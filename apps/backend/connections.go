package main

// ---------------------------------------------------------------------------
// Platform connections.
//
// Before this existed, the UI let a user pick "Level 1: Official Platform API"
// and reported success without ever asking for a credential — nothing was
// collected, stored, or checked. Publishing adapters read their tokens from
// process environment variables, so there was no place in the product for a
// user to supply one.
//
// This file gives connections a real home:
//   - a catalog telling the UI exactly which fields each platform needs
//   - encrypted-at-rest storage of those secrets (AES-256-GCM)
//   - a verify step that actually calls the provider where an adapter exists,
//     and honestly reports "unverified" where one does not
//
// Nothing here reports a connection as live unless a provider confirmed it.
// ---------------------------------------------------------------------------

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const connectionSchema = `
CREATE TABLE IF NOT EXISTS platform_connections (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  platform      TEXT NOT NULL,
  auth_level    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'unverified',
  detail        TEXT NOT NULL DEFAULT '',
  handle        TEXT NOT NULL DEFAULT '',
  secrets_enc   TEXT NOT NULL DEFAULT '',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conn_user ON platform_connections(user_id);
`

func initConnections() {
	if _, err := db.Exec(ddl(connectionSchema)); err != nil {
		log.Printf("init connections schema: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Encryption at rest
// ---------------------------------------------------------------------------

// secretKey derives the AES key from PALIUS_SECRET_KEY. Returning an error when
// it is unset is deliberate: storing a customer's API token in plaintext is
// worse than refusing to store it, and the UI has been promising encryption.
func secretKey() ([]byte, error) {
	raw := env("PALIUS_SECRET_KEY", "")
	if strings.TrimSpace(raw) == "" {
		return nil, errors.New("PALIUS_SECRET_KEY is not set — refusing to store credentials in plaintext")
	}
	sum := sha256.Sum256([]byte(raw))
	return sum[:], nil
}

// encryptionAvailable reports whether secrets can be stored at all.
func encryptionAvailable() bool {
	_, err := secretKey()
	return err == nil
}

func encryptSecrets(plain map[string]string) (string, error) {
	if len(plain) == 0 {
		return "", nil
	}
	key, err := secretKey()
	if err != nil {
		return "", err
	}
	blob, err := json.Marshal(plain)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, blob, nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

func decryptSecrets(enc string) (map[string]string, error) {
	out := map[string]string{}
	if enc == "" {
		return out, nil
	}
	key, err := secretKey()
	if err != nil {
		return nil, err
	}
	raw, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(raw) < gcm.NonceSize() {
		return nil, errors.New("ciphertext too short")
	}
	nonce, body := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	blob, err := gcm.Open(nil, nonce, body, nil)
	if err != nil {
		return nil, err
	}
	err = json.Unmarshal(blob, &out)
	return out, err
}

// ---------------------------------------------------------------------------
// Catalog — what each platform actually needs from the user
// ---------------------------------------------------------------------------

// CredentialField is one input the UI must render. Secret fields are write-only:
// they are never returned once stored.
type CredentialField struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Placeholder string `json:"placeholder"`
	Help        string `json:"help"`
	Secret      bool   `json:"secret"`
	Required    bool   `json:"required"`
}

// AuthMethod is one way to connect a platform.
//
// Available=false means the method cannot be used right now — the UI must not
// offer it as if it worked. For OAuth that means no developer app is
// registered; for the embedded browser it means no worker is answering. Both
// are read from the live deployment rather than hard-coded, so the dialog
// reflects what the server can actually do at the moment it is opened.
type AuthMethod struct {
	Level       string            `json:"level"` // level-1 | level-2 | level-3
	Name        string            `json:"name"`
	Summary     string            `json:"summary"`
	Available   bool              `json:"available"`
	Unavailable string            `json:"unavailable,omitempty"`
	Verifiable  bool              `json:"verifiable"`
	DocsURL     string            `json:"docsUrl,omitempty"`
	Fields      []CredentialField `json:"fields"`
}

// ConnectablePlatform is one entry in the connect dialog.
type ConnectablePlatform struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Group   string       `json:"group"` // social | publishing | launch
	Methods []AuthMethod `json:"methods"`
}

// browserMethod is the Level 3 connector: the universal fallback that needs no
// developer app and no API approval. It is the fastest way to connect a
// platform, and the one whose availability depends on infrastructure rather
// than paperwork — hence the live worker check.
func browserMethod(id, what string) AuthMethod {
	summary := "Palius opens " + what + "'s own login page in a built-in browser window and streams it to you. " +
		"You sign in exactly as you normally would, 2FA included. Palius keeps the session that keeps you logged in — " +
		"never your password — sealed with AES-256-GCM. No developer account, no API approval, no browser extension, " +
		"no pasting cookies."

	// Say what the session actually buys, per platform. A login that cannot
	// publish is still worth having, but implying otherwise is not.
	if _, canCompose := composeMappings[id]; canCompose {
		summary += " Posts are then written straight into " + what + "'s own editor."
	} else {
		summary += " Publishing to " + what + " still goes through its API or a manual step — signing in does not add a posting route here."
	}

	m := AuthMethod{
		Level:   "level-3",
		Name:    "Sign in through " + what,
		Summary: summary,
		// Verified by loading a signed-in page with the captured session, which
		// is a real check, not a claim.
		Verifiable: true,
	}

	if !browserLoginSupported(id) {
		m.Available = false
		m.Unavailable = "Palius does not have " + what + "'s login page mapped yet, so there is nothing to open."
		m.Verifiable = false
		return m
	}
	if h := browserWorkerHealth(); !h.Running {
		m.Available = false
		m.Unavailable = h.Detail + " Once a worker is running, this connects " + what + " without waiting on API approval."
		return m
	}
	if !encryptionAvailable() {
		m.Available = false
		m.Unavailable = "PALIUS_SECRET_KEY is not set, so a captured session could not be encrypted. The server will not ask you to log in until it is."
		return m
	}

	m.Available = true
	return m
}

// oauthMethodFor reports OAuth as usable only when the operator has actually
// registered a developer app for that platform. The flow itself is implemented
// in oauth.go; what varies per deployment is whether credentials exist.
func oauthMethodFor(platform, name, docs string) AuthMethod {
	m := AuthMethod{
		Level:      "level-2",
		Name:       "Sign in with " + name,
		Summary:    "Opens " + name + " in your own browser to approve access. You log in on " + name + "'s own page — Palius never sees your password — and the returned token is sealed with AES-256-GCM. No browser extension, no copying cookies.",
		Verifiable: true,
		DocsURL:    docs,
	}
	if oauthConfigured(platform) {
		m.Available = true
		return m
	}
	m.Available = false
	m.Unavailable = "No " + name + " developer app is configured on this server. Register one, set its client id and secret, and add " + redirectURI(platform) + " as the redirect URI."
	return m
}

func apiKeyField(key, label, placeholder, help string) CredentialField {
	return CredentialField{Key: key, Label: label, Placeholder: placeholder, Help: help, Secret: true, Required: true}
}

// ConnectableCatalog is every platform the connect dialog can offer, with the
// real requirements for each. Publishing and launch targets are included —
// they were previously missing from the dialog even though the backend has
// working adapters for them.
func ConnectableCatalog() []ConnectablePlatform {
	social := func(id, name, oauthName, docs string) ConnectablePlatform {
		return ConnectablePlatform{
			ID: id, Name: name, Group: "social",
			Methods: []AuthMethod{oauthMethodFor(id, oauthName, docs), browserMethod(id, name)},
		}
	}

	return []ConnectablePlatform{
		social("tiktok", "TikTok", "TikTok", "https://developers.tiktok.com/doc/content-posting-api-get-started"),
		social("instagram", "Instagram", "Meta", "https://developers.facebook.com/docs/instagram-api"),
		social("facebook", "Facebook", "Meta", "https://developers.facebook.com/docs/pages-api"),
		{
			ID: "linkedin", Name: "LinkedIn", Group: "social",
			Methods: []AuthMethod{
				oauthMethodFor("linkedin", "LinkedIn", "https://learn.microsoft.com/linkedin/marketing/"),
				{
					Level: "level-1", Name: "Access token", Available: true, Verifiable: true,
					Summary: "Paste a LinkedIn access token and your member/organization URN. Used by the article adapter.",
					DocsURL: "https://learn.microsoft.com/linkedin/marketing/",
					Fields: []CredentialField{
						apiKeyField("accessToken", "Access token", "AQV...", "From your LinkedIn developer app, with w_member_social scope."),
						{Key: "authorUrn", Label: "Author URN", Placeholder: "urn:li:person:xxxx", Help: "Member or organization URN that will own the post.", Required: true},
					},
				},
				browserMethod("linkedin", "LinkedIn"),
			},
		},
		{
			ID: "reddit", Name: "Reddit", Group: "social",
			Methods: []AuthMethod{
				oauthMethodFor("reddit", "Reddit", "https://www.reddit.com/dev/api"),
				{
					Level: "level-1", Name: "Access token", Available: true, Verifiable: true,
					Summary: "Paste a Reddit OAuth access token. Posts go out as discussions in a named subreddit, never as adverts.",
					DocsURL: "https://www.reddit.com/dev/api",
					Fields: []CredentialField{
						apiKeyField("accessToken", "Access token", "Bearer token", "From Reddit's OAuth flow, with the submit scope."),
						{Key: "subreddit", Label: "Default subreddit", Placeholder: "r/SideProject", Help: "Respect the subreddit's self-promotion rules."},
					},
				},
				browserMethod("reddit", "Reddit"),
			},
		},
		social("x", "X (Twitter)", "X", "https://developer.x.com/en/docs"),
		social("threads", "Threads", "Meta", "https://developers.facebook.com/docs/threads"),
		social("pinterest", "Pinterest", "Pinterest", "https://developers.pinterest.com/docs/api/v5/"),
		social("youtube", "YouTube", "Google", "https://developers.google.com/youtube/v3"),
		{
			ID: "whatsapp", Name: "WhatsApp Business", Group: "social",
			Methods: []AuthMethod{
				{
					Level: "level-1", Name: "Cloud API token", Available: true, Verifiable: false,
					Summary: "WhatsApp Business Cloud API. Needs a Meta business account and a verified sender number — it is a broadcast/DM channel, not a public feed.",
					DocsURL: "https://developers.facebook.com/docs/whatsapp/cloud-api",
					Fields: []CredentialField{
						apiKeyField("accessToken", "Permanent access token", "EAAG...", "System user token from Meta Business settings."),
						{Key: "phoneNumberId", Label: "Phone number ID", Placeholder: "1234567890", Help: "The sender number registered in WhatsApp Manager.", Required: true},
					},
				},
			},
		},
		{
			ID: "telegram", Name: "Telegram", Group: "social",
			Methods: []AuthMethod{
				{
					Level: "level-1", Name: "Bot token", Available: true, Verifiable: true,
					Summary: "Create a bot with @BotFather, add it to your channel as an admin, then paste the token.",
					DocsURL: "https://core.telegram.org/bots/api",
					Fields: []CredentialField{
						apiKeyField("botToken", "Bot token", "123456:ABC-DEF...", "Issued by @BotFather."),
						{Key: "chatId", Label: "Channel / chat id", Placeholder: "@yourchannel", Help: "Where posts are sent.", Required: true},
					},
				},
			},
		},

		// ---- Publishing & launch targets: adapters exist in publishing.go ----
		{
			ID: "devto", Name: "dev.to", Group: "publishing",
			Methods: []AuthMethod{
				{
					Level: "level-1", Name: "API key", Available: true, Verifiable: true,
					Summary: "Generate a key under Settings → Extensions → DEV Community API Keys.",
					DocsURL: "https://developers.forem.com/api",
					Fields:  []CredentialField{apiKeyField("apiKey", "API key", "your dev.to key", "Settings → Extensions → DEV Community API Keys.")},
				},
				browserMethod("devto", "dev.to"),
			},
		},
		{
			ID: "hashnode", Name: "Hashnode", Group: "publishing",
			Methods: []AuthMethod{
				{
					Level: "level-1", Name: "Personal access token", Available: true, Verifiable: true,
					Summary: "GraphQL API. Needs your publication id as well as the token.",
					DocsURL: "https://apidocs.hashnode.com",
					Fields: []CredentialField{
						apiKeyField("apiKey", "Personal access token", "hashnode PAT", "Account settings → Developer."),
						{Key: "publicationId", Label: "Publication ID", Placeholder: "65f...", Help: "The blog posts are published to.", Required: true},
					},
				},
				browserMethod("hashnode", "Hashnode"),
			},
		},
		{
			ID: "medium", Name: "Medium", Group: "publishing",
			Methods: []AuthMethod{
				// Browser first: Medium has not issued a new integration token
				// in years, so for most accounts the token option is dead and
				// signing in is the only way to publish.
				browserMethod("medium", "Medium"),
				{
					Level: "level-1", Name: "Integration token", Available: true, Verifiable: true,
					Summary: "Medium stopped issuing new integration tokens; existing ones still work. If you do not already hold one, sign in through the browser instead.",
					DocsURL: "https://github.com/Medium/medium-api-docs",
					Fields: []CredentialField{
						apiKeyField("token", "Integration token", "2f8c...", "Only available if you already hold one."),
						{Key: "userId", Label: "User ID", Placeholder: "1a2b3c", Help: "Medium user id that owns the posts."},
					},
				},
			},
		},
		{
			ID: "hashnode-newsletter", Name: "Substack / newsletter", Group: "publishing",
			Methods: []AuthMethod{
				// Substack has no write API whatsoever, so this is not merely
				// the easier route — it is the only one that actually posts.
				browserMethod("hashnode-newsletter", "Substack"),
				{
					Level: "level-1", Name: "Export only", Available: true, Verifiable: false,
					Summary: "Substack has no public write API. Without a browser session Palius prepares a ready-to-paste HTML export rather than failing silently — nothing to connect.",
				},
			},
		},
		{
			ID: "yourwebsite", Name: "Your own site", Group: "publishing",
			Methods: []AuthMethod{{
				Level: "level-1", Name: "Webhook", Available: true, Verifiable: false,
				Summary: "Posts a JSON payload to your endpoint. This should be the canonical home for every article.",
				Fields: []CredentialField{
					{Key: "endpoint", Label: "Webhook URL", Placeholder: "https://yoursite.com/api/posts", Help: "Receives the article as JSON.", Required: true},
					apiKeyField("apiKey", "Shared secret", "optional", "Sent as a bearer token if set."),
				},
			}},
		},
		{
			ID: "producthunt", Name: "Product Hunt", Group: "launch",
			Methods: []AuthMethod{
				{
					Level: "level-1", Name: "Developer token (read-only)", Available: true, Verifiable: true,
					Summary: "Product Hunt's API cannot submit launches — submission is manual by design. A token only enables live vote/comment tracking; Palius prepares a paste-ready launch kit either way.",
					DocsURL: "https://api.producthunt.com/v2/docs",
					Fields:  []CredentialField{apiKeyField("accessToken", "Developer token", "optional", "Only needed for tracking your launch's votes and comments.")},
				},
				// Signing in does not change the fact that launches are
				// submitted by hand — Product Hunt has no create endpoint and
				// no compose form we drive. It saves you pasting a token for
				// tracking, and nothing more.
				browserMethod("producthunt", "Product Hunt"),
			},
		},
	}
}

func findConnectable(id string) (ConnectablePlatform, bool) {
	for _, p := range ConnectableCatalog() {
		if p.ID == id {
			return p, true
		}
	}
	return ConnectablePlatform{}, false
}

func findMethod(p ConnectablePlatform, level string) (AuthMethod, bool) {
	for _, m := range p.Methods {
		if m.Level == level {
			return m, true
		}
	}
	return AuthMethod{}, false
}

// ---------------------------------------------------------------------------
// Stored connections
// ---------------------------------------------------------------------------

// Connection is what the UI lists. Secrets are never included.
type Connection struct {
	ID        string `json:"id"`
	Platform  string `json:"platform"`
	AuthLevel string `json:"authLevel"`
	Status    string `json:"status"` // verified | unverified | failed
	Detail    string `json:"detail"`
	Handle    string `json:"handle"`
	UpdatedAt string `json:"updatedAt"`
}

type connectRequest struct {
	Platform  string            `json:"platform"`
	AuthLevel string            `json:"authLevel"`
	Handle    string            `json:"handle"`
	Fields    map[string]string `json:"fields"`
}

func registerConnectionRoutes(api *gin.RouterGroup) {
	api.GET("/connections/catalog", handleConnectionCatalog)
	api.GET("/connections", handleListConnections)
	api.POST("/connections", handleCreateConnection)
	api.POST("/connections/:id/verify", handleVerifyConnection)
	api.DELETE("/connections/:id", handleDeleteConnection)
}

func handleConnectionCatalog(c *gin.Context) {
	worker := browserWorkerHealth()
	c.JSON(http.StatusOK, gin.H{
		"platforms":            ConnectableCatalog(),
		"encryptionAvailable":  encryptionAvailable(),
		"encryptionNote":       "Credentials are sealed with AES-256-GCM using PALIUS_SECRET_KEY. Without that key the server refuses to store them rather than writing plaintext.",
		"browserWorkerRunning": worker.Running,
		"browserWorkerDetail":  worker.Detail,
	})
}

func handleListConnections(c *gin.Context) {
	rows, err := db.Query(
		`SELECT id, platform, auth_level, status, detail, handle, updated_at
		   FROM platform_connections WHERE user_id = ? ORDER BY updated_at DESC`,
		userId(c))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"connections": []Connection{}})
		return
	}
	defer rows.Close()

	out := []Connection{}
	for rows.Next() {
		var x Connection
		if err := rows.Scan(&x.ID, &x.Platform, &x.AuthLevel, &x.Status, &x.Detail, &x.Handle, &x.UpdatedAt); err == nil {
			out = append(out, x)
		}
	}
	c.JSON(http.StatusOK, gin.H{"connections": out})
}

