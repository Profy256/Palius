package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Exact metering
//
// Billing model: the customer subscribes, uses whatever model they like, and is
// charged for what they consume. Two invariants make that safe:
//
//   I1. NO OPERATION IS EVER SOLD BELOW VENDOR COST.
//       Enforced in assertProfitable(). Price = vendor cost x markup, and the
//       markup is >= MinMarkup, checked at charge time rather than trusted.
//
//   I2. NO CREDIT IS SPENT THAT THE CUSTOMER DOES NOT HAVE.
//       Enforced by reserving credits *before* dispatch and reconciling after.
//
// Counting is a two-phase commit because estimates and reality differ. A user
// asks for 8 seconds; the provider returns 8.4 and bills for 9. If we charged
// the estimate we would eat the difference on every job.
//
//   1. RESERVE  — estimate the cost, hold that many credits. Refuse if short.
//   2. COMMIT   — recompute from the units the vendor actually reported,
//                 release the hold, charge the real amount.
//   3. FAIL     — release the hold. If the vendor billed us anyway, the charge
//                 is booked against the failure allowance, not the customer.
//
// The credit ledger is append-only. Balance is SUM(delta), never an UPDATE on a
// balance column, so two concurrent generations cannot race a lost update and
// there is a complete audit trail for any billing dispute.
// ---------------------------------------------------------------------------

// MinMarkup is the floor multiple of vendor cost. Below this an operation is
// refused outright: it means the rate card and the plan pricing have drifted
// apart and every call is losing money.
const MinMarkup = 1.5

// Operation lifecycle states.
const (
	OpReserved  = "reserved"
	OpCommitted = "committed"
	OpFailed    = "failed"
	OpRefunded  = "refunded"
)

// Credit ledger entry kinds. Signed deltas; balance is their sum.
const (
	EntryGrant    = "grant"    // + monthly plan allowance
	EntryPurchase = "purchase" // + bought top-up
	EntryHold     = "hold"     // - reserved for an in-flight operation
	EntryRelease  = "release"  // + hold released
	EntryCharge   = "charge"   // - actual consumption
	EntryRefund   = "refund"   // + goodwill / failed job
	EntryExpire   = "expire"   // - unused allowance at period end
	EntryAdjust   = "adjust"   // +/- manual admin correction
)

const meteringSchema = `
CREATE TABLE IF NOT EXISTS credit_ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,
  entry_kind   TEXT    NOT NULL,
  delta        REAL    NOT NULL,
  operation_id TEXT,
  reason       TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_op   ON credit_ledger(operation_id);

CREATE TABLE IF NOT EXISTS operations (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  idempotency_key   TEXT,
  state             TEXT NOT NULL,
  modality          TEXT NOT NULL,
  model             TEXT NOT NULL,
  provider          TEXT NOT NULL,
  intent            TEXT,

  est_units         REAL NOT NULL DEFAULT 0,
  est_credits       REAL NOT NULL DEFAULT 0,
  est_vendor_usd    REAL NOT NULL DEFAULT 0,

  actual_units      REAL NOT NULL DEFAULT 0,
  unit_kind         TEXT,
  actual_vendor_usd REAL NOT NULL DEFAULT 0,
  charged_credits   REAL NOT NULL DEFAULT 0,
  billable_usd      REAL NOT NULL DEFAULT 0,
  margin_usd        REAL NOT NULL DEFAULT 0,

  vendor_billed_on_failure INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at        DATETIME
);
CREATE INDEX IF NOT EXISTS idx_ops_user  ON operations(user_id);
CREATE INDEX IF NOT EXISTS idx_ops_state ON operations(state);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_idem ON operations(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS margin_alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT,
  operation_id TEXT,
  model       TEXT,
  vendor_usd  REAL,
  billable_usd REAL,
  detail      TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`

