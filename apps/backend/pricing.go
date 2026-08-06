package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"strconv"
	"strings"
	"sync"
)

// ---------------------------------------------------------------------------
// Cost engine
//
// The old ledger charged a flat $0.000002/token for every model and a flat
// $0.04 for "not text" — meaning one 8-second AI video was booked at the same
// cost as one thumbnail. Real generative video runs $0.10–$0.75 per second, so
// a single clip could cost 20–100x what was recorded. That gap is exactly how
// an AI product bleeds money without noticing.
//
// This file makes three things explicit and auditable:
//
//  1. VENDOR COST  — what the upstream provider actually bills us.
//  2. BILLABLE     — what we charge the customer, vendor cost x markup.
//  3. CREDITS      — the customer-facing unit, so pricing survives a vendor
//                    price change without repricing every plan.
//
// IMPORTANT: the default rates below are starting points captured from public
// price lists and WILL drift. They are deliberately overridable at runtime via
// PALIUS_RATE_CARD (a JSON file path) so ops can correct them without a
// redeploy. Verify against each vendor's pricing page before you invoice
// anyone. `VerifiedOn` records when a rate was last checked.
// ---------------------------------------------------------------------------

// CreditValueUSD is the retail value of one credit. Credits are the unit the
// customer sees; USD is what we reconcile against the vendor invoice.
// 1 credit = $0.01 retail keeps the arithmetic legible on a pricing page.
const CreditValueUSD = 0.01

// TextRate is priced per 1M tokens, split because output typically costs
// 3-5x input. Charging one blended rate (as the old code did) undercounts
// every output-heavy job — blog writing above all.
type TextRate struct {
	InputPerMTok  float64 `json:"inputPerMTok"`
	OutputPerMTok float64 `json:"outputPerMTok"`
}

// ImageRate is priced per generated image, keyed by quality tier.
type ImageRate struct {
	PerImage map[string]float64 `json:"perImage"` // quality -> USD
	Default  float64            `json:"default"`
}

// VideoRate is priced per second of output — the only dimension that matters
// for generative video — with a resolution multiplier and optional audio.
type VideoRate struct {
	PerSecond       float64            `json:"perSecond"`
	ResolutionMult  map[string]float64 `json:"resolutionMult"`
	AudioPerSecond  float64            `json:"audioPerSecond"`
	MinBillSeconds  float64            `json:"minBillSeconds"`
}

// ModelRate is a single model's price across whichever modalities it supports.
type ModelRate struct {
	Provider   string     `json:"provider"`
	Model      string     `json:"model"`
	Modality   string     `json:"modality"` // text | image | video
	Text       *TextRate  `json:"text,omitempty"`
	Image      *ImageRate `json:"image,omitempty"`
	Video      *VideoRate `json:"video,omitempty"`
	VerifiedOn string     `json:"verifiedOn"`
	Note       string     `json:"note,omitempty"`
}

// RateCard is the full price list plus the commercial policy applied on top.
type RateCard struct {
	// Markup multipliers applied to vendor cost to reach the billable price.
	// Media carries a higher multiplier than text because it fails and gets
	// retried far more often, and because storage/CDN/egress ride along with it.
	TextMarkup  float64 `json:"textMarkup"`
	ImageMarkup float64 `json:"imageMarkup"`
	VideoMarkup float64 `json:"videoMarkup"`

	// FailureAllowance pads the vendor cost to cover generations that are
	// rejected, retried, or discarded by the user but still billed to us.
	FailureAllowance float64 `json:"failureAllowance"`

	Models map[string]ModelRate `json:"models"`
}

var (
	rateCardOnce sync.Once
	rateCard     *RateCard
)