func handleCreateConnection(c *gin.Context) {
	var req connectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	platform, ok := findConnectable(req.Platform)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown platform: " + req.Platform})
		return
	}
	method, ok := findMethod(platform, req.AuthLevel)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown auth method for " + platform.Name})
		return
	}
	if !method.Available {
		// Refuse rather than report a success the system cannot deliver.
		c.JSON(http.StatusConflict, gin.H{
			"error":  method.Name + " is not available for " + platform.Name,
			"detail": method.Unavailable,
		})
		return
	}

	// Level 3 has no credentials to submit — the session is produced by logging
	// in through the embedded browser. Accepting an empty form here would store
	// a connection with nothing behind it.
	if req.AuthLevel == "level-3" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "browser sessions are not created from this endpoint",
			"detail": "Start one with POST /browser/sessions and finish it with /browser/sessions/{id}/complete.",
		})
		return
	}

	// Every required field must actually be present. The old flow accepted an
	// empty form and declared victory.
	missing := []string{}
	for _, f := range method.Fields {
		if f.Required && strings.TrimSpace(req.Fields[f.Key]) == "" {
			missing = append(missing, f.Label)
		}
	}
	if len(missing) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "missing required credentials",
			"missing": missing,
		})
		return
	}

	secrets := map[string]string{}
	for _, f := range method.Fields {
		if v := strings.TrimSpace(req.Fields[f.Key]); v != "" {
			secrets[f.Key] = v
		}
	}

	enc, err := encryptSecrets(secrets)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	id := fmt.Sprintf("conn-%s-%d", req.Platform, time.Now().UnixNano())
	status, detail := "unverified", "Saved. Not verified — no live check is available for this platform."
	if method.Verifiable {
		status, detail = verifyCredentials(req.Platform, secrets)
	}

	if _, err := db.Exec(
		`INSERT INTO platform_connections (id, user_id, platform, auth_level, status, detail, handle, secrets_enc)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, userId(c), req.Platform, req.AuthLevel, status, detail, req.Handle, enc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save connection"})
		return
	}

	c.JSON(http.StatusOK, Connection{
		ID: id, Platform: req.Platform, AuthLevel: req.AuthLevel,
		Status: status, Detail: detail, Handle: req.Handle,
	})
}

func handleVerifyConnection(c *gin.Context) {
	id := c.Param("id")
	var platform, level, enc string
	if err := db.QueryRow(
		`SELECT platform, auth_level, secrets_enc FROM platform_connections WHERE id = ? AND user_id = ?`,
		id, userId(c)).Scan(&platform, &level, &enc); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connection not found"})
		return
	}
	secrets, err := decryptSecrets(enc)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	// A browser session is checked by loading a signed-in page, not by calling
	// an API — but the outcome is the same shape, so the UI needs no special
	// case. This is what catches a session the platform has since expired.
	var status, detail string
	if level == "level-3" {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
		defer cancel()
		status, detail = verifyBrowserConnection(ctx, platform, secrets)
	} else {
		status, detail = verifyCredentials(platform, secrets)
	}
	if _, err := db.Exec(
		`UPDATE platform_connections SET status = ?, detail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		status, detail, id); err != nil {
		log.Printf("verify connection %s: %v", id, err)
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "status": status, "detail": detail})
}

