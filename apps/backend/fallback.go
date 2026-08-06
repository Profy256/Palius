package main

import "strings"

// fallbackContext returns a deterministic context response when Gemini is off.
func fallbackContext(req ContextRequest, scraped string) ContextResponse {
	if scraped != "" {
		return ContextResponse{
			ContextID:     "ctx-fallback",
			Summary:       "Scraped your website and learned what the product does, who it is for, and its key selling points. Content will be tailored to that real product info.",
			Confidence:    85,
			NeedsMore:     false,
			Missing:       nil,
			Scraped:       true,
			ScrapedSource: req.WebsiteURL,
			Suggestions: []string{
				"Add a description for extra nuance the page does not cover.",
				"Upload your README or pitch deck for deeper context.",
			},
		}
	}
	if req.Description == "" && len(req.Documents) == 0 {
		return ContextResponse{
			ContextID:  "ctx-fallback",
			Summary:    "No product context provided yet.",
			Confidence: 15,
			NeedsMore:  true,
			Missing: []string{
				"What is the product or service?",
				"Who is the target audience?",
				"What problem does it solve?",
				"Paste your website URL or upload a doc (README, .md, PDF) so I can read the product myself.",
			},
		}
	}
	hasVisual := false
	for _, d := range req.Documents {
		if d.Kind == "image" || d.Kind == "screenshot" {
			hasVisual = true
			break
		}
	}
	summary := "Captured your description. AI will tailor hooks, captions and blog angles to your product."
	if hasVisual {
		summary = "Captured your product screenshots/images alongside your description. The AI can now build authentic visual content (video, carousels) from them."
	}
	return ContextResponse{
		ContextID:  "ctx-fallback",
		Summary:    summary,
		Confidence: 70,
		NeedsMore:  false,
		Missing:    nil,
		Suggestions: []string{
			"Add your website URL if you want posts to link back to it — I already have enough context to write.",
			"Upload your README or pitch deck for deeper context.",
		},
	}
}

// fallbackAnalyze returns a deterministic analysis when Gemini is off.
func fallbackAnalyze(req ContentAnalyzeRequest) ContentAnalyzeResponse {
	needsContext := req.Context == "" && req.Prompt == ""
	ct := strings.ToLower(req.ContentType)
	visual := strings.Contains(ct, "video") || strings.Contains(ct, "image") || strings.Contains(ct, "carousel") || strings.Contains(ct, "reel") || strings.Contains(ct, "photo")
	var assets []RequestedAsset
	if visual {
		assets = []RequestedAsset{
			{
				Type:     "screenshot",
				Reason:   "You're creating visual content for the brand — a screenshot or photo of the product makes the video/carousel authentic instead of generic.",
				Required: true,
			},
		}
	}
	return ContentAnalyzeResponse{
		Score:                    84,
		ViralPotential:           72,
		Strengths:                []string{"Clear value proposition", "Strong hook potential", "Platform-agnostic framing"},
		Improvements:             []string{"Add a specific metric or data point in the first line", "End with a single, strong call to action", "Reference your website URL for discovery"},
		BestPlatforms:            []string{"tiktok", "linkedin", "x"},
		RecommendedPostingWindow: "Tuesday 5:00 PM – 6:30 PM",
		NeedsMoreContext:         needsContext,
		ContextQuestions: []string{
			"What is the product and who is it for?",
			"Do you have a URL or a doc (README, .md, PDF) I can read to learn it?",
			"What is the single biggest pain point it solves?",
		},
		RequestedAssets: assets,
	}
}

