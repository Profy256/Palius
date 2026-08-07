package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Blog & micro-blog publishing
//
// Blog WRITING is covered by the subscription (see plans.go) — this file is
// about getting the finished draft onto the platforms where long-form belongs.
//
// Each destination differs in three ways that matter, and the adapter pattern
// below captures all three rather than pretending they are the same:
//
//   1. AUTH        — API token, OAuth bearer, or none (manual export).
//   2. BODY FORMAT — markdown, HTML, or platform-flavoured markdown.
//   3. CANONICAL   — cross-posting the same article to several sites without a
//                    canonical URL splits your SEO between them. Every adapter
//                    that supports it sets canonical_url back to the owner's
//                    own site, which is the single highest-value detail here.
//
// Reddit is deliberately handled differently: it is a community, not a CMS.
// Dropping a marketing article into a subreddit gets you banned, so the adapter
// enforces a discussion-shaped post and requires the target subreddit to be
// named explicitly.
// ---------------------------------------------------------------------------

// BlogDestination identifies where a draft should go.
type BlogDestination struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`     // article | microblog | community
	AuthKind string `json:"authKind"` // apiKey | oauth | none
	Format   string `json:"format"`   // markdown | html | text

	SupportsCanonical bool `json:"supportsCanonical"`
	SupportsTags      bool `json:"supportsTags"`
	SupportsDraft     bool `json:"supportsDraft"`
	SupportsCoverImage bool `json:"supportsCoverImage"`

	MaxTags       int    `json:"maxTags"`
	MaxTitleChars int    `json:"maxTitleChars"`
	Notes         string `json:"notes"`
	DocsURL       string `json:"docsUrl"`
}

// BlogDestinations is the catalog the UI renders as approval toggles.
func BlogDestinations() []BlogDestination {
	return []BlogDestination{
		{
			ID: "devto", Name: "dev.to", Kind: "article", AuthKind: "apiKey", Format: "markdown",
			SupportsCanonical: true, SupportsTags: true, SupportsDraft: true, SupportsCoverImage: true,
			MaxTags: 4, MaxTitleChars: 250,
			Notes:   "Best fit for developer-tool launches. Tags are lowercase alphanumerics only.",
			DocsURL: "https://developers.forem.com/api",
		},
		{
			ID: "hashnode", Name: "Hashnode", Kind: "article", AuthKind: "apiKey", Format: "markdown",
			SupportsCanonical: true, SupportsTags: true, SupportsDraft: true, SupportsCoverImage: true,
			MaxTags: 5, MaxTitleChars: 250,
			Notes:   "GraphQL API. Requires a publicationId; tags must be existing Hashnode tag slugs.",
			DocsURL: "https://apidocs.hashnode.com",
		},
		{
			ID: "linkedin", Name: "LinkedIn article", Kind: "article", AuthKind: "oauth", Format: "text",
			SupportsCanonical: false, SupportsTags: false, SupportsDraft: false, SupportsCoverImage: true,
			MaxTitleChars: 200,
			Notes:   "Posts via the UGC API as an article share. Long-form native articles are not exposed by the public API — the adapter posts the intro plus a link, which is what actually performs anyway.",
			DocsURL: "https://learn.microsoft.com/linkedin/marketing/",
		},
		{
			ID: "reddit", Name: "Reddit", Kind: "community", AuthKind: "oauth", Format: "markdown",
			SupportsCanonical: false, SupportsTags: false, SupportsDraft: false,
			MaxTitleChars: 300,
			Notes:   "Community, not a CMS. Requires an explicit subreddit, respects its self-promotion rules, and posts a discussion rather than an advert.",
			DocsURL: "https://www.reddit.com/dev/api",
		},
		{
			ID: "medium", Name: "Medium", Kind: "article", AuthKind: "apiKey", Format: "markdown",
			SupportsCanonical: true, SupportsTags: true, SupportsDraft: true,
			MaxTags: 5, MaxTitleChars: 100,
			Notes:   "Medium froze new integration tokens; existing tokens still work. Treat as best-effort and fall back to export.",
			DocsURL: "https://github.com/Medium/medium-api-docs",
		},
		{
			ID: "hashnode-newsletter", Name: "Substack / newsletter", Kind: "microblog", AuthKind: "none", Format: "html",
			SupportsCanonical: false, SupportsCoverImage: true,
			Notes: "No public write API. The adapter produces a ready-to-paste HTML export instead of failing silently.",
		},
		{
			ID: "yourwebsite", Name: "Your own site", Kind: "article", AuthKind: "apiKey", Format: "markdown",
			SupportsCanonical: true, SupportsTags: true, SupportsDraft: true, SupportsCoverImage: true,
			MaxTags: 10,
			Notes:   "Posts to your webhook endpoint. This should be the canonical home for every article.",
		},
	}
}

// BlogPublishRequest is one draft heading for one or more destinations.
type BlogPublishRequest struct {
	Title        string   `json:"title"`
	Body         string   `json:"body"`         // markdown
	Intro        string   `json:"intro"`
	Tags         []string `json:"tags"`
	CoverImageURL string  `json:"coverImageUrl"`
	CanonicalURL string   `json:"canonicalUrl"` // the owner's own site
	Destinations []string `json:"destinations"`
	PublishAsDraft bool   `json:"publishAsDraft"`

	// Reddit-specific: refuse to guess a community.
	Subreddit string `json:"subreddit"`

	// OwnerID is who is publishing, used to find their stored browser sessions.
	// Set by the handler from the request, never from the body — trusting the
	// caller here would let anyone publish with someone else's session.
	OwnerID string `json:"-"`
}

// BlogPublishResult is the per-destination outcome.
type BlogPublishResult struct {
	Destination string `json:"destination"`
	Status      string `json:"status"` // published | draft | skipped | failed | export
	URL         string `json:"url,omitempty"`
	Message     string `json:"message,omitempty"`
	ExportBody  string `json:"exportBody,omitempty"`
}

// publishHTTP is the shared client. Generous timeout because some of these APIs
// are slow, but bounded so a hung publish cannot pin a request forever.
var publishHTTP = &http.Client{Timeout: 30 * time.Second}

// PublishBlog fans a draft out to the approved destinations. Failures are
// per-destination: one platform rejecting the post must not lose the others.
func PublishBlog(ctx context.Context, req BlogPublishRequest) []BlogPublishResult {
	results := make([]BlogPublishResult, 0, len(req.Destinations))

	for _, dest := range req.Destinations {
		var r BlogPublishResult
		switch dest {
		case "devto":
			r = publishDevTo(ctx, req)
		case "hashnode":
			r = publishHashnode(ctx, req)
		case "linkedin":
			r = publishLinkedIn(ctx, req)
		case "reddit":
			r = publishReddit(ctx, req)
		case "medium":
			r = publishMedium(ctx, req)
		case "yourwebsite":
			r = publishOwnSite(ctx, req)
		default:
			r = exportOnly(dest, req)
		}

		// "export" means no API credential was configured — or, for Substack,
		// that no write API exists at all. That is precisely the gap Level 3
		// fills, so try the user's browser session before giving up and
		// handing back a draft to paste by hand.
		if r.Status == "export" {
			if viaBrowser, ok := publishViaBrowserConnection(ctx, dest, req); ok {
				r = viaBrowser
			}
		}

		r.Destination = dest
		results = append(results, r)
	}
	return results
}

// ---------------------------------------------------------------------- dev.to

func publishDevTo(ctx context.Context, req BlogPublishRequest) BlogPublishResult {
	key := env("DEVTO_API_KEY", "")
	if key == "" {
		return notConfigured("dev.to", "DEVTO_API_KEY", req)
	}

	// dev.to rejects tags that are not lowercase alphanumeric.
	tags := make([]string, 0, 4)
	for _, t := range req.Tags {
		clean := strings.Map(func(r rune) rune {
			switch {
			case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
				return r
			case r >= 'A' && r <= 'Z':
				return r + 32
			}
			return -1
		}, t)
		if clean != "" {
			tags = append(tags, clean)
		}
		if len(tags) == 4 {
			break
		}
	}

	body := map[string]interface{}{
		"article": map[string]interface{}{
			"title":        truncate(req.Title, 250),
			"body_markdown": req.Body,
			"published":    !req.PublishAsDraft,
			"tags":         tags,
		},
	}
	// Cross-posting without this splits SEO between dev.to and your own site.
	if req.CanonicalURL != "" {
		body["article"].(map[string]interface{})["canonical_url"] = req.CanonicalURL
	}
	if req.CoverImageURL != "" {
		body["article"].(map[string]interface{})["main_image"] = req.CoverImageURL
	}

	var out struct {
		URL string `json:"url"`
	}
	status, err := postJSON(ctx, "https://dev.to/api/articles", body,
		map[string]string{"api-key": key}, &out)
	if err != nil {
		return BlogPublishResult{Status: "failed", Message: err.Error()}
	}
	if status >= 300 {
		return BlogPublishResult{Status: "failed", Message: fmt.Sprintf("dev.to returned %d", status)}
	}
	return BlogPublishResult{Status: publishedOrDraft(req), URL: out.URL}
}

// -------------------------------------------------------------------- Hashnode

func publishHashnode(ctx context.Context, req BlogPublishRequest) BlogPublishResult {
	key := env("HASHNODE_API_KEY", "")
	pub := env("HASHNODE_PUBLICATION_ID", "")
	if key == "" || pub == "" {
		return notConfigured("Hashnode", "HASHNODE_API_KEY + HASHNODE_PUBLICATION_ID", req)
	}

	// Hashnode is GraphQL-only.
	const mutation = `
