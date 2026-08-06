package main

import (
	"math"
	"strconv"
)

// ---------------------------------------------------------------------------
// Plan catalog & unit economics
//
// BILLING MODEL
//
// The platform is a normal SaaS subscription. Everything that is cheap to run
// is included in the monthly fee with no metering:
//
//   • captions, hashtags, hooks, titles, descriptions
//   • BLOG AND MICRO-BLOG WRITING, and publishing to dev.to / Hashnode /
//     LinkedIn / Reddit / Medium / your own site
//   • content analysis, scoring, viral research, competitor tracking
//   • comment auto-reply, DM assistant, lead qualification
//   • scheduling, calendar, analytics, repurposing of existing text
//
// Only the two operations with serious marginal cost are metered, as credits,
// the same way Claude handles image and video generation on Fable:
//
//   • AI IMAGE GENERATION
//   • AI VIDEO GENERATION
//
// Why the split: a caption costs ~$0.0004 of vendor spend and a full blog draft
// ~$0.05. Even a heavy month of text lands near $2-3 per user, which belongs in
// fixed COGS (EstTextCostUSD below), not on a meter. Metering cheap things only
// teaches customers to be afraid of the product. One 8-second Veo clip, by
// contrast, is ~$2.20 — five thousand times a caption — and has to be metered
// or a single enthusiastic user erases the margin of a hundred others.
//
// PROTECTION AGAINST LOSSES — three layers, all enforced in metering.go:
//
//   1. PER-OPERATION MARGIN. Credits charged = vendor cost x markup, computed
//      from the units the vendor ACTUALLY reported. assertProfitable() refuses
//      anything that would price under MinMarkup, so no single generation can
//      be sold at a loss regardless of which model the customer picks.
//   2. HARD ALLOWANCE. Included credits are sized so that 100% consumption
//      still clears the margin target. Generation is refused when they run out,
//      never silently absorbed.
//   3. PRICED OVERAGE. Extra credits are sold above blended cost, so heavy
//      users are profitable rather than merely tolerated.
// ---------------------------------------------------------------------------

// TargetGrossMargin is the margin plans are designed against. 70% is the low
// end of healthy vertical SaaS; under ~60% an AI product cannot fund support
// and sales out of gross profit.
const TargetGrossMargin = 0.70

// Plan is one purchasable tier.
type Plan struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	MonthlyUSD float64 `json:"monthlyUSD"`
	AnnualUSD  float64 `json:"annualUSD"`

	// IncludedCredits is the monthly MEDIA allowance — image and video
	// generation only. 1 credit = $0.01 of billable value.
	IncludedCredits float64 `json:"includedCredits"`

	// EstTextCostUSD is the assumed monthly vendor spend on all the unmetered
	// text work this tier's usage pattern implies. It is a real cost line even
	// though the customer never sees it, so plan margin has to carry it.
	EstTextCostUSD float64 `json:"estTextCostUSD"`

	// OveragePerCreditUSD is what an extra credit costs once the allowance is
	// spent, held well above blended vendor cost.
	OveragePerCreditUSD float64 `json:"overagePerCreditUSD"`

	// Abuse ceilings. Credits normally bind first; these only catch anomalies.
	MaxVideoSecondsPerMonth float64 `json:"maxVideoSecondsPerMonth"`
	MaxImagesPerMonth       int     `json:"maxImagesPerMonth"`
	MaxConnectedAccounts    int     `json:"maxConnectedAccounts"`
	MaxSeats                int     `json:"maxSeats"`

	// MediaEnabled gates generation entirely. Model *choice* is deliberately
	// not restricted on paid plans: every operation is priced at true vendor
	// cost x markup, so an expensive model simply draws credits down faster.
	// The markup is the margin protection — an allowlist would only be
	// packaging, and it would stop customers using what they came for.
	MediaEnabled bool `json:"mediaEnabled"`

	// RequireConfirmAboveUSD forces an explicit "yes, spend this" step on a
	// costly single operation, so nobody burns a month of credits by accident.
	RequireConfirmAboveUSD float64 `json:"requireConfirmAboveUSD"`

	Features []string `json:"features"`
	Included []string `json:"included"` // unmetered, subscription-covered
	Audience string   `json:"audience"`
}

