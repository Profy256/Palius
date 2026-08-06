package main

import "sort"

// ---------------------------------------------------------------------------
// Generation model catalog — cost efficiency vs output quality
//
// The single biggest lever on media COGS is NOT negotiating a better rate. It
// is not generating hero-quality output on every iteration. A user exploring
// ideas will discard 8 of 10 results; rendering those 8 on Veo 3 instead of
// Runway Turbo costs ~8x for output that was going to be thrown away.
//
// So every model carries a Quality score (1-10, subjective but calibrated
// against what these produce for short-form social) and a Tier that says where
// it belongs in the workflow:
//
//   draft    — cheap, fast, disposable. Used for exploration and variations.
//   standard — the default for content that will actually be published.
//   premium  — hero assets, launch campaigns, paid ads.
//
// `PickModel` routes on intent so drafts never silently land on premium.
// ---------------------------------------------------------------------------

// GenModel describes one image or video model as a product decision, not just
// a price. CostPerUnitUSD is denormalised from the rate card for display.
type GenModel struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Provider string `json:"provider"`
	Modality string `json:"modality"` // image | video
	Tier     string `json:"tier"`     // draft | standard | premium

	CostPerUnitUSD float64 `json:"costPerUnitUSD"` // per image, or per second
	UnitLabel      string  `json:"unitLabel"`

	Quality    int `json:"quality"`    // 1-10 overall fidelity
	PromptAdherence int `json:"promptAdherence"` // 1-10 does it follow the brief
	TextInImage int `json:"textInImage"` // 1-10 legible typography (0 = n/a for video)
	Speed       int `json:"speed"`       // 1-10 higher is faster

	// Efficiency is quality per dollar, computed — the ranking that actually
	// matters when choosing a default.
	Efficiency float64 `json:"efficiency"`

	HasAudio bool     `json:"hasAudio"`
	BestFor  []string `json:"bestFor"`
	Weakness string   `json:"weakness"`
	MinPlan  string   `json:"minPlan"`
}

