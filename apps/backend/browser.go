package main

// ---------------------------------------------------------------------------
// Level 3 connections — signing in through an embedded browser.
//
// Why this exists at all: getting an official API approved for TikTok,
// Instagram or X is a review process measured in weeks, and several platforms
// will not grant write access to a small product regardless. Level 3 is the
// universal fallback — the user logs in on the platform's own login page, we
// keep the resulting session, and posting happens as them.
//
// The security shape matters, so it is stated plainly:
//
//   • Palius never receives the password. Keystrokes are dispatched into a
//     Chromium page that belongs to the platform, on the platform's own domain.
//     Nothing in this file or the worker reads an input's value.
//   • What is kept is the storage state — cookies plus local/session storage —
//     sealed with AES-256-GCM under PALIUS_SECRET_KEY before it reaches the
//     database, exactly like every other credential here. No key, no storage.
//   • The streaming socket is opened by the user's browser straight to the
//     worker, authorised by a single-use ticket scoped to one session. The
//     worker's shared token never leaves the server.
//
// The honest caveats, which the UI repeats to the user: a stored session is not
// an API grant. It expires on the platform's schedule, it can be invalidated by
// a password change, and some platforms' terms discourage automated access.
// verifyBrowserConnection is what keeps the UI from claiming otherwise.
// ---------------------------------------------------------------------------

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const browserSessionSchema = `
CREATE TABLE IF NOT EXISTS browser_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  platform      TEXT NOT NULL,
  mode          TEXT NOT NULL DEFAULT 'login',
  status        TEXT NOT NULL DEFAULT 'pending',
  handle        TEXT NOT NULL DEFAULT '',
  detail        TEXT NOT NULL DEFAULT '',
  state_enc     TEXT NOT NULL DEFAULT '',
  connection_id TEXT NOT NULL DEFAULT '',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bsession_user ON browser_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_bsession_conn ON browser_sessions(connection_id);
`