// fallbackVariants returns per-platform variants when Gemini is off.
func fallbackVariants(req ContentGenerateRequest) ContentGenerateResponse {
	if req.BlogOnly() {
		// Long-form only — the owner did not ask for social posts.
		return ContentGenerateResponse{
			Score:            88,
			Variants:         nil,
			Blog:             fallbackBlog(req),
			BlogSuggested:    false,
			BlogApprovalText: "",
		}
	}
	base := req.Caption
	if base == "" {
		base = "A new tool that makes content creation effortless."
	}
	hasURL := req.WebsiteURL != ""
	cta := "Link in bio"
	if hasURL {
		cta = "Link in bio / URL in post"
	}

	// Honor the platforms the owner actually selected — including ones with no
	// bespoke copy below, which fall through to the generic shape.
	targets := req.Platforms
	if len(targets) == 0 {
		targets = []string{"tiktok", "linkedin", "x", "instagram"}
	}

	variants := make([]PlatformVariant, 0, len(targets))
	for _, p := range targets {
		variants = append(variants, fallbackVariantFor(p, base, cta, hasURL))
	}

	resp := ContentGenerateResponse{
		Score:     88,
		Variants:  variants,
		BlogSuggested: true,
		BlogApprovalText: "Should I also write a blog / micro-blog and publish it to platforms that fit long-form content?",
	}
	if req.WantsBlog() {
		resp.Blog = fallbackBlog(req)
	}
	return resp
}

// fallbackVariantFor shapes one platform's demo variant. Platforms without
// bespoke copy still get a usable variant rather than being dropped.
func fallbackVariantFor(platform, base, cta string, hasURL bool) PlatformVariant {
	v := PlatformVariant{Platform: platform, Caption: base, UrlInBio: hasURL}
	switch platform {
	case "tiktok":
		v.Format = "Short-form video (15-30s) with on-screen hook"
		v.Caption = base + "\n\n🎬 Full breakdown on our page. " + cta
		v.Hooks = []string{"Stop scrolling — this changes how you create.", "Nobody talks about this content hack."}
		v.Hashtags = []string{"#creator", "#viral", "#growth"}
	case "linkedin":
		v.Format = "Professional text + carousel"
		v.Caption = base + "\n\nWe built this to save teams hours every week."
		v.Hooks = []string{"The problem no one in our industry is fixing."}
		v.Hashtags = []string{"#Startups", "#Productivity", "#AI"}
	case "x":
		v.Format = "Thread / short post"
		v.Hooks = []string{"Hot take:", "TIL:", "1/ What most people get wrong"}
		v.Hashtags = []string{"#buildinpublic", "#indiehackers"}
	case "instagram":
		v.Format = "Reel + story"
		v.Caption = base + "\n\nSave this for later. " + cta
		v.Hooks = []string{"POV: your content finally works."}
		v.Hashtags = []string{"#reels", "#smallbusiness", "#content"}
	case "reddit":
		v.Format = "Discussion post"
		v.Caption = "We've been working on this problem for a while — what's your experience?"
		v.Hooks = []string{"What's the hardest part of creating content for you?"}
		v.Hashtags = []string{}
	case "youtube":
		v.Format = "Short + long-form description"
		v.Caption = base + "\n\nFull walkthrough in the description. " + cta
		v.Hooks = []string{"The 60-second version of a 6-month build."}
		v.Hashtags = []string{"#shorts", "#buildinpublic"}
	case "facebook":
		v.Format = "Feed post + reel"
		v.Caption = base + "\n\n" + cta
		v.Hooks = []string{"We rebuilt this after 200 conversations."}
		v.Hashtags = []string{"#smallbusiness", "#tools"}
	case "threads":
		v.Format = "Conversational text post"
		v.Hooks = []string{"Unpopular opinion:"}
		v.Hashtags = []string{"#buildinpublic"}
	case "pinterest":
		v.Format = "Idea pin / vertical graphic"
		v.Caption = base + "\n\nSave this pin. " + cta
		v.Hooks = []string{"The workflow, in one graphic."}
		v.Hashtags = []string{"#productivity", "#tools", "#design"}
	case "whatsapp":
		// Broadcast channel, not a public feed — no hashtags, no growth hooks.
		v.Format = "Broadcast message to subscribers"
		v.Caption = base + "\n\n" + cta
		v.Hooks = []string{}
		v.Hashtags = []string{}
	case "telegram":
		v.Format = "Channel post"
		v.Caption = base + "\n\n" + cta
		v.Hooks = []string{}
		v.Hashtags = []string{}
	default:
		// Unlisted/custom platform added by the owner.
		v.Format = "Native post"
		v.Caption = base + "\n\n" + cta
		v.Hooks = []string{"Lead with the outcome, not the feature."}
		v.Hashtags = []string{}
	}
	return v
}

