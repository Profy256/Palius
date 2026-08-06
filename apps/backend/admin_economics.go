package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// Admin monitoring
//
// The old admin panel showed token counts and calls — useful, but it could not
// answer the only questions that matter operationally:
//
//   Am I making money this month, and on whom am I losing it?
//   What is generation actually costing me, by model?
//   How much am I eating on failed jobs?
//   Is any model priced below cost right now?
//   Who is about to blow through their allowance?
//
// Everything below exists to answer one of those.
// ---------------------------------------------------------------------------

// BusinessOverview is the single screen an operator should be able to trust.
type BusinessOverview struct {
	PeriodStart string `json:"periodStart"`

	// Revenue is recognised from active subscriptions plus credit packs sold.
	MRR              float64 `json:"mrr"`
	SubscriberCount  int     `json:"subscriberCount"`
	PaidSubscribers  int     `json:"paidSubscribers"`
	FreeUsers        int     `json:"freeUsers"`

	// Cost, split so text (unmetered, subscription-covered) is visible next to
	// media (metered). Text being invisible to the customer is not a reason for
	// it to be invisible to us.
	MediaCostUSD    float64 `json:"mediaCostUSD"`
	TextCostUSD     float64 `json:"textCostUSD"`
	FailureCostUSD  float64 `json:"failureCostUSD"`
	TotalCostUSD    float64 `json:"totalCostUSD"`

	GrossProfitUSD float64 `json:"grossProfitUSD"`
	GrossMarginPct float64 `json:"grossMarginPct"`

	// Credit flow.
	CreditsGranted   float64 `json:"creditsGranted"`
	CreditsPurchased float64 `json:"creditsPurchased"`
	CreditsCharged   float64 `json:"creditsCharged"`
	CreditsHeld      float64 `json:"creditsHeld"`
	CreditLiability  float64 `json:"creditLiability"` // unspent credits customers are owed

	// Operational health.
	OperationsTotal     int     `json:"operationsTotal"`
	OperationsFailed    int     `json:"operationsFailed"`
	FailureRatePct      float64 `json:"failureRatePct"`
	OpenMarginAlerts    int     `json:"openMarginAlerts"`
	UsersOverAllowance  int     `json:"usersOverAllowance"`

	Health string `json:"health"`
}

// ModelSpend is per-model cost and margin, the view that tells you which model
// to make the default.
type ModelSpend struct {
	Model       string  `json:"model"`
	Provider    string  `json:"provider"`
	Modality    string  `json:"modality"`
	Operations  int     `json:"operations"`
	Units       float64 `json:"units"`
	UnitKind    string  `json:"unitKind"`
	VendorUSD   float64 `json:"vendorCostUSD"`
	BillableUSD float64 `json:"billableUSD"`
	MarginUSD   float64 `json:"marginUSD"`
	MarginPct   float64 `json:"marginPct"`
	Credits     float64 `json:"credits"`
}

// UserEconomics is per-customer profitability — who is worth keeping and who is
// quietly costing more than they pay.
type UserEconomics struct {
	UserID          string  `json:"userId"`
	Name            string  `json:"name"`
	Plan            string  `json:"plan"`
	Status          string  `json:"status"`
	MonthlyUSD      float64 `json:"monthlyUSD"`
	IncludedCredits float64 `json:"includedCredits"`
	CreditsUsed     float64 `json:"creditsUsed"`
	UtilizationPct  float64 `json:"utilizationPct"`
	MediaCostUSD    float64 `json:"mediaCostUSD"`
	TextCostUSD     float64 `json:"textCostUSD"`
	TotalCostUSD    float64 `json:"totalCostUSD"`
	ProfitUSD       float64 `json:"profitUSD"`
	MarginPct       float64 `json:"marginPct"`
	Operations      int     `json:"operations"`
	VideoSeconds    float64 `json:"videoSeconds"`
	Images          float64 `json:"images"`
	Balance         float64 `json:"balance"`
	Flag            string  `json:"flag"` // "", "watch", "unprofitable"
}

// MarginAlert is a recorded instance of pricing drifting under cost.
type MarginAlert struct {
	ID          int64   `json:"id"`
	UserID      string  `json:"userId"`
	OperationID string  `json:"operationId"`
	Model       string  `json:"model"`
	VendorUSD   float64 `json:"vendorUSD"`
	BillableUSD float64 `json:"billableUSD"`
	Detail      string  `json:"detail"`
	CreatedAt   string  `json:"createdAt"`
}

