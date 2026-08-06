package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const systemPrompt = `You are Palius, an AI social media operating system for solo developers, startups without marketing teams, small marketing teams, businesses, and influencers. You research viral content, adapt one piece of content across platforms, and publish where it fits. You always drive traffic back to the owner's website URL when one is provided. Respond with sharp, actionable, data-informed advice.`

// systemJSON makes handlers ask Gemini for strict JSON output.
func systemJSON() string {
	return systemPrompt + " Always respond with valid JSON only, no markdown fences."
}

// jsonFromAI runs a prompt against the configured provider and tries to parse
// the model output as the target type. It returns the provider-reported usage
// so the caller can persist it to the ledger.
func jsonFromAI(ctx context.Context, system, user string, out interface{}) (*TokenUsage, error) {
	text, usage, err := callAI(ctx, system, user, 0.7, true)
	if err != nil {
		return nil, err
	}
	text = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(text, "```json"), "```"))
	if err := json.Unmarshal([]byte(text), out); err != nil {
		return usage, err
	}
	return usage, nil
}

// userId returns the caller id from the X-User-Id header, defaulting to user-1.
func userId(c *gin.Context) string {
	if v := c.GetHeader("X-User-Id"); v != "" {
		ensureUser(v, "Workspace "+v)
		return v
	}
	return "user-1"
}

// aiCall runs a provider call and, on success, records it in the usage ledger.
// It returns whether the call produced usable output.
func aiCall(c *gin.Context, taskType, system, userPrompt string, out interface{}) bool {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	usage, err := jsonFromAI(ctx, system, userPrompt, out)
	if err != nil {
		return false
	}
	recordTextUsage(userId(c), usage, taskType, resolveProvider(), activeModel())
	return true
}

// handleContext ingests product context and returns what it still needs.
func handleContext(c *gin.Context) {
	var req ContextRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// If the owner gave a website URL, scrape it so the AI has real product
	// information even when it knows nothing about the product.
	scraped := ""
	if req.WebsiteURL != "" {
		scraped = scrapePage(req.WebsiteURL)
	}

	user := buildContextPrompt(req, scraped)
	var out ContextResponse
	if aiAvailable() && aiCall(c, "text", systemJSON(), user, &out) {
		if out.ContextID == "" {
			out.ContextID = "ctx-" + fmt.Sprint(time.Now().Unix())
		}
		if out.NeedsMore && len(out.Missing) == 0 {
			out.NeedsMore = false
		}
		out.Scraped = scraped != ""
		out.ScrapedSource = req.WebsiteURL
		c.JSON(http.StatusOK, out)
		return
	}
	out = fallbackContext(req, scraped)
	out.ContextID = "ctx-" + fmt.Sprint(time.Now().Unix())
	c.JSON(http.StatusOK, out)
}

func buildContextPrompt(req ContextRequest, scraped string) string {
	var b strings.Builder
	b.WriteString("The owner is onboarding their product/brand so you can create on-brand content.\n")
	if req.Description != "" {
		b.WriteString("Description: " + req.Description + "\n")
	}
	if req.WebsiteURL != "" {
		b.WriteString("Website URL: " + req.WebsiteURL + " (always link traffic back to this)\n")
	}
	if scraped != "" {
		b.WriteString("Scraped live from the owner's website — use this as the source of truth about the product (ignore any of your own guesses that contradict it):\n" + scraped + "\n")
	}
	if req.Audience != "" {
		b.WriteString("Target audience: " + req.Audience + "\n")
	}
	for _, d := range req.Documents {
		if d.Kind == "image" || d.Kind == "screenshot" {
			b.WriteString(fmt.Sprintf("Owner uploaded a screenshot/image: %s (%s)\n", d.Name, d.ContentType))
		} else {
			b.WriteString(fmt.Sprintf("Document (%s, %s): %s\n", d.Name, d.ContentType, d.Summary))
		}
	}
	b.WriteString(`
Analyze what you now know. Return JSON:
{
  "contextId": "",
  "summary": "short summary of what the AI now understands about the product",
  "confidence": 0,
  "needsMore": true,
  "missing": ["questions the owner must answer so content can go viral"],
  "suggestions": ["next actions, e.g. add website URL or upload README"],
  "requestedAssets": []
}
If the owner wants visual content (video, image carousel, graphics) for the brand and you lack product visuals (screenshots of the app/product, photos, logos), list what you need in requestedAssets as {"type":"screenshot|image|video|pdf|document|markdown","reason":"why it is needed","required":true}.
Set needsMore=true and fill missing only if context is genuinely insufficient to create content.`)
	return b.String()
}

