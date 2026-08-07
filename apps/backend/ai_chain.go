package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ---------------------------------------------------------------------------
// Provider fallback chain
//
// One provider used to be the whole story: if it stopped answering — quota
// exhausted, card declined, rate limited, an outage — the structured endpoints
// silently dropped to canned local text and carried on. The product kept
// producing content that merely looked generated, and nothing said otherwise.
//
// The chain tries the primary, then each configured fallback in order. Two
// rules keep it from making things worse:
//
//   1. Only provider-side failures fail over. A 400 caused by a malformed
//      prompt would fail identically everywhere, so retrying it would just
//      spend money three times to reach the same error.
//   2. A provider that has failed repeatedly is skipped for a cooldown, so a
//      dead one is not re-probed on every single request.
//
// Whichever provider actually answered is reported back, so the usage ledger
// and the admin margin numbers attribute spend to the right vendor instead of
// recording everything against the primary.
// ---------------------------------------------------------------------------

// AIResult is one completed generation and where it came from.
type AIResult struct {
	Text     string
	Usage    *TokenUsage
	Provider string // who actually answered
	Model    string
	// Degraded is true when the primary did not answer and a fallback did. The
	// caller can surface that rather than passing off a downgrade as normal.
	Degraded bool
	Attempts []AIAttempt
}

// AIAttempt records one try, successful or not, for diagnostics.
type AIAttempt struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	OK       bool   `json:"ok"`
	Error    string `json:"error,omitempty"`
	TookMS   int64  `json:"tookMs"`
}

// providerChain is the primary followed by AI_FALLBACK_PROVIDERS, with
// duplicates and unconfigured providers removed. Listing a provider you have
// not set up yet is harmless — it is simply skipped until its key exists.
func providerChain() []string {
	primary := resolveProvider()
	if primary == "none" {
		return nil
	}

	out := []string{}
	seen := map[string]bool{}
	add := func(p string) {
		p = strings.ToLower(strings.TrimSpace(p))
		if p == "" || p == "none" || seen[p] || !providerConfigured(p) {
			return
		}
		seen[p] = true
		out = append(out, p)
	}

	add(primary)
	for _, p := range strings.Split(env("AI_FALLBACK_PROVIDERS", ""), ",") {
		add(p)
	}
	return out
}

// callAIChain runs the prompt down the chain and returns the first success.
func callAIChain(ctx context.Context, system, user string, temperature float64, jsonMode bool) (AIResult, error) {
	chain := providerChain()
	if len(chain) == 0 {
		return AIResult{}, errors.New("no AI provider is configured")
	}

	res := AIResult{}
	var lastErr error

	for i, provider := range chain {
		if cooling, until := providerCoolingDown(provider); cooling {
			res.Attempts = append(res.Attempts, AIAttempt{
				Provider: provider,
				Model:    modelFor(provider),
				Error:    "skipped: cooling down until " + until.Format(time.RFC3339),
			})
			continue
		}

		// Each attempt gets its own slice of the budget. Sharing one deadline
		// meant a provider that hung — rather than failing fast — consumed the
		// whole allowance, and the chain ran out of time before it could try
		// anyone else. The customer then received canned fallback text purely
		// because the primary was slow to die.
		attemptCtx, cancelAttempt := context.WithTimeout(ctx, attemptBudget(ctx, len(chain)-i))

		start := time.Now()
		text, usage, err := callProvider(attemptCtx, provider, system, user, temperature, jsonMode)
		took := time.Since(start).Milliseconds()
		cancelAttempt()

		if err == nil {
			noteProviderSuccess(provider)
			res.Attempts = append(res.Attempts, AIAttempt{
				Provider: provider, Model: modelFor(provider), OK: true, TookMS: took,
			})
			res.Text, res.Usage, res.Provider, res.Model = text, usage, provider, modelFor(provider)
			res.Degraded = i > 0
			if res.Degraded {
				log.Printf("AI FALLBACK: %s answered after %s failed", provider, chain[0])
			}
			return res, nil
		}

		lastErr = err
		res.Attempts = append(res.Attempts, AIAttempt{
			Provider: provider, Model: modelFor(provider), Error: err.Error(), TookMS: took,
		})

		// The caller gave up (timeout, client disconnected). Trying the next
		// provider would only extend a request nobody is waiting for.
		if ctx.Err() != nil {
			return res, fmt.Errorf("%s: %w", provider, err)
		}

		if !shouldFailOver(err) {
			// The same request would fail the same way everywhere.
			log.Printf("AI ERROR (not retried elsewhere) provider=%s: %v", provider, err)
			return res, fmt.Errorf("%s: %w", provider, err)
		}

		noteProviderFailure(provider)
		if i+1 < len(chain) {
			log.Printf("AI provider %s failed (%v) — trying %s", provider, err, chain[i+1])
		}
	}

	return res, fmt.Errorf("every AI provider failed; last error: %w", lastErr)
}