func registerAdminEconomicsRoutes(admin *gin.RouterGroup) {
	admin.GET("/business", handleAdminBusiness)
	admin.GET("/models", handleAdminModelSpend)
	admin.GET("/economics", handleAdminUserEconomics)
	admin.GET("/operations", handleAdminOperations)
	admin.GET("/alerts", handleAdminMarginAlerts)
	admin.GET("/ratecard", handleAdminRateCard)
	admin.GET("/plans", handleAdminPlans)
	admin.POST("/users/:id/credits", handleAdminAdjustCredits)
}

func periodStart() string {
	return time.Now().UTC().Format("2006-01") + "-01"
}

func handleAdminBusiness(c *gin.Context) {
	ps := periodStart()
	ov := BusinessOverview{PeriodStart: ps}

	// --- revenue from active subscriptions -------------------------------
	rows, err := db.Query(`SELECT COALESCE(plan,'free'), COUNT(*) FROM users WHERE status='active' GROUP BY plan`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for rows.Next() {
		var planID string
		var n int
		if err := rows.Scan(&planID, &n); err != nil {
			continue
		}
		p := PlanByID(planID)
		ov.MRR += p.MonthlyUSD * float64(n)
		ov.SubscriberCount += n
		if p.MonthlyUSD > 0 {
			ov.PaidSubscribers += n
		} else {
			ov.FreeUsers += n
		}
	}
	rows.Close()

	// --- cost, split by modality ----------------------------------------
	// Media cost comes from settled operations; text cost from usage_events
	// rows that were tracked but never charged.
	_ = db.QueryRow(`SELECT COALESCE(SUM(actual_vendor_usd),0) FROM operations
		WHERE state=? AND created_at >= ?`, OpCommitted, ps).Scan(&ov.MediaCostUSD)
	_ = db.QueryRow(`SELECT COALESCE(SUM(vendor_cost_usd),0) FROM usage_events
		WHERE task_type NOT IN ('image','video') AND created_at >= ?`, ps).Scan(&ov.TextCostUSD)
	_ = db.QueryRow(`SELECT COALESCE(SUM(actual_vendor_usd),0) FROM operations
		WHERE state=? AND vendor_billed_on_failure=1 AND created_at >= ?`, OpFailed, ps).Scan(&ov.FailureCostUSD)

	// Credit packs sold this period add to revenue.
	var packRevenue float64
	_ = db.QueryRow(`SELECT COALESCE(SUM(delta),0) FROM credit_ledger
		WHERE entry_kind=? AND created_at >= ?`, EntryPurchase, ps).Scan(&packRevenue)
	ov.MRR += round2(packRevenue * CreditValueUSD * 1.2) // packs sell at ~1.2x face

	ov.TotalCostUSD = round2(ov.MediaCostUSD + ov.TextCostUSD + ov.FailureCostUSD)
	ov.MediaCostUSD = round2(ov.MediaCostUSD)
	ov.TextCostUSD = round2(ov.TextCostUSD)
	ov.FailureCostUSD = round2(ov.FailureCostUSD)
	ov.MRR = round2(ov.MRR)
	ov.GrossProfitUSD = round2(ov.MRR - ov.TotalCostUSD)
	if ov.MRR > 0 {
		ov.GrossMarginPct = round2(ov.GrossProfitUSD / ov.MRR * 100)
	}

	// --- credit flow ------------------------------------------------------
	_ = db.QueryRow(`SELECT COALESCE(SUM(delta),0) FROM credit_ledger
		WHERE entry_kind=? AND created_at >= ?`, EntryGrant, ps).Scan(&ov.CreditsGranted)
	ov.CreditsPurchased = packRevenue
	_ = db.QueryRow(`SELECT COALESCE(-SUM(delta),0) FROM credit_ledger
		WHERE entry_kind=? AND created_at >= ?`, EntryCharge, ps).Scan(&ov.CreditsCharged)
	_ = db.QueryRow(`SELECT COALESCE(-SUM(l.delta),0) FROM credit_ledger l
		JOIN operations o ON o.id=l.operation_id
		WHERE l.entry_kind=? AND o.state=?`, EntryHold, OpReserved).Scan(&ov.CreditsHeld)
	// Unspent credits are a real liability: customers paid for them and can
	// spend them next month, when they will cost us vendor dollars.
	_ = db.QueryRow(`SELECT COALESCE(SUM(delta),0) FROM credit_ledger`).Scan(&ov.CreditLiability)

	ov.CreditsGranted = round2(ov.CreditsGranted)
	ov.CreditsCharged = round2(ov.CreditsCharged)
	ov.CreditsHeld = round2(ov.CreditsHeld)
	ov.CreditLiability = round2(ov.CreditLiability)

	// --- operational health ----------------------------------------------
	_ = db.QueryRow(`SELECT COUNT(*) FROM operations WHERE created_at >= ?`, ps).Scan(&ov.OperationsTotal)
	_ = db.QueryRow(`SELECT COUNT(*) FROM operations WHERE state=? AND created_at >= ?`,
		OpFailed, ps).Scan(&ov.OperationsFailed)
	if ov.OperationsTotal > 0 {
		ov.FailureRatePct = round2(float64(ov.OperationsFailed) / float64(ov.OperationsTotal) * 100)
	}
	_ = db.QueryRow(`SELECT COUNT(*) FROM margin_alerts WHERE created_at >= ?`, ps).Scan(&ov.OpenMarginAlerts)

	// Users who have spent more credits than their plan includes.
	_ = db.QueryRow(`
		SELECT COUNT(*) FROM (
		  SELECT l.user_id, -SUM(l.delta) AS used
		  FROM credit_ledger l WHERE l.entry_kind=? AND l.created_at >= ?
		  GROUP BY l.user_id
		) t
		JOIN users u ON u.id = t.user_id
		WHERE t.used > u.credit_quota AND u.credit_quota > 0`,
		EntryCharge, ps).Scan(&ov.UsersOverAllowance)

	switch {
	case ov.OpenMarginAlerts > 0:
		ov.Health = "action required: at least one model is priced at or below vendor cost"
	case ov.MRR > 0 && ov.GrossMarginPct < 50:
		ov.Health = "warning: gross margin under 50% — check per-model spend"
	case ov.FailureRatePct > 20:
		ov.Health = "warning: over 20% of generations are failing — vendor cost without revenue"
	case ov.MRR == 0:
		ov.Health = "no paid subscribers yet"
	default:
		ov.Health = "healthy"
	}

	c.JSON(http.StatusOK, ov)
}

func handleAdminModelSpend(c *gin.Context) {
	ps := periodStart()
	out := []ModelSpend{}

	// Media, from the operations ledger.
	rows, err := db.Query(`
		SELECT model, provider, modality, COUNT(*),
		       COALESCE(SUM(actual_units),0), COALESCE(MAX(unit_kind),''),
		       COALESCE(SUM(actual_vendor_usd),0), COALESCE(SUM(billable_usd),0),
		       COALESCE(SUM(margin_usd),0), COALESCE(SUM(charged_credits),0)
		FROM operations WHERE state=? AND created_at >= ?
		GROUP BY model, provider, modality ORDER BY 7 DESC`, OpCommitted, ps)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for rows.Next() {
		var m ModelSpend
		if err := rows.Scan(&m.Model, &m.Provider, &m.Modality, &m.Operations,
			&m.Units, &m.UnitKind, &m.VendorUSD, &m.BillableUSD, &m.MarginUSD, &m.Credits); err == nil {
			if m.BillableUSD > 0 {
				m.MarginPct = round2(m.MarginUSD / m.BillableUSD * 100)
			}
			out = append(out, m)
		}
	}
	rows.Close()

	// Text, from usage_events — zero revenue by design, so margin is negative
	// here and that is correct: it is a cost of the subscription.
	trows, err := db.Query(`
		SELECT model, provider, COUNT(*),
		       COALESCE(SUM(input_tokens+output_tokens),0),
		       COALESCE(SUM(vendor_cost_usd),0)
		FROM usage_events
		WHERE task_type NOT IN ('image','video') AND created_at >= ?
		GROUP BY model, provider ORDER BY 5 DESC`, ps)
	if err == nil {
		for trows.Next() {
			var m ModelSpend
			m.Modality = "text"
			m.UnitKind = "tokens"
			if err := trows.Scan(&m.Model, &m.Provider, &m.Operations, &m.Units, &m.VendorUSD); err == nil {
				m.MarginUSD = -m.VendorUSD
				out = append(out, m)
			}
		}
		trows.Close()
	}

	c.JSON(http.StatusOK, gin.H{
		"models": out,
		"note":   "text rows show cost only — text is covered by the subscription and never billed in credits",
	})
}

func handleAdminUserEconomics(c *gin.Context) {
	ps := periodStart()

	rows, err := db.Query(`
		SELECT u.id, u.name, COALESCE(u.plan,'free'), COALESCE(u.status,'active')
		FROM users u ORDER BY u.name`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	type base struct{ id, name, plan, status string }
	var bases []base
	for rows.Next() {
		var b base
		if err := rows.Scan(&b.id, &b.name, &b.plan, &b.status); err == nil {
			bases = append(bases, b)
		}
	}
	rows.Close()

	out := []UserEconomics{}
	for _, b := range bases {
		plan := PlanByID(b.plan)
		u := UserEconomics{
			UserID: b.id, Name: b.name, Plan: b.plan, Status: b.status,
			MonthlyUSD: plan.MonthlyUSD, IncludedCredits: plan.IncludedCredits,
		}

		_ = db.QueryRow(`SELECT COALESCE(-SUM(delta),0) FROM credit_ledger
			WHERE user_id=? AND entry_kind=? AND created_at >= ?`,
			b.id, EntryCharge, ps).Scan(&u.CreditsUsed)
		_ = db.QueryRow(`SELECT COALESCE(SUM(actual_vendor_usd),0), COUNT(*)
			FROM operations WHERE user_id=? AND state=? AND created_at >= ?`,
			b.id, OpCommitted, ps).Scan(&u.MediaCostUSD, &u.Operations)
		_ = db.QueryRow(`SELECT COALESCE(SUM(vendor_cost_usd),0) FROM usage_events
			WHERE user_id=? AND task_type NOT IN ('image','video') AND created_at >= ?`,
			b.id, ps).Scan(&u.TextCostUSD)
		_ = db.QueryRow(`SELECT COALESCE(SUM(actual_units),0) FROM operations
			WHERE user_id=? AND modality='video' AND state=? AND created_at >= ?`,
			b.id, OpCommitted, ps).Scan(&u.VideoSeconds)
		_ = db.QueryRow(`SELECT COALESCE(SUM(actual_units),0) FROM operations
			WHERE user_id=? AND modality='image' AND state=? AND created_at >= ?`,
			b.id, OpCommitted, ps).Scan(&u.Images)
		_ = db.QueryRow(`SELECT COALESCE(SUM(delta),0) FROM credit_ledger WHERE user_id=?`,
			b.id).Scan(&u.Balance)

		u.TotalCostUSD = round4(u.MediaCostUSD + u.TextCostUSD)
		u.ProfitUSD = round4(u.MonthlyUSD - u.TotalCostUSD)
		if u.MonthlyUSD > 0 {
			u.MarginPct = round2(u.ProfitUSD / u.MonthlyUSD * 100)
		}
		if u.IncludedCredits > 0 {
			u.UtilizationPct = round2(u.CreditsUsed / u.IncludedCredits * 100)
		}
		u.MediaCostUSD = round4(u.MediaCostUSD)
		u.TextCostUSD = round4(u.TextCostUSD)
		u.CreditsUsed = round2(u.CreditsUsed)
		u.Balance = round2(u.Balance)

		switch {
		case u.ProfitUSD < 0:
			u.Flag = "unprofitable"
		case u.MonthlyUSD > 0 && u.MarginPct < 40:
			u.Flag = "watch"
		case u.UtilizationPct > 90:
			u.Flag = "watch"
		}
		out = append(out, u)
	}

	c.JSON(http.StatusOK, gin.H{"users": out})
}

func handleAdminOperations(c *gin.Context) {
	limit := queryInt(c, "limit", 100)
	state := c.Query("state")

	q := `SELECT ` + opColumns + ` FROM operations`
	args := []interface{}{}
	if state != "" {
		q += ` WHERE state = ?`
		args = append(args, state)
	}
	q += ` ORDER BY created_at DESC LIMIT ?`
	args = append(args, limit)

	rows, err := db.Query(q, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	ops := []Operation{}
	for rows.Next() {
		if op, err := scanOperation(rows); err == nil {
			ops = append(ops, *op)
		}
	}
	c.JSON(http.StatusOK, gin.H{"operations": ops})
}

func handleAdminMarginAlerts(c *gin.Context) {
	rows, err := db.Query(`SELECT id, COALESCE(user_id,''), COALESCE(operation_id,''),
		COALESCE(model,''), COALESCE(vendor_usd,0), COALESCE(billable_usd,0),
		COALESCE(detail,''), created_at
		FROM margin_alerts ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	alerts := []MarginAlert{}
	for rows.Next() {
		var a MarginAlert
		if err := rows.Scan(&a.ID, &a.UserID, &a.OperationID, &a.Model,
			&a.VendorUSD, &a.BillableUSD, &a.Detail, &a.CreatedAt); err == nil {
			alerts = append(alerts, a)
		}
	}
	c.JSON(http.StatusOK, gin.H{"alerts": alerts})
}

// handleAdminRateCard exposes the live prices with the credit cost of a
// reference unit, so an operator can see at a glance what each model charges.
func handleAdminRateCard(c *gin.Context) {
	rc := getRateCard()

	type row struct {
		Model      string  `json:"model"`
		Provider   string  `json:"provider"`
		Modality   string  `json:"modality"`
		VendorUnit string  `json:"vendorUnit"`
		VendorUSD  float64 `json:"vendorUSD"`
		Credits    float64 `json:"credits"`
		BillableUSD float64 `json:"billableUSD"`
		MarginPct  float64 `json:"marginPct"`
		VerifiedOn string  `json:"verifiedOn"`
		Note       string  `json:"note,omitempty"`
	}

	out := []row{}
	for key, m := range rc.Models {
		r := row{Model: key, Provider: m.Provider, Modality: m.Modality,
			VerifiedOn: m.VerifiedOn, Note: m.Note}
		var cost CostBreakdown
		switch m.Modality {
		case "image":
			r.VendorUnit = "per image (standard)"
			cost = EstimateCost(GenerationSpec{Modality: "image", Model: key, ImageCount: 1, ImageQuality: "standard"})
		case "video":
			r.VendorUnit = "per 8s clip @1080p"
			cost = EstimateCost(GenerationSpec{Modality: "video", Model: key, Seconds: 8, Resolution: "1080p", VideoCount: 1})
		default:
			r.VendorUnit = "per 1k in + 1k out tokens"
			cost = EstimateCost(GenerationSpec{Modality: "text", Model: key, InputTokens: 1000, OutputTokens: 1000})
		}
		r.VendorUSD = cost.VendorCostUSD
		r.Credits = cost.Credits
		r.BillableUSD = cost.BillableUSD
		r.MarginPct = cost.MarginPct
		out = append(out, r)
	}

	c.JSON(http.StatusOK, gin.H{
		"markups": gin.H{
			"text":             rc.TextMarkup,
			"image":            rc.ImageMarkup,
			"video":            rc.VideoMarkup,
			"failureAllowance": rc.FailureAllowance,
		},
		"minMarkup":            MinMarkup,
		"creditValueUSD":       CreditValueUSD,
		"blendedCostPerCredit": BlendedCostPerCredit(),
		"models":               out,
		"warning": "List prices drift. Override with PALIUS_RATE_CARD (JSON) and re-verify against each vendor's pricing page.",
	})
}

func handleAdminPlans(c *gin.Context) {
	type row struct {
		Plan      Plan          `json:"plan"`
		Economics PlanEconomics `json:"economics"`
		Subscribers int         `json:"subscribers"`
	}
	out := []row{}
	for _, p := range PlanCatalog() {
		var n int
		_ = db.QueryRow(`SELECT COUNT(*) FROM users WHERE COALESCE(plan,'free')=? AND status='active'`, p.ID).Scan(&n)
		out = append(out, row{Plan: p, Economics: ComputePlanEconomics(p), Subscribers: n})
	}
	c.JSON(http.StatusOK, gin.H{"plans": out, "packs": CreditPacks()})
}

// handleAdminAdjustCredits is the manual lever for refunds and goodwill.
func handleAdminAdjustCredits(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Credits float64 `json:"credits"`
		Reason  string  `json:"reason"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Credits == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "credits (non-zero) required"})
		return
	}
	reason := body.Reason
	if reason == "" {
		reason = "manual admin adjustment"
	}
	if err := addLedgerEntry(id, EntryAdjust, body.Credits, "", reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	bal, _ := creditBalance(id)
	c.JSON(http.StatusOK, gin.H{"ok": true, "balance": bal})
}