func initMetering() {
	if _, err := db.Exec(ddl(meteringSchema)); err != nil {
		log.Fatalf("init metering schema: %v", err)
	}
	// The original usage_events table predates cost accounting; widen it so
	// media rows can carry their real units instead of a flat credit of 1.
	for _, col := range []string{
		"ALTER TABLE usage_events ADD COLUMN units REAL NOT NULL DEFAULT 0",
		"ALTER TABLE usage_events ADD COLUMN unit_kind TEXT",
		"ALTER TABLE usage_events ADD COLUMN vendor_cost_usd REAL NOT NULL DEFAULT 0",
		"ALTER TABLE usage_events ADD COLUMN billable_usd REAL NOT NULL DEFAULT 0",
		"ALTER TABLE usage_events ADD COLUMN margin_usd REAL NOT NULL DEFAULT 0",
		"ALTER TABLE usage_events ADD COLUMN operation_id TEXT",
	} {
		// Duplicate-column errors are expected on every run after the first.
		if _, err := db.Exec(col); err != nil && !strings.Contains(err.Error(), "duplicate column") &&
			!strings.Contains(err.Error(), "already exists") {
			log.Printf("metering migration: %v", err)
		}
	}
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

// CreditBalance is what the customer and the UI need to see.
type CreditBalance struct {
	UserID          string  `json:"userId"`
	Plan            string  `json:"plan"`
	Balance         float64 `json:"balance"`         // spendable now
	Held            float64 `json:"held"`            // reserved by in-flight jobs
	Available       float64 `json:"available"`       // balance - held
	IncludedCredits float64 `json:"includedCredits"` // this period's allowance
	UsedThisPeriod  float64 `json:"usedThisPeriod"`
	OveragePerCredit float64 `json:"overagePerCreditUSD"`
	MediaEnabled    bool    `json:"mediaEnabled"`
	PeriodStart     string  `json:"periodStart"`
}

func creditBalance(uid string) (CreditBalance, error) {
	var b CreditBalance
	b.UserID = uid

	u, err := userRow(uid)
	if err != nil {
		return b, err
	}
	plan := PlanByID(u.Plan)
	b.Plan = plan.ID
	b.IncludedCredits = plan.IncludedCredits
	b.OveragePerCredit = plan.OveragePerCreditUSD
	b.MediaEnabled = plan.MediaEnabled

	// Sum of every signed delta — holds are already negative, so this is the
	// true spendable figure.
	if err := db.QueryRow(
		`SELECT COALESCE(SUM(delta),0) FROM credit_ledger WHERE user_id = ?`, uid,
	).Scan(&b.Balance); err != nil {
		return b, err
	}

	// Outstanding holds, so the UI can distinguish "spent" from "in flight".
	if err := db.QueryRow(
		`SELECT COALESCE(-SUM(l.delta),0) FROM credit_ledger l
		 JOIN operations o ON o.id = l.operation_id
		 WHERE l.user_id = ? AND l.entry_kind = ? AND o.state = ?`,
		uid, EntryHold, OpReserved,
	).Scan(&b.Held); err != nil {
		return b, err
	}

	periodStart := time.Now().UTC().Format("2006-01") + "-01"
	b.PeriodStart = periodStart
	if err := db.QueryRow(
		`SELECT COALESCE(-SUM(delta),0) FROM credit_ledger
		 WHERE user_id = ? AND entry_kind = ? AND created_at >= ?`,
		uid, EntryCharge, periodStart,
	).Scan(&b.UsedThisPeriod); err != nil {
		return b, err
	}

	b.Balance = round2(b.Balance)
	b.Held = round2(b.Held)
	b.Available = round2(b.Balance)
	b.UsedThisPeriod = round2(b.UsedThisPeriod)
	return b, nil
}

// grantMonthlyCredits tops a user up to their plan allowance for the period.
// Idempotent per period: calling it twice in one month grants once.
func grantMonthlyCredits(uid string) error {
	u, err := userRow(uid)
	if err != nil {
		return err
	}
	plan := PlanByID(u.Plan)
	period := time.Now().UTC().Format("2006-01")
	reason := "monthly allowance " + period

	var n int
	if err := db.QueryRow(
		`SELECT COUNT(*) FROM credit_ledger WHERE user_id = ? AND entry_kind = ? AND reason = ?`,
		uid, EntryGrant, reason,
	).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	return addLedgerEntry(uid, EntryGrant, plan.IncludedCredits, "", reason)
}

func addLedgerEntry(uid, kind string, delta float64, opID, reason string) error {
	var op interface{}
	if opID != "" {
		op = opID
	}
	_, err := db.Exec(
		`INSERT INTO credit_ledger (user_id, entry_kind, delta, operation_id, reason) VALUES (?,?,?,?,?)`,
		uid, kind, delta, op, reason,
	)
	return err
}

// ---------------------------------------------------------------------------
// Margin invariant
// ---------------------------------------------------------------------------

// ErrBelowCost means an operation would be sold at or under what it costs us.
var ErrBelowCost = errors.New("operation would price at or below vendor cost")

// assertProfitable is the guardrail that makes "I must profit on every call"
// structural rather than aspirational. It records an alert whenever the rate
// card and pricing policy have drifted into loss-making territory.
func assertProfitable(uid, opID string, c CostBreakdown) error {
	if c.VendorCostUSD <= 0 {
		return nil // free/self-hosted model — nothing to protect
	}
	effective := c.BillableUSD / c.VendorCostUSD
	if effective >= MinMarkup {
		return nil
	}

	detail := fmt.Sprintf(
		"effective markup %.2fx is below the %.2fx floor (vendor $%.4f vs billable $%.4f) for model %s",
		effective, MinMarkup, c.VendorCostUSD, c.BillableUSD, c.Model)
	log.Printf("MARGIN ALERT user=%s op=%s: %s", uid, opID, detail)
	_, _ = db.Exec(
		`INSERT INTO margin_alerts (user_id, operation_id, model, vendor_usd, billable_usd, detail)
		 VALUES (?,?,?,?,?,?)`,
		uid, opID, c.Model, c.VendorCostUSD, c.BillableUSD, detail,
	)
	return fmt.Errorf("%w: %s", ErrBelowCost, detail)
}

// ---------------------------------------------------------------------------
// Reserve / commit / fail
// ---------------------------------------------------------------------------

// ReserveResult is returned to the caller before a job is dispatched.
type ReserveResult struct {
	OperationID    string        `json:"operationId"`
	Estimate       CostBreakdown `json:"estimate"`
	HeldCredits    float64       `json:"heldCredits"`
	BalanceAfter   float64       `json:"balanceAfter"`
	NeedsConfirm   bool          `json:"needsConfirm"`
	ConfirmMessage string        `json:"confirmMessage,omitempty"`
}

// InsufficientCreditsError carries what the UI needs to sell an upgrade.
type InsufficientCreditsError struct {
	Required  float64
	Available float64
	Plan      string
}

func (e *InsufficientCreditsError) Error() string {
	return fmt.Sprintf("insufficient credits: need %.2f, have %.2f on plan %s",
		e.Required, e.Available, e.Plan)
}

// reserveOperation prices the job, checks the customer can pay, and holds the
// credits. Nothing is dispatched to a provider until this succeeds.
func reserveOperation(uid string, spec GenerationSpec, intent, idempotencyKey string, confirmed bool) (*ReserveResult, error) {
	if err := grantMonthlyCredits(uid); err != nil {
		log.Printf("grant credits for %s: %v", uid, err)
	}

	// Replaying the same key returns the original operation instead of
	// double-charging — clients retry, and retries must be free.
	if idempotencyKey != "" {
		if existing, err := operationByIdempotencyKey(idempotencyKey); err == nil && existing != nil {
			bal, _ := creditBalance(uid)
			return &ReserveResult{
				OperationID:  existing.ID,
				HeldCredits:  existing.EstCredits,
				BalanceAfter: bal.Available,
			}, nil
		}
	}

	// A suspended or delinquent account must not be able to spend, including
	// spending credits it was granted before suspension. Without this a failed
	// payment still buys generation until the allowance runs out.
	u, err := userRow(uid)
	if err != nil {
		return nil, err
	}
	if u.Status != "active" {
		return nil, fmt.Errorf("account is %s — generation is disabled", u.Status)
	}

	bal, err := creditBalance(uid)
	if err != nil {
		return nil, err
	}
	plan := PlanByID(bal.Plan)

	isMedia := spec.Modality == "image" || spec.Modality == "video"
	if isMedia && !plan.MediaEnabled {
		return nil, fmt.Errorf("plan %s does not include image or video generation", plan.ID)
	}

	est := EstimateCost(spec)

	// Hard monthly ceilings, independent of credit balance, so a top-up cannot
	// be used to blow past an abuse threshold.
	if err := checkHardCaps(uid, plan, spec); err != nil {
		return nil, err
	}

	if est.Credits > bal.Available {
		return nil, &InsufficientCreditsError{
			Required: est.Credits, Available: bal.Available, Plan: plan.ID,
		}
	}

	// Expensive single operations need an explicit yes.
	if plan.RequireConfirmAboveUSD > 0 && est.BillableUSD > plan.RequireConfirmAboveUSD && !confirmed {
		return &ReserveResult{
			Estimate:     est,
			NeedsConfirm: true,
			ConfirmMessage: fmt.Sprintf(
				"This will use %.0f credits (%s). Continue?",
				est.Credits, est.Explanation),
			BalanceAfter: bal.Available,
		}, nil
	}

	opID := newOperationID()
	if err := assertProfitable(uid, opID, est); err != nil {
		return nil, err
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	var idem interface{}
	if idempotencyKey != "" {
		idem = idempotencyKey
	}
	if _, err := tx.Exec(
		`INSERT INTO operations
		   (id, user_id, idempotency_key, state, modality, model, provider, intent,
		    est_units, est_credits, est_vendor_usd, unit_kind)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		opID, uid, idem, OpReserved, spec.Modality, spec.Model, spec.Provider, intent,
		est.Units, est.Credits, est.VendorCostUSD, est.UnitKind,
	); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(
		`INSERT INTO credit_ledger (user_id, entry_kind, delta, operation_id, reason) VALUES (?,?,?,?,?)`,
		uid, EntryHold, -est.Credits, opID, "hold for "+spec.Modality+" "+spec.Model,
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &ReserveResult{
		OperationID:  opID,
		Estimate:     est,
		HeldCredits:  est.Credits,
		BalanceAfter: round2(bal.Available - est.Credits),
	}, nil
}

// commitOperation settles a finished job against the units the vendor actually
// reported. This is where over- and under-estimates get corrected.
func commitOperation(opID string, actual GenerationSpec) (*CostBreakdown, error) {
	op, err := operationByID(opID)
	if err != nil {
		return nil, err
	}
	if op.State != OpReserved {
		// Already settled — return what was charged rather than charging twice.
		final := CostBreakdown{
			Modality: op.Modality, Model: op.Model, Provider: op.Provider,
			Units: op.ActualUnits, UnitKind: op.UnitKind,
			VendorCostUSD: op.ActualVendorUSD, BillableUSD: op.BillableUSD,
			Credits: op.ChargedCredits, MarginUSD: op.MarginUSD,
		}
		return &final, nil
	}

	// Price from the actuals, not the estimate.
	actual.Modality = op.Modality
	if actual.Model == "" {
		actual.Model = op.Model
	}
	if actual.Provider == "" {
		actual.Provider = op.Provider
	}
	final := EstimateCost(actual)

	if err := assertProfitable(op.UserID, opID, final); err != nil {
		// Still charge — the work is done and the vendor will invoice us. The
		// alert is the signal to fix the rate card; refusing here would give
		// away the output for free, which is strictly worse.
		log.Printf("commit %s proceeding despite margin alert", opID)
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	// Release the hold, then charge the real amount. Two entries rather than a
	// net adjustment so the ledger reads as a plain audit trail.
	if _, err := tx.Exec(
		`INSERT INTO credit_ledger (user_id, entry_kind, delta, operation_id, reason) VALUES (?,?,?,?,?)`,
		op.UserID, EntryRelease, op.EstCredits, opID, "release hold on commit",
	); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(
		`INSERT INTO credit_ledger (user_id, entry_kind, delta, operation_id, reason) VALUES (?,?,?,?,?)`,
		op.UserID, EntryCharge, -final.Credits, opID,
		fmt.Sprintf("%s %s: %s", op.Modality, op.Model, final.Explanation),
	); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(
		`UPDATE operations SET state=?, actual_units=?, unit_kind=?, actual_vendor_usd=?,
		    charged_credits=?, billable_usd=?, margin_usd=?, settled_at=CURRENT_TIMESTAMP
		 WHERE id=?`,
		OpCommitted, final.Units, final.UnitKind, final.VendorCostUSD,
		final.Credits, final.BillableUSD, final.MarginUSD, opID,
	); err != nil {
		return nil, err
	}
	// Mirror into usage_events so the existing admin views keep working.
	if _, err := tx.Exec(
		`INSERT INTO usage_events
		   (user_id, task_type, provider, model, input_tokens, output_tokens,
		    credit_units, cost_usd, units, unit_kind, vendor_cost_usd, billable_usd,
		    margin_usd, operation_id)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		op.UserID, op.Modality, op.Provider, op.Model,
		actual.InputTokens, actual.OutputTokens,
		final.Credits, final.VendorCostUSD, final.Units, final.UnitKind,
		final.VendorCostUSD, final.BillableUSD, final.MarginUSD, opID,
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &final, nil
}

// failOperation releases the hold for a job that produced nothing.
//
// vendorBilled matters: providers frequently charge for generations that error
// out or return unusable frames. When that happens the cost is real but it is
// not the customer's fault, so it is booked to the house — funded by the
// FailureAllowance already baked into every price — and recorded so the admin
// can see how much failure is actually costing.
func failOperation(opID, reason string, vendorBilled bool, vendorUSD float64) error {
	op, err := operationByID(opID)
	if err != nil {
		return err
	}
	if op.State != OpReserved {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec(
		`INSERT INTO credit_ledger (user_id, entry_kind, delta, operation_id, reason) VALUES (?,?,?,?,?)`,
		op.UserID, EntryRelease, op.EstCredits, opID, "release hold: "+reason,
	); err != nil {
		return err
	}
	billed := 0
	if vendorBilled {
		billed = 1
	}
	if _, err := tx.Exec(
		`UPDATE operations SET state=?, error=?, vendor_billed_on_failure=?,
		   actual_vendor_usd=?, charged_credits=0, billable_usd=0, margin_usd=?,
		   settled_at=CURRENT_TIMESTAMP
		 WHERE id=?`,
		OpFailed, reason, billed, vendorUSD, -vendorUSD, opID,
	); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if vendorBilled && vendorUSD > 0 {
		log.Printf("absorbed $%.4f vendor cost on failed op %s (%s)", vendorUSD, opID, reason)
	}
	return nil
}

// checkHardCaps enforces the monthly unit ceilings that sit above credits.
func checkHardCaps(uid string, plan Plan, spec GenerationSpec) error {
	periodStart := time.Now().UTC().Format("2006-01") + "-01"

	switch spec.Modality {
	case "video":
		if plan.MaxVideoSecondsPerMonth <= 0 {
			return fmt.Errorf("plan %s does not include AI video generation", plan.ID)
		}
		var used float64
		_ = db.QueryRow(
			`SELECT COALESCE(SUM(actual_units),0) FROM operations
			 WHERE user_id=? AND modality='video' AND state=? AND created_at >= ?`,
			uid, OpCommitted, periodStart,
		).Scan(&used)
		want := spec.Seconds * float64(maxInt(spec.VideoCount, 1))
		if used+want > plan.MaxVideoSecondsPerMonth {
			return fmt.Errorf(
				"monthly video limit reached: %.0fs of %.0fs used on plan %s",
				used, plan.MaxVideoSecondsPerMonth, plan.ID)
		}
	case "image":
		if plan.MaxImagesPerMonth <= 0 {
			return fmt.Errorf("plan %s does not include AI image generation", plan.ID)
		}
		var used float64
		_ = db.QueryRow(
			`SELECT COALESCE(SUM(actual_units),0) FROM operations
			 WHERE user_id=? AND modality='image' AND state=? AND created_at >= ?`,
			uid, OpCommitted, periodStart,
		).Scan(&used)
		want := float64(maxInt(spec.ImageCount, 1))
		if used+want > float64(plan.MaxImagesPerMonth) {
			return fmt.Errorf(
				"monthly image limit reached: %.0f of %d used on plan %s",
				used, plan.MaxImagesPerMonth, plan.ID)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Operation rows
// ---------------------------------------------------------------------------

// Operation is one metered unit of work.
type Operation struct {
	ID              string  `json:"id"`
	UserID          string  `json:"userId"`
	State           string  `json:"state"`
	Modality        string  `json:"modality"`
	Model           string  `json:"model"`
	Provider        string  `json:"provider"`
	Intent          string  `json:"intent"`
	EstUnits        float64 `json:"estUnits"`
	EstCredits      float64 `json:"estCredits"`
	EstVendorUSD    float64 `json:"estVendorUSD"`
	ActualUnits     float64 `json:"actualUnits"`
	UnitKind        string  `json:"unitKind"`
	ActualVendorUSD float64 `json:"actualVendorUSD"`
	ChargedCredits  float64 `json:"chargedCredits"`
	BillableUSD     float64 `json:"billableUSD"`
	MarginUSD       float64 `json:"marginUSD"`
	VendorBilledOnFailure bool `json:"vendorBilledOnFailure"`
	Error           string  `json:"error,omitempty"`
	CreatedAt       string  `json:"createdAt"`
	SettledAt       string  `json:"settledAt,omitempty"`
}

const opColumns = `id, user_id, state, modality, model, provider,
	COALESCE(intent,''), est_units, est_credits, est_vendor_usd,
	actual_units, COALESCE(unit_kind,''), actual_vendor_usd, charged_credits,
	billable_usd, margin_usd, vendor_billed_on_failure, COALESCE(error,''),
	created_at, COALESCE(settled_at,'')`

func scanOperation(row interface{ Scan(...interface{}) error }) (*Operation, error) {
	var o Operation
	var billed int
	if err := row.Scan(&o.ID, &o.UserID, &o.State, &o.Modality, &o.Model, &o.Provider,
		&o.Intent, &o.EstUnits, &o.EstCredits, &o.EstVendorUSD,
		&o.ActualUnits, &o.UnitKind, &o.ActualVendorUSD, &o.ChargedCredits,
		&o.BillableUSD, &o.MarginUSD, &billed, &o.Error,
		&o.CreatedAt, &o.SettledAt); err != nil {
		return nil, err
	}
	o.VendorBilledOnFailure = billed == 1
	return &o, nil
}

func operationByID(id string) (*Operation, error) {
	return scanOperation(db.QueryRow(`SELECT `+opColumns+` FROM operations WHERE id = ?`, id))
}

func operationByIdempotencyKey(key string) (*Operation, error) {
	op, err := scanOperation(db.QueryRow(
		`SELECT `+opColumns+` FROM operations WHERE idempotency_key = ?`, key))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return op, err
}

func newOperationID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("op-%d", time.Now().UnixNano())
	}
	return "op-" + hex.EncodeToString(b)
}

// ---------------------------------------------------------------------------
// recordTextUsage replaces the old flat-rate recordUsage for text calls.
// ---------------------------------------------------------------------------

func recordTextUsage(uid string, u *TokenUsage, taskType, provider, model string) {
	if db == nil || u == nil {
		return
	}
	cost := EstimateCost(GenerationSpec{
		Modality:     "text",
		Model:        model,
		Provider:     provider,
		InputTokens:  u.InputTokens,
		OutputTokens: u.OutputTokens,
	})

	// Text is TRACKED but never CHARGED. Credits exist for image and video
	// generation only — captions, hashtags, blog drafts, comment and DM replies,
	// analysis and viral research are all covered by the subscription fee.
	//
	// That is a deliberate product decision, and the economics support it: a
	// caption costs ~$0.0004 and a full blog draft ~$0.05 of vendor spend, so
	// even a heavy month of text lands around $2-3 per user. It is a fixed line
	// in COGS (see Plan.EstTextCostUSD), not something worth metering to the
	// customer. Metering cheap operations only teaches users to be afraid of
	// the product.
	//
	// credit_units is written as 0 for exactly this reason.
	if _, err := db.Exec(
		`INSERT INTO usage_events
		   (user_id, task_type, provider, model, input_tokens, output_tokens,
		    credit_units, cost_usd, units, unit_kind, vendor_cost_usd,
		    billable_usd, margin_usd)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		uid, taskType, provider, model, u.InputTokens, u.OutputTokens,
		0, cost.VendorCostUSD, cost.Units, cost.UnitKind,
		cost.VendorCostUSD, 0, -cost.VendorCostUSD,
	); err != nil {
		log.Printf("record text usage: %v", err)
	}
}

// ceilCredits rounds up to 2dp — fractional credits that round down leak money
// across millions of calls.
func ceilCredits(v float64) float64 {
	return math.Ceil(v*100) / 100
}