// ImageModels — what can actually be used for image generation here.
//
// For a social media tool the decisive capability is usually TEXT RENDERING:
// thumbnails, quote cards and promo graphics all need legible words baked into
// the image. That is why Ideogram and gpt-image-1 rank above models with
// higher raw aesthetics.
func ImageModels() []GenModel {
	models := []GenModel{
		{
			ID: "flux-schnell", Name: "FLUX.1 [schnell]", Provider: "replicate",
			Modality: "image", Tier: "draft",
			CostPerUnitUSD: 0.003, UnitLabel: "image",
			Quality: 6, PromptAdherence: 6, TextInImage: 3, Speed: 10,
			BestFor:  []string{"Bulk variations", "Mood exploration", "Draft thumbnails"},
			Weakness: "Weak at text in image; simpler compositions",
			MinPlan:  "solo",
		},
		{
			ID: "sdxl", Name: "SDXL", Provider: "replicate",
			Modality: "image", Tier: "draft",
			CostPerUnitUSD: 0.002, UnitLabel: "image",
			Quality: 5, PromptAdherence: 5, TextInImage: 2, Speed: 9,
			BestFor:  []string{"Cheapest volume", "Style fine-tunes"},
			Weakness: "Dated aesthetics; needs prompt engineering",
			MinPlan:  "solo",
		},
		{
			ID: "flux-dev", Name: "FLUX.1 [dev]", Provider: "replicate",
			Modality: "image", Tier: "standard",
			CostPerUnitUSD: 0.025, UnitLabel: "image",
			Quality: 8, PromptAdherence: 8, TextInImage: 5, Speed: 7,
			BestFor:  []string{"Everyday social visuals", "Product scenes"},
			Weakness: "Text still unreliable at small sizes",
			MinPlan:  "solo",
		},
		{
			ID: "imagen-3", Name: "Imagen 3", Provider: "gemini",
			Modality: "image", Tier: "standard",
			CostPerUnitUSD: 0.030, UnitLabel: "image",
			Quality: 9, PromptAdherence: 9, TextInImage: 7, Speed: 7,
			BestFor:  []string{"Photorealism", "Lifestyle & product photography"},
			Weakness: "Stricter content filters",
			MinPlan:  "solo",
		},
		{
			ID: "nano-banana", Name: "Gemini 2.5 Flash Image", Provider: "gemini",
			Modality: "image", Tier: "standard",
			CostPerUnitUSD: 0.039, UnitLabel: "image",
			Quality: 9, PromptAdherence: 9, TextInImage: 7, Speed: 8,
			BestFor:  []string{"Editing existing images", "Character/brand consistency across a series"},
			Weakness: "Less painterly than dedicated art models",
			MinPlan:  "creator",
		},
		{
			ID: "ideogram-v3", Name: "Ideogram v3", Provider: "ideogram",
			Modality: "image", Tier: "standard",
			CostPerUnitUSD: 0.040, UnitLabel: "image",
			Quality: 8, PromptAdherence: 9, TextInImage: 10, Speed: 7,
			BestFor:  []string{"Text-heavy graphics", "Quote cards", "Posters & typography"},
			Weakness: "Photoreal humans weaker than Imagen",
			MinPlan:  "creator",
		},
		{
			ID: "recraft-v3", Name: "Recraft v3", Provider: "recraft",
			Modality: "image", Tier: "standard",
			CostPerUnitUSD: 0.040, UnitLabel: "image",
			Quality: 8, PromptAdherence: 8, TextInImage: 9, Speed: 7,
			BestFor:  []string{"Vector & SVG output", "Logos", "Consistent brand sets"},
			Weakness: "Not for photorealism",
			MinPlan:  "creator",
		},
		{
			ID: "gpt-image-1", Name: "GPT Image 1", Provider: "openai",
			Modality: "image", Tier: "premium",
			CostPerUnitUSD: 0.042, UnitLabel: "image",
			Quality: 9, PromptAdherence: 10, TextInImage: 9, Speed: 5,
			BestFor:  []string{"Complex multi-part briefs", "Text in image", "Inpainting & edits"},
			Weakness: "Slow; high tier costs $0.167/image",
			MinPlan:  "creator",
		},
		{
			ID: "flux-pro", Name: "FLUX 1.1 Pro", Provider: "replicate",
			Modality: "image", Tier: "premium",
			CostPerUnitUSD: 0.040, UnitLabel: "image",
			Quality: 9, PromptAdherence: 8, TextInImage: 6, Speed: 6,
			BestFor:  []string{"Hero images", "Paid ad creative"},
			Weakness: "Premium price for marginal gain over dev on social crops",
			MinPlan:  "business",
		},
		{
			ID: "dall-e-3", Name: "DALL-E 3", Provider: "openai",
			Modality: "image", Tier: "premium",
			CostPerUnitUSD: 0.040, UnitLabel: "image",
			Quality: 7, PromptAdherence: 8, TextInImage: 5, Speed: 6,
			BestFor:  []string{"Stylised illustration"},
			Weakness: "Superseded by gpt-image-1 on nearly every axis",
			MinPlan:  "business",
		},
	}
	return withEfficiency(models)
}

