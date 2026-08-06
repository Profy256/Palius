package main

import (
	"database/sql"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

var db *DB

// TokenUsage is the normalized token count reported by any AI provider.
type TokenUsage struct {
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`
	TotalTokens  int `json:"totalTokens"`
}

// UsageEvent is one recorded AI call in the ledger.
type UsageEvent struct {
	ID           int64   `json:"id"`
	UserID       string  `json:"userId"`
	UserName     string  `json:"userName"`
	TaskType     string  `json:"taskType"`
	Provider     string  `json:"provider"`
	Model        string  `json:"model"`
	InputTokens  int     `json:"inputTokens"`
	OutputTokens int     `json:"outputTokens"`
	CreditUnits  float64 `json:"creditUnits"`
	CostUSD      float64 `json:"costUSD"`
	CreatedAt    string  `json:"createdAt"`
}

// AdminUser is a user with aggregated usage.
type AdminUser struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Plan        string  `json:"plan"`
	Status      string  `json:"status"`
	TokenQuota  int64   `json:"tokenQuota"`
	CreditQuota float64 `json:"creditQuota"`
	TokensUsed  int64   `json:"tokensUsed"`
	CreditsUsed float64 `json:"creditsUsed"`
	Calls       int64   `json:"calls"`
	LastActive  string  `json:"lastActive"`
}

// DailyPoint is a single day's aggregate for charts.
type DailyPoint struct {
	Date   string `json:"date"`
	Tokens int64  `json:"tokens"`
	Calls  int64  `json:"calls"`
}

// ProviderUsage is aggregate usage grouped by provider.
type ProviderUsage struct {
	Provider string `json:"provider"`
	Tokens   int64  `json:"tokens"`
	Calls    int64  `json:"calls"`
}

// AdminOverview is the top-level admin KPIs.
type AdminOverview struct {
	TotalTokens  int64           `json:"totalTokens"`
	TotalCredits float64         `json:"totalCredits"`
	TotalCalls   int64           `json:"totalCalls"`
	ActiveUsers  int             `json:"activeUsers"`
	TodayTokens  int64           `json:"todayTokens"`
	TodayCalls   int64           `json:"todayCalls"`
	Daily        []DailyPoint    `json:"daily"`
	Providers    []ProviderUsage `json:"providers"`
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT 'starter',
  status       TEXT NOT NULL DEFAULT 'active',
  token_quota  INTEGER NOT NULL DEFAULT 1000000,
  credit_quota REAL    NOT NULL DEFAULT 100,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS usage_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  task_type     TEXT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  credit_units  REAL    NOT NULL DEFAULT 0,
  cost_usd      REAL    NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_usage_user    ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at);
`

// openDB initializes SQLite and seeds demo data on first run.
func openDB() {
	db = openDatabase()
	if _, err := db.Exec(ddl(schema)); err != nil {
		log.Fatalf("init schema: %v", err)
	}
	migratePlans()
	initMetering()
	initDestinations()
	initConnections()
	seedIfEmpty()
}

func seedIfEmpty() {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		log.Fatalf("count users: %v", err)
	}
	if count > 0 {
		return
	}

	users := []struct {
		id, name, plan, status string
		tokenQuota             int64
		creditQuota            float64
	}{
		{"user-1", "Alex Morgan", "creator", "active", 2_000_000, 2900},
		{"user-2", "Sarah Chen", "creator", "active", 2_000_000, 2900},
		{"user-3", "James Okafor", "solo", "active", 500_000, 1000},
		{"user-4", "Lena Petrova", "agency", "active", 10_000_000, 33000},
		{"user-5", "Marco Diaz", "free", "suspended", 500_000, 0},
	}
	for _, u := range users {
		if _, err := db.Exec(
			"INSERT INTO users (id, name, plan, status, token_quota, credit_quota) VALUES (?,?,?,?,?,?)",
			u.id, u.name, u.plan, u.status, u.tokenQuota, u.creditQuota,
		); err != nil {
			log.Printf("seed user %s: %v", u.id, err)
		}
	}

	seedUsageEvents()
}

// seedUsageEvents inserts ~14 days of plausible traffic so the admin panel has
// something to render before live usage exists. Costs are computed through the
// real rate card rather than invented, so the demo numbers and the production
// numbers are produced by the same code path.
func seedUsageEvents() {
	now := time.Now()
	textModels := []struct{ provider, model string }{
		{"gemini", "gemini-2.0-flash"},
		{"openai", "gpt-4o-mini"},
		{"anthropic", "claude-sonnet-4-5"},
		{"deepseek", "deepseek-chat"},
	}
	imageModels := []struct{ provider, model, quality string }{
		{"replicate", "flux-schnell", "standard"},
		{"gemini", "imagen-3", "standard"},
		{"openai", "gpt-image-1", "medium"},
	}
	videoModels := []struct {
		provider, model, res string
		secs                 float64
		audio                bool
	}{
		{"replicate", "runway-gen3", "1080p", 8, false},
		{"replicate", "kling-2", "1080p", 6, false},
		{"gemini", "veo-3-fast", "1080p", 8, true},
	}
	userIDs := []string{"user-1", "user-2", "user-3", "user-4"}

	for day := 0; day < 14; day++ {
		t := now.Add(-time.Duration(day) * 24 * time.Hour).
			Truncate(24 * time.Hour).
			Add(8*time.Hour + time.Duration(day%5)*time.Hour)
		stamp := t.Format("2006-01-02 15:04:05")

		// Text is the bulk of the traffic and none of it is billed.
		for i := 0; i < 4+day%5; i++ {
			m := textModels[(day+i)%len(textModels)]
			uid := userIDs[(day+i)%len(userIDs)]
			in := 800 + (day*37+i*211)%6000
			out := 150 + (day*13+i*97)%1200
			c := EstimateCost(GenerationSpec{
				Modality: "text", Model: m.model, Provider: m.provider,
				InputTokens: in, OutputTokens: out,
			})
			insertSeedEvent(uid, "text", m.provider, m.model, in, out, 0,
				c.VendorCostUSD, float64(in+out), "tokens", c.VendorCostUSD, 0,
				-c.VendorCostUSD, "", stamp)
		}

		// Media is metered — each one gets a settled operation plus its event.
		if day%2 == 0 {
			m := imageModels[day%len(imageModels)]
			uid := userIDs[day%len(userIDs)]
			n := 1 + day%4
			c := EstimateCost(GenerationSpec{
				Modality: "image", Model: m.model, Provider: m.provider,
				ImageCount: n, ImageQuality: m.quality,
			})
			opID := newOperationID()
			insertSeedOperation(opID, uid, "image", m.model, m.provider, c, stamp)
			insertSeedEvent(uid, "image", m.provider, m.model, 0, 0, c.Credits,
				c.VendorCostUSD, c.Units, "images", c.VendorCostUSD, c.BillableUSD,
				c.MarginUSD, opID, stamp)
		}
		if day%3 == 0 {
			m := videoModels[day%len(videoModels)]
			uid := userIDs[(day+1)%len(userIDs)]
			c := EstimateCost(GenerationSpec{
				Modality: "video", Model: m.model, Provider: m.provider,
				Seconds: m.secs, Resolution: m.res, VideoCount: 1, WithAudio: m.audio,
			})
			opID := newOperationID()
			insertSeedOperation(opID, uid, "video", m.model, m.provider, c, stamp)
			insertSeedEvent(uid, "video", m.provider, m.model, 0, 0, c.Credits,
				c.VendorCostUSD, c.Units, "seconds", c.VendorCostUSD, c.BillableUSD,
				c.MarginUSD, opID, stamp)
		}
	}

	// Give each seeded user their allowance and debit what they consumed, so
	// balances in the demo reconcile against the operations above.
	for _, uid := range userIDs {
		u, err := userRow(uid)
		if err != nil {
			continue
		}
		plan := PlanByID(u.Plan)
		_ = addLedgerEntry(uid, EntryGrant, plan.IncludedCredits, "",
			"monthly allowance "+time.Now().UTC().Format("2006-01"))
		var spent float64
		_ = db.QueryRow(`SELECT COALESCE(SUM(charged_credits),0) FROM operations WHERE user_id=?`, uid).Scan(&spent)
		if spent > 0 {
			_ = addLedgerEntry(uid, EntryCharge, -spent, "", "seeded consumption")
		}
	}
}

func insertSeedEvent(uid, task, provider, model string, in, out int,
	credits, cost, units float64, unitKind string, vendorUSD, billableUSD, marginUSD float64,
	opID, stamp string) {
	var op interface{}
	if opID != "" {
		op = opID
	}
	if _, err := db.Exec(
		`INSERT INTO usage_events (user_id, task_type, provider, model, input_tokens,
		   output_tokens, credit_units, cost_usd, units, unit_kind, vendor_cost_usd,
		   billable_usd, margin_usd, operation_id, created_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		uid, task, provider, model, in, out, credits, cost, units, unitKind,
		vendorUSD, billableUSD, marginUSD, op, stamp,
	); err != nil {
		log.Printf("seed usage: %v", err)
	}
}

func insertSeedOperation(opID, uid, modality, model, provider string, c CostBreakdown, stamp string) {
	if _, err := db.Exec(
		`INSERT INTO operations (id, user_id, state, modality, model, provider, intent,
		   est_units, est_credits, est_vendor_usd, actual_units, unit_kind,
		   actual_vendor_usd, charged_credits, billable_usd, margin_usd,
		   created_at, settled_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		opID, uid, OpCommitted, modality, model, provider, "standard",
		c.Units, c.Credits, c.VendorCostUSD, c.Units, c.UnitKind,
		c.VendorCostUSD, c.Credits, c.BillableUSD, c.MarginUSD, stamp, stamp,
	); err != nil {
		log.Printf("seed operation: %v", err)
	}
}

// recordUsage writes one AI call to the ledger.
func recordUsage(uid string, u *TokenUsage, taskType, provider, model string) {
	if db == nil || u == nil {
		return
	}
	credits := 0.0
	cost := float64(u.InputTokens+u.OutputTokens) * 0.000002
	if taskType != "text" {
		credits = 1
		cost = 0.04
	}
	_, err := db.Exec(
		`INSERT INTO usage_events (user_id, task_type, provider, model, input_tokens, output_tokens, credit_units, cost_usd)
		 VALUES (?,?,?,?,?,?,?,?)`,
		uid, taskType, provider, model, u.InputTokens, u.OutputTokens, credits, cost,
	)
	if err != nil {
		log.Printf("record usage: %v", err)
	}
}

func ensureUser(uid, name string) {
	if db == nil || uid == "" {
		return
	}
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM users WHERE id = ?", uid).Scan(&n); err != nil || n > 0 {
		return
	}
	_, _ = db.Exec(
		"INSERT OR IGNORE INTO users (id, name) VALUES (?,?)",
		uid, name,
	)
}

// ----------------------------------------------------------------- admin ----

func adminOverview(days int) (AdminOverview, error) {
	var ov AdminOverview
	if err := db.QueryRow(`SELECT COALESCE(SUM(input_tokens+output_tokens),0), COALESCE(SUM(credit_units),0), COUNT(*) FROM usage_events`).
		Scan(&ov.TotalTokens, &ov.TotalCredits, &ov.TotalCalls); err != nil {
		return ov, err
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM users WHERE status='active'`).Scan(&ov.ActiveUsers); err != nil {
		return ov, err
	}
	today := time.Now().Format("2006-01-02")
	if err := db.QueryRow(`SELECT COALESCE(SUM(input_tokens+output_tokens),0), COUNT(*) FROM usage_events WHERE `+dayExpr("created_at")+` = ?`, today).
		Scan(&ov.TodayTokens, &ov.TodayCalls); err != nil {
		return ov, err
	}
	if days <= 0 {
		days = 14
	}
	ov.Daily, _ = dailyUsage(days)
	ov.Providers, _ = providerUsage()
	return ov, nil
}

func dailyUsage(days int) ([]DailyPoint, error) {
	rows, err := db.Query(`SELECT `+dayExpr("created_at")+` AS d, COALESCE(SUM(input_tokens+output_tokens),0), COUNT(*) FROM usage_events WHERE created_at >= ? GROUP BY d ORDER BY d`, time.Now().AddDate(0, 0, -days+1).Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DailyPoint
	for rows.Next() {
		var p DailyPoint
		if err := rows.Scan(&p.Date, &p.Tokens, &p.Calls); err == nil {
			out = append(out, p)
		}
	}
	return out, nil
}

func providerUsage() ([]ProviderUsage, error) {
	rows, err := db.Query(`SELECT provider, COALESCE(SUM(input_tokens+output_tokens),0), COUNT(*) FROM usage_events GROUP BY provider ORDER BY 2 DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProviderUsage
	for rows.Next() {
		var p ProviderUsage
		if err := rows.Scan(&p.Provider, &p.Tokens, &p.Calls); err == nil {
			out = append(out, p)
		}
	}
	return out, nil
}

func adminUsers() ([]AdminUser, error) {
	rows, err := db.Query(`
		SELECT u.id, u.name, u.plan, u.status, u.token_quota, u.credit_quota,
		       COALESCE(SUM(e.input_tokens+e.output_tokens),0),
		       COALESCE(SUM(e.credit_units),0),
		       COUNT(e.id),
		       MAX(e.created_at)
		FROM users u LEFT JOIN usage_events e ON e.user_id = u.id
		GROUP BY u.id ORDER BY 7 DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AdminUser
	for rows.Next() {
		var u AdminUser
		var last sql.NullString
		if err := rows.Scan(&u.ID, &u.Name, &u.Plan, &u.Status, &u.TokenQuota, &u.CreditQuota,
			&u.TokensUsed, &u.CreditsUsed, &u.Calls, &last); err == nil {
			u.LastActive = last.String
			out = append(out, u)
		}
	}
	return out, nil
}

func userUsage(uid string) ([]UsageEvent, error) {
	rows, err := db.Query(`
		SELECT e.id, e.user_id, u.name, e.task_type, e.provider, e.model,
		       e.input_tokens, e.output_tokens, e.credit_units, e.cost_usd, e.created_at
		FROM usage_events e JOIN users u ON u.id = e.user_id
		WHERE e.user_id = ? ORDER BY e.created_at DESC LIMIT 200`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEvents(rows)
}

func recentEvents(limit int) ([]UsageEvent, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := db.Query(`
		SELECT e.id, e.user_id, u.name, e.task_type, e.provider, e.model,
		       e.input_tokens, e.output_tokens, e.credit_units, e.cost_usd, e.created_at
		FROM usage_events e JOIN users u ON u.id = e.user_id
		ORDER BY e.created_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEvents(rows)
}

func scanEvents(rows *sql.Rows) ([]UsageEvent, error) {
	var out []UsageEvent
	for rows.Next() {
		var e UsageEvent
		if err := rows.Scan(&e.ID, &e.UserID, &e.UserName, &e.TaskType, &e.Provider, &e.Model,
			&e.InputTokens, &e.OutputTokens, &e.CreditUnits, &e.CostUSD, &e.CreatedAt); err == nil {
			out = append(out, e)
		}
	}
	return out, nil
}

func updateUserQuota(id string, tokenQuota int64, creditQuota float64, plan, status string) error {
	_, err := db.Exec(
		`UPDATE users SET token_quota = ?, credit_quota = ?, plan = COALESCE(?, plan), status = COALESCE(?, status) WHERE id = ?`,
		tokenQuota, creditQuota, plan, status, id,
	)
	return err
}

// migratePlans maps legacy plan ids onto the current catalog. PlanByID falls
// back to Free for anything unrecognised, so an unmigrated row would silently
// lose a paying customer their allowance.
func migratePlans() {
	legacy := map[string]string{
		"starter":    "solo",
		"pro":        "creator",
		"enterprise": "agency",
	}
	for old, current := range legacy {
		res, err := db.Exec(`UPDATE users SET plan = ? WHERE plan = ?`, current, old)
		if err != nil {
			log.Printf("migrate plan %s -> %s: %v", old, current, err)
			continue
		}
		if n, _ := res.RowsAffected(); n > 0 {
			log.Printf("migrated %d users from plan %q to %q", n, old, current)
		}
	}
	// Re-point credit quotas at the current plan allowances.
	for _, p := range PlanCatalog() {
		if _, err := db.Exec(
			`UPDATE users SET credit_quota = ? WHERE plan = ? AND credit_quota != ?`,
			p.IncludedCredits, p.ID, p.IncludedCredits,
		); err != nil {
			log.Printf("sync quota for plan %s: %v", p.ID, err)
		}
	}
}
