package main

import "testing"

// These tests are the tripwire on the business model. If someone edits the rate
// card, the markups, or a plan allowance in a way that makes an operation or a
// tier lose money, CI fails here rather than the finance spreadsheet failing in
// three months.

// TestEveryOperationIsProfitable walks the whole catalog at several sizes and
// asserts that billable always clears vendor cost by at least MinMarkup.
func TestEveryOperationIsProfitable(t *testing.T) {
	for _, m := range ImageModels() {
		for _, q := range []string{"", "low", "standard", "medium", "high", "hd"} {
			for _, n := range []int{1, 4, 10} {
				c := EstimateCost(GenerationSpec{
					Modality: "image", Model: m.ID, Provider: m.Provider,
					ImageCount: n, ImageQuality: q,
				})
				assertMargin(t, m.ID+"/"+q, c)
			}
		}
	}

	for _, m := range VideoModels() {
		for _, secs := range []float64{1, 4, 8, 15, 30, 60} {
			for _, res := range []string{"", "720p", "1080p", "4k"} {
				for _, audio := range []bool{false, true} {
					c := EstimateCost(GenerationSpec{
						Modality: "video", Model: m.ID, Provider: m.Provider,
						Seconds: secs, Resolution: res, VideoCount: 1, WithAudio: audio,
					})
					assertMargin(t, m.ID+"/"+res, c)
				}
			}
		}
	}
}

func assertMargin(t *testing.T, label string, c CostBreakdown) {
	t.Helper()
	if c.VendorCostUSD <= 0 {
		return
	}
	if c.BillableUSD <= c.VendorCostUSD {
		t.Errorf("%s: sold at a loss — vendor $%.4f, billable $%.4f", label, c.VendorCostUSD, c.BillableUSD)
		return
	}
	if got := c.BillableUSD / c.VendorCostUSD; got < MinMarkup {
		t.Errorf("%s: effective markup %.2fx is below the %.2fx floor", label, got, MinMarkup)
	}
	if c.Credits <= 0 {
		t.Errorf("%s: billable $%.4f but charged 0 credits", label, c.BillableUSD)
	}
}

// TestUnknownModelIsNeverFree guards the most dangerous failure mode: a model
// nobody added to the rate card must be billed at the worst known rate, not $0.
// Getting this wrong means a new provider integration silently gives away
// unlimited video.
func TestUnknownModelIsNeverFree(t *testing.T) {
	for _, modality := range []string{"image", "video"} {
		c := EstimateCost(GenerationSpec{
			Modality: modality, Model: "brand-new-unlisted-model-v9",
			Seconds: 8, Resolution: "1080p", ImageCount: 1, VideoCount: 1,
		})
		if c.VendorCostUSD <= 0 || c.Credits <= 0 {
			t.Errorf("%s: unknown model billed as free (vendor $%.4f, %.2f credits)",
				modality, c.VendorCostUSD, c.Credits)
		}
		if c.RateKnown {
			t.Errorf("%s: unknown model reported RateKnown=true", modality)
		}
	}

	// An unknown video model must cost at least as much as the priciest known
	// one, so an unmapped id can never be the cheap way in.
	unknown := EstimateCost(GenerationSpec{
		Modality: "video", Model: "unmapped", Seconds: 8, Resolution: "1080p",
	})
	for _, m := range VideoModels() {
		known := EstimateCost(GenerationSpec{
			Modality: "video", Model: m.ID, Seconds: 8, Resolution: "1080p",
		})
		if unknown.VendorCostUSD < known.VendorCostUSD {
			t.Errorf("unknown video model ($%.4f) is cheaper than known %s ($%.4f)",
				unknown.VendorCostUSD, m.ID, known.VendorCostUSD)
		}
	}
}

// TestEveryPaidPlanClearsMarginTarget asserts that a customer who burns 100% of
// their allowance still leaves the target gross margin. This is the check that
// stops an over-generous allowance shipping.
func TestEveryPaidPlanClearsMarginTarget(t *testing.T) {
	for _, p := range PlanCatalog() {
		if p.MonthlyUSD == 0 {
			// Free must have no media allowance at all, or it is farmable.
			if p.IncludedCredits > 0 || p.MediaEnabled {
				t.Errorf("free plan grants media (credits=%.0f enabled=%v)",
					p.IncludedCredits, p.MediaEnabled)
			}
			continue
		}
		e := ComputePlanEconomics(p)
		if e.WorstCaseMarginUSD <= 0 {
			t.Errorf("plan %s loses money at full utilisation: revenue $%.2f vs cost $%.2f",
				p.ID, p.MonthlyUSD, e.MaxTotalCostUSD)
		}
		if e.WorstCaseMarginPct < TargetGrossMargin*100 {
			t.Errorf("plan %s worst-case margin %.1f%% is below the %.0f%% target",
				p.ID, e.WorstCaseMarginPct, TargetGrossMargin*100)
		}
	}
}

// TestOverageAndPacksPriceAboveCost — selling extra credits below cost turns
// the best customers into the most expensive ones.
func TestOverageAndPacksPriceAboveCost(t *testing.T) {
	blended := BlendedCostPerCredit()

	for _, p := range PlanCatalog() {
		if p.OveragePerCreditUSD == 0 {
			continue // hard-stop tier
		}
		if p.OveragePerCreditUSD <= blended {
			t.Errorf("plan %s overage $%.4f/credit is at or below cost $%.4f",
				p.ID, p.OveragePerCreditUSD, blended)
		}
	}

	for _, k := range CreditPacks() {
		if k.PerCreditUSD <= blended {
			t.Errorf("pack %s at $%.4f/credit is at or below cost $%.4f",
				k.ID, k.PerCreditUSD, blended)
		}
		if k.MarginPct < 50 {
			t.Errorf("pack %s margin %.1f%% is thin for a top-up", k.ID, k.MarginPct)
		}
	}
}

// TestTextIsNeverCharged locks in the billing split: the subscription covers
// text, so credits must only ever come from image and video.
func TestTextIsNeverCharged(t *testing.T) {
	rc := getRateCard()
	if rc.TextMarkup != 1.0 {
		t.Errorf("text markup is %.2f — text is subscription-covered and should be recorded at cost (1.0)",
			rc.TextMarkup)
	}

	// A generous month of text should still be a small fixed cost, cheap enough
	// to leave unmetered.
	blog := EstimateCost(GenerationSpec{
		Modality: "text", Model: "claude-sonnet-4-5", InputTokens: 2000, OutputTokens: 3000,
	})
	if blog.VendorCostUSD > 0.25 {
		t.Errorf("a blog draft costs $%.4f — too expensive to include unmetered; reconsider the split",
			blog.VendorCostUSD)
	}
}

// TestCreditsAlwaysRoundUp — a fractional credit rounded down is a slow leak
// across millions of calls.
func TestCreditsAlwaysRoundUp(t *testing.T) {
	c := EstimateCost(GenerationSpec{
		Modality: "image", Model: "flux-schnell", ImageCount: 1, ImageQuality: "standard",
	})
	if c.Credits*CreditValueUSD < c.BillableUSD-0.00001 {
		t.Errorf("credits (%.4f -> $%.6f) under-recover billable $%.6f",
			c.Credits, c.Credits*CreditValueUSD, c.BillableUSD)
	}
}