// handleAnalyze scores a draft and asks for more context if needed.
func handleAnalyze(c *gin.Context) {
	var req ContentAnalyzeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	user := buildAnalyzePrompt(req)
	var out ContentAnalyzeResponse
	if aiAvailable() && aiCall(c, "text", systemJSON(), user, &out) {
		c.JSON(http.StatusOK, out)
		return
	}
	c.JSON(http.StatusOK, fallbackAnalyze(req))
}

func buildAnalyzePrompt(req ContentAnalyzeRequest) string {
	var b strings.Builder
	b.WriteString("Analyze this content draft before publishing:\n")
	if req.Prompt != "" {
		b.WriteString("Creator prompt/goal: " + req.Prompt + "\n")
	}
	b.WriteString("Caption: " + req.Caption + "\n")
	if req.WebsiteURL != "" {
		b.WriteString("Website URL (must be referenced/CTAd): " + req.WebsiteURL + "\n")
	}
	b.WriteString("Target platform: " + req.Platform + "\n")
	b.WriteString("Content type: " + req.ContentType + " (has media: " + fmt.Sprint(req.HasMedia) + ")\n")
	if req.Context != "" {
		b.WriteString("Known product context: " + req.Context + "\n")
	}
	b.WriteString(`
Return JSON:
{
  "score": 0,
  "viralPotential": 0,
  "strengths": ["..."],
  "improvements": ["..."],
  "bestPlatforms": ["tiktok","linkedin", ...],
  "recommendedPostingWindow": "day time window",
  "needsMoreContext": true,
  "contextQuestions": ["questions to ask the owner if context is thin"],
  "requestedAssets": []
}
The owner is generating content of type ` + req.ContentType + ` with media: ` + fmt.Sprint(req.HasMedia) + `.
If the content type is video or image/carousel for the brand and you do not have product visuals, ask for screenshots/photos of the product in requestedAssets (e.g. {"type":"screenshot","reason":"needed to build the carousel/video visuals","required":true}).
Set needsMoreContext=true and fill contextQuestions only if the draft lacks enough product context.`)
	return b.String()
}

// handleGenerate adapts a piece of content to every selected platform.
func handleGenerate(c *gin.Context) {
	var req ContentGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	user := buildGeneratePrompt(req)
	var out ContentGenerateResponse
	if aiAvailable() && aiCall(c, "text", systemJSON(), user, &out) {
		finalizeGenerate(&req, &out)
		c.JSON(http.StatusOK, out)
		return
	}
	out = fallbackVariants(req)
	finalizeGenerate(&req, &out)
	c.JSON(http.StatusOK, out)
}

