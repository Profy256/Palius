package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
)

// ---------------------------------------------------------------------------
// User-defined destinations
//
// The built-in adapters in publishing.go cover the platforms we ship with. They
// are NOT the boundary of the system. Per the PRD, the owner must be able to
// discover a new blog or social site, connect it themselves, and publish there
// without waiting for us to ship an adapter — and without a deploy.
//
// Three escape hatches, in increasing order of effort:
//
//   1. API MAPPING     — the site has a REST API. The owner describes it as
//                        JSON: endpoint, auth header, and which field name
//                        carries the title/body/tags. No code.
//   2. BROWSER SESSION — the site has no API. The owner logs in through the
//                        embedded browser; we store the encrypted session and
//                        drive the compose form with CSS selectors. This is the
//                        Level 3 connector from the PRD, applied to blogs.
//   3. EXPORT          — nothing works. We hand back a formatted draft rather
//                        than losing the writing.
//
// Definitions live in the database and are read per request, so adding a
// destination takes effect immediately.
// ---------------------------------------------------------------------------

const destinationSchema = `
CREATE TABLE IF NOT EXISTS custom_destinations (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'article',
  mode          TEXT NOT NULL DEFAULT 'api',
  config_json   TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dest_user ON custom_destinations(user_id);
`

func initDestinations() {
	if _, err := db.Exec(ddl(destinationSchema)); err != nil {
		log.Printf("init destinations schema: %v", err)
	}
}

// APIMapping describes an arbitrary REST endpoint well enough to post to it.
// This is what lets a user connect a site we have never heard of.
type APIMapping struct {
	Endpoint string            `json:"endpoint"`
	Method   string            `json:"method"` // default POST
	Headers  map[string]string `json:"headers"`

	// AuthHeader/AuthPrefix keep the secret out of Headers so it can be stored
	// encrypted and redacted in the UI.
	AuthHeader string `json:"authHeader"` // e.g. "Authorization"
	AuthPrefix string `json:"authPrefix"` // e.g. "Bearer "
	AuthSecret string `json:"authSecret"`

	// FieldMap renames our canonical fields to whatever the target expects.
	// e.g. {"title":"post[title]", "body":"post[content]"}
	FieldMap map[string]string `json:"fieldMap"`

	// Wrapper nests the payload under a key, e.g. "article" for dev.to-shaped
	// APIs that expect {"article": {...}}.
	Wrapper string `json:"wrapper"`

	// Extra static fields merged into every request (e.g. publicationId).
	Extra map[string]interface{} `json:"extra"`

	// URLPath is a dotted path into the response holding the published URL.
	URLPath string `json:"urlPath"`
}

// composeSelectors locates the parts of an editor. Named rather than inline so
// the built-in compose mappings in browser.go can be written against the same
// shape a user-defined destination uses.
type composeSelectors struct {
	Title       string `json:"title"`
	Body        string `json:"body"`
	Tags        string `json:"tags"`
	CoverUpload string `json:"coverUpload"`
	PublishBtn  string `json:"publishButton"`
	DraftBtn    string `json:"draftButton"`
}

// BrowserMapping drives a compose form through the embedded browser when the
// site has no API. Mirrors the connector-script model used for social posting.
type BrowserMapping struct {
	LoginURL   string           `json:"loginUrl"`
	ComposeURL string           `json:"composeUrl"`
	Selectors  composeSelectors `json:"selectors"`
	// SessionRef points at the encrypted cookie jar captured at login time.
	SessionRef string `json:"sessionRef"`
}

// CustomDestination is a user-added publishing target.
type CustomDestination struct {
	ID      string          `json:"id"`
	UserID  string          `json:"userId"`
	Name    string          `json:"name"`
	Kind    string          `json:"kind"`
	Mode    string          `json:"mode"` // api | browser | export
	Config  json.RawMessage `json:"config"`
	Enabled bool            `json:"enabled"`
}

func listCustomDestinations(uid string) ([]CustomDestination, error) {
	rows, err := db.Query(
		`SELECT id, user_id, name, kind, mode, config_json, enabled
		 FROM custom_destinations WHERE user_id = ? ORDER BY name`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []CustomDestination{}
	for rows.Next() {
		var d CustomDestination
		var cfg string
		var enabled int
		if err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.Kind, &d.Mode, &cfg, &enabled); err != nil {
			continue
		}
		d.Config = json.RawMessage(cfg)
		d.Enabled = enabled == 1
		out = append(out, d)
	}
	return out, nil
}

// Takes a pointer so the generated ID is visible to the caller — returning it
// only in the DB row left the API response with an empty id.
func saveCustomDestination(d *CustomDestination) error {
	if d.ID == "" {
		d.ID = "dest-" + slugify(d.Name) + "-" + newOperationID()[3:11]
	}
	enabled := 0
	if d.Enabled {
		enabled = 1
	}
	_, err := db.Exec(
		`INSERT INTO custom_destinations (id, user_id, name, kind, mode, config_json, enabled)
		 VALUES (?,?,?,?,?,?,?)
		 ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind,
		   mode=excluded.mode, config_json=excluded.config_json,
		   enabled=excluded.enabled, updated_at=CURRENT_TIMESTAMP`,
		d.ID, d.UserID, d.Name, d.Kind, d.Mode, string(d.Config), enabled)
	return err
}