mutation PublishPost($input: PublishPostInput!) {
  publishPost(input: $input) { post { url } }
}`

	input := map[string]interface{}{
		"title":         truncate(req.Title, 250),
		"contentMarkdown": req.Body,
		"publicationId": pub,
	}
	if req.CanonicalURL != "" {
		input["originalArticleURL"] = req.CanonicalURL
	}
	if req.CoverImageURL != "" {
		input["coverImageOptions"] = map[string]string{"coverImageURL": req.CoverImageURL}
	}
	if len(req.Tags) > 0 {
		tags := []map[string]string{}
		for i, t := range req.Tags {
			if i == 5 {
				break
			}
			tags = append(tags, map[string]string{"slug": slugify(t), "name": t})
		}
		input["tags"] = tags
	}

	var out struct {
		Data struct {
			PublishPost struct {
				Post struct{ URL string } `json:"post"`
			} `json:"publishPost"`
		} `json:"data"`
		Errors []struct{ Message string } `json:"errors"`
	}
	status, err := postJSON(ctx, "https://gql.hashnode.com/",
		map[string]interface{}{"query": mutation, "variables": map[string]interface{}{"input": input}},
		map[string]string{"Authorization": key}, &out)
	if err != nil {
		return BlogPublishResult{Status: "failed", Message: err.Error()}
	}
	if len(out.Errors) > 0 {
		return BlogPublishResult{Status: "failed", Message: out.Errors[0].Message}
	}
	if status >= 300 {
		return BlogPublishResult{Status: "failed", Message: fmt.Sprintf("hashnode returned %d", status)}
	}
	return BlogPublishResult{Status: "published", URL: out.Data.PublishPost.Post.URL}
}

// -------------------------------------------------------------------- LinkedIn

func publishLinkedIn(ctx context.Context, req BlogPublishRequest) BlogPublishResult {
	token := env("LINKEDIN_ACCESS_TOKEN", "")
	author := env("LINKEDIN_AUTHOR_URN", "") // e.g. urn:li:person:xxxx
	if token == "" || author == "" {
		return notConfigured("LinkedIn", "LINKEDIN_ACCESS_TOKEN + LINKEDIN_AUTHOR_URN", req)
	}

	// The public API cannot create native long-form articles. Posting the hook
	// plus a link to the canonical article is both what the API allows and what
	// actually performs — LinkedIn suppresses posts whose only content is an
	// outbound link, so the intro carries the weight.
	commentary := req.Intro
	if commentary == "" {
		commentary = truncate(req.Body, 1200)
	}
	if req.CanonicalURL != "" {
		commentary += "\n\nFull article: " + req.CanonicalURL
	}

	body := map[string]interface{}{
		"author":         author,
		"lifecycleState": "PUBLISHED",
		"specificContent": map[string]interface{}{
			"com.linkedin.ugc.ShareContent": map[string]interface{}{
				"shareCommentary":    map[string]string{"text": truncate(commentary, 3000)},
				"shareMediaCategory": "NONE",
			},
		},
		"visibility": map[string]string{
			"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
		},
	}

	var out struct {
		ID string `json:"id"`
	}
	status, err := postJSON(ctx, "https://api.linkedin.com/v2/ugcPosts", body, map[string]string{
		"Authorization":              "Bearer " + token,
		"X-Restli-Protocol-Version":  "2.0.0",
	}, &out)
	if err != nil {
		return BlogPublishResult{Status: "failed", Message: err.Error()}
	}
	if status >= 300 {
		return BlogPublishResult{Status: "failed", Message: fmt.Sprintf("linkedin returned %d", status)}
	}
	return BlogPublishResult{Status: "published", URL: "https://www.linkedin.com/feed/update/" + out.ID}
}

// ---------------------------------------------------------------------- Reddit

func publishReddit(ctx context.Context, req BlogPublishRequest) BlogPublishResult {
	token := env("REDDIT_ACCESS_TOKEN", "")
	if token == "" {
		return notConfigured("Reddit", "REDDIT_ACCESS_TOKEN", req)
	}
	// Never guess a community. Posting a marketing article to the wrong
	// subreddit gets the account banned, and a ban is not recoverable by
	// retrying.
	if req.Subreddit == "" {
		return BlogPublishResult{
			Status:  "skipped",
			Message: "no subreddit specified — Reddit posts must name their community, and self-promotion rules vary by subreddit",
		}
	}

	// A self post with the discussion in the body, not a bare link. Link-only
	// submissions from a new account read as spam and get removed.
	form := strings.NewReader(
		"sr=" + req.Subreddit +
			"&kind=self" +
			"&title=" + urlEncode(truncate(req.Title, 300)) +
			"&text=" + urlEncode(req.Body) +
			"&api_type=json")

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://oauth.reddit.com/api/submit", form)
	if err != nil {
		return BlogPublishResult{Status: "failed", Message: err.Error()}
	}
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	httpReq.Header.Set("User-Agent", env("REDDIT_USER_AGENT", "palius-social-os/1.0"))

	res, err := publishHTTP.Do(httpReq)
	if err != nil {
		return BlogPublishResult{Status: "failed", Message: err.Error()}
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return BlogPublishResult{Status: "failed",
			Message: fmt.Sprintf("reddit returned %d: %s", res.StatusCode, truncate(string(raw), 200))}
	}

	var out struct {
		JSON struct {
			Errors [][]string `json:"errors"`
			Data   struct {
				URL string `json:"url"`
			} `json:"data"`
		} `json:"json"`
	}
	_ = json.Unmarshal(raw, &out)
	if len(out.JSON.Errors) > 0 {
		return BlogPublishResult{Status: "failed", Message: strings.Join(out.JSON.Errors[0], ": ")}
	}
	return BlogPublishResult{Status: "published", URL: out.JSON.Data.URL}
}

// ---------------------------------------------------------------------- Medium

func publishMedium(ctx context.Context, req BlogPublishRequest) BlogPublishResult {
	token := env("MEDIUM_TOKEN", "")
	userID := env("MEDIUM_USER_ID", "")
	if token == "" || userID == "" {
		return notConfigured("Medium", "MEDIUM_TOKEN + MEDIUM_USER_ID", req)
	}

	status := "public"
	if req.PublishAsDraft {
		status = "draft"
	}
	body := map[string]interface{}{
		"title":         truncate(req.Title, 100),
		"contentFormat": "markdown",
		"content":       req.Body,
		"publishStatus": status,
		"tags":          firstN(req.Tags, 5),
	}
	if req.CanonicalURL != "" {
		body["canonicalUrl"] = req.CanonicalURL
	}

	var out struct {
		Data struct{ URL string } `json:"data"`
	}
	code, err := postJSON(ctx, "https://api.medium.com/v1/users/"+userID+"/posts", body,
		map[string]string{"Authorization": "Bearer " + token}, &out)
	if err != nil {
		return BlogPublishResult{Status: "failed", Message: err.Error()}
	}
	if code >= 300 {
		return BlogPublishResult{Status: "failed",
			Message: fmt.Sprintf("medium returned %d (integration tokens are no longer issued — export instead)", code)}
	}
	return BlogPublishResult{Status: publishedOrDraft(req), URL: out.Data.URL}
}

// ------------------------------------------------------------------- own site

func publishOwnSite(ctx context.Context, req BlogPublishRequest) BlogPublishResult {
	hook := env("OWN_SITE_WEBHOOK_URL", "")
	if hook == "" {
		return notConfigured("your own site", "OWN_SITE_WEBHOOK_URL", req)
	}
	headers := map[string]string{}
	if secret := env("OWN_SITE_WEBHOOK_SECRET", ""); secret != "" {
		headers["Authorization"] = "Bearer " + secret
	}

	var out struct {
		URL string `json:"url"`
	}
	code, err := postJSON(ctx, hook, map[string]interface{}{
		"title":         req.Title,
		"body":          req.Body,
		"intro":         req.Intro,
		"tags":          req.Tags,
		"coverImageUrl": req.CoverImageURL,
		"draft":         req.PublishAsDraft,
	}, headers, &out)
	if err != nil {
		return BlogPublishResult{Status: "failed", Message: err.Error()}
	}
	if code >= 300 {
		return BlogPublishResult{Status: "failed", Message: fmt.Sprintf("webhook returned %d", code)}
	}
	return BlogPublishResult{Status: publishedOrDraft(req), URL: out.URL}
}

// ------------------------------------------------------------------- helpers

// notConfigured returns the draft as an export rather than an error. A missing
// token should not lose the writing — the owner can paste it manually.
func notConfigured(name, envVars string, req BlogPublishRequest) BlogPublishResult {
	return BlogPublishResult{
		Status:  "export",
		Message: fmt.Sprintf("%s is not connected (set %s). The draft is ready to paste.", name, envVars),
		ExportBody: "# " + req.Title + "\n\n" + req.Body,
	}
}

func exportOnly(dest string, req BlogPublishRequest) BlogPublishResult {
	return BlogPublishResult{
		Status:     "export",
		Message:    dest + " has no public write API — copy the draft across manually.",
		ExportBody: "# " + req.Title + "\n\n" + req.Body,
	}
}

func publishedOrDraft(req BlogPublishRequest) string {
	if req.PublishAsDraft {
		return "draft"
	}
	return "published"
}

func postJSON(ctx context.Context, url string, body interface{}, headers map[string]string, out interface{}) (int, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	res, err := publishHTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if out != nil && len(raw) > 0 {
		_ = json.Unmarshal(raw, out)
	}
	return res.StatusCode, nil
}

func firstN(s []string, n int) []string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ' || r == '_' || r == '-':
			b.WriteRune('-')
		}
	}
	return strings.Trim(b.String(), "-")
}

func urlEncode(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		switch {
		case (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.' || c == '~':
			b.WriteByte(c)
		case c == ' ':
			b.WriteByte('+')
		default:
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}