// defaultRateCard is the built-in price list. Every figure here is a public
// list price captured for planning purposes — treat as an estimate, not a
// contract, and override via PALIUS_RATE_CARD in production.
func defaultRateCard() *RateCard {
	const verified = "2026-05"

	return &RateCard{
		// Text carries no markup because text is never billed in credits — the
		// subscription covers it. The 1.0 multiplier means "record cost at cost"
		// so text still shows up truthfully in COGS reporting.
		TextMarkup: 1.0,

		// Media markups. These are the numbers that decide whether the business
		// works. 2.5-3x leaves 60-67% gross margin on generation after the
		// failure allowance, which is competitive against credit-based rivals
		// while never selling a clip below cost. Raising video past ~3x prices
		// the product out; dropping below 2x leaves nothing for support and
		// payment fees.
		ImageMarkup: 3.0,
		VideoMarkup: 2.5,

		FailureAllowance: 0.15, // ~15% of media jobs get paid for twice

		Models: map[string]ModelRate{
			// ------------------------------------------------------- text ---
			"gemini-2.0-flash": {
				Provider: "gemini", Model: "gemini-2.0-flash", Modality: "text",
				Text: &TextRate{InputPerMTok: 0.10, OutputPerMTok: 0.40}, VerifiedOn: verified,
			},
			"gemini-2.5-flash": {
				Provider: "gemini", Model: "gemini-2.5-flash", Modality: "text",
				Text: &TextRate{InputPerMTok: 0.30, OutputPerMTok: 2.50}, VerifiedOn: verified,
			},
			"gemini-2.5-pro": {
				Provider: "gemini", Model: "gemini-2.5-pro", Modality: "text",
				Text: &TextRate{InputPerMTok: 1.25, OutputPerMTok: 10.00}, VerifiedOn: verified,
			},
			"gpt-4o-mini": {
				Provider: "openai", Model: "gpt-4o-mini", Modality: "text",
				Text: &TextRate{InputPerMTok: 0.15, OutputPerMTok: 0.60}, VerifiedOn: verified,
			},
			"gpt-4o": {
				Provider: "openai", Model: "gpt-4o", Modality: "text",
				Text: &TextRate{InputPerMTok: 2.50, OutputPerMTok: 10.00}, VerifiedOn: verified,
			},
			"claude-haiku-4-5": {
				Provider: "anthropic", Model: "claude-haiku-4-5", Modality: "text",
				Text: &TextRate{InputPerMTok: 1.00, OutputPerMTok: 5.00}, VerifiedOn: verified,
			},
			"claude-sonnet-4-5": {
				Provider: "anthropic", Model: "claude-sonnet-4-5", Modality: "text",
				Text: &TextRate{InputPerMTok: 3.00, OutputPerMTok: 15.00}, VerifiedOn: verified,
			},
			"deepseek-chat": {
				Provider: "deepseek", Model: "deepseek-chat", Modality: "text",
				Text: &TextRate{InputPerMTok: 0.27, OutputPerMTok: 1.10}, VerifiedOn: verified,
			},
			"ollama-local": {
				Provider: "ollama", Model: "ollama-local", Modality: "text",
				Text: &TextRate{InputPerMTok: 0, OutputPerMTok: 0}, VerifiedOn: verified,
				Note: "self-hosted; only amortised GPU cost, tracked separately",
			},

			// ------------------------------------------------------ image ---
			"gpt-image-1": {
				Provider: "openai", Model: "gpt-image-1", Modality: "image",
				Image: &ImageRate{
					Default: 0.04,
					PerImage: map[string]float64{
						"low": 0.011, "medium": 0.042, "high": 0.167,
					},
				}, VerifiedOn: verified,
			},
			"dall-e-3": {
				Provider: "openai", Model: "dall-e-3", Modality: "image",
				Image: &ImageRate{
					Default:  0.040,
					PerImage: map[string]float64{"standard": 0.040, "hd": 0.080},
				}, VerifiedOn: verified,
			},
			"imagen-3": {
				Provider: "gemini", Model: "imagen-3", Modality: "image",
				Image: &ImageRate{
					Default:  0.030,
					PerImage: map[string]float64{"standard": 0.030, "high": 0.060},
				}, VerifiedOn: verified,
			},
			"flux-schnell": {
				Provider: "replicate", Model: "flux-schnell", Modality: "image",
				Image: &ImageRate{
					Default:  0.003,
					PerImage: map[string]float64{"standard": 0.003, "high": 0.030},
				}, VerifiedOn: verified,
				Note: "cheapest viable tier — good default for bulk thumbnails",
			},

			// ------------------------------------------------------ video ---
			// This is where the money goes. Note the per-second figures against
			// the per-image ones above: eight seconds of Veo costs more than a
			// hundred Flux images.
			"veo-3": {
				Provider: "gemini", Model: "veo-3", Modality: "video",
				Video: &VideoRate{
					PerSecond:      0.40,
					AudioPerSecond: 0.10,
					ResolutionMult: map[string]float64{"720p": 1.0, "1080p": 1.5, "4k": 3.0},
					MinBillSeconds: 4,
				}, VerifiedOn: verified,
			},
			"veo-3-fast": {
				Provider: "gemini", Model: "veo-3-fast", Modality: "video",
				Video: &VideoRate{
					PerSecond:      0.15,
					AudioPerSecond: 0.05,
					ResolutionMult: map[string]float64{"720p": 1.0, "1080p": 1.5, "4k": 3.0},
					MinBillSeconds: 4,
				}, VerifiedOn: verified,
			},
			"sora-2": {
				Provider: "openai", Model: "sora-2", Modality: "video",
				Video: &VideoRate{
					PerSecond:      0.30,
					ResolutionMult: map[string]float64{"720p": 1.0, "1080p": 1.67, "4k": 3.33},
					MinBillSeconds: 4,
				}, VerifiedOn: verified,
			},
			"kling-2": {
				Provider: "replicate", Model: "kling-2", Modality: "video",
				Video: &VideoRate{
					PerSecond:      0.12,
					ResolutionMult: map[string]float64{"720p": 1.0, "1080p": 1.4, "4k": 2.8},
					MinBillSeconds: 5,
				}, VerifiedOn: verified,
			},
			"runway-gen3": {
				Provider: "replicate", Model: "runway-gen3", Modality: "video",
				Video: &VideoRate{
					PerSecond:      0.09,
					ResolutionMult: map[string]float64{"720p": 1.0, "1080p": 1.4, "4k": 2.8},
					MinBillSeconds: 5,
				}, VerifiedOn: verified,
				Note: "cheapest viable video tier — default for starter plans",
			},
		},
	}
}