// publishToCustom routes a draft to a user-defined destination.
func publishToCustom(ctx context.Context, d CustomDestination, req BlogPublishRequest) BlogPublishResult {
	switch d.Mode {
	case "api":
		var m APIMapping
		if err := json.Unmarshal(d.Config, &m); err != nil {
			return BlogPublishResult{Status: "failed", Message: "invalid API mapping: " + err.Error()}
		}
		return publishViaMapping(ctx, d.Name, m, req)

	case "browser":
		var m BrowserMapping
		if err := json.Unmarshal(d.Config, &m); err != nil {
			return BlogPublishResult{Status: "failed", Message: "invalid browser mapping: " + err.Error()}
		}
		return publishViaBrowser(ctx, d.Name, d.UserID, m, req)

	default:
		return exportOnly(d.Name, req)
	}
}

// publishViaMapping posts to an arbitrary API described entirely by config.
func publishViaMapping(ctx context.Context, name string, m APIMapping, req BlogPublishRequest) BlogPublishResult {
	if m.Endpoint == "" {
		return BlogPublishResult{Status: "failed", Message: name + ": no endpoint configured"}
	}

	field := func(canonical, fallback string) string {
		if m.FieldMap != nil {
			if v, ok := m.FieldMap[canonical]; ok && v != "" {
				return v
			}
		}
		return fallback
	}

	payload := map[string]interface{}{
		field("title", "title"): req.Title,
		field("body", "body"):   req.Body,
	}
	if len(req.Tags) > 0 {
		payload[field("tags", "tags")] = req.Tags
	}
	if req.CanonicalURL != "" {
		payload[field("canonicalUrl", "canonical_url")] = req.CanonicalURL
	}
	if req.CoverImageURL != "" {
		payload[field("coverImageUrl", "cover_image")] = req.CoverImageURL
	}
	payload[field("published", "published")] = !req.PublishAsDraft
	for k, v := range m.Extra {
		payload[k] = v
	}

	var body interface{} = payload
	if m.Wrapper != "" {
		body = map[string]interface{}{m.Wrapper: payload}
	}

	headers := map[string]string{}
	for k, v := range m.Headers {
		headers[k] = v
	}
	if m.AuthHeader != "" && m.AuthSecret != "" {
		headers[m.AuthHeader] = m.AuthPrefix + m.AuthSecret
	}

	var raw map[string]interface{}
	status, err := postJSON(ctx, m.Endpoint, body, headers, &raw)
	if err != nil {
		return BlogPublishResult{Status: "failed", Message: name + ": " + err.Error()}
	}
	if status >= 300 {
		return BlogPublishResult{Status: "failed",
			Message: fmt.Sprintf("%s returned %d", name, status)}
	}
	return BlogPublishResult{Status: publishedOrDraft(req), URL: digPath(raw, m.URLPath)}
}

// publishViaBrowser hands the job to the Playwright worker. The worker is a
// separate service (see DEPLOYMENT.md) because it needs a real Chromium; when
// it is not deployed we say so plainly rather than silently dropping the post.
//
// The session is resolved and decrypted here rather than in the worker: the
// worker holds no database and no encryption key, which is what lets it be
// restarted or scaled without anyone's login going with it.
func publishViaBrowser(ctx context.Context, name, uid string, m BrowserMapping, req BlogPublishRequest) BlogPublishResult {
	if !browserWorkerRunning() {
		return BlogPublishResult{
			Status: "export",
			Message: name + ": browser publishing needs the Playwright worker — " +
				browserWorkerHealth().Detail + " The draft is ready to paste.",
			ExportBody: "# " + req.Title + "\n\n" + req.Body,
		}
	}
	if m.SessionRef == "" {
		return BlogPublishResult{Status: "failed",
			Message: name + ": not logged in — connect the site through the embedded browser first"}
	}

	state := browserStorageStateFor(m.SessionRef, uid)
	if state == "" {
		return BlogPublishResult{Status: "failed",
			Message: name + ": the stored browser session is missing or expired — sign in again through the embedded browser"}
	}
	var storageState interface{}
	if err := json.Unmarshal([]byte(state), &storageState); err != nil {
		return BlogPublishResult{Status: "failed", Message: name + ": stored session is unreadable"}
	}

	var out struct {
		URL   string `json:"url"`
		Error string `json:"error"`
	}
	status, err := workerCall(ctx, http.MethodPost, "/publish/blog", map[string]interface{}{
		"composeUrl":   m.ComposeURL,
		"storageState": storageState,
		"selectors":    m.Selectors,
		"title":        req.Title,
		"body":         req.Body,
		"tags":         req.Tags,
		"draft":        req.PublishAsDraft,
	}, &out)
	if err != nil {
		return BlogPublishResult{Status: "failed", Message: name + ": " + err.Error()}
	}
	if status >= 300 || out.Error != "" {
		return BlogPublishResult{Status: "failed",
			Message: fmt.Sprintf("%s: worker failed (%d) %s", name, status, out.Error)}
	}
	return BlogPublishResult{Status: publishedOrDraft(req), URL: out.URL}
}

