package main

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Accounts: registration, subscriptions and credit purchases
//
// The admin panel could previously answer "how much did this account spend on
// vendors" but not the three questions an operator actually asks first:
//
//   Who registered?      -> users, with a signup date and an email
//   Who is still here?   -> last_seen_at, bucketed into today / 7d / 30d
//   Who pays me?         -> subscriptions (recurring) and credit_purchases
//                           (one-off top-ups), which are different customers
//                           and must not be conflated
//
// A user on a paid plan row is not the same thing as a paying customer: the
// plan column is an entitlement, a subscription is money. Keeping them in
// separate tables is what makes "paying" a fact rather than an inference.
// ---------------------------------------------------------------------------

// Subscription lifecycle states.
const (
	SubActive   = "active"
	SubTrialing = "trialing"
	SubPastDue  = "past_due"
	SubCanceled = "canceled"
)

// Credit purchase states.
const (
	PurchasePending  = "pending"
	PurchasePaid     = "paid"
	PurchaseRefunded = "refunded"
	PurchaseFailed   = "failed"
)

const accountsSchema = `
CREATE TABLE IF NOT EXISTS subscriptions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  plan          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  monthly_usd   REAL NOT NULL DEFAULT 0,
  bill_interval TEXT NOT NULL DEFAULT 'monthly',
  provider      TEXT NOT NULL DEFAULT 'manual',
  external_ref  TEXT,
  started_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  period_start  DATETIME,
  period_end    DATETIME,
  canceled_at   DATETIME,
  cancel_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_subs_user   ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS credit_purchases (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  pack_id      TEXT NOT NULL,
  credits      REAL NOT NULL DEFAULT 0,
  amount_usd   REAL NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'paid',
  provider     TEXT NOT NULL DEFAULT 'manual',
  external_ref TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  refunded_at  DATETIME
);
CREATE INDEX IF NOT EXISTS idx_purch_user   ON credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purch_status ON credit_purchases(status);

CREATE TABLE IF NOT EXISTS admin_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit(created_at);
`

// initAccounts creates the subscription/purchase/audit tables and widens the
// original users table, which had no email and no notion of "last seen".
func initAccounts() {
	if _, err := db.Exec(ddl(accountsSchema)); err != nil {
		log.Fatalf("init accounts schema: %v", err)
	}
	for _, stmt := range []string{
		"ALTER TABLE users ADD COLUMN email TEXT",
		"ALTER TABLE users ADD COLUMN company TEXT",
		"ALTER TABLE users ADD COLUMN country TEXT",
		"ALTER TABLE users ADD COLUMN signup_source TEXT",
		"ALTER TABLE users ADD COLUMN last_seen_at DATETIME",
		"ALTER TABLE users ADD COLUMN suspended_reason TEXT",
		"ALTER TABLE users ADD COLUMN admin_notes TEXT",
	} {
		if _, err := db.Exec(stmt); err != nil && !isDuplicateColumn(err) {
			log.Printf("accounts migration: %v", err)
		}
	}
}