// getRateCard loads the card once, preferring PALIUS_RATE_CARD if present.
func getRateCard() *RateCard {
	rateCardOnce.Do(func() {
		rateCard = defaultRateCard()

		path := env("PALIUS_RATE_CARD", "")
		if path == "" {
			return
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			log.Printf("rate card: cannot read %s (%v) — using built-in defaults", path, err)
			return
		}
		var override RateCard
		if err := json.Unmarshal(raw, &override); err != nil {
			log.Printf("rate card: cannot parse %s (%v) — using built-in defaults", path, err)
			return
		}
		// Merge rather than replace, so an override file only has to carry the
		// models whose prices actually moved.
		if override.TextMarkup > 0 {
			rateCard.TextMarkup = override.TextMarkup
		}
		if override.ImageMarkup > 0 {
			rateCard.ImageMarkup = override.ImageMarkup
		}
		if override.VideoMarkup > 0 {
			rateCard.VideoMarkup = override.VideoMarkup
		}
		if override.FailureAllowance > 0 {
			rateCard.FailureAllowance = override.FailureAllowance
		}
		for k, v := range override.Models {
			rateCard.Models[k] = v
		}
		log.Printf("rate card: loaded %d model overrides from %s", len(override.Models), path)
	})
	return rateCard
}

// ---------------------------------------------------------------------------
// Cost computation
// ---------------------------------------------------------------------------