// digPath walks a dotted path through a decoded JSON body ("data.post.url").
func digPath(m map[string]interface{}, path string) string {
	if path == "" || m == nil {
		return ""
	}
	var cur interface{} = m
	for _, part := range strings.Split(path, ".") {
		asMap, ok := cur.(map[string]interface{})
		if !ok {
			return ""
		}
		cur, ok = asMap[part]
		if !ok {
			return ""
		}
	}
	if s, ok := cur.(string); ok {
		return s
	}
	return ""
}

// ---------------------------------------------------------------------------
// Product Hunt
//
// Worth being precise about, because it is the highest-leverage launch channel
// for exactly the audience this product targets — and because its API does NOT
// do what people assume.
//
// Product Hunt's GraphQL v2 API is effectively READ-ONLY for launches. You
// cannot create a post/launch through it; launches must be submitted through
// the website by a human. What the API is genuinely good for:
//
//   • tracking your own launch's votes/comments in real time
//   • monitoring competitor launches (feeds the competitor tracker)
//   • pulling trending products as raw material for viral research
//
// So the adapter does two honest things: it produces a complete launch kit for
// the manual submission, and it exposes the read API for tracking. Pretending
// to "publish to Product Hunt" would just fail at 12:01am PT on launch day.
// ---------------------------------------------------------------------------

// ProductHuntLaunchKit is everything needed to paste a launch into the form.
type ProductHuntLaunchKit struct {
	Tagline      string   `json:"tagline"`      // 60 chars, hard limit
	Description  string   `json:"description"`  // 260 chars
	FirstComment string   `json:"firstComment"` // the maker's comment — matters most
	Topics       []string `json:"topics"`
	GalleryNeeds []string `json:"galleryNeeds"`
	Checklist    []string `json:"checklist"`
	SubmitURL    string   `json:"submitUrl"`
	Warning      string   `json:"warning"`
}

func buildProductHuntKit(req BlogPublishRequest, websiteURL string) ProductHuntLaunchKit {
	tagline := req.Intro
	if len(tagline) > 60 {
		tagline = truncate(tagline, 57)
	}
	desc := req.Intro
	if len(desc) > 260 {
		desc = truncate(desc, 257)
	}

	return ProductHuntLaunchKit{
		Tagline:     tagline,
		Description: desc,
		FirstComment: "Hey Product Hunt 👋\n\n" + req.Intro +
			"\n\nWhy I built this:\n[one honest paragraph — this is the part people actually read]\n\n" +
			"Would love your feedback on what to build next.",
		Topics:       firstN(req.Tags, 3),
		GalleryNeeds: []string{
			"Thumbnail 240x240 (GIF works and stands out in the feed)",
			"Gallery images 1270x760, first one is the hero",
			"Optional 30-60s demo video",
		},
		Checklist: []string{
			"Launch at 12:01am PT — the 24h ranking window starts then",
			"Launch Tue-Thu; weekends have less traffic",
			"Post the maker's first comment immediately after going live",
			"Do NOT ask directly for upvotes — it is against the rules and gets you delisted",
			"Reply to every comment in the first 4 hours",
			"Have the website URL live and the signup flow tested before submitting",
		},
		SubmitURL: "https://www.producthunt.com/posts/new",
		Warning: "Product Hunt's API cannot create launches — submission is manual by design. " +
			"This kit is ready to paste; tracking runs through the read API once you are live.",
	}
}

// fetchProductHuntStats reads a live launch's performance for the analytics and
// competitor views. Read-only, which is all the API allows.
func fetchProductHuntStats(ctx context.Context, slug string) (map[string]interface{}, error) {
	token := env("PRODUCTHUNT_TOKEN", "")
	if token == "" {
		return nil, fmt.Errorf("PRODUCTHUNT_TOKEN not set")
	}

	const q = `query($slug: String!) {
  post(slug: $slug) {
    name tagline votesCount commentsCount featuredAt url
    topics(first: 5) { edges { node { name } } }
  }
}`

	var out map[string]interface{}
	status, err := postJSON(ctx, "https://api.producthunt.com/v2/api/graphql",
		map[string]interface{}{"query": q, "variables": map[string]string{"slug": slug}},
		map[string]string{"Authorization": "Bearer " + token}, &out)
	if err != nil {
		return nil, err
	}
	if status >= 300 {
		return nil, fmt.Errorf("product hunt returned %d", status)
	}
	return out, nil
}