// fallbackBlog returns a generated blog draft when Gemini is off.
func fallbackBlog(req ContentGenerateRequest) *BlogDraft {
	topic := req.BlogTopic
	if topic == "" {
		topic = "How we built a better way to create content"
	}
	return &BlogDraft{
		Title:    topic,
		Format:   "blog",
		Intro:    "Long-form content builds trust that short-form can't. Here is the story and the strategy.",
		Sections: []string{
			"1. The problem we kept hitting",
			"2. What most tools get wrong",
			"3. How our approach is different",
			"4. A concrete framework you can copy",
		},
		CTA:           "Try it today — link in bio and first paragraph.",
		SuitableFor:   []string{"yourwebsite", "linkedin-article", "medium", "substack"},
		PublishedTo:   nil, // draft only — owner must approve each destination first
		RequiresImage: true,
		Image:         "App screenshot / product hero on a clean dark background, with the product name overlaid",
	}
}

// fallbackViral returns researched viral tactics when Gemini is off.
func fallbackViral(req ViralResearchRequest) ViralResearchResponse {
	return ViralResearchResponse{
		Trends: []string{
			"Behind-the-scenes 'how we built it' content",
			"Short-form educational hooks with a contrarian opener",
			"Founder-led personal storytelling over brand voice",
			"Remixing one core asset across 5 formats in 48h",
		},
		ContentIdeas: []string{
			"3 mistakes every startup makes posting on TikTok",
			"The exact 7-day launch content calendar",
			"Why we almost killed our product (and what saved it)",
			"One metric that matters more than followers",
		},
		PostingStyles: []string{
			"Hook in first 1.5s, value by second 10",
			"Consistent face/brand color = +memorability",
			"Comment bait question at the end",
			"Post the same core idea in 3 formats before moving on",
		},
		Tactics: []string{
			"Post consistently (daily for short-form) during a 30-day sprint",
			"Steal the format, not the content",
			"Reply to every comment within 1h to boost distribution",
			"Pin your best-performing post to drive profile conversion",
		},
		Sources: []string{
			"Platform official creator playbooks",
			"Top creators in your niche (public analytics)",
			"Viral post teardowns across TikTok / Reels / Shorts",
		},
		Summary: "Virality favors strong hooks, consistent formats, and replying fast. Iterate on what already works instead of chasing new ideas.",
	}
}