// VideoModels — the expensive half of the catalog. Note the spread: the
// cheapest usable model is ~15x less than the most expensive, for output that
// is perfectly adequate as scroll-stopping b-roll.
func VideoModels() []GenModel {
	models := []GenModel{
		{
			ID: "wan-2", Name: "Wan 2.2", Provider: "replicate",
			Modality: "video", Tier: "draft",
			CostPerUnitUSD: 0.03, UnitLabel: "second",
			Quality: 5, PromptAdherence: 6, Speed: 8,
			BestFor:  []string{"Storyboard previews", "Motion tests before committing"},
			Weakness: "Artifacts on fast motion; no audio",
			MinPlan:  "solo",
		},
		{
			ID: "runway-gen3", Name: "Runway Gen-3 Turbo", Provider: "replicate",
			Modality: "video", Tier: "draft",
			CostPerUnitUSD: 0.09, UnitLabel: "second",
			Quality: 7, PromptAdherence: 7, Speed: 8,
			BestFor:  []string{"B-roll", "Abstract backgrounds", "High-volume shorts"},
			Weakness: "No native audio; struggles with hands and text",
			MinPlan:  "solo",
		},
		{
			ID: "kling-2", Name: "Kling 2.5", Provider: "replicate",
			Modality: "video", Tier: "standard",
			CostPerUnitUSD: 0.12, UnitLabel: "second",
			Quality: 8, PromptAdherence: 8, Speed: 6,
			BestFor:  []string{"Realistic human motion", "Product in motion", "Longer takes"},
			Weakness: "No native audio; slower queue",
			MinPlan:  "solo",
		},
		{
			ID: "veo-3-fast", Name: "Veo 3 Fast", Provider: "gemini",
			Modality: "video", Tier: "standard",
			CostPerUnitUSD: 0.15, UnitLabel: "second",
			Quality: 9, PromptAdherence: 9, Speed: 7, HasAudio: true,
			BestFor:  []string{"Best value with native audio", "Talking-head style shorts", "Default for published clips"},
			Weakness: "Slightly softer detail than full Veo 3",
			MinPlan:  "creator",
		},
		{
			ID: "sora-2", Name: "Sora 2", Provider: "openai",
			Modality: "video", Tier: "premium",
			CostPerUnitUSD: 0.30, UnitLabel: "second",
			Quality: 9, PromptAdherence: 9, Speed: 4, HasAudio: true,
			BestFor:  []string{"Narrative sequences", "Multi-shot continuity"},
			Weakness: "Expensive; long queue times",
			MinPlan:  "business",
		},
		{
			ID: "veo-3", Name: "Veo 3", Provider: "gemini",
			Modality: "video", Tier: "premium",
			CostPerUnitUSD: 0.40, UnitLabel: "second",
			Quality: 10, PromptAdherence: 10, Speed: 4, HasAudio: true,
			BestFor:  []string{"Launch campaigns", "Paid ad creative", "Hero content"},
			Weakness: "Most expensive per second — gate behind explicit confirmation",
			MinPlan:  "business",
		},
	}
	return withEfficiency(models)
}

// withEfficiency computes quality-per-dollar and sorts by it, so the most
// cost-efficient model is always first in the list the UI renders.
func withEfficiency(models []GenModel) []GenModel {
	for i := range models {
		if models[i].CostPerUnitUSD > 0 {
			// Quality is 1-10; dividing by cost gives "quality points per dollar".
			models[i].Efficiency = round2(float64(models[i].Quality) / models[i].CostPerUnitUSD)
		}
		if models[i].Modality == "video" {
			models[i].TextInImage = 0
		}
	}
	sort.SliceStable(models, func(i, j int) bool {
		return models[i].Efficiency > models[j].Efficiency
	})
	return models
}

// RecommendModel suggests a default for an intent. It is a *recommendation*,
// not a restriction: a subscriber may run any model in the catalog and is
// charged that model's price. Keeping the default honest is still worth real
// money, because most users never change a default — routing exploration to a
// draft-tier model is the difference between $0.72 and $3.20 for eight seconds
// of output the user was going to discard either way.
func RecommendModel(modality, intent string) GenModel {
	pool := ImageModels()
	if modality == "video" {
		pool = VideoModels()
	}

	wantTier := "standard"
	switch intent {
	case "draft", "variation", "explore", "preview":
		wantTier = "draft"
	case "hero", "final", "campaign", "ad":
		wantTier = "premium"
	}

	// Pools are sorted by efficiency, so the first match in a tier is the most
	// quality-per-dollar option in that tier.
	for _, tier := range fallbackOrder(wantTier) {
		for _, m := range pool {
			if m.Tier == tier {
				return m
			}
		}
	}
	if len(pool) > 0 {
		return pool[0]
	}
	return GenModel{}
}

// FindModel looks up any catalog model by id.
func FindModel(id string) (GenModel, bool) {
	for _, m := range append(ImageModels(), VideoModels()...) {
		if m.ID == id {
			return m, true
		}
	}
	return GenModel{}, false
}

func fallbackOrder(want string) []string {
	switch want {
	case "draft":
		return []string{"draft", "standard", "premium"}
	case "premium":
		return []string{"premium", "standard", "draft"}
	default:
		return []string{"standard", "draft", "premium"}
	}
}
