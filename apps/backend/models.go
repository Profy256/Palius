package main

// ContextDoc is a summarized document attached to a product context request.
// Kind describes what was uploaded: text | image | pdf | file.
type ContextDoc struct {
	Name        string `json:"name"`
	ContentType string `json:"contentType"`
	Summary     string `json:"summary"`
	Kind        string `json:"kind"`
}

// ContextRequest carries product/brand context the owner wants the AI to learn.
type ContextRequest struct {
	Description string       `json:"description"`
	WebsiteURL  string       `json:"websiteUrl"`
	Audience    string       `json:"audience"`
	Documents   []ContextDoc `json:"documents"`
}

// ContextResponse tells the owner what the AI understood and what it still needs.
type ContextResponse struct {
	ContextID      string           `json:"contextId"`
	Summary        string           `json:"summary"`
	Confidence     int              `json:"confidence"`
	NeedsMore      bool             `json:"needsMore"`
	Missing        []string         `json:"missing"`
	Suggestions    []string         `json:"suggestions"`
	Scraped        bool             `json:"scraped"`
	ScrapedSource  string           `json:"scrapedSource"`
	RequestedAssets []RequestedAsset `json:"requestedAssets"`
}

// ContentAnalyzeRequest is the draft a creator is about to publish.
type ContentAnalyzeRequest struct {
	Caption     string   `json:"caption"`
	Prompt      string   `json:"prompt"`
	WebsiteURL  string   `json:"websiteUrl"`
	Platform    string   `json:"platform"`
	Context     string   `json:"context"`
	ContentType string   `json:"contentType"`
	HasMedia    bool     `json:"hasMedia"`
	MediaTypes  []string `json:"mediaTypes"`
}

// RequestedAsset is a specific upload the AI needs — e.g. a product screenshot
// before it can craft a video, an image carousel, or a blog cover. The AI asks
// for these instead of inventing or assuming a visual it was never given.
type RequestedAsset struct {
	Type     string `json:"type"` // screenshot | image | video | document | pdf | markdown | other
	Reason   string `json:"reason"`
	Required bool   `json:"required"`
	For      string `json:"for"` // what it is needed for, e.g. "blog cover", "instagram carousel"
}

// ContentAnalyzeResponse is the AI's analysis of the draft.
type ContentAnalyzeResponse struct {
	Score                    int              `json:"score"`
	ViralPotential           int              `json:"viralPotential"`
	Strengths                []string         `json:"strengths"`
	Improvements             []string         `json:"improvements"`
	BestPlatforms            []string         `json:"bestPlatforms"`
	RecommendedPostingWindow string           `json:"recommendedPostingWindow"`
	NeedsMoreContext         bool             `json:"needsMoreContext"`
	ContextQuestions         []string         `json:"contextQuestions"`
	RequestedAssets          []RequestedAsset `json:"requestedAssets"`
}

// PlatformVariant is the platform-adapted version of a piece of content.
type PlatformVariant struct {
	Platform  string   `json:"platform"`
	Format    string   `json:"format"`
	Caption   string   `json:"caption"`
	Hooks     []string `json:"hooks"`
	Hashtags  []string `json:"hashtags"`
	UrlInBio  bool     `json:"urlInBio"`
	LinkPlace string   `json:"linkPlace"`
}

// ContentGenerateRequest asks for per-platform adaptations.
//
// OutputMode is what the owner actually wants out of this run: "social" (posts
// only), "blog" (long-form only — no social posting at all), or "both". Some
// owners only ever want blogs, so social publishing is never assumed.
type ContentGenerateRequest struct {
	Caption      string   `json:"caption"`
	Prompt       string   `json:"prompt"`
	WebsiteURL   string   `json:"websiteUrl"`
	Platforms    []string `json:"platforms"`
	Style        string   `json:"style"`
	Context      string   `json:"context"`
	OutputMode   string   `json:"outputMode"` // social | blog | both
	BlogApproved bool     `json:"blogApproved"`
	BlogTopic    string   `json:"blogTopic"`
	Audience     string   `json:"audience"`
	ContentType  string   `json:"contentType"`
	HasVisuals   bool     `json:"hasVisuals"` // owner supplied product screenshots/photos
}

// BlogOnly reports whether the owner wants long-form only, no social posts.
func (r ContentGenerateRequest) BlogOnly() bool { return r.OutputMode == "blog" }

// WantsBlog reports whether a blog draft should be written for this run.
func (r ContentGenerateRequest) WantsBlog() bool { return r.BlogOnly() || r.BlogApproved }

// ContentGenerateResponse is the set of adapted variants plus optional blog.
// RequestedAssets is what the AI still needs from the owner after planning —
// it asks rather than guessing at a visual it was never given.
type ContentGenerateResponse struct {
	Score            int               `json:"score"`
	Variants         []PlatformVariant `json:"variants"`
	Blog             *BlogDraft        `json:"blog,omitempty"`
	BlogSuggested    bool              `json:"blogSuggested"`
	BlogApprovalText string            `json:"blogApprovalText"`
	RequestedAssets  []RequestedAsset  `json:"requestedAssets"`
}

// BlogDraft is a generated blog or micro-blog piece.
type BlogDraft struct {
	Title         string   `json:"title"`
	Format        string   `json:"format"`
	Intro         string   `json:"intro"`
	Sections      []string `json:"sections"`
	CTA           string   `json:"cta"`
	SuitableFor   []string `json:"suitableFor"`
	PublishedTo   []string `json:"publishedTo"`
	RequiresImage bool     `json:"requiresImage"`
	Image         string   `json:"image"`
}

// ViralResearchRequest asks the AI to research the web for viral tactics.
type ViralResearchRequest struct {
	Topic     string   `json:"topic"`
	Industry  string   `json:"industry"`
	Platforms []string `json:"platforms"`
	Count     int      `json:"count"`
}

// ViralResearchResponse is the researched set of ideas/styles/tactics.
type ViralResearchResponse struct {
	Trends        []string `json:"trends"`
	ContentIdeas  []string `json:"contentIdeas"`
	PostingStyles []string `json:"postingStyles"`
	Tactics       []string `json:"tactics"`
	Sources       []string `json:"sources"`
	Summary       string   `json:"summary"`
}

// PlatformAnalytics is per-platform performance data.
type PlatformAnalytics struct {
	Platform              string   `json:"platform"`
	Followers             string   `json:"followers"`
	Reach                 string   `json:"reach"`
	Impressions           string   `json:"impressions"`
	EngagementRate        string   `json:"engagementRate"`
	Views                 string   `json:"views"`
	Saves                 string   `json:"saves"`
	Shares                string   `json:"shares"`
	BestPostingTime       string   `json:"bestPostingTime"`
	GrowthTrend           []int    `json:"growthTrend"`
	TopContent            []string `json:"topContent"`
	Summary               string   `json:"summary"`
	AvgViews              int      `json:"avgViews"`
	OptimalPostCountPerWk string   `json:"optimalPostCountPerWk"`
}