// PlanEconomics is the derived margin picture, computed from the live rate card
// rather than asserted, so it stays honest when vendor prices move.
type PlanEconomics struct {
	PlanID string `json:"planId"`

	// Worst case: the customer burns every included credit.
	MaxMediaCostUSD    float64 `json:"maxMediaCostUSD"`
	TextCostUSD        float64 `json:"textCostUSD"`
	MaxTotalCostUSD    float64 `json:"maxTotalCostUSD"`
	WorstCaseMarginUSD float64 `json:"worstCaseMarginUSD"`
	WorstCaseMarginPct float64 `json:"worstCaseMarginPct"`

	// Typical case: most customers consume a fraction of the allowance.
	ExpectedUtilization float64 `json:"expectedUtilization"`
	ExpectedMarginUSD   float64 `json:"expectedMarginUSD"`
	ExpectedMarginPct   float64 `json:"expectedMarginPct"`

	// What the allowance actually buys, in units a buyer recognises.
	BudgetClipsIncluded  int `json:"budgetClipsIncluded"`  // 8s 1080p, Runway Gen-3
	PremiumClipsIncluded int `json:"premiumClipsIncluded"` // 8s 1080p + audio, Veo 3 Fast
	ImagesIncluded       int `json:"imagesIncluded"`       // Imagen 3 standard
	CheapImagesIncluded  int `json:"cheapImagesIncluded"`  // FLUX schnell

	Verdict string `json:"verdict"`
}

// CreditPack is a top-up sold outside the subscription.
type CreditPack struct {
	ID          string  `json:"id"`
	Credits     float64 `json:"credits"`
	PriceUSD    float64 `json:"priceUSD"`
	PerCreditUSD float64 `json:"perCreditUSD"`
	VendorCostUSD float64 `json:"vendorCostUSD"`
	MarginPct   float64 `json:"marginPct"`
}

// CreditPacks are priced above the implied plan rate: top-ups should be more
// profitable than allowance, and they never expire, which is worth paying for.
func CreditPacks() []CreditPack {
	packs := []CreditPack{
		{ID: "pack-1k", Credits: 1000, PriceUSD: 12},
		{ID: "pack-5k", Credits: 5000, PriceUSD: 55},
		{ID: "pack-15k", Credits: 15000, PriceUSD: 150},
	}
	blended := BlendedCostPerCredit()
	for i := range packs {
		packs[i].PerCreditUSD = round4(packs[i].PriceUSD / packs[i].Credits)
		packs[i].VendorCostUSD = round2(packs[i].Credits * blended)
		if packs[i].PriceUSD > 0 {
			packs[i].MarginPct = round2(
				(packs[i].PriceUSD - packs[i].VendorCostUSD) / packs[i].PriceUSD * 100)
		}
	}
	return packs
}

// subscriptionIncluded is the unmetered feature list every paid plan carries.
// Stated explicitly because "what costs me credits?" is the first question any
// customer asks, and a vague answer costs conversions.
func subscriptionIncluded() []string {
	return []string{
		"Unlimited AI captions, hooks, hashtags & titles",
		"Unlimited blog & micro-blog writing",
		"Publishing to dev.to, Hashnode, LinkedIn, Reddit, Medium & your site",
		"Unlimited content analysis, scoring & viral research",
		"Unlimited comment auto-reply & DM lead qualification",
		"Competitor tracking, analytics & performance coaching",
		"Scheduling, calendar & repurposing",
	}
}