func buildGeneratePrompt(req ContentGenerateRequest) string {
	var b strings.Builder
	if req.BlogOnly() {
		// The owner wants long-form only. Do not produce social posts and do not
		// suggest them — social publishing was explicitly not asked for.
		b.WriteString("The owner wants LONG-FORM ONLY for this run: a blog / micro-blog, no social media posts.\n")
		b.WriteString("Return an EMPTY variants array. Do not write captions, hooks or hashtags for social platforms, and do not suggest posting to them.\n")
	} else {
		b.WriteString("Adapt the following piece of content for these platforms. For each platform rewrite the caption so it feels native, pick the right format, and give 2 hook options and relevant hashtags.\n")
		b.WriteString("Platforms to target: " + strings.Join(req.Platforms, ", ") + "\n")
	}
	if req.Prompt != "" {
		b.WriteString("Creator prompt/goal: " + req.Prompt + "\n")
	}
	if req.ContentType != "" {
		b.WriteString("Content being created: " + req.ContentType + "\n")
		if strings.Contains(strings.ToLower(req.ContentType), "video") || strings.Contains(strings.ToLower(req.ContentType), "image") || strings.Contains(strings.ToLower(req.ContentType), "carousel") {
			b.WriteString("This is VISUAL content for the brand. Use the owner's product screenshots/visuals when describing or generating it; if none are attached, tell the owner explicitly what visuals you need.\n")
		}
	}
	b.WriteString("Core caption: " + req.Caption + "\n")
	if req.WebsiteURL != "" {
		b.WriteString("Website URL: " + req.WebsiteURL + " — always point traffic here (link in bio, url field, first comment, or article body depending on platform rules).\n")
	}
	if req.Style != "" {
		b.WriteString("Caption style: " + req.Style + "\n")
	} else {
		b.WriteString("Caption style: pick the most effective style for this content and platform automatically.\n")
	}
	if req.Context != "" {
		b.WriteString("Product context: " + req.Context + "\n")
	} else if req.WebsiteURL != "" {
		// No context was gathered up front, so fall back to reading the URL the
		// owner provided. The URL exists for exactly this reason — it is how the
		// AI learns a product it knows nothing about when no docs were uploaded.
		if scraped := scrapePage(req.WebsiteURL); scraped != "" {
			b.WriteString("Product context (scraped live from " + req.WebsiteURL + " — use as the source of truth):\n" + scraped + "\n")
		} else {
			b.WriteString("Website URL (could not scrape): " + req.WebsiteURL + "\n")
		}
	}
	if req.Audience != "" {
		b.WriteString("Audience: " + req.Audience + "\n")
	} else {
		b.WriteString("Audience: infer the best-fit target audience for this content automatically.\n")
	}
	if req.WantsBlog() {
		b.WriteString("The owner APPROVED writing a companion blog / micro-blog. Generate it as a DRAFT ONLY.\n")
		b.WriteString("The blog must be approved by the owner before it is posted anywhere. Only PROPOSE destinations — do not mark anything as published.\n")
		b.WriteString("Decide whether the destination blog format needs a cover image or screenshot (e.g. Medium, Substack, website hero). If it does, set requiresImage=true and describe the image in the 'image' field.\n")
	} else {
		b.WriteString("Suggest (do not generate) whether a blog / micro-blog would help this tech product.\n")
	}
	b.WriteString("Owner supplied product visuals (screenshots/photos): " + fmt.Sprint(req.HasVisuals) + "\n")
	b.WriteString(`
After you have planned the content, list everything you still need from the owner in "requestedAssets" — a screenshot, a product photo, a logo, a blog cover, a demo video, a document. Never invent, assume or substitute a visual you were not given, and never describe a product detail you cannot source from the context above: ask for it instead. Set "for" to the exact thing it is needed for (e.g. "blog cover", "instagram carousel"). Ask for nothing you already have.
Return JSON:
{
  "score": 0,
  "blogSuggested": true,
  "blogApprovalText": "one-line ask to the owner about generating a blog",
  "requestedAssets": [{"type":"screenshot|image|video|pdf|document|markdown","reason":"why you need it","required":true,"for":"blog cover"}],
  "variants": [
    {"platform":"tiktok","format":"...","caption":"...","hooks":[".."],"hashtags":[".."],"urlInBio":true,"linkPlace":"..."}
  ]
}
If a blog was approved, also return "blog": {"title":"...","format":"blog|micro-blog","intro":"...","sections":["..."],"cta":"...","suitableFor":["website","linkedin-article","medium","substack"],"publishedTo":[],"requiresImage":true,"image":"description of the cover/screenshot the blog needs"}`)
	return b.String()
}

