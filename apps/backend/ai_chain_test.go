package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestShouldFailOver pins down the rule that decides whether another provider
// is worth trying. Getting this wrong is expensive in both directions: too
// eager and one bad prompt is billed to every provider in the chain; too shy
// and an exhausted quota silently degrades the product.
func TestShouldFailOver(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		// Provider-side: move on.
		{"payment required", fmt.Errorf("openai http 402: subscription required"), true},
		{"rate limited", fmt.Errorf("openai http 429: too many requests"), true},
		{"revoked key", fmt.Errorf("openai http 401: invalid api key"), true},
		{"server fault", fmt.Errorf("openai http 503: service unavailable"), true},
		{"model retired", fmt.Errorf("openai http 404: unknown model"), true},
		{"quota in prose", errors.New("gemini error: quota exceeded for this project"), true},
		{"connection closed", errors.New("post: connection closed"), true},
		{"missing key", errors.New("GEMINI_API_KEY not set"), true},
		{"empty candidates", errors.New("gemini returned no candidates"), true},

		// Our fault: the next provider would reject it identically.
		{"bad request", fmt.Errorf("openai http 400: messages must not be empty"), false},
		{"unprocessable", fmt.Errorf("openai http 422: invalid schema"), false},
		{"nil error", nil, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldFailOver(tc.err); got != tc.want {
				t.Fatalf("shouldFailOver(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// TestProviderChainSkipsUnconfigured proves that naming a provider you have not
// set up yet is harmless — the reason a Gemini key can be added later without
// touching any other setting.
func TestProviderChainSkipsUnconfigured(t *testing.T) {
	t.Setenv("AI_PROVIDER", "openai")
	t.Setenv("OPENAI_API_KEY", "primary-key")
	t.Setenv("GEMINI_API_KEY", "") // not configured yet
	t.Setenv("ANTHROPIC_API_KEY", "anthropic-key")
	t.Setenv("AI_FALLBACK_PROVIDERS", "gemini,anthropic,openai")

	got := providerChain()
	want := []string{"openai", "anthropic"} // gemini skipped, openai not duplicated

	if len(got) != len(want) {
		t.Fatalf("chain = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("chain = %v, want %v", got, want)
		}
	}
}

// TestChainFailsOverToSecondProvider is the end-to-end case the user asked
// about: the primary returns "payment required" and a second provider serves
// the request instead — with the result attributed to the one that answered.
func TestChainFailsOverToSecondProvider(t *testing.T) {
	resetProviderHealth()

	dead := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusPaymentRequired)
		fmt.Fprint(w, `{"error":{"message":"subscription required"}}`)
	}))
	defer dead.Close()

	alive := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"answered by the backup"}}],
			"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}`)
	}))
	defer alive.Close()

	// Primary is the "NVIDIA" slot; DeepSeek stands in as the fallback, since
	// both speak the OpenAI protocol and can be pointed at a test server.
	t.Setenv("AI_PROVIDER", "openai")
	t.Setenv("OPENAI_API_KEY", "primary-key")
	t.Setenv("OPENAI_BASE_URL", dead.URL)
	t.Setenv("OPENAI_MODEL", "primary-model")

	t.Setenv("DEEPSEEK_API_KEY", "fallback-key")
	t.Setenv("DEEPSEEK_BASE_URL", alive.URL)
	t.Setenv("DEEPSEEK_MODEL", "fallback-model")

	t.Setenv("AI_FALLBACK_PROVIDERS", "deepseek")

	res, err := callAIChain(context.Background(), "sys", "user", 0.7, false)
	if err != nil {
		t.Fatalf("chain returned an error despite a healthy fallback: %v", err)
	}
	if res.Text != "answered by the backup" {
		t.Fatalf("text = %q, want the fallback's answer", res.Text)
	}
	if res.Provider != "deepseek" || res.Model != "fallback-model" {
		t.Fatalf("attributed to %s/%s, want deepseek/fallback-model — the ledger would bill the wrong vendor",
			res.Provider, res.Model)
	}
	if !res.Degraded {
		t.Fatal("Degraded = false, but the primary failed and a backup answered")
	}
	if res.Usage == nil || res.Usage.TotalTokens != 15 {
		t.Fatalf("usage = %+v, want the fallback's 15 tokens recorded", res.Usage)
	}
	if len(res.Attempts) != 2 || res.Attempts[0].OK || !res.Attempts[1].OK {
		t.Fatalf("attempts = %+v, want a failed primary then a successful fallback", res.Attempts)
	}
}