// fallbackAnalytics returns per-platform analytics when Gemini is off.
func fallbackAnalytics(platform string) PlatformAnalytics {
	data := map[string]PlatformAnalytics{
		"tiktok": {
			Platform: "tiktok", Followers: "42.1k", Reach: "1.8M", Impressions: "2.4M",
			EngagementRate: "9.2%", Views: "1.6M", Saves: "38.4k", Shares: "21.7k",
			BestPostingTime: "Tue–Thu 5:00 PM", GrowthTrend: []int{2100, 2300, 2500, 2700, 3200, 3900, 4800},
			TopContent: []string{"'Stop scrolling' hook reel — 890k views", "'We rebuilt this in 48h' — 512k views", "'3 mistakes' educational — 204k views"},
			Summary: "TikTok is your top reach channel. Short-form hooks outperform; 82% of views come from For You distribution.",
			AvgViews: 214000, OptimalPostCountPerWk: "5–7",
		},
		"linkedin": {
			Platform: "linkedin", Followers: "18.4k", Reach: "412k", Impressions: "640k",
			EngagementRate: "5.1%", Views: "308k", Saves: "9.2k", Shares: "4.1k",
			BestPostingTime: "Tue–Thu 8:00 AM", GrowthTrend: []int{920, 940, 980, 1040, 1180, 1340, 1520},
			TopContent: []string{"Founder story carousel — 96k impressions", "'What most tools get wrong' text post — 54k impressions"},
			Summary: "LinkedIn converts best for B2B. Carousels and founder storytelling drive 3x engagement.",
			AvgViews: 62000, OptimalPostCountPerWk: "3–5",
		},
		"instagram": {
			Platform: "instagram", Followers: "29.7k", Reach: "860k", Impressions: "1.1M",
			EngagementRate: "6.8%", Views: "740k", Saves: "22.1k", Shares: "12.4k",
			BestPostingTime: "Wed–Sat 7:30 PM", GrowthTrend: []int{1500, 1600, 1750, 1900, 2300, 2700, 3200},
			TopContent: []string{"Reel carousel hybrid — 410k views", "Save-able educational carousel — 180k views"},
			Summary: "Reels + saves are the strongest signal. Education content drives saves which boosts reach.",
			AvgViews: 132000, OptimalPostCountPerWk: "4–6",
		},
		"x": {
			Platform: "x", Followers: "12.3k", Reach: "640k", Impressions: "980k",
			EngagementRate: "4.4%", Views: "512k", Saves: "3.2k", Shares: "8.9k",
			BestPostingTime: "Mon–Fri 9:00 AM", GrowthTrend: []int{610, 640, 660, 700, 760, 840, 960},
			TopContent: []string{"Build-in-public thread — 210k impressions", "Hot take on AI tools — 120k impressions"},
			Summary: "X rewards threads and build-in-public. Posting frequency here pays off more than anywhere else.",
			AvgViews: 88000, OptimalPostCountPerWk: "4–10",
		},
		"youtube": {
			Platform: "youtube", Followers: "8.9k", Reach: "310k", Impressions: "480k",
			EngagementRate: "7.6%", Views: "285k", Saves: "4.1k", Shares: "6.3k",
			BestPostingTime: "Fri 3:00 PM", GrowthTrend: []int{420, 440, 460, 500, 560, 620, 700},
			TopContent: []string{"Long-form tutorial — 140k views", "Shorts repurpose — 96k views"},
			Summary: "YouTube rewards depth. Repurposing TikTok shorts into Shorts is growing watch time 40%.",
			AvgViews: 41000, OptimalPostCountPerWk: "2–3",
		},
		"reddit": {
			Platform: "reddit", Followers: "4.2k", Reach: "180k", Impressions: "240k",
			EngagementRate: "3.9%", Views: "168k", Saves: "1.8k", Shares: "2.2k",
			BestPostingTime: "Tue–Thu 6:00 PM", GrowthTrend: []int{210, 220, 240, 260, 280, 310, 340},
			TopContent: []string{"'What's your hardest content problem?' — 1.2k upvotes"},
			Summary: "Reddit is a community channel — value-first, no self-promo. Best used for feedback and authority.",
			AvgViews: 24000, OptimalPostCountPerWk: "2–4",
		},
	}

	if p, ok := data[platform]; ok {
		return p
	}
	// generic fallback for unknown/custom platforms
	return PlatformAnalytics{
		Platform: platform, Followers: "5.2k", Reach: "96k", Impressions: "132k",
		EngagementRate: "4.6%", Views: "82k", Saves: "2.4k", Shares: "1.9k",
		BestPostingTime: "Tue–Thu 6:00 PM", GrowthTrend: []int{260, 270, 290, 310, 330, 360, 400},
		TopContent:      []string{"Best-performing post on this platform"},
		Summary:         "Solid baseline performance. Consistency will compound growth over 60 days.",
		AvgViews:        11700, OptimalPostCountPerWk: "3–5",
	}
}