func finalizeGenerate(req *ContentGenerateRequest, out *ContentGenerateResponse) {
	if out.Blog == nil && req.WantsBlog() {
		out.Blog = fallbackBlog(*req)
	}
	if req.BlogOnly() {
		// Long-form only — social posts were not asked for, so never backfill them.
		out.Variants = nil
	} else if len(out.Variants) == 0 {
		f := fallbackVariants(*req)
		out.Variants = f.Variants
	}
	out.RequestedAssets = append(out.RequestedAssets, missingBlogVisual(*req, out)...)
}

// missingBlogVisual asks the owner for the cover the blog needs when they have
// not given the AI any visual to work from. The AI must ask rather than pick
// something for them.
func missingBlogVisual(req ContentGenerateRequest, out *ContentGenerateResponse) []RequestedAsset {
	if req.HasVisuals || out.Blog == nil || !out.Blog.RequiresImage {
		return nil
	}
	for _, a := range out.RequestedAssets {
		if a.Type == "screenshot" || a.Type == "image" {
			return nil // the AI already asked
		}
	}
	reason := "This blog destination will not publish without a cover image, and you have not given me a product visual to use."
	if out.Blog.Image != "" {
		reason = "The blog needs a cover: " + out.Blog.Image + ". Upload one — I will not substitute a stock image."
	}
	return []RequestedAsset{{Type: "screenshot", Reason: reason, Required: true, For: "blog cover"}}
}

// handleViralResearch researches content ideas and virality tactics.
func handleViralResearch(c *gin.Context) {
	var req ViralResearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if req.Count <= 0 {
		req.Count = 6
	}

	user := buildViralPrompt(req)
	var out ViralResearchResponse
	if aiAvailable() && aiCall(c, "text", systemJSON(), user, &out) {
		c.JSON(http.StatusOK, out)
		return
	}
	c.JSON(http.StatusOK, fallbackViral(req))
}

func buildViralPrompt(req ViralResearchRequest) string {
	var b strings.Builder
	b.WriteString("You are a viral content researcher. Search your knowledge of how top creators and brands win on social platforms, then produce concrete, copyable tactics.\n")
	b.WriteString("Topic/niche: " + req.Topic + "\n")
	if req.Industry != "" {
		b.WriteString("Industry: " + req.Industry + "\n")
	}
	b.WriteString("Platforms of interest: " + strings.Join(req.Platforms, ", ") + "\n")
	b.WriteString(fmt.Sprintf("Return at least %d items in each list.\n", req.Count))
	b.WriteString(`
Return JSON:
{
  "trends": ["trending content themes right now"],
  "contentIdeas": ["specific post ideas with a hook"],
  "postingStyles": ["styles/formats that are winning"],
  "tactics": ["distribution/engagement tactics that go viral"],
  "sources": ["where these findings come from: creator playbooks, public analytics, teardowns"],
  "summary": "one paragraph strategic summary"
}`)
	return b.String()
}

// handleAnalytics returns per-platform analytics.
func handleAnalytics(c *gin.Context) {
	platform := c.Param("platform")
	if platform == "" {
		platform = "tiktok"
	}

	var out PlatformAnalytics
	if aiAvailable() {
		user := fmt.Sprintf(`Act as an analytics engine. Produce plausible, internally-consistent social analytics for the "%s" account of a small brand with a 60-day growth trend. Return JSON:
{
  "platform":"%s","followers":"..","reach":"..","impressions":"..","engagementRate":"..","views":"..","saves":"..","shares":"..","bestPostingTime":"..","growthTrend":[6 numbers, weekly],"topContent":["top 2-3 posts with metrics"],"summary":"strategic summary","avgViews":0,"optimalPostCountPerWk":".."
}`, platform, platform)
		if aiCall(c, "text", systemJSON(), user, &out) && out.Platform != "" {
			c.JSON(http.StatusOK, out)
			return
		}
	}
	c.JSON(http.StatusOK, fallbackAnalytics(platform))
}