// PlanCatalog is the shipped price list.
//
// Allowance sizing, worked for Creator ($49):
//
//	revenue                                     $49.00
//	COGS budget at 70% target margin            $14.70
//	  less assumed text/blog vendor spend       -$3.00
//	  = media vendor budget                     $11.70
//	x video markup (2.5)                        $29.25 of billable value
//	/ credit value ($0.01)                      2,925  ->  2,900 credits
//
// The allowance is deliberately set so FULL consumption still lands inside the
// COGS budget. That is the whole trick: never sell an allowance you cannot
// afford to have completely used.
func PlanCatalog() []Plan {
	return []Plan{
		{
			// Free gets the entire platform and none of the generation. Text is
			// cheap enough to give away; one image is ~100x a caption and one
			// clip ~5,000x. The wall lands exactly at the expensive operations,
			// which is also the sharpest upgrade prompt available.
			ID: "free", Name: "Free", MonthlyUSD: 0, AnnualUSD: 0,
			IncludedCredits:         0,
			EstTextCostUSD:          0.60,
			OveragePerCreditUSD:     0, // free users hard-stop, no overage
			MaxVideoSecondsPerMonth: 0,
			MaxImagesPerMonth:       0,
			MaxConnectedAccounts:    2,
			MaxSeats:                1,
			MediaEnabled:            false,
			RequireConfirmAboveUSD:  0,
			Audience:                "Trying it out",
			Included:                subscriptionIncluded(),
			Features: []string{
				"2 connected accounts",
				"Full scheduling, analytics & engagement inbox",
				"AI captions, hashtags & blog writing included",
				"No AI image or video generation",
			},
		},
		{
			ID: "solo", Name: "Solo", MonthlyUSD: 19, AnnualUSD: 190,
			IncludedCredits:         1000, // $10 billable -> ~$4 media vendor at 2.5x
			EstTextCostUSD:          1.50,
			OveragePerCreditUSD:     0.020,
			MaxVideoSecondsPerMonth: 120,
			MaxImagesPerMonth:       1200,
			MaxConnectedAccounts:    5,
			MaxSeats:                1,
			MediaEnabled:            true,
			RequireConfirmAboveUSD:  2.00,
			Audience:                "Solo developers & indie hackers",
			Included:                subscriptionIncluded(),
			Features: []string{
				"5 connected accounts",
				"1,000 media credits / month",
				"~3 short video clips or ~95 images",
				"Any image or video model you like",
			},
		},
		{
			ID: "creator", Name: "Creator", MonthlyUSD: 49, AnnualUSD: 490,
			IncludedCredits:         2900, // $29 billable -> ~$11.70 media vendor at 2.5x
			EstTextCostUSD:          3.00,
			OveragePerCreditUSD:     0.018,
			MaxVideoSecondsPerMonth: 400,
			MaxImagesPerMonth:       4000,
			MaxConnectedAccounts:    12,
			MaxSeats:                3,
			MediaEnabled:            true,
			RequireConfirmAboveUSD:  2.00,
			Audience:                "Creators & startups without a marketing team",
			Included:                subscriptionIncluded(),
			Features: []string{
				"12 connected accounts, 3 seats",
				"2,900 media credits / month",
				"~10 budget clips, ~4 premium clips with audio, or ~280 images",
				"Any model, including Veo 3 & Sora 2",
			},
		},
		{
			ID: "business", Name: "Business", MonthlyUSD: 149, AnnualUSD: 1490,
			IncludedCredits:         9600, // $96 billable -> ~$38.70 media vendor at 2.5x
			EstTextCostUSD:          6.00,
			OveragePerCreditUSD:     0.015,
			MaxVideoSecondsPerMonth: 1400,
			MaxImagesPerMonth:       14000,
			MaxConnectedAccounts:    40,
			MaxSeats:                10,
			MediaEnabled:            true,
			RequireConfirmAboveUSD:  5.00,
			Audience:                "Small marketing teams & SMBs",
			Included:                subscriptionIncluded(),
			Features: []string{
				"40 connected accounts, 10 seats",
				"9,600 media credits / month",
				"~33 budget clips, ~15 premium clips, or ~930 images",
				"Custom Playwright connectors",
				"Priority generation queue",
			},
		},
		{
			ID: "agency", Name: "Agency", MonthlyUSD: 499, AnnualUSD: 4990,
			IncludedCredits:         33000, // $330 billable -> ~$132 media vendor at 2.5x
			EstTextCostUSD:          15.00,
			OveragePerCreditUSD:     0.012,
			MaxVideoSecondsPerMonth: 5000,
			MaxImagesPerMonth:       50000,
			MaxConnectedAccounts:    250,
			MaxSeats:                50,
			MediaEnabled:            true,
			RequireConfirmAboveUSD:  10.00,
			Audience:                "Agencies managing many brands",
			Included:                subscriptionIncluded(),
			Features: []string{
				"250 connected accounts, 50 seats",
				"33,000 media credits / month",
				"~114 budget clips, ~52 premium clips, or ~3,190 images",
				"White-label reporting & client workspaces",
				"Bring your own API keys — generation billed at cost",
				"SSO & audit log export",
			},
		},
	}
}