func initBrowserSessions() {
	if _, err := db.Exec(ddl(browserSessionSchema)); err != nil {
		log.Printf("init browser session schema: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Where each platform's login lives
// ---------------------------------------------------------------------------

// browserTarget is everything the worker needs to open the right page and
// recognise a finished login.
//
// VerifyURL must be a page the platform only serves to a signed-in user —
// a settings or account page, never a homepage or feed. Verification works by
// checking we were not redirected away from it, and almost every platform here
// will happily render its homepage to a signed-out visitor, which would make
// the check pass with no session at all.
//
// SignedInSelector is a refinement, not the basis of the decision: it is a
// markup detail that platforms change without notice.
type browserTarget struct {
	LoginURL         string
	RegisterURL      string
	VerifyURL        string
	SuccessURL       string // JS regex, matched against the page URL
	SignedInSelector string
}

var browserTargets = map[string]browserTarget{
	"tiktok": {
		LoginURL:    "https://www.tiktok.com/login",
		RegisterURL: "https://www.tiktok.com/signup",
		VerifyURL:   "https://www.tiktok.com/setting",
		SuccessURL:  `tiktok\.com/(foryou|following|@)`,
	},
	"instagram": {
		LoginURL:    "https://www.instagram.com/accounts/login/",
		RegisterURL: "https://www.instagram.com/accounts/emailsignup/",
		VerifyURL:   "https://www.instagram.com/accounts/edit/",
		SuccessURL:  `instagram\.com/($|\?|direct|explore)`,
	},
	"facebook": {
		LoginURL:    "https://www.facebook.com/login",
		RegisterURL: "https://www.facebook.com/r.php",
		VerifyURL:   "https://www.facebook.com/settings",
		SuccessURL:  `facebook\.com/($|\?|home|me)`,
	},
	"threads": {
		LoginURL:    "https://www.threads.com/login",
		RegisterURL: "https://www.threads.com/login",
		VerifyURL:   "https://www.threads.com/settings/account",
		SuccessURL:  `threads\.(net|com)/($|\?|@)`,
	},
	"linkedin": {
		LoginURL:    "https://www.linkedin.com/login",
		RegisterURL: "https://www.linkedin.com/signup",
		VerifyURL:   "https://www.linkedin.com/mypreferences/d/categories/account",
		SuccessURL:  `linkedin\.com/(feed|in/)`,
	},
	"reddit": {
		LoginURL:    "https://www.reddit.com/login",
		RegisterURL: "https://www.reddit.com/register",
		VerifyURL:   "https://www.reddit.com/settings",
		SuccessURL:  `reddit\.com/($|\?|r/)`,
	},
	"x": {
		LoginURL:    "https://x.com/login",
		RegisterURL: "https://x.com/i/flow/signup",
		VerifyURL:   "https://x.com/settings/account",
		SuccessURL:  `x\.com/(home|messages|notifications)`,
	},
	"pinterest": {
		LoginURL:    "https://www.pinterest.com/login/",
		RegisterURL: "https://www.pinterest.com/signup/",
		VerifyURL:   "https://www.pinterest.com/settings/",
		SuccessURL:  `pinterest\.com/($|\?)`,
	},
	"youtube": {
		// Google's own sign-in, which is also where a new account is created.
		LoginURL:    "https://accounts.google.com/ServiceLogin?service=youtube",
		RegisterURL: "https://accounts.google.com/signup",
		VerifyURL:   "https://studio.youtube.com/",
		SuccessURL:  `(youtube\.com|studio\.youtube\.com)/`,
	},

	// ---- Blogs & newsletters -------------------------------------------
	//
	// These have APIs, but every one of them costs the user something: dev.to
	// and Hashnode mean digging a token out of a settings page, Medium stopped
	// issuing tokens to new accounts altogether, and Substack has no write API
	// at all. Browser login is the shorter path for the first two and the only
	// path for the last two.
	"devto": {
		LoginURL:    "https://dev.to/enter",
		RegisterURL: "https://dev.to/enter?state=new-user",
		VerifyURL:   "https://dev.to/dashboard",
		SuccessURL:  `dev\.to/(dashboard|$)`,
	},
	"hashnode": {
		LoginURL:    "https://hashnode.com/onboard?source=login",
		RegisterURL: "https://hashnode.com/onboard",
		VerifyURL:   "https://hashnode.com/settings",
		SuccessURL:  `hashnode\.com/(draft|settings|$)`,
	},
	"medium": {
		// Medium's sign-in and sign-up are the same flow.
		LoginURL:    "https://medium.com/m/signin",
		RegisterURL: "https://medium.com/m/signin",
		VerifyURL:   "https://medium.com/me/settings",
		SuccessURL:  `medium\.com/(me|new-story|$)`,
	},
	"hashnode-newsletter": {
		LoginURL:    "https://substack.com/sign-in",
		RegisterURL: "https://substack.com/signup",
		VerifyURL:   "https://substack.com/home",
		SuccessURL:  `substack\.com/(home|publish)`,
	},
	"producthunt": {
		LoginURL:    "https://www.producthunt.com/login",
		RegisterURL: "https://www.producthunt.com/login",
		VerifyURL:   "https://www.producthunt.com/my/settings",
		SuccessURL:  `producthunt\.com/(my|$)`,
	},
}

// ---------------------------------------------------------------------------
// Compose mappings — publishing through the browser
// ---------------------------------------------------------------------------

// composeMapping drives a platform's editor when the connection is a browser
// session rather than an API token.
//
// These selectors are the honest weak point of the whole feature. They describe
// third-party markup that changes without warning, so they are defaults that
// get a user going, not a contract. Two things follow from that, and both are
// implemented rather than just noted:
//
//   - A failed browser publish returns the draft as an export. Losing someone's
//     writing because a CSS class was renamed is not an acceptable outcome.
//   - A user-defined destination (destinations.go) can override all of it with
//     their own selectors, with no deploy.
//
// Multi-selectors are deliberate: `a, b` matches either, so a renamed test id
// does not have to take the whole mapping down with it.
var composeMappings = map[string]BrowserMapping{
	"devto": {
		ComposeURL: "https://dev.to/new",
		Selectors: composeSelectors{
			Title:       "#article-form-title, textarea[placeholder*='title' i], input[name='title']",
			Body:        "#article_body_markdown, textarea[placeholder*='write' i], .crayons-article-form__body textarea",
			Tags:        "#tag-input, input[placeholder*='tag' i]",
			PublishBtn:  "button:has-text('Publish')",
			DraftBtn:    "button:has-text('Save draft')",
		},
	},
	"hashnode": {
		ComposeURL: "https://hashnode.com/draft",
		Selectors: composeSelectors{
			Title:      "textarea[placeholder*='title' i], input[placeholder*='title' i]",
			Body:       "textarea[placeholder*='story' i], div[contenteditable='true']",
			PublishBtn: "button:has-text('Publish')",
			DraftBtn:   "button:has-text('Save draft')",
		},
	},
	"medium": {
		ComposeURL: "https://medium.com/new-story",
		Selectors: composeSelectors{
			Title:      "[data-testid='editorTitleParagraph'], h3[contenteditable='true']",
			Body:       "[data-testid='editorParagraphText'], article div[contenteditable='true']",
			PublishBtn: "button:has-text('Publish')",
		},
	},
	"hashnode-newsletter": {
		ComposeURL: "https://substack.com/publish/post?type=newsletter",
		Selectors: composeSelectors{
			Title:      "textarea[placeholder*='title' i]",
			Body:       "div[contenteditable='true']",
			PublishBtn: "button:has-text('Continue'), button:has-text('Publish')",
		},
	},
}

// browserLoginSupported reports whether we know where a platform's login page
// is. Offering the option without a target would just open a blank window.
func browserLoginSupported(platform string) bool {
	_, ok := browserTargets[platform]
	return ok
}

// ---------------------------------------------------------------------------
// Worker client
// ---------------------------------------------------------------------------

func workerURL() string {
	return strings.TrimRight(env("PLAYWRIGHT_WORKER_URL", ""), "/")
}

// workerPublicURL is what the user's browser dials for the frame stream. It
// differs from workerURL whenever the API reaches the worker over a private
// network name that means nothing outside the cluster (docker compose, Render
// internal hostnames), so it falls back rather than assuming they are the same.
func workerPublicURL() string {
	if u := env("PLAYWRIGHT_WORKER_PUBLIC_URL", ""); u != "" {
		return strings.TrimRight(u, "/")
	}
	return workerURL()
}

var workerHTTP = &http.Client{Timeout: 90 * time.Second}

// workerCall performs one authenticated request against the worker. Kept
// separate from postJSON because captured storage states can exceed that
// helper's 1MB response cap, and because this needs GET and DELETE.
func workerCall(ctx context.Context, method, path string, body interface{}, out interface{}) (int, error) {
	base := workerURL()
	if base == "" {
		return 0, fmt.Errorf("PLAYWRIGHT_WORKER_URL is not set")
	}

	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		reader = bytes.NewReader(payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, base+path, reader)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token := env("PLAYWRIGHT_WORKER_TOKEN", ""); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	res, err := workerHTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(res.Body, 16<<20))
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return res.StatusCode, fmt.Errorf("worker returned unreadable JSON: %w", err)
		}
	}
	return res.StatusCode, nil
}