// isDuplicateColumn reports whether an ALTER failed only because the column is
// already there — the normal outcome on every run after the first.
func isDuplicateColumn(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate column") || strings.Contains(msg, "already exists")
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

// touchUser records that an account made a request. This is what turns
// "registered" into "active" — without it the admin panel can only report who
// signed up, never who still shows up.
func touchUser(uid string) {
	if db == nil || uid == "" {
		return
	}
	if _, err := db.Exec(`UPDATE users SET last_seen_at = ? WHERE id = ?`,
		time.Now().UTC().Format("2006-01-02 15:04:05"), uid); err != nil {
		log.Printf("touch user %s: %v", uid, err)
	}
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

// Subscription is one recurring commitment. A user has at most one live row;
// canceled rows are kept so churn is measurable.
type Subscription struct {
	ID           string  `json:"id"`
	UserID       string  `json:"userId"`
	UserName     string  `json:"userName"`
	Email        string  `json:"email"`
	Plan         string  `json:"plan"`
	Status       string  `json:"status"`
	MonthlyUSD   float64 `json:"monthlyUSD"`
	Interval     string  `json:"interval"`
	Provider     string  `json:"provider"`
	StartedAt    string  `json:"startedAt"`
	PeriodStart  string  `json:"periodStart"`
	PeriodEnd    string  `json:"periodEnd"`
	CanceledAt   string  `json:"canceledAt"`
	CancelReason string  `json:"cancelReason"`
}

// normalizeStamps puts every date on this row into one format.
func (s *Subscription) normalizeStamps() {
	s.StartedAt = normStamp(s.StartedAt)
	s.PeriodStart = normStamp(s.PeriodStart)
	s.PeriodEnd = normStamp(s.PeriodEnd)
	s.CanceledAt = normStamp(s.CanceledAt)
}

func newID(prefix string) string {
	return fmt.Sprintf("%s_%d%03d", prefix, time.Now().UnixNano()/1e6, time.Now().Nanosecond()%1000)
}

// activeSubscription returns the live subscription for a user, or nil. A user
// with no row is on Free and is not a paying customer, whatever their plan
// column happens to say.
func activeSubscription(uid string) (*Subscription, error) {
	row := db.QueryRow(`
		SELECT id, user_id, plan, status, monthly_usd, bill_interval, provider,
		       started_at, COALESCE(period_start,''), COALESCE(period_end,''),
		       COALESCE(canceled_at,''), COALESCE(cancel_reason,'')
		FROM subscriptions
		WHERE user_id = ? AND status IN (?,?,?)
		ORDER BY started_at DESC LIMIT 1`, uid, SubActive, SubTrialing, SubPastDue)

	var s Subscription
	err := row.Scan(&s.ID, &s.UserID, &s.Plan, &s.Status, &s.MonthlyUSD, &s.Interval,
		&s.Provider, &s.StartedAt, &s.PeriodStart, &s.PeriodEnd, &s.CanceledAt, &s.CancelReason)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	s.normalizeStamps()
	return &s, nil
}

// startSubscription opens (or replaces) a subscription for a user and moves
// their plan entitlement to match. Any previous live row is canceled first so a
// user can never be counted twice in MRR.
func startSubscription(uid, planID, provider, externalRef string, trial bool) (*Subscription, error) {
	plan := PlanByID(planID)
	now := time.Now().UTC()

	if _, err := db.Exec(
		`UPDATE subscriptions SET status = ?, canceled_at = ?, cancel_reason = ?
		 WHERE user_id = ? AND status IN (?,?,?)`,
		SubCanceled, now.Format("2006-01-02 15:04:05"), "replaced by new subscription",
		uid, SubActive, SubTrialing, SubPastDue,
	); err != nil {
		return nil, err
	}

	status := SubActive
	if trial {
		status = SubTrialing
	}
	s := Subscription{
		ID:          newID("sub"),
		UserID:      uid,
		Plan:        plan.ID,
		Status:      status,
		MonthlyUSD:  plan.MonthlyUSD,
		Interval:    "monthly",
		Provider:    provider,
		StartedAt:   now.Format("2006-01-02 15:04:05"),
		PeriodStart: now.Format("2006-01-02 15:04:05"),
		PeriodEnd:   now.AddDate(0, 1, 0).Format("2006-01-02 15:04:05"),
	}
	if _, err := db.Exec(
		`INSERT INTO subscriptions (id, user_id, plan, status, monthly_usd, bill_interval,
		   provider, external_ref, started_at, period_start, period_end)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		s.ID, s.UserID, s.Plan, s.Status, s.MonthlyUSD, s.Interval, s.Provider,
		nullIfEmpty(externalRef), s.StartedAt, s.PeriodStart, s.PeriodEnd,
	); err != nil {
		return nil, err
	}

	// Entitlement follows the money: plan column and credit quota move together.
	if _, err := db.Exec(`UPDATE users SET plan = ?, credit_quota = ? WHERE id = ?`,
		plan.ID, plan.IncludedCredits, uid); err != nil {
		return nil, err
	}
	// Give them the allowance they just paid for straight away.
	if err := grantMonthlyCredits(uid); err != nil {
		log.Printf("grant on subscribe %s: %v", uid, err)
	}
	return &s, nil
}

// cancelSubscription ends a subscription and drops the account back to Free.
func cancelSubscription(uid, reason string) error {
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := db.Exec(
		`UPDATE subscriptions SET status = ?, canceled_at = ?, cancel_reason = ?
		 WHERE user_id = ? AND status IN (?,?,?)`,
		SubCanceled, now, reason, uid, SubActive, SubTrialing, SubPastDue)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("no live subscription for %s", uid)
	}
	free := PlanByID("free")
	_, err = db.Exec(`UPDATE users SET plan = ?, credit_quota = ? WHERE id = ?`,
		free.ID, free.IncludedCredits, uid)
	return err
}

func listSubscriptions(status string) ([]Subscription, error) {
	q := `
		SELECT s.id, s.user_id, COALESCE(u.name,''), COALESCE(u.email,''), s.plan,
		       s.status, s.monthly_usd, s.bill_interval, s.provider, s.started_at,
		       COALESCE(s.period_start,''), COALESCE(s.period_end,''),
		       COALESCE(s.canceled_at,''), COALESCE(s.cancel_reason,'')
		FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id`
	args := []interface{}{}
	if status != "" && status != "all" {
		q += ` WHERE s.status = ?`
		args = append(args, status)
	}
	q += ` ORDER BY s.started_at DESC LIMIT 500`

	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Subscription{}
	for rows.Next() {
		var s Subscription
		if err := rows.Scan(&s.ID, &s.UserID, &s.UserName, &s.Email, &s.Plan, &s.Status,
			&s.MonthlyUSD, &s.Interval, &s.Provider, &s.StartedAt, &s.PeriodStart,
			&s.PeriodEnd, &s.CanceledAt, &s.CancelReason); err == nil {
			s.normalizeStamps()
			out = append(out, s)
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Credit purchases
// ---------------------------------------------------------------------------

// CreditPurchase is one credit-pack sale. Credits land in the ledger only when
// the purchase is marked paid, so an abandoned checkout never grants anything.
type CreditPurchase struct {
	ID         string  `json:"id"`
	UserID     string  `json:"userId"`
	UserName   string  `json:"userName"`
	Email      string  `json:"email"`
	PackID     string  `json:"packId"`
	Credits    float64 `json:"credits"`
	AmountUSD  float64 `json:"amountUSD"`
	Status     string  `json:"status"`
	Provider   string  `json:"provider"`
	CreatedAt  string  `json:"createdAt"`
	RefundedAt string  `json:"refundedAt"`
}

func packByID(id string) (CreditPack, bool) {
	for _, p := range CreditPacks() {
		if p.ID == id {
			return p, true
		}
	}
	return CreditPack{}, false
}

// recordPurchase sells a credit pack. There is no payment provider wired in
// yet, so provider defaults to "manual" and the caller is trusted — this is the
// seam a Stripe webhook drops into later without the rest of the system moving.
func recordPurchase(uid, packID, provider, externalRef, status string) (*CreditPurchase, error) {
	pack, ok := packByID(packID)
	if !ok {
		return nil, fmt.Errorf("unknown credit pack %q", packID)
	}
	if status == "" {
		status = PurchasePaid
	}
	p := CreditPurchase{
		ID:        newID("pur"),
		UserID:    uid,
		PackID:    pack.ID,
		Credits:   pack.Credits,
		AmountUSD: pack.PriceUSD,
		Status:    status,
		Provider:  provider,
		CreatedAt: time.Now().UTC().Format("2006-01-02 15:04:05"),
	}
	if _, err := db.Exec(
		`INSERT INTO credit_purchases (id, user_id, pack_id, credits, amount_usd,
		   status, provider, external_ref, created_at)
		 VALUES (?,?,?,?,?,?,?,?,?)`,
		p.ID, p.UserID, p.PackID, p.Credits, p.AmountUSD, p.Status, p.Provider,
		nullIfEmpty(externalRef), p.CreatedAt,
	); err != nil {
		return nil, err
	}
	if p.Status == PurchasePaid {
		if err := addLedgerEntry(uid, EntryPurchase, pack.Credits, "",
			"credit pack "+pack.ID+" ($"+trimFloat(pack.PriceUSD)+")"); err != nil {
			return nil, err
		}
	}
	return &p, nil
}

// refundPurchase reverses a paid pack, clawing the credits back out of the
// ledger so a refunded customer cannot keep spending what they were repaid.
func refundPurchase(id string) error {
	var uid, status string
	var credits float64
	if err := db.QueryRow(
		`SELECT user_id, status, credits FROM credit_purchases WHERE id = ?`, id,
	).Scan(&uid, &status, &credits); err != nil {
		return err
	}
	if status != PurchasePaid {
		return fmt.Errorf("purchase %s is %s, only paid purchases can be refunded", id, status)
	}
	if _, err := db.Exec(
		`UPDATE credit_purchases SET status = ?, refunded_at = ? WHERE id = ?`,
		PurchaseRefunded, time.Now().UTC().Format("2006-01-02 15:04:05"), id,
	); err != nil {
		return err
	}
	return addLedgerEntry(uid, EntryAdjust, -credits, "", "refund of purchase "+id)
}

func listPurchases(status string, limit int) ([]CreditPurchase, error) {
	if limit <= 0 {
		limit = 200
	}
	q := `
		SELECT p.id, p.user_id, COALESCE(u.name,''), COALESCE(u.email,''), p.pack_id,
		       p.credits, p.amount_usd, p.status, p.provider, p.created_at,
		       COALESCE(p.refunded_at,'')
		FROM credit_purchases p LEFT JOIN users u ON u.id = p.user_id`
	args := []interface{}{}
	if status != "" && status != "all" {
		q += ` WHERE p.status = ?`
		args = append(args, status)
	}
	q += ` ORDER BY p.created_at DESC LIMIT ?`
	args = append(args, limit)

	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []CreditPurchase{}
	for rows.Next() {
		var p CreditPurchase
		if err := rows.Scan(&p.ID, &p.UserID, &p.UserName, &p.Email, &p.PackID,
			&p.Credits, &p.AmountUSD, &p.Status, &p.Provider, &p.CreatedAt,
			&p.RefundedAt); err == nil {
			p.CreatedAt = normStamp(p.CreatedAt)
			p.RefundedAt = normStamp(p.RefundedAt)
			out = append(out, p)
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

// AuditEntry is one privileged action. Giving the operator every privilege is
// only defensible if every use of one is written down.
type AuditEntry struct {
	ID         int64  `json:"id"`
	Actor      string `json:"actor"`
	Action     string `json:"action"`
	TargetType string `json:"targetType"`
	TargetID   string `json:"targetId"`
	Detail     string `json:"detail"`
	CreatedAt  string `json:"createdAt"`
}

func recordAudit(actor, action, targetType, targetID, detail string) {
	if actor == "" {
		actor = "admin"
	}
	if _, err := db.Exec(
		`INSERT INTO admin_audit (actor, action, target_type, target_id, detail)
		 VALUES (?,?,?,?,?)`, actor, action, targetType, targetID, detail,
	); err != nil {
		log.Printf("audit %s: %v", action, err)
	}
}

func listAudit(limit int) ([]AuditEntry, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := db.Query(
		`SELECT id, actor, action, COALESCE(target_type,''), COALESCE(target_id,''),
		        COALESCE(detail,''), created_at
		 FROM admin_audit ORDER BY created_at DESC, id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AuditEntry{}
	for rows.Next() {
		var a AuditEntry
		if err := rows.Scan(&a.ID, &a.Actor, &a.Action, &a.TargetType, &a.TargetID,
			&a.Detail, &a.CreatedAt); err == nil {
			a.CreatedAt = normStamp(a.CreatedAt)
			out = append(out, a)
		}
	}
	return out, nil
}

// normStamp renders every timestamp the same way, whatever the driver handed
// back. The SQLite driver returns DATETIME-declared columns as RFC3339 while
// values written as strings come back verbatim, so an export could otherwise
// carry two formats in adjacent columns and sort wrongly in a spreadsheet.
func normStamp(s string) string {
	if s == "" {
		return ""
	}
	t, err := parseStamp(s)
	if err != nil {
		return s
	}
	return t.UTC().Format("2006-01-02 15:04:05")
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

// seedAccounts backfills the demo users with the registration details,
// subscriptions and purchases the admin panel now reports on. It runs only when
// there are no subscriptions at all, so it never touches real data.
func seedAccounts() {
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM subscriptions`).Scan(&n); err != nil || n > 0 {
		return
	}

	now := time.Now().UTC()
	profiles := []struct {
		id, email, company, country, source string
		signupDaysAgo, lastSeenHoursAgo     int
		plan                                string
		subStatus                           string
		packs                               []string
	}{
		{"user-1", "alex@morganmedia.co", "Morgan Media", "US", "organic", 96, 2, "creator", SubActive, []string{"pack-1k"}},
		{"user-2", "sarah.chen@brightlab.io", "BrightLab", "SG", "product-hunt", 61, 9, "creator", SubActive, nil},
		{"user-3", "james@okaforstudio.ng", "Okafor Studio", "NG", "referral", 34, 30, "solo", SubActive, nil},
		{"user-4", "lena@petrovaagency.eu", "Petrova Agency", "DE", "outbound", 210, 5, "agency", SubActive, []string{"pack-5k", "pack-1k"}},
		{"user-5", "marco.diaz@gmail.com", "—", "MX", "organic", 12, 400, "free", "", nil},
	}

	for _, p := range profiles {
		signup := now.AddDate(0, 0, -p.signupDaysAgo).Format("2006-01-02 15:04:05")
		lastSeen := now.Add(-time.Duration(p.lastSeenHoursAgo) * time.Hour).Format("2006-01-02 15:04:05")
		if _, err := db.Exec(
			`UPDATE users SET email = ?, company = ?, country = ?, signup_source = ?,
			   created_at = ?, last_seen_at = ? WHERE id = ?`,
			p.email, p.company, p.country, p.source, signup, lastSeen, p.id,
		); err != nil {
			log.Printf("seed profile %s: %v", p.id, err)
			continue
		}

		if p.subStatus != "" {
			plan := PlanByID(p.plan)
			if _, err := db.Exec(
				`INSERT INTO subscriptions (id, user_id, plan, status, monthly_usd,
				   bill_interval, provider, started_at, period_start, period_end)
				 VALUES (?,?,?,?,?,?,?,?,?,?)`,
				newID("sub"), p.id, plan.ID, p.subStatus, plan.MonthlyUSD, "monthly",
				"seed", signup, now.Format("2006-01")+"-01 00:00:00",
				now.AddDate(0, 1, 0).Format("2006-01-02 15:04:05"),
			); err != nil {
				log.Printf("seed subscription %s: %v", p.id, err)
			}
		}

		for i, packID := range p.packs {
			pack, ok := packByID(packID)
			if !ok {
				continue
			}
			stamp := now.AddDate(0, 0, -(i*9 + 3)).Format("2006-01-02 15:04:05")
			if _, err := db.Exec(
				`INSERT INTO credit_purchases (id, user_id, pack_id, credits,
				   amount_usd, status, provider, created_at)
				 VALUES (?,?,?,?,?,?,?,?)`,
				newID("pur"), p.id, pack.ID, pack.Credits, pack.PriceUSD,
				PurchasePaid, "seed", stamp,
			); err != nil {
				log.Printf("seed purchase %s: %v", p.id, err)
				continue
			}
			_ = addLedgerEntry(p.id, EntryPurchase, pack.Credits, "",
				"credit pack "+pack.ID+" ($"+trimFloat(pack.PriceUSD)+")")
		}
	}

	// One churned account, so the churn column is not permanently zero.
	churnedAt := now.AddDate(0, 0, -20).Format("2006-01-02 15:04:05")
	if _, err := db.Exec(
		`INSERT INTO subscriptions (id, user_id, plan, status, monthly_usd, bill_interval,
		   provider, started_at, period_start, period_end, canceled_at, cancel_reason)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		newID("sub"), "user-5", "solo", SubCanceled, 19.0, "monthly", "seed",
		now.AddDate(0, 0, -80).Format("2006-01-02 15:04:05"),
		now.AddDate(0, 0, -50).Format("2006-01-02 15:04:05"), churnedAt,
		churnedAt, "too expensive for my volume",
	); err != nil {
		log.Printf("seed churn: %v", err)
	}

	recordAudit("system", "seed", "accounts", "", "seeded demo subscriptions and credit purchases")
}