// Per-attempt time budget. The floor keeps a slow-but-working provider from
// being cut off mid-answer (reasoning models routinely take 40s+); the cap
// stops a single hang from swallowing the request.
const (
	attemptFloor = 45 * time.Second
	attemptCap   = 90 * time.Second
)

// attemptBudget decides how long one provider may take, leaving room for the
// ones behind it. The last candidate gets whatever is left, since there is
// nobody after it to reserve time for.
func attemptBudget(ctx context.Context, candidatesLeft int) time.Duration {
	deadline, ok := ctx.Deadline()
	if !ok {
		return attemptCap
	}
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return time.Millisecond // let the call fail immediately
	}
	if candidatesLeft <= 1 {
		return min(remaining, attemptCap)
	}

	// An even share guarantees every candidate gets a turn. The floor then
	// lifts that share for a slow model — but is itself capped at half the
	// remaining time, because a floor larger than the budget would hand the
	// whole allowance to the first provider and starve the rest, which is the
	// very failure this function exists to prevent.
	share := remaining / time.Duration(candidatesLeft)
	floor := min(attemptFloor, remaining/2)
	return min(max(share, floor), attemptCap)
}

// ---------------------------------------------------------------------------
// Which failures are worth retrying elsewhere
// ---------------------------------------------------------------------------

var httpStatusRe = regexp.MustCompile(`http (\d{3})`)

// shouldFailOver reports whether another provider might succeed where this one
// failed. Payment, rate limit, auth and server-side faults are worth moving on
// from; a rejected prompt is not.
func shouldFailOver(err error) bool {
	if err == nil {
		return false
	}

	// Transport-level trouble: DNS, refused connection, TLS, timeout.
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}

	msg := strings.ToLower(err.Error())

	if m := httpStatusRe.FindStringSubmatch(msg); m != nil {
		code, _ := strconv.Atoi(m[1])
		switch {
		case code == 401 || code == 403:
			return true // bad or revoked key here; another provider may be fine
		case code == 402: // payment required — the "need to subscribe" case
			return true
		case code == 404:
			return true // model retired or renamed on this provider
		case code == 408 || code == 409 || code == 425 || code == 429:
			return true // timeout, conflict, too early, rate limited
		case code >= 500:
			return true // provider-side fault
		case code == 400 || code == 422:
			return false // our request is wrong; it will be wrong everywhere
		}
	}

	// Errors that arrive as prose rather than a status code.
	for _, s := range []string{
		"quota", "insufficient", "billing", "payment", "credit",
		"rate limit", "ratelimit", "too many requests", "overloaded",
		"unavailable", "timeout", "timed out", "deadline exceeded",
		"connection refused", "connection reset", "connection closed",
		"eof", "no such host", "not set", "returned no", "no candidates",
	} {
		if strings.Contains(msg, s) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Cooldown
// ---------------------------------------------------------------------------

// A provider that fails repeatedly is skipped for a while. Without this, every
// request would pay the full timeout of a dead provider before reaching the one
// that works.
const (
	providerFailureThreshold = 3
	providerCooldown         = 2 * time.Minute
)

type providerHealth struct {
	failures int
	until    time.Time
}

var (
	providerHealthMu  sync.Mutex
	providerHealthMap = map[string]*providerHealth{}
)

func providerCoolingDown(provider string) (bool, time.Time) {
	providerHealthMu.Lock()
	defer providerHealthMu.Unlock()

	h := providerHealthMap[provider]
	if h == nil || h.until.IsZero() {
		return false, time.Time{}
	}
	if time.Now().Before(h.until) {
		return true, h.until
	}
	// Cooldown elapsed: let the next request probe it again.
	h.until = time.Time{}
	h.failures = 0
	return false, time.Time{}
}

func noteProviderFailure(provider string) {
	providerHealthMu.Lock()
	defer providerHealthMu.Unlock()

	h := providerHealthMap[provider]
	if h == nil {
		h = &providerHealth{}
		providerHealthMap[provider] = h
	}
	h.failures++
	if h.failures >= providerFailureThreshold {
		h.until = time.Now().Add(providerCooldown)
		log.Printf("AI provider %s parked for %s after %d consecutive failures",
			provider, providerCooldown, h.failures)
	}
}

func noteProviderSuccess(provider string) {
	providerHealthMu.Lock()
	defer providerHealthMu.Unlock()

	if h := providerHealthMap[provider]; h != nil {
		h.failures = 0
		h.until = time.Time{}
	}
}

// aiChainStatus describes the chain for the health endpoint and the admin
// panel, so "which provider is actually serving traffic" is observable rather
// than guessed from output quality.
func aiChainStatus() []map[string]interface{} {
	out := []map[string]interface{}{}
	for i, p := range providerChain() {
		cooling, until := providerCoolingDown(p)
		entry := map[string]interface{}{
			"provider": p,
			"model":    modelFor(p),
			"role":     "fallback",
			"healthy":  !cooling,
		}
		if i == 0 {
			entry["role"] = "primary"
		}
		if cooling {
			entry["cooldownUntil"] = until.UTC().Format(time.RFC3339)
		}
		out = append(out, entry)
	}
	return out
}