// ---------------------------------------------------------------------------
// Availability
//
// The connect dialog asks on every open, so the health probe is cached. Without
// that, one user browsing the platform list would hammer the worker; with too
// long a cache, a worker that just died keeps being advertised as usable.
// ---------------------------------------------------------------------------

type workerHealth struct {
	Running  bool   `json:"running"`
	Chromium bool   `json:"chromium"`
	Sessions int    `json:"sessions"`
	Detail   string `json:"detail"`
}

var (
	healthMu     sync.Mutex
	healthCache  workerHealth
	healthExpiry time.Time
)

func browserWorkerHealth() workerHealth {
	healthMu.Lock()
	defer healthMu.Unlock()
	if time.Now().Before(healthExpiry) {
		return healthCache
	}

	h := workerHealth{}
	switch {
	case workerURL() == "":
		h.Detail = "PLAYWRIGHT_WORKER_URL is not set — no browser worker is configured for this deployment."
	default:
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var out struct {
			OK       bool `json:"ok"`
			Chromium bool `json:"chromium"`
			Sessions int  `json:"sessions"`
		}
		status, err := workerCall(ctx, http.MethodGet, "/health", nil, &out)
		switch {
		case err != nil:
			h.Detail = "The browser worker is not reachable: " + err.Error()
		case status != http.StatusOK:
			h.Detail = fmt.Sprintf("The browser worker answered HTTP %d.", status)
		case !out.Chromium:
			h.Detail = "The browser worker is up but Chromium failed to launch."
		default:
			h.Running, h.Chromium, h.Sessions = true, true, out.Sessions
			h.Detail = "Browser worker is live."
		}
	}

	healthCache = h
	// Cache a working worker for longer than a broken one: recovering quickly
	// matters more than noticing a failure a few seconds sooner.
	if h.Running {
		healthExpiry = time.Now().Add(30 * time.Second)
	} else {
		healthExpiry = time.Now().Add(10 * time.Second)
	}
	return h
}

