package main

// ---------------------------------------------------------------------------
// OAuth 2.0 authorization-code flow.
//
// This is the RFC 8252-shaped path adapted to this architecture. Palius is a
// web app with a local Go API, not an Electron shell, so the loopback listener
// described for desktop apps becomes a callback route on this server — same
// principle, same guarantees:
//
//   1. UI asks for an auth URL and opens it in the user's real browser
//   2. user approves on the provider's own domain (we never see the password)
//   3. provider redirects to our callback with a one-time code
//   4. we exchange the code for a token server-side, using the client secret
//   5. the token is sealed with AES-256-GCM and stored as a connection
//
// A `state` value is minted per attempt and checked on return, so a callback
// that Palius did not initiate is rejected.
//
// What this deliberately does NOT do: read the user's Chrome cookie database,
// ask for their platform password, or drive a hidden login form. Importing a
// browser session to automate an account violates most platforms' terms and is
// what gets accounts flagged — the compliant path is the one above.
// ---------------------------------------------------------------------------

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// oauthProvider is the per-platform endpoint set. Client credentials come from
// the environment because they belong to the operator's registered app, not to
// the end user.
type oauthProvider struct {
	Name      string
	AuthURL   string
	TokenURL  string
	Scopes    string
	ClientID  func() string
	Secret    func() string
	ExtraAuth map[string]string
}

func oauthProviders() map[string]oauthProvider {
	e := func(k string) func() string { return func() string { return env(k, "") } }
	return map[string]oauthProvider{
		"linkedin": {
			Name: "LinkedIn", AuthURL: "https://www.linkedin.com/oauth/v2/authorization",
			TokenURL: "https://www.linkedin.com/oauth/v2/accessToken",
			Scopes:   "openid profile w_member_social",
			ClientID: e("LINKEDIN_CLIENT_ID"), Secret: e("LINKEDIN_CLIENT_SECRET"),
		},
		"reddit": {
			Name: "Reddit", AuthURL: "https://www.reddit.com/api/v1/authorize",
			TokenURL: "https://www.reddit.com/api/v1/access_token",
			Scopes:   "identity submit read",
			ClientID: e("REDDIT_CLIENT_ID"), Secret: e("REDDIT_CLIENT_SECRET"),
			ExtraAuth: map[string]string{"duration": "permanent"},
		},
		"x": {
			Name: "X", AuthURL: "https://twitter.com/i/oauth2/authorize",
			TokenURL: "https://api.twitter.com/2/oauth2/token",
			Scopes:   "tweet.read tweet.write users.read offline.access",
			ClientID: e("X_CLIENT_ID"), Secret: e("X_CLIENT_SECRET"),
		},
		"facebook": {
			Name: "Meta", AuthURL: "https://www.facebook.com/v21.0/dialog/oauth",
			TokenURL: "https://graph.facebook.com/v21.0/oauth/access_token",
			Scopes:   "pages_manage_posts,pages_read_engagement",
			ClientID: e("META_CLIENT_ID"), Secret: e("META_CLIENT_SECRET"),
		},
		"instagram": {
			Name: "Meta", AuthURL: "https://www.facebook.com/v21.0/dialog/oauth",
			TokenURL: "https://graph.facebook.com/v21.0/oauth/access_token",
			Scopes:   "instagram_basic,instagram_content_publish,pages_show_list",
			ClientID: e("META_CLIENT_ID"), Secret: e("META_CLIENT_SECRET"),
		},
		"threads": {
			Name: "Meta", AuthURL: "https://threads.net/oauth/authorize",
			TokenURL: "https://graph.threads.net/oauth/access_token",
			Scopes:   "threads_basic,threads_content_publish",
			ClientID: e("META_CLIENT_ID"), Secret: e("META_CLIENT_SECRET"),
		},
		"pinterest": {
			Name: "Pinterest", AuthURL: "https://www.pinterest.com/oauth/",
			TokenURL: "https://api.pinterest.com/v5/oauth/token",
			Scopes:   "boards:read,pins:read,pins:write",
			ClientID: e("PINTEREST_CLIENT_ID"), Secret: e("PINTEREST_CLIENT_SECRET"),
		},
		"youtube": {
			Name: "Google", AuthURL: "https://accounts.google.com/o/oauth2/v2/auth",
			TokenURL: "https://oauth2.googleapis.com/token",
			Scopes:   "https://www.googleapis.com/auth/youtube.upload",
			ClientID: e("GOOGLE_CLIENT_ID"), Secret: e("GOOGLE_CLIENT_SECRET"),
			ExtraAuth: map[string]string{"access_type": "offline", "prompt": "consent"},
		},
		"tiktok": {
			Name: "TikTok", AuthURL: "https://www.tiktok.com/v2/auth/authorize/",
			TokenURL: "https://open.tiktokapis.com/v2/oauth/token/",
			Scopes:   "user.info.basic,video.publish",
			ClientID: e("TIKTOK_CLIENT_KEY"), Secret: e("TIKTOK_CLIENT_SECRET"),
		},
	}
}

// oauthConfigured reports whether the operator registered an app for this
// platform. Without it the UI must not offer OAuth as if it worked.
func oauthConfigured(platform string) bool {
	p, ok := oauthProviders()[platform]
	return ok && p.ClientID() != "" && p.Secret() != ""
}