// GenerationSpec describes one billable unit of work.
type GenerationSpec struct {
	Modality   string `json:"modality"` // text | image | video
	Model      string `json:"model"`
	Provider   string `json:"provider"`

	// text
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`

	// image
	ImageCount   int    `json:"imageCount"`
	ImageQuality string `json:"imageQuality"`

	// video
	Seconds     float64 `json:"seconds"`
	Resolution  string  `json:"resolution"`
	WithAudio   bool    `json:"withAudio"`
	VideoCount  int     `json:"videoCount"`
}

// CostBreakdown is the full economics of one operation — deliberately verbose
// so the admin panel can show exactly where a dollar went.
type CostBreakdown struct {
	Modality      string  `json:"modality"`
	Model         string  `json:"model"`
	Provider      string  `json:"provider"`
	Units         float64 `json:"units"`     // tokens, images, or seconds
	UnitKind      string  `json:"unitKind"`  // "tokens" | "images" | "seconds"
	VendorCostUSD float64 `json:"vendorCostUSD"`
	FailurePadUSD float64 `json:"failurePadUSD"`
	Markup        float64 `json:"markup"`
	BillableUSD   float64 `json:"billableUSD"`
	Credits       float64 `json:"credits"`
	MarginUSD     float64 `json:"marginUSD"`
	MarginPct     float64 `json:"marginPct"`
	Explanation   string  `json:"explanation"`
	RateKnown     bool    `json:"rateKnown"`
}

// EstimateCost prices one generation. It never returns zero for an unknown
// media model: an unpriced video is the single most expensive thing that can
// happen here, so we fall back to the most expensive known rate rather than
// silently booking it as free.
func EstimateCost(spec GenerationSpec) CostBreakdown {
	rc := getRateCard()
	out := CostBreakdown{
		Modality: spec.Modality,
		Model:    spec.Model,
		Provider: spec.Provider,
	}

	rate, known := rc.Models[normalizeModel(spec.Model)]
	out.RateKnown = known

	switch strings.ToLower(spec.Modality) {
	case "image":
		count := maxInt(spec.ImageCount, 1)
		per := 0.0
		switch {
		case known && rate.Image != nil:
			per = rate.Image.Default
			if q, ok := rate.Image.PerImage[strings.ToLower(spec.ImageQuality)]; ok {
				per = q
			}
		default:
			per = mostExpensiveImageRate(rc)
			out.Explanation = fmt.Sprintf(
				"unknown image model %q — billed at the most expensive known rate ($%.3f/image) so it cannot be under-charged; add it to the rate card",
				spec.Model, per)
		}
		out.Units = float64(count)
		out.UnitKind = "images"
		out.VendorCostUSD = per * float64(count)
		out.Markup = rc.ImageMarkup
		if out.Explanation == "" {
			out.Explanation = fmt.Sprintf("%d image(s) x $%.3f at %s quality", count, per, orDefault(spec.ImageQuality, "default"))
		}

	case "video":
		count := maxInt(spec.VideoCount, 1)
		secs := spec.Seconds
		if secs <= 0 {
			secs = 8 // a typical short clip; never bill zero seconds
		}
		var per, audioPer, mult, minSecs float64
		if known && rate.Video != nil {
			per = rate.Video.PerSecond
			audioPer = rate.Video.AudioPerSecond
			mult = 1.0
			if m, ok := rate.Video.ResolutionMult[strings.ToLower(spec.Resolution)]; ok {
				mult = m
			}
			minSecs = rate.Video.MinBillSeconds
		} else {
			per, audioPer, mult, minSecs = mostExpensiveVideoRate(rc)
			out.Explanation = fmt.Sprintf(
				"unknown video model %q — billed at the most expensive known rate ($%.2f/s) so it cannot be under-charged; add it to the rate card",
				spec.Model, per)
		}
		if secs < minSecs {
			secs = minSecs
		}
		billedSecs := secs * float64(count)
		out.Units = billedSecs
		out.UnitKind = "seconds"
		out.VendorCostUSD = billedSecs * per * mult
		if spec.WithAudio {
			out.VendorCostUSD += billedSecs * audioPer
		}
		out.Markup = rc.VideoMarkup
		if out.Explanation == "" {
			out.Explanation = fmt.Sprintf(
				"%.0fs x %d clip(s) x $%.2f/s at %s (x%.2f)%s",
				secs, count, per, orDefault(spec.Resolution, "720p"), mult,
				map[bool]string{true: " + audio", false: ""}[spec.WithAudio])
		}

	default: // text
		var in, outRate float64
		if known && rate.Text != nil {
			in, outRate = rate.Text.InputPerMTok, rate.Text.OutputPerMTok
		} else {
			in, outRate = mostExpensiveTextRate(rc)
			out.Explanation = fmt.Sprintf(
				"unknown text model %q — billed at the most expensive known rate; add it to the rate card", spec.Model)
		}
		out.Units = float64(spec.InputTokens + spec.OutputTokens)
		out.UnitKind = "tokens"
		out.VendorCostUSD = (float64(spec.InputTokens)/1_000_000)*in +
			(float64(spec.OutputTokens)/1_000_000)*outRate
		out.Markup = rc.TextMarkup
		if out.Explanation == "" {
			out.Explanation = fmt.Sprintf(
				"%d in x $%.2f/M + %d out x $%.2f/M",
				spec.InputTokens, in, spec.OutputTokens, outRate)
		}
	}

	// Media jobs get retried and discarded; text rarely does.
	if out.Modality == "image" || out.Modality == "video" {
		out.FailurePadUSD = out.VendorCostUSD * rc.FailureAllowance
	}

	loaded := out.VendorCostUSD + out.FailurePadUSD
	out.BillableUSD = round4(loaded * out.Markup)
	out.VendorCostUSD = round4(out.VendorCostUSD)
	out.FailurePadUSD = round4(out.FailurePadUSD)
	out.MarginUSD = round4(out.BillableUSD - out.VendorCostUSD)
	if out.BillableUSD > 0 {
		out.MarginPct = round2((out.MarginUSD / out.BillableUSD) * 100)
	}
	// Credits are always rounded up: a fractional credit that rounds down is a
	// slow leak across millions of calls.
	out.Credits = math.Ceil(out.BillableUSD/CreditValueUSD*100) / 100

	return out
}

func mostExpensiveImageRate(rc *RateCard) float64 {
	worst := 0.20
	for _, m := range rc.Models {
		if m.Image == nil {
			continue
		}
		if m.Image.Default > worst {
			worst = m.Image.Default
		}
		for _, v := range m.Image.PerImage {
			if v > worst {
				worst = v
			}
		}
	}
	return worst
}

func mostExpensiveVideoRate(rc *RateCard) (per, audio, mult, minSecs float64) {
	per, audio, mult, minSecs = 0.75, 0.10, 1.5, 4
	for _, m := range rc.Models {
		if m.Video == nil {
			continue
		}
		if m.Video.PerSecond > per {
			per = m.Video.PerSecond
			audio = m.Video.AudioPerSecond
			minSecs = m.Video.MinBillSeconds
		}
	}
	return
}

func mostExpensiveTextRate(rc *RateCard) (in, out float64) {
	in, out = 3.0, 15.0
	for _, m := range rc.Models {
		if m.Text == nil {
			continue
		}
		if m.Text.OutputPerMTok > out {
			in, out = m.Text.InputPerMTok, m.Text.OutputPerMTok
		}
	}
	return
}

// normalizeModel maps vendor-qualified ids ("anthropic/claude-sonnet-4-5",
// "models/gemini-2.5-pro", "gpt-4o-2024-11-20") onto rate card keys.
func normalizeModel(m string) string {
	m = strings.ToLower(strings.TrimSpace(m))
	if i := strings.LastIndex(m, "/"); i >= 0 {
		m = m[i+1:]
	}
	rc := rateCard
	if rc == nil {
		return m
	}
	if _, ok := rc.Models[m]; ok {
		return m
	}
	// Longest matching prefix wins, so dated snapshots resolve to their family.
	best := ""
	for k := range rc.Models {
		if strings.HasPrefix(m, k) && len(k) > len(best) {
			best = k
		}
	}
	if best != "" {
		return best
	}
	return m
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func orDefault(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

func round4(v float64) float64 { return math.Round(v*10000) / 10000 }
func round2(v float64) float64 { return math.Round(v*100) / 100 }

func envFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}