func browserWorkerRunning() bool { return browserWorkerHealth().Running }

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

func registerBrowserRoutes(api *gin.RouterGroup) {
	// A separate prefix from /connections/:id on purpose — "browser" would
	// otherwise be indistinguishable from a connection id.
	api.GET("/browser/status", handleBrowserStatus)
	api.POST("/browser/sessions", handleStartBrowserSession)
	api.GET("/browser/sessions/:sid", handleBrowserSessionStatus)
	api.POST("/browser/sessions/:sid/complete", handleCompleteBrowserSession)
	api.DELETE("/browser/sessions/:sid", handleCancelBrowserSession)
}

func handleBrowserStatus(c *gin.Context) {
	h := browserWorkerHealth()
	c.JSON(http.StatusOK, gin.H{
		"running":             h.Running,
		"detail":              h.Detail,
		"activeSessions":      h.Sessions,
		"encryptionAvailable": encryptionAvailable(),
	})
}

type startBrowserSessionRequest struct {
	Platform string `json:"platform"`
	Mode     string `json:"mode"` // login | register
}

func handleStartBrowserSession(c *gin.Context) {
	var req startBrowserSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	target, ok := browserTargets[req.Platform]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "browser login is not mapped for " + req.Platform,
		})
		return
	}

	// Refuse before opening anything. Capturing a session we then cannot store
	// would mean making the user log in for nothing.
	if !encryptionAvailable() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":  "PALIUS_SECRET_KEY is not set",
			"detail": "The captured session cannot be encrypted, so the server will not ask you to log in.",
		})
		return
	}
	if h := browserWorkerHealth(); !h.Running {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":  "the browser worker is not available",
			"detail": h.Detail,
		})
		return
	}

	mode := "login"
	startURL := target.LoginURL
	if req.Mode == "register" {
		mode = "register"
		startURL = target.RegisterURL
	}

	// The ticket authorises exactly one stream socket. It is generated here so
	// the worker's shared token never has to reach the user's browser.
	ticketBytes := make([]byte, 24)
	if _, err := rand.Read(ticketBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate a stream ticket"})
		return
	}
	ticket := base64.RawURLEncoding.EncodeToString(ticketBytes)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	var out struct {
		SessionID  string `json:"sessionId"`
		StreamPath string `json:"streamPath"`
		Status     string `json:"status"`
		Error      string `json:"error"`
	}
	status, err := workerCall(ctx, http.MethodPost, "/session", map[string]interface{}{
		"platform":          req.Platform,
		"mode":              mode,
		"startUrl":          startURL,
		"ticket":            ticket,
		"successUrlPattern": target.SuccessURL,
		"signedInSelector":  target.SignedInSelector,
		"viewport":          map[string]int{"width": 1280, "height": 800},
	}, &out)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "could not reach the browser worker: " + err.Error()})
		return
	}
	if status >= 300 || out.SessionID == "" {
		detail := out.Error
		if detail == "" {
			detail = fmt.Sprintf("worker returned HTTP %d", status)
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "the browser worker could not open the login page", "detail": detail})
		return
	}

	if _, err := db.Exec(
		`INSERT INTO browser_sessions (id, user_id, platform, mode, status, detail)
		 VALUES (?, ?, ?, ?, 'pending', ?)`,
		out.SessionID, userId(c), req.Platform, mode,
		"Waiting for the user to finish signing in."); err != nil {
		// Nothing is stored, so the orphaned worker session must not be left
		// holding a Chromium context.
		_, _ = workerCall(ctx, http.MethodDelete, "/session/"+out.SessionID, nil, nil)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not record the session"})
		return
	}

	// Use the catalog's display name — "instagram's own page" reads like a
	// database row, and this line is the product's main assurance to someone
	// about to type a password.
	displayName := req.Platform
	if p, ok := findConnectable(req.Platform); ok {
		displayName = p.Name
	}
	verb := "logging in on"
	if mode == "register" {
		verb = "creating an account on"
	}

	c.JSON(http.StatusOK, gin.H{
		"sessionId": out.SessionID,
		"platform":  req.Platform,
		"mode":      mode,
		"startUrl":  startURL,
		"streamUrl": streamURL(out.StreamPath, ticket),
		"notice": "You are " + verb + " " + displayName + "'s own page. Palius never sees your password — " +
			"only the session that keeps you signed in, which is encrypted before it is stored.",
	})
}