// pending holds in-flight authorization attempts, keyed by state.
type pendingAuth struct {
	Platform string
	UserID   string
	Created  time.Time
}

var (
	pendingMu    sync.Mutex
	pendingAuths = map[string]pendingAuth{}
)

func newState() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// sweepPending drops attempts older than 10 minutes so the map cannot grow
// without bound and a stale code cannot be replayed.
func sweepPending() {
	cutoff := time.Now().Add(-10 * time.Minute)
	for k, v := range pendingAuths {
		if v.Created.Before(cutoff) {
			delete(pendingAuths, k)
		}
	}
}

func publicBaseURL() string {
	return strings.TrimRight(env("PALIUS_PUBLIC_URL", "http://localhost:8080"), "/")
}

func appBaseURL() string {
	return strings.TrimRight(env("PALIUS_APP_URL", "http://localhost:3000"), "/")
}

func redirectURI(platform string) string {
	return publicBaseURL() + "/api/v1/oauth/" + platform + "/callback"
}

func registerOAuthRoutes(api *gin.RouterGroup) {
	api.GET("/oauth/:platform/start", handleOAuthStart)
	api.GET("/oauth/:platform/callback", handleOAuthCallback)
}

// handleOAuthStart returns the provider URL the UI should open. It does not
// redirect itself: the UI opens it in a new tab so the user stays in Palius.
func handleOAuthStart(c *gin.Context) {
	platform := c.Param("platform")
	p, ok := oauthProviders()[platform]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no OAuth provider for " + platform})
		return
	}
	if p.ClientID() == "" || p.Secret() == "" {
		c.JSON(http.StatusConflict, gin.H{
			"error": "OAuth is not configured for " + p.Name,
			"detail": "Register a developer app with " + p.Name + " and set its client id and secret on the server, " +
				"then set the redirect URI to " + redirectURI(platform) + ".",
			"redirectUri": redirectURI(platform),
		})
		return
	}

	state := newState()
	pendingMu.Lock()
	sweepPending()
	pendingAuths[state] = pendingAuth{Platform: platform, UserID: userId(c), Created: time.Now()}
	pendingMu.Unlock()

	q := url.Values{}
	q.Set("client_id", p.ClientID())
	q.Set("redirect_uri", redirectURI(platform))
	q.Set("response_type", "code")
	q.Set("scope", p.Scopes)
	q.Set("state", state)
	for k, v := range p.ExtraAuth {
		q.Set(k, v)
	}

	c.JSON(http.StatusOK, gin.H{
		"authUrl": p.AuthURL + "?" + q.Encode(),
		"state":   state,
	})
}

// handleOAuthCallback completes the exchange and stores the token, then bounces
// the user back to the app with a result they can see.
func handleOAuthCallback(c *gin.Context) {
	platform := c.Param("platform")
	state := c.Query("state")

	if errParam := c.Query("error"); errParam != "" {
		c.Redirect(http.StatusFound, appBaseURL()+"/?connected="+platform+"&status=denied")
		return
	}

	pendingMu.Lock()
	sweepPending()
	att, ok := pendingAuths[state]
	delete(pendingAuths, state)
	pendingMu.Unlock()

	// An unknown state means this callback was not started by us.
	if !ok || att.Platform != platform {
		c.Redirect(http.StatusFound, appBaseURL()+"/?connected="+platform+"&status=badstate")
		return
	}

	token, err := exchangeCode(platform, c.Query("code"))
	if err != nil {
		c.Redirect(http.StatusFound, appBaseURL()+"/?connected="+platform+"&status=failed")
		return
	}

	enc, err := encryptSecrets(map[string]string{"accessToken": token})
	if err != nil {
		c.Redirect(http.StatusFound, appBaseURL()+"/?connected="+platform+"&status=nokey")
		return
	}

	id := fmt.Sprintf("conn-%s-%d", platform, time.Now().UnixNano())
	status, detail := verifyCredentials(platform, map[string]string{"accessToken": token})
	if _, err := db.Exec(
		`INSERT INTO platform_connections (id, user_id, platform, auth_level, status, detail, handle, secrets_enc)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, att.UserID, platform, "level-2", status, detail, "", enc); err != nil {
		c.Redirect(http.StatusFound, appBaseURL()+"/?connected="+platform+"&status=savefailed")
		return
	}

	c.Redirect(http.StatusFound, appBaseURL()+"/?connected="+platform+"&status="+status)
}

func exchangeCode(platform, code string) (string, error) {
	p, ok := oauthProviders()[platform]
	if !ok {
		return "", fmt.Errorf("unknown provider %s", platform)
	}
	if code == "" {
		return "", fmt.Errorf("no authorization code returned")
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI(platform))
	form.Set("client_id", p.ClientID())
	form.Set("client_secret", p.Secret())

	req, err := http.NewRequest(http.MethodPost, p.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "palius-os/0.1")
	// Reddit and X require the client credentials as HTTP Basic auth.
	if platform == "reddit" || platform == "x" {
		req.SetBasicAuth(p.ClientID(), p.Secret())
	}

	res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("%s token endpoint returned %d: %s", p.Name, res.StatusCode, string(body))
	}

	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &out); err != nil || out.AccessToken == "" {
		return "", fmt.Errorf("no access_token in %s response", p.Name)
	}
	return out.AccessToken, nil
}