// TestChainDoesNotRetryBadRequests guards the money-wasting direction: a
// request the provider rejected as malformed must not be replayed against
// every other provider.
func TestChainDoesNotRetryBadRequests(t *testing.T) {
	resetProviderHealth()

	var fallbackCalls int
	rejecting := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"error":{"message":"messages must not be empty"}}`)
	}))
	defer rejecting.Close()

	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackCalls++
		fmt.Fprint(w, `{"choices":[{"message":{"content":"should never be reached"}}]}`)
	}))
	defer fallback.Close()

	t.Setenv("AI_PROVIDER", "openai")
	t.Setenv("OPENAI_API_KEY", "primary-key")
	t.Setenv("OPENAI_BASE_URL", rejecting.URL)
	t.Setenv("DEEPSEEK_API_KEY", "fallback-key")
	t.Setenv("DEEPSEEK_BASE_URL", fallback.URL)
	t.Setenv("AI_FALLBACK_PROVIDERS", "deepseek")

	if _, err := callAIChain(context.Background(), "sys", "user", 0.7, false); err == nil {
		t.Fatal("expected the 400 to surface as an error")
	}
	if fallbackCalls != 0 {
		t.Fatalf("fallback was called %d time(s) for a malformed request — that bills a second vendor for the same mistake", fallbackCalls)
	}
}

// TestHungProviderStillReachesFallback is the case that matters most for the
// customer: the primary does not refuse, it simply stops responding. The chain
// must abandon it and let a working provider answer, instead of burning the
// whole request budget and serving canned text.
func TestHungProviderStillReachesFallback(t *testing.T) {
	resetProviderHealth()

	// Blocks until the chain gives up on it, which is the behaviour under test.
	// The safety timer matters: httptest's Close waits for in-flight requests,
	// so a handler that never returns would deadlock the test suite instead of
	// failing it.
	hung := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Comfortably longer than the ~2s the chain should wait, short enough
		// that Close() does not stall the suite.
		select {
		case <-r.Context().Done():
		case <-time.After(3 * time.Second):
		}
	}))
	defer hung.Close()

	alive := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"choices":[{"message":{"content":"served despite the hang"}}],
			"usage":{"total_tokens":7}}`)
	}))
	defer alive.Close()

	t.Setenv("AI_PROVIDER", "openai")
	t.Setenv("OPENAI_API_KEY", "k")
	t.Setenv("OPENAI_BASE_URL", hung.URL)
	t.Setenv("DEEPSEEK_API_KEY", "k2")
	t.Setenv("DEEPSEEK_BASE_URL", alive.URL)
	t.Setenv("AI_FALLBACK_PROVIDERS", "deepseek")

	// A 4s overall budget: the first attempt may take at most half of it, so
	// there is still time to reach the second provider.
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	res, err := callAIChain(ctx, "sys", "user", 0.7, false)
	if err != nil {
		t.Fatalf("chain gave up instead of using the healthy fallback: %v", err)
	}
	if res.Text != "served despite the hang" {
		t.Fatalf("text = %q, want the fallback's answer", res.Text)
	}
	if res.Provider != "deepseek" {
		t.Fatalf("answered by %q, want deepseek", res.Provider)
	}
}

// TestAttemptBudgetLeavesRoomForFallback checks the arithmetic directly: no
// single attempt may consume the entire remaining budget while others wait.
func TestAttemptBudgetLeavesRoomForFallback(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Second)
	defer cancel()

	first := attemptBudget(ctx, 2)
	if first > 60*time.Second {
		t.Fatalf("first of two attempts got %s of a 100s budget — too greedy", first)
	}

	last := attemptBudget(ctx, 1)
	if last < first {
		t.Fatalf("last attempt got %s, less than an earlier one at %s", last, first)
	}
}

// TestCooldownParksDeadProvider proves a provider that keeps failing stops
// being probed, so it does not add its timeout to every later request.
func TestCooldownParksDeadProvider(t *testing.T) {
	resetProviderHealth()

	for i := 0; i < providerFailureThreshold; i++ {
		noteProviderFailure("openai")
	}
	if cooling, _ := providerCoolingDown("openai"); !cooling {
		t.Fatalf("provider not parked after %d failures", providerFailureThreshold)
	}

	// A success clears the parking, so recovery needs no restart.
	noteProviderSuccess("openai")
	if cooling, _ := providerCoolingDown("openai"); cooling {
		t.Fatal("provider still parked after a success")
	}
}

func resetProviderHealth() {
	providerHealthMu.Lock()
	defer providerHealthMu.Unlock()
	providerHealthMap = map[string]*providerHealth{}
}