func handleDeleteConnection(c *gin.Context) {
	if _, err := db.Exec(
		`DELETE FROM platform_connections WHERE id = ? AND user_id = ?`,
		c.Param("id"), userId(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// verifyCredentials calls the provider for real where a cheap authenticated
// read exists. Anything else is reported as unverified — never as connected.
func verifyCredentials(platform string, secrets map[string]string) (status, detail string) {
	switch platform {
	case "devto":
		return checkGet("https://dev.to/api/articles/me?per_page=1",
			map[string]string{"api-key": secrets["apiKey"]}, "dev.to")
	case "telegram":
		return checkGet("https://api.telegram.org/bot"+secrets["botToken"]+"/getMe",
			nil, "Telegram")
	case "medium":
		return checkGet("https://api.medium.com/v1/me",
			map[string]string{"Authorization": "Bearer " + secrets["token"]}, "Medium")
	case "linkedin":
		return checkGet("https://api.linkedin.com/v2/userinfo",
			map[string]string{"Authorization": "Bearer " + secrets["accessToken"]}, "LinkedIn")
	case "reddit":
		return checkGet("https://oauth.reddit.com/api/v1/me",
			map[string]string{
				"Authorization": "Bearer " + secrets["accessToken"],
				"User-Agent":    "palius-os/0.1",
			}, "Reddit")
	case "producthunt":
		if strings.TrimSpace(secrets["accessToken"]) == "" {
			return "unverified", "No token supplied. Launch kits still work — Product Hunt submission is manual regardless."
		}
		return checkGet("https://api.producthunt.com/v2/api/graphql",
			map[string]string{"Authorization": "Bearer " + secrets["accessToken"]}, "Product Hunt")
	case "hashnode":
		return checkGet("https://gql.hashnode.com/",
			map[string]string{"Authorization": secrets["apiKey"]}, "Hashnode")
	}
	return "unverified", "Saved. No live credential check is available for this platform."
}

// checkGet performs the authenticated read and maps the outcome to a status the
// UI can trust.
func checkGet(url string, headers map[string]string, name string) (string, string) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return "failed", "Could not build request: " + err.Error()
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "unverified", "Could not reach " + name + " (" + err.Error() + "). Credentials are stored; retry verification later."
	}
	defer res.Body.Close()

	switch {
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		return "failed", name + " rejected these credentials (HTTP " + fmt.Sprint(res.StatusCode) + ")."
	case res.StatusCode >= 200 && res.StatusCode < 400:
		return "verified", name + " accepted the credentials."
	default:
		return "unverified", name + " returned HTTP " + fmt.Sprint(res.StatusCode) + ". Credentials stored but not confirmed."
	}
}