// streamURL turns the worker's path into a ws:// or wss:// URL the browser can
// open, carrying the single-use ticket.
func streamURL(path, ticket string) string {
	base := workerPublicURL()
	if base == "" {
		return ""
	}
	switch {
	case strings.HasPrefix(base, "https://"):
		base = "wss://" + strings.TrimPrefix(base, "https://")
	case strings.HasPrefix(base, "http://"):
		base = "ws://" + strings.TrimPrefix(base, "http://")
	}
	return base + path + "?ticket=" + ticket
}

// ownedSession loads a pending session and proves it belongs to the caller.
// Without this check, knowing a session id would be enough to steal the login
// somebody else is in the middle of completing.
func ownedSession(c *gin.Context) (id, platform, mode string, ok bool) {
	id = c.Param("sid")
	err := db.QueryRow(
		`SELECT platform, mode FROM browser_sessions WHERE id = ? AND user_id = ?`,
		id, userId(c)).Scan(&platform, &mode)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return "", "", "", false
	}
	return id, platform, mode, true
}

func handleBrowserSessionStatus(c *gin.Context) {
	id, platform, mode, ok := ownedSession(c)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var out struct {
		Status string `json:"status"`
		URL    string `json:"url"`
	}
	status, err := workerCall(ctx, http.MethodGet, "/session/"+id, nil, &out)
	if err != nil || status != http.StatusOK {
		c.JSON(http.StatusOK, gin.H{
			"sessionId": id, "platform": platform, "mode": mode,
			"status": "expired",
			"detail": "The worker no longer has this session. Start the login again.",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"sessionId": id, "platform": platform, "mode": mode,
		"status": out.Status, "url": out.URL,
	})
}

// handleCompleteBrowserSession captures the login and turns it into a stored
// connection. This is a deliberate user action rather than something detected
// automatically: only the user knows when they are past 2FA.
func handleCompleteBrowserSession(c *gin.Context) {
	id, platform, mode, ok := ownedSession(c)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	var captured struct {
		StorageState json.RawMessage `json:"storageState"`
		URL          string          `json:"url"`
		Handle       string          `json:"handle"`
		CookieCount  int             `json:"cookieCount"`
		SignedIn     bool            `json:"signedIn"`
		Error        string          `json:"error"`
	}
	status, err := workerCall(ctx, http.MethodPost, "/session/"+id+"/capture", nil, &captured)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "could not reach the browser worker: " + err.Error()})
		return
	}
	if status >= 300 || len(captured.StorageState) == 0 {
		detail := captured.Error
		if detail == "" {
			detail = fmt.Sprintf("worker returned HTTP %d", status)
		}
		c.JSON(http.StatusConflict, gin.H{
			"error":  "no session was captured",
			"detail": detail + " — finish signing in before saving.",
		})
		return
	}

	// Prove the session actually works before storing anything. Cookies exist
	// on a signed-out page too, so their presence proves nothing on its own.
	verifyStatus, verifyDetail := verifyStorageState(ctx, platform, captured.StorageState)

	// A login that did not complete is not a connection. Refuse, leave the
	// browser session open, and let the user carry on where they left off —
	// storing a dead session would put a broken row in their connection list
	// and only fail later, at publish time.
	if verifyStatus == "failed" {
		c.JSON(http.StatusConflict, gin.H{
			"error":  "you are not signed in yet",
			"detail": verifyDetail + " Finish signing in — the window is still open — then save again.",
		})
		return
	}

	// Reuses the same AES-256-GCM envelope as every other stored credential.
	enc, err := encryptSecrets(map[string]string{"storageState": string(captured.StorageState)})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	connID := fmt.Sprintf("conn-%s-%d", platform, time.Now().UnixNano())
	handle := strings.TrimSpace(captured.Handle)

	if _, err := db.Exec(
		`INSERT INTO platform_connections (id, user_id, platform, auth_level, status, detail, handle, secrets_enc)
		 VALUES (?, ?, ?, 'level-3', ?, ?, ?, ?)`,
		connID, userId(c), platform, verifyStatus, verifyDetail, handle, enc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save the connection"})
		return
	}

	// Stored — so the live Chromium context has done its job. Holding a
	// logged-in browser open past that point is pure risk.
	_, _ = workerCall(ctx, http.MethodDelete, "/session/"+id, nil, nil)

	if _, err := db.Exec(
		`UPDATE browser_sessions
		    SET status = 'active', state_enc = ?, connection_id = ?, handle = ?, detail = ?,
		        updated_at = CURRENT_TIMESTAMP
		  WHERE id = ?`,
		enc, connID, handle, verifyDetail, id); err != nil {
		log.Printf("record browser session %s: %v", id, err)
	}

	c.JSON(http.StatusOK, gin.H{
		"connection": Connection{
			ID: connID, Platform: platform, AuthLevel: "level-3",
			Status: verifyStatus, Detail: verifyDetail, Handle: handle,
		},
		"sessionId":   id,
		"mode":        mode,
		"cookieCount": captured.CookieCount,
	})
}

