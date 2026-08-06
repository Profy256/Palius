package main

import (
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var (
	reTitle     = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	reMetaDesc  = regexp.MustCompile(`(?i)<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']`)
	reMetaDesc2 = regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']`)
	reTag       = regexp.MustCompile(`<[^>]+>`)
	reSpace     = regexp.MustCompile(`\s+`)
)

// scrapePage fetches a URL and returns a compact text digest (page title,
// meta description and visible body text) so the AI can learn about the
// product even when it has no prior information. It returns "" when the page
// cannot be fetched. This powers the "user provides a URL so the platform can
// search/scrape it" behavior.
func scrapePage(rawURL string) string {
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}
	client := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (PaliusBot/1.0; +https://palius.ai) AppleWebKit/537.36 Chrome/120 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/json")
	req.Header.Set("Accept-Language", "en")

	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return ""
	}
	html := string(body)

	var b strings.Builder
	if m := reTitle.FindStringSubmatch(html); len(m) > 1 && strings.TrimSpace(m[1]) != "" {
		b.WriteString("Page title: " + clean(m[1]) + "\n")
	}
	if m := reMetaDesc.FindStringSubmatch(html); len(m) > 1 && strings.TrimSpace(m[1]) != "" {
		b.WriteString("Description: " + clean(m[1]) + "\n")
	} else if m := reMetaDesc2.FindStringSubmatch(html); len(m) > 1 && strings.TrimSpace(m[1]) != "" {
		b.WriteString("Description: " + clean(m[1]) + "\n")
	}
	text := clean(reTag.ReplaceAllString(html, " "))
	if text != "" {
		b.WriteString("Page content: " + text + "\n")
	}

	out := strings.TrimSpace(b.String())
	if out == "" {
		return ""
	}
	const maxLen = 6000
	if len(out) > maxLen {
		out = out[:maxLen]
	}
	return out
}

// clean trims and collapses runs of whitespace.
func clean(s string) string {
	return strings.TrimSpace(reSpace.ReplaceAllString(s, " "))
}