// PlanByID looks up a plan, falling back to Free so an unknown plan id can
// never grant more than the least privileged tier.
func PlanByID(id string) Plan {
	for _, p := range PlanCatalog() {
		if p.ID == id {
			return p
		}
	}
	return PlanCatalog()[0] // free
}

// ComputePlanEconomics derives the margin picture from the live rate card.
func ComputePlanEconomics(p Plan) PlanEconomics {
	rc := getRateCard()

	e := PlanEconomics{PlanID: p.ID, ExpectedUtilization: 0.45}

	// Included credits are billable dollars; dividing by the media markup
	// recovers the vendor cost we absorb if every credit goes to media.
	markup := rc.VideoMarkup
	if markup <= 0 {
		markup = 2.5
	}
	e.MaxMediaCostUSD = round4((p.IncludedCredits * CreditValueUSD) / markup)
	e.TextCostUSD = p.EstTextCostUSD
	e.MaxTotalCostUSD = round4(e.MaxMediaCostUSD + e.TextCostUSD)

	e.WorstCaseMarginUSD = round4(p.MonthlyUSD - e.MaxTotalCostUSD)
	if p.MonthlyUSD > 0 {
		e.WorstCaseMarginPct = round2((e.WorstCaseMarginUSD / p.MonthlyUSD) * 100)
	}

	expected := e.MaxMediaCostUSD*e.ExpectedUtilization + e.TextCostUSD
	e.ExpectedMarginUSD = round4(p.MonthlyUSD - expected)
	if p.MonthlyUSD > 0 {
		e.ExpectedMarginPct = round2((e.ExpectedMarginUSD / p.MonthlyUSD) * 100)
	}

	// Translate the allowance into units a buyer recognises.
	e.BudgetClipsIncluded = unitsPerAllowance(p.IncludedCredits, GenerationSpec{
		Modality: "video", Model: "runway-gen3", Seconds: 8, Resolution: "1080p", VideoCount: 1,
	})
	e.PremiumClipsIncluded = unitsPerAllowance(p.IncludedCredits, GenerationSpec{
		Modality: "video", Model: "veo-3-fast", Seconds: 8, Resolution: "1080p",
		VideoCount: 1, WithAudio: true,
	})
	e.ImagesIncluded = unitsPerAllowance(p.IncludedCredits, GenerationSpec{
		Modality: "image", Model: "imagen-3", ImageCount: 1, ImageQuality: "standard",
	})
	e.CheapImagesIncluded = unitsPerAllowance(p.IncludedCredits, GenerationSpec{
		Modality: "image", Model: "flux-schnell", ImageCount: 1, ImageQuality: "standard",
	})

	switch {
	case p.MonthlyUSD == 0:
		e.Verdict = "Free tier — text-only COGS of ~$" +
			trimFloat(p.EstTextCostUSD) + "/user is customer acquisition spend. " +
			"No generation, so it cannot be farmed for media."
	case e.WorstCaseMarginPct >= TargetGrossMargin*100:
		e.Verdict = "Healthy: clears the 70% gross-margin target even at 100% credit burn."
	case e.WorstCaseMarginPct >= 55:
		e.Verdict = "Acceptable: profitable at full burn but under the 70% target — watch the heaviest accounts."
	case e.WorstCaseMarginPct > 0:
		e.Verdict = "Thin: a fully-utilising cohort erodes most of the margin. Cut the allowance or raise the price."
	default:
		e.Verdict = "LOSS-MAKING at full utilisation. Reduce included credits or raise the price before launch."
	}

	return e
}

func unitsPerAllowance(credits float64, spec GenerationSpec) int {
	c := EstimateCost(spec)
	if c.Credits <= 0 {
		return 0
	}
	return int(math.Floor(credits / c.Credits))
}

// BlendedCostPerCredit is the vendor cost behind one credit, used to verify
// that overage and pack pricing sit above cost.
func BlendedCostPerCredit() float64 {
	rc := getRateCard()
	markup := rc.VideoMarkup
	if markup <= 0 {
		markup = 2.5
	}
	return round4(CreditValueUSD / markup)
}

func trimFloat(v float64) string {
	return strconv.FormatFloat(math.Round(v*100)/100, 'f', -1, 64)
}