func handleCancelBrowserSession(c *gin.Context) {
	id, _, _, ok := ownedSession(c)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	_, _ = workerCall(ctx, http.MethodDelete, "/session/"+id, nil, nil)

	if _, err := db.Exec(
		`UPDATE browser_sessions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		id); err != nil {
		log.Printf("cancel browser session %s: %v", id, err)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

// verifyStorageState navigates to a page that only a signed-in user sees. A
// stored session that quietly expired is the single most likely failure of this
// whole feature, so this is what the UI's status badge is built on.
func verifyStorageState(ctx context.Context, platform string, state json.RawMessage) (status, detail string) {
	target, ok := browserTargets[platform]
	if !ok || target.VerifyURL == "" {
		return "unverified", "Session stored. There is no signed-in page mapped for this platform, so it was not checked."
	}

	var out struct {
		SignedIn bool   `json:"signedIn"`
		Detail   string `json:"detail"`
		Error    string `json:"error"`
	}
	var raw interface{}
	if err := json.Unmarshal(state, &raw); err != nil {
		return "failed", "The captured session could not be decoded."
	}

	code, err := workerCall(ctx, http.MethodPost, "/verify", map[string]interface{}{
		"storageState":     raw,
		"checkUrl":         target.VerifyURL,
		"signedInSelector": target.SignedInSelector,
	}, &out)
	switch {
	case err != nil:
		return "unverified", "Session stored, but the worker could not be reached to check it: " + err.Error()
	case code >= 300:
		msg := out.Error
		if msg == "" {
			msg = fmt.Sprintf("worker returned HTTP %d", code)
		}
		return "unverified", "Session stored, but the check did not run: " + msg
	case out.SignedIn:
		return "verified", "Signed in and confirmed on " + platform + ". Sessions expire on the platform's schedule — Palius re-checks and will tell you when it needs renewing."
	default:
		msg := out.Detail
		if msg == "" {
			msg = "The platform did not show a signed-in page."
		}
		return "failed", msg
	}
}

// verifyBrowserConnection re-checks a stored level-3 connection. Called from
// the shared verify endpoint so a browser session and an API key behave the
// same way from the UI's point of view.
func verifyBrowserConnection(ctx context.Context, platform string, secrets map[string]string) (status, detail string) {
	state := secrets["storageState"]
	if strings.TrimSpace(state) == "" {
		return "failed", "No stored browser session — reconnect through the embedded browser."
	}
	if h := browserWorkerHealth(); !h.Running {
		return "unverified", "Stored, but not checked: " + h.Detail
	}
	return verifyStorageState(ctx, platform, json.RawMessage(state))
}

// storageStateForConnection returns the decrypted browser session stored
// against a user's Level 3 connection to a platform, or "" when there is none.
func storageStateForConnection(platform, uid string) string {
	var enc string
	if err := db.QueryRow(
		`SELECT secrets_enc FROM platform_connections
		  WHERE user_id = ? AND platform = ? AND auth_level = 'level-3'
		    AND status <> 'failed'
		  ORDER BY updated_at DESC`,
		uid, platform).Scan(&enc); err != nil || enc == "" {
		return ""
	}
	secrets, err := decryptSecrets(enc)
	if err != nil {
		log.Printf("decrypt connection session for %s: %v", platform, err)
		return ""
	}
	return secrets["storageState"]
}

// publishViaBrowserConnection publishes a draft through a built-in platform's
// own editor, using the browser session the user signed in with.
//
// This is what makes Level 3 worth having for blogs: Substack has no write API
// at all, Medium no longer issues tokens to new accounts, and dev.to and
// Hashnode both make you go and find one. Signing in is the shorter path — and
// for two of those four it is the only one.
//
// Returns ok=false when this route is not available, so the caller keeps
// whatever the API adapter already decided rather than being overruled.
func publishViaBrowserConnection(ctx context.Context, platform string, req BlogPublishRequest) (BlogPublishResult, bool) {
	mapping, mapped := composeMappings[platform]
	if !mapped || req.OwnerID == "" {
		return BlogPublishResult{}, false
	}
	if !browserWorkerRunning() {
		return BlogPublishResult{}, false
	}

	stateJSON := storageStateForConnection(platform, req.OwnerID)
	if stateJSON == "" {
		return BlogPublishResult{}, false
	}
	var storageState interface{}
	if err := json.Unmarshal([]byte(stateJSON), &storageState); err != nil {
		return BlogPublishResult{}, false
	}

	// Losing someone's writing because a third party renamed a CSS class is not
	// an acceptable failure mode, so every error here still hands back the
	// draft. The selectors are defaults, not a contract — see composeMappings.
	fallback := func(msg string) BlogPublishResult {
		return BlogPublishResult{
			Status:     "export",
			Message:    msg + " The draft is ready to paste.",
			ExportBody: "# " + req.Title + "\n\n" + req.Body,
		}
	}

	var out struct {
		URL   string `json:"url"`
		Error string `json:"error"`
	}
	status, err := workerCall(ctx, http.MethodPost, "/publish/blog", map[string]interface{}{
		"composeUrl":   mapping.ComposeURL,
		"storageState": storageState,
		"selectors":    mapping.Selectors,
		"title":        req.Title,
		"body":         req.Body,
		"tags":         req.Tags,
		"draft":        req.PublishAsDraft,
	}, &out)
	switch {
	case err != nil:
		return fallback(platform + ": could not reach the browser worker (" + err.Error() + ")."), true
	case status >= 300 || out.Error != "":
		msg := out.Error
		if msg == "" {
			msg = fmt.Sprintf("the worker returned HTTP %d", status)
		}
		return fallback(platform + ": publishing through the browser failed — " + msg + "."), true
	}
	return BlogPublishResult{Status: publishedOrDraft(req), URL: out.URL}, true
}

// browserStorageStateFor returns the decrypted storage state behind a session
// reference, for the publishing path. Returns an empty string when there is no
// usable session rather than an error, because every caller treats "no session"
// as an ordinary, reportable outcome.
func browserStorageStateFor(sessionRef, uid string) string {
	var enc string
	// A destination's sessionRef may name either the capture session or the
	// connection it produced; accept both so config written by hand works.
	if err := db.QueryRow(
		`SELECT state_enc FROM browser_sessions
		  WHERE (id = ? OR connection_id = ?) AND user_id = ? AND status = 'active'
		  ORDER BY updated_at DESC`,
		sessionRef, sessionRef, uid).Scan(&enc); err != nil || enc == "" {
		return ""
	}
	secrets, err := decryptSecrets(enc)
	if err != nil {
		log.Printf("decrypt browser session %s: %v", sessionRef, err)
		return ""
	}
	return secrets["storageState"]
}
