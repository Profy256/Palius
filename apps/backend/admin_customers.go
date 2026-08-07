package main

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// Admin: customers, segments and total-platform monitoring
//
// One customer row, assembled from every table that has an opinion about them:
// registration, presence, subscription, credit purchases, ledger balance,
// generation operations, vendor cost and support reports. The operator should
// never have to join three screens to decide whether an account is worth
// keeping.
//
// The segment vocabulary is fixed and defined here, because "active user" means
// nothing until someone says over what window:
//
//   registered    every account that exists
//   active        seen in the last 30 days
//   active_today  seen in the last 24 hours
//   paying        pays us money: a live subscription OR a paid credit pack
//   subscribers   live recurring subscription only
//   credit_buyers bought at least one pack (may be on Free)
//   free          no live subscription and no purchase
//   churned       had a subscription, now canceled, none live
//   suspended     account switched off by an operator
//   dormant       registered but not seen in 30 days
// ---------------------------------------------------------------------------

const activeWindowDays = 30

// Customer is the whole account in one row.
type Customer struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	Company      string `json:"company"`
	Country      string `json:"country"`
	Source       string `json:"signupSource"`
	Plan         string `json:"plan"`
	Status       string `json:"status"`
	Segment      string `json:"segment"`
	RegisteredAt string `json:"registeredAt"`
	LastSeenAt   string `json:"lastSeenAt"`
	LastSeenAge  string `json:"lastSeenAge"`
	IsActive     bool   `json:"isActive"`
	ActiveToday  bool   `json:"activeToday"`

	// Money in.
	IsPaying          bool    `json:"isPaying"`
	SubscriptionState string  `json:"subscriptionState"` // "" when never subscribed
	SubscribedSince   string  `json:"subscribedSince"`
	MonthlyUSD        float64 `json:"monthlyUSD"`
	PurchaseCount     int     `json:"purchaseCount"`
	PurchasedCredits  float64 `json:"purchasedCredits"`
	PurchasedUSD      float64 `json:"purchasedUSD"`
	LifetimeUSD       float64 `json:"lifetimeUSD"`

	// HasChurned is tracked separately from Segment because an account can be
	// both churned and suspended, and Segment only has room for one label. Churn
	// rate must not silently drop a customer who cancelled and was then switched
	// off.
	HasChurned bool `json:"hasChurned"`

	// Credits & consumption.
	IncludedCredits float64 `json:"includedCredits"`
	CreditBalance   float64 `json:"creditBalance"`
	CreditsUsed     float64 `json:"creditsUsedThisPeriod"`
	UtilizationPct  float64 `json:"utilizationPct"`

	// Cost & profit.
	VendorCostUSD float64 `json:"vendorCostUSD"`
	ProfitUSD     float64 `json:"profitUSD"`

	// Activity.
	Operations  int `json:"operations"`
	FailedOps   int `json:"failedOperations"`
	AICalls     int `json:"aiCalls"`
	OpenIssues  int `json:"openIssues"`
	TotalIssues int `json:"totalIssues"`

	Flag string `json:"flag"` // "", "watch", "unprofitable", "at-risk", "suspended"
}

// SegmentCounts is the KPI strip: how many accounts sit in each bucket.
type SegmentCounts struct {
	Registered   int `json:"registered"`
	NewThisMonth int `json:"newThisMonth"`
	NewThisWeek  int `json:"newThisWeek"`
	ActiveToday  int `json:"activeToday"`
	Active7d     int `json:"active7d"`
	Active30d    int `json:"active30d"`
	Dormant      int `json:"dormant"`
	Suspended    int `json:"suspended"`

	Paying       int `json:"paying"`
	Subscribers  int `json:"subscribers"`
	Trialing     int `json:"trialing"`
	PastDue      int `json:"pastDue"`
	CreditBuyers int `json:"creditBuyers"`
	FreeUsers    int `json:"freeUsers"`
	Churned      int `json:"churned"`

	MRR              float64        `json:"mrr"`
	ARPU             float64        `json:"arpu"`
	PackRevenueMTD   float64        `json:"packRevenueMTD"`
	LifetimePackUSD  float64        `json:"lifetimePackRevenueUSD"`
	ConversionPct    float64        `json:"paidConversionPct"`
	ChurnPct         float64        `json:"churnPct"`
	PlanBreakdown    map[string]int `json:"planBreakdown"`
	CountryBreakdown map[string]int `json:"countryBreakdown"`
	SourceBreakdown  map[string]int `json:"sourceBreakdown"`
}

func registerAdminCustomerRoutes(admin *gin.RouterGroup) {
	admin.GET("/customers", handleAdminCustomers)
	admin.GET("/customers/:id", handleAdminCustomerDetail)
	admin.GET("/segments", handleAdminSegments)
	admin.GET("/subscriptions", handleAdminSubscriptions)
	admin.GET("/purchases", handleAdminPurchases)
	admin.GET("/activity", handleAdminActivity)
	admin.GET("/audit", handleAdminAudit)

	// Privileged actions. Every one writes an audit row.
	admin.POST("/users", handleAdminCreateUser)
	admin.POST("/users/:id/suspend", handleAdminSuspend)
	admin.POST("/users/:id/reactivate", handleAdminReactivate)
	admin.POST("/users/:id/subscription", handleAdminSetSubscription)
	admin.DELETE("/users/:id/subscription", handleAdminCancelSubscription)
	admin.POST("/users/:id/purchase", handleAdminGrantPack)
	admin.POST("/users/:id/note", handleAdminSetNote)
	admin.POST("/purchases/:id/refund", handleAdminRefundPurchase)
}

// ---------------------------------------------------------------------------
// Customer list
// ---------------------------------------------------------------------------

func handleAdminCustomers(c *gin.Context) {
	customers, err := loadCustomers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	segment := strings.ToLower(strings.TrimSpace(c.Query("segment")))
	query := strings.ToLower(strings.TrimSpace(c.Query("q")))

	filtered := []Customer{}
	for _, cu := range customers {
		if !matchesSegment(cu, segment) {
			continue
		}
		if query != "" && !strings.Contains(
			strings.ToLower(cu.ID+" "+cu.Name+" "+cu.Email+" "+cu.Company+" "+cu.Plan+" "+cu.Country), query) {
			continue
		}
		filtered = append(filtered, cu)
	}

	sortCustomers(filtered, c.Query("sort"))
	c.JSON(http.StatusOK, gin.H{
		"customers": filtered,
		"total":     len(customers),
		"shown":     len(filtered),
		"segment":   defaultString(segment, "all"),
		"segments": []string{
			"all", "registered", "active", "active_today", "paying", "subscribers",
			"credit_buyers", "free", "churned", "suspended", "dormant", "trialing",
			"past_due", "at_risk",
		},
	})
}

func matchesSegment(cu Customer, segment string) bool {
	switch segment {
	case "", "all", "registered":
		return true
	case "active":
		return cu.IsActive
	case "active_today":
		return cu.ActiveToday
	case "paying":
		return cu.IsPaying
	case "subscribers":
		return cu.SubscriptionState == SubActive || cu.SubscriptionState == SubTrialing || cu.SubscriptionState == SubPastDue
	case "trialing":
		return cu.SubscriptionState == SubTrialing
	case "past_due":
		return cu.SubscriptionState == SubPastDue
	case "credit_buyers":
		return cu.PurchaseCount > 0
	case "free":
		return !cu.IsPaying
	case "churned":
		return cu.HasChurned
	case "suspended":
		return cu.Status == "suspended"
	case "dormant":
		return !cu.IsActive && cu.Status != "suspended"
	case "at_risk":
		return cu.Flag == "at-risk" || cu.Flag == "unprofitable"
	default:
		return true
	}
}

func sortCustomers(list []Customer, key string) {
	switch key {
	case "spend":
		sort.SliceStable(list, func(i, j int) bool { return list[i].LifetimeUSD > list[j].LifetimeUSD })
	case "cost":
		sort.SliceStable(list, func(i, j int) bool { return list[i].VendorCostUSD > list[j].VendorCostUSD })
	case "profit":
		sort.SliceStable(list, func(i, j int) bool { return list[i].ProfitUSD < list[j].ProfitUSD })
	case "registered":
		sort.SliceStable(list, func(i, j int) bool { return list[i].RegisteredAt > list[j].RegisteredAt })
	case "issues":
		sort.SliceStable(list, func(i, j int) bool { return list[i].OpenIssues > list[j].OpenIssues })
	default: // most recently seen
		sort.SliceStable(list, func(i, j int) bool { return list[i].LastSeenAt > list[j].LastSeenAt })
	}
}

// loadCustomers assembles every account from all the tables that describe it.
// The aggregates are read in one pass each and joined in memory: the row count
// here is customers, not events, so this stays cheap while keeping the SQL
// legible.
func loadCustomers() ([]Customer, error) {
	rows, err := db.Query(`
		SELECT id, name, COALESCE(email,''), COALESCE(company,''), COALESCE(country,''),
		       COALESCE(signup_source,''), COALESCE(plan,'free'), COALESCE(status,'active'),
		       COALESCE(created_at,''), COALESCE(last_seen_at,'')
		FROM users`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Customer{}
	for rows.Next() {
		var cu Customer
		if err := rows.Scan(&cu.ID, &cu.Name, &cu.Email, &cu.Company, &cu.Country,
			&cu.Source, &cu.Plan, &cu.Status, &cu.RegisteredAt, &cu.LastSeenAt); err != nil {
			continue
		}
		cu.RegisteredAt = normStamp(cu.RegisteredAt)
		cu.LastSeenAt = normStamp(cu.LastSeenAt)
		out = append(out, cu)
	}
	if len(out) == 0 {
		return out, nil
	}

	subs := liveSubscriptionMap()
	everSubscribed := everSubscribedSet()
	purch := purchaseTotals()
	balances := ledgerBalances()
	used := creditsUsedThisPeriod()
	opsAgg := operationTotals()
	calls := aiCallTotals()
	issues := issueCountsByUser()

	now := time.Now().UTC()
	for i := range out {
		cu := &out[i]
		plan := PlanByID(cu.Plan)
		cu.IncludedCredits = plan.IncludedCredits

		// Presence.
		if t, err := parseStamp(cu.LastSeenAt); err == nil {
			age := now.Sub(t)
			cu.ActiveToday = age < 24*time.Hour
			cu.IsActive = age < activeWindowDays*24*time.Hour
			cu.LastSeenAge = humanAge(cu.LastSeenAt)
		}

		// Subscription.
		if s, ok := subs[cu.ID]; ok {
			cu.SubscriptionState = s.Status
			cu.SubscribedSince = normStamp(s.StartedAt)
			cu.MonthlyUSD = s.MonthlyUSD
		}

		// Purchases.
		if p, ok := purch[cu.ID]; ok {
			cu.PurchaseCount = p.count
			cu.PurchasedCredits = round2(p.credits)
			cu.PurchasedUSD = round2(p.usd)
		}

		cu.IsPaying = cu.MonthlyUSD > 0 || cu.PurchasedUSD > 0
		cu.LifetimeUSD = round2(cu.MonthlyUSD + cu.PurchasedUSD)

		// Credits.
		cu.CreditBalance = round2(balances[cu.ID])
		cu.CreditsUsed = round2(used[cu.ID])
		if cu.IncludedCredits > 0 {
			cu.UtilizationPct = round2(cu.CreditsUsed / cu.IncludedCredits * 100)
		}

		// Cost & activity.
		if a, ok := opsAgg[cu.ID]; ok {
			cu.Operations = a.total
			cu.FailedOps = a.failed
			cu.VendorCostUSD = round2(a.vendorUSD)
		}
		cu.VendorCostUSD = round2(cu.VendorCostUSD + textCostFor(cu.ID))
		cu.AICalls = calls[cu.ID]
		cu.ProfitUSD = round2(cu.MonthlyUSD + cu.PurchasedUSD - cu.VendorCostUSD)

		if ic, ok := issues[cu.ID]; ok {
			cu.OpenIssues = ic.open
			cu.TotalIssues = ic.total
		}

		cu.HasChurned = everSubscribed[cu.ID] && cu.SubscriptionState == ""
		cu.Segment = segmentOf(*cu, everSubscribed[cu.ID])
		cu.Flag = flagFor(*cu)
	}

	return out, nil
}

func segmentOf(cu Customer, everSubscribed bool) string {
	switch {
	case cu.Status == "suspended":
		return "suspended"
	case cu.SubscriptionState == SubTrialing:
		return "trialing"
	case cu.SubscriptionState == SubPastDue:
		return "past_due"
	case cu.MonthlyUSD > 0:
		return "subscriber"
	case cu.PurchaseCount > 0:
		return "credit_buyer"
	case everSubscribed:
		return "churned"
	default:
		return "free"
	}
}

// flagFor is the "look at this account" signal. Losing money is the loudest,
// then a paying customer who has stopped showing up.
func flagFor(cu Customer) string {
	switch {
	case cu.Status == "suspended":
		return "suspended"
	case cu.IsPaying && cu.ProfitUSD < 0:
		return "unprofitable"
	case cu.IsPaying && !cu.IsActive:
		return "at-risk"
	case cu.OpenIssues >= 2:
		return "at-risk"
	case cu.UtilizationPct >= 90:
		return "watch"
	default:
		return ""
	}
}

// ---------------------------------------------------------------------------
// Aggregate loaders
// ---------------------------------------------------------------------------

func liveSubscriptionMap() map[string]Subscription {
	out := map[string]Subscription{}
	rows, err := db.Query(`
		SELECT user_id, plan, status, monthly_usd, started_at
		FROM subscriptions WHERE status IN (?,?,?)
		ORDER BY started_at DESC`, SubActive, SubTrialing, SubPastDue)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var s Subscription
		if err := rows.Scan(&s.UserID, &s.Plan, &s.Status, &s.MonthlyUSD, &s.StartedAt); err != nil {
			continue
		}
		// Ordered newest first, so the first row per user wins.
		if _, seen := out[s.UserID]; !seen {
			out[s.UserID] = s
		}
	}
	return out
}

func everSubscribedSet() map[string]bool {
	out := map[string]bool{}
	rows, err := db.Query(`SELECT DISTINCT user_id FROM subscriptions`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		if rows.Scan(&uid) == nil {
			out[uid] = true
		}
	}
	return out
}

type purchaseAgg struct {
	count   int
	credits float64
	usd     float64
}

func purchaseTotals() map[string]purchaseAgg {
	out := map[string]purchaseAgg{}
	rows, err := db.Query(`
		SELECT user_id, COUNT(*), COALESCE(SUM(credits),0), COALESCE(SUM(amount_usd),0)
		FROM credit_purchases WHERE status = ? GROUP BY user_id`, PurchasePaid)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		var a purchaseAgg
		if rows.Scan(&uid, &a.count, &a.credits, &a.usd) == nil {
			out[uid] = a
		}
	}
	return out
}

func ledgerBalances() map[string]float64 {
	out := map[string]float64{}
	rows, err := db.Query(`SELECT user_id, COALESCE(SUM(delta),0) FROM credit_ledger GROUP BY user_id`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		var v float64
		if rows.Scan(&uid, &v) == nil {
			out[uid] = v
		}
	}
	return out
}

func creditsUsedThisPeriod() map[string]float64 {
	out := map[string]float64{}
	rows, err := db.Query(
		`SELECT user_id, COALESCE(-SUM(delta),0) FROM credit_ledger
		 WHERE entry_kind = ? AND created_at >= ? GROUP BY user_id`,
		EntryCharge, periodStart())
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		var v float64
		if rows.Scan(&uid, &v) == nil {
			out[uid] = v
		}
	}
	return out
}

type opAgg struct {
	total     int
	failed    int
	vendorUSD float64
}

func operationTotals() map[string]opAgg {
	out := map[string]opAgg{}
	rows, err := db.Query(`
		SELECT user_id, COUNT(*),
		       SUM(CASE WHEN state = ? THEN 1 ELSE 0 END),
		       COALESCE(SUM(actual_vendor_usd),0)
		FROM operations GROUP BY user_id`, OpFailed)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		var a opAgg
		if rows.Scan(&uid, &a.total, &a.failed, &a.vendorUSD) == nil {
			out[uid] = a
		}
	}
	return out
}

func aiCallTotals() map[string]int {
	out := map[string]int{}
	rows, err := db.Query(`SELECT user_id, COUNT(*) FROM usage_events GROUP BY user_id`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		var n int
		if rows.Scan(&uid, &n) == nil {
			out[uid] = n
		}
	}
	return out
}

// textCostFor is the unmetered spend an account generates. The customer never
// sees it; it still comes out of the same margin, so it belongs in their row.
func textCostFor(uid string) float64 {
	var v float64
	_ = db.QueryRow(
		`SELECT COALESCE(SUM(vendor_cost_usd),0) FROM usage_events
		 WHERE user_id = ? AND task_type NOT IN ('image','video')`, uid).Scan(&v)
	return v
}

type issueCount struct{ open, total int }

func issueCountsByUser() map[string]issueCount {
	out := map[string]issueCount{}
	rows, err := db.Query(`
		SELECT user_id, COUNT(*),
		       SUM(CASE WHEN status IN (?,?) THEN 1 ELSE 0 END)
		FROM issue_reports GROUP BY user_id`, IssueOpen, IssueInProgress)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		var ic issueCount
		if rows.Scan(&uid, &ic.total, &ic.open) == nil {
			out[uid] = ic
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

func handleAdminSegments(c *gin.Context) {
	customers, err := loadCustomers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	now := time.Now().UTC()
	monthStart := now.Format("2006-01") + "-01"
	weekAgo := now.AddDate(0, 0, -7)

	s := SegmentCounts{
		PlanBreakdown:    map[string]int{},
		CountryBreakdown: map[string]int{},
		SourceBreakdown:  map[string]int{},
	}

	for _, cu := range customers {
		s.Registered++
		s.PlanBreakdown[cu.Plan]++
		if cu.Country != "" {
			s.CountryBreakdown[cu.Country]++
		}
		if cu.Source != "" {
			s.SourceBreakdown[cu.Source]++
		}

		if cu.RegisteredAt >= monthStart {
			s.NewThisMonth++
		}
		if t, err := parseStamp(cu.RegisteredAt); err == nil && t.After(weekAgo) {
			s.NewThisWeek++
		}

		if cu.ActiveToday {
			s.ActiveToday++
		}
		if t, err := parseStamp(cu.LastSeenAt); err == nil && t.After(weekAgo) {
			s.Active7d++
		}
		if cu.IsActive {
			s.Active30d++
		} else if cu.Status != "suspended" {
			s.Dormant++
		}
		if cu.Status == "suspended" {
			s.Suspended++
		}

		if cu.IsPaying {
			s.Paying++
			s.MRR += cu.MonthlyUSD
		} else {
			s.FreeUsers++
		}
		switch cu.SubscriptionState {
		case SubActive:
			s.Subscribers++
		case SubTrialing:
			s.Subscribers++
			s.Trialing++
		case SubPastDue:
			s.Subscribers++
			s.PastDue++
		}
		if cu.PurchaseCount > 0 {
			s.CreditBuyers++
		}
		if cu.HasChurned {
			s.Churned++
		}
	}

	_ = db.QueryRow(
		`SELECT COALESCE(SUM(amount_usd),0) FROM credit_purchases
		 WHERE status = ? AND created_at >= ?`, PurchasePaid, periodStart()).Scan(&s.PackRevenueMTD)
	_ = db.QueryRow(
		`SELECT COALESCE(SUM(amount_usd),0) FROM credit_purchases WHERE status = ?`,
		PurchasePaid).Scan(&s.LifetimePackUSD)

	s.MRR = round2(s.MRR)
	s.PackRevenueMTD = round2(s.PackRevenueMTD)
	s.LifetimePackUSD = round2(s.LifetimePackUSD)
	if s.Paying > 0 {
		s.ARPU = round2((s.MRR + s.PackRevenueMTD) / float64(s.Paying))
	}
	if s.Registered > 0 {
		s.ConversionPct = round2(float64(s.Paying) / float64(s.Registered) * 100)
	}
	if s.Subscribers+s.Churned > 0 {
		s.ChurnPct = round2(float64(s.Churned) / float64(s.Subscribers+s.Churned) * 100)
	}

	c.JSON(http.StatusOK, s)
}

// ---------------------------------------------------------------------------
// Customer detail — everything known about one account
// ---------------------------------------------------------------------------

func handleAdminCustomerDetail(c *gin.Context) {
	id := c.Param("id")
	customers, err := loadCustomers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var found *Customer
	for i := range customers {
		if customers[i].ID == id {
			found = &customers[i]
			break
		}
	}
	if found == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "customer not found"})
		return
	}

	subs, _ := subscriptionHistory(id)
	purchases, _ := listPurchases("", 50)
	mine := []CreditPurchase{}
	for _, p := range purchases {
		if p.UserID == id {
			mine = append(mine, p)
		}
	}
	ledger, _ := ledgerEntries(id, 100)
	ops, _ := userOperations(id, 50)
	events, _ := userUsage(id)
	issues, _ := listIssues(issueFilter{UserID: id, Limit: 50})
	balance, _ := creditBalance(id)

	var notes string
	_ = db.QueryRow(`SELECT COALESCE(admin_notes,'') FROM users WHERE id = ?`, id).Scan(&notes)

	c.JSON(http.StatusOK, gin.H{
		"customer":      found,
		"subscriptions": subs,
		"purchases":     mine,
		"ledger":        ledger,
		"operations":    ops,
		"usage":         events,
		"issues":        issues,
		"balance":       balance,
		"adminNotes":    notes,
	})
}

func subscriptionHistory(uid string) ([]Subscription, error) {
	rows, err := db.Query(`
		SELECT id, user_id, plan, status, monthly_usd, bill_interval, provider,
		       started_at, COALESCE(period_start,''), COALESCE(period_end,''),
		       COALESCE(canceled_at,''), COALESCE(cancel_reason,'')
		FROM subscriptions WHERE user_id = ? ORDER BY started_at DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Subscription{}
	for rows.Next() {
		var s Subscription
		if err := rows.Scan(&s.ID, &s.UserID, &s.Plan, &s.Status, &s.MonthlyUSD,
			&s.Interval, &s.Provider, &s.StartedAt, &s.PeriodStart, &s.PeriodEnd,
			&s.CanceledAt, &s.CancelReason); err == nil {
			s.normalizeStamps()
			out = append(out, s)
		}
	}
	return out, nil
}

// LedgerEntry is one signed credit movement.
type LedgerEntry struct {
	ID          int64   `json:"id"`
	UserID      string  `json:"userId"`
	Kind        string  `json:"kind"`
	Delta       float64 `json:"delta"`
	OperationID string  `json:"operationId"`
	Reason      string  `json:"reason"`
	CreatedAt   string  `json:"createdAt"`
}

func ledgerEntries(uid string, limit int) ([]LedgerEntry, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := db.Query(`
		SELECT id, user_id, entry_kind, delta, COALESCE(operation_id,''),
		       COALESCE(reason,''), created_at
		FROM credit_ledger WHERE user_id = ?
		ORDER BY created_at DESC, id DESC LIMIT ?`, uid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LedgerEntry{}
	for rows.Next() {
		var e LedgerEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.Kind, &e.Delta, &e.OperationID,
			&e.Reason, &e.CreatedAt); err == nil {
			e.CreatedAt = normStamp(e.CreatedAt)
			out = append(out, e)
		}
	}
	return out, nil
}

func userOperations(uid string, limit int) ([]Operation, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := db.Query(`SELECT `+opColumns+` FROM operations
		WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`, uid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Operation{}
	for rows.Next() {
		op, err := scanOperation(rows)
		if err == nil && op != nil {
			out = append(out, *op)
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Revenue lists
// ---------------------------------------------------------------------------

func handleAdminSubscriptions(c *gin.Context) {
	subs, err := listSubscriptions(c.Query("status"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var mrr float64
	live := 0
	for _, s := range subs {
		if s.Status == SubActive || s.Status == SubTrialing || s.Status == SubPastDue {
			mrr += s.MonthlyUSD
			live++
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"subscriptions": subs,
		"live":          live,
		"mrr":           round2(mrr),
		"arr":           round2(mrr * 12),
	})
}

func handleAdminPurchases(c *gin.Context) {
	purchases, err := listPurchases(c.Query("status"), queryInt(c, "limit", 200))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var revenue, credits float64
	for _, p := range purchases {
		if p.Status == PurchasePaid {
			revenue += p.AmountUSD
			credits += p.Credits
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"purchases":   purchases,
		"revenueUSD":  round2(revenue),
		"creditsSold": round2(credits),
		"packs":       CreditPacks(),
	})
}

// ---------------------------------------------------------------------------
// Live activity — one feed of everything happening on the platform
// ---------------------------------------------------------------------------

// ActivityItem is a single thing that happened, whatever table it came from.
type ActivityItem struct {
	At        string  `json:"at"`
	Kind      string  `json:"kind"` // generation | ai | signup | subscription | purchase | issue | credit | admin
	UserID    string  `json:"userId"`
	UserName  string  `json:"userName"`
	Title     string  `json:"title"`
	Detail    string  `json:"detail"`
	AmountUSD float64 `json:"amountUSD"`
	Severity  string  `json:"severity"` // info | warn | error
	Ref       string  `json:"ref"`
}

func handleAdminActivity(c *gin.Context) {
	limit := queryInt(c, "limit", 120)
	items := []ActivityItem{}

	names := userNames()
	name := func(uid string) string {
		if n, ok := names[uid]; ok && n != "" {
			return n
		}
		return uid
	}

	// Generation operations — the expensive events.
	if rows, err := db.Query(`
		SELECT id, user_id, state, modality, model, provider, actual_vendor_usd,
		       charged_credits, COALESCE(error,''), created_at
		FROM operations ORDER BY created_at DESC LIMIT ?`, limit); err == nil {
		for rows.Next() {
			var id, uid, state, modality, model, provider, errMsg, at string
			var vendor, credits float64
			if rows.Scan(&id, &uid, &state, &modality, &model, &provider, &vendor,
				&credits, &errMsg, &at) != nil {
				continue
			}
			sev := "info"
			if state == OpFailed {
				sev = "error"
			}
			detail := fmt.Sprintf("%s · %s · %.0f credits", provider, model, credits)
			if errMsg != "" {
				detail += " · " + errMsg
			}
			items = append(items, ActivityItem{
				At: at, Kind: "generation", UserID: uid, UserName: name(uid),
				Title: modality + " generation " + state, Detail: detail,
				AmountUSD: round2(vendor), Severity: sev, Ref: id,
			})
		}
		rows.Close()
	}

	// Unmetered AI calls.
	if rows, err := db.Query(`
		SELECT user_id, task_type, provider, model, input_tokens + output_tokens,
		       vendor_cost_usd, created_at
		FROM usage_events WHERE task_type NOT IN ('image','video')
		ORDER BY created_at DESC LIMIT ?`, limit); err == nil {
		for rows.Next() {
			var uid, task, provider, model, at string
			var tokens int64
			var cost float64
			if rows.Scan(&uid, &task, &provider, &model, &tokens, &cost, &at) != nil {
				continue
			}
			items = append(items, ActivityItem{
				At: at, Kind: "ai", UserID: uid, UserName: name(uid),
				Title:     task + " (included)",
				Detail:    fmt.Sprintf("%s · %s · %d tokens", provider, model, tokens),
				AmountUSD: round2(cost), Severity: "info",
			})
		}
		rows.Close()
	}

	// Registrations.
	if rows, err := db.Query(`
		SELECT id, name, COALESCE(email,''), COALESCE(signup_source,''), created_at
		FROM users ORDER BY created_at DESC LIMIT ?`, limit); err == nil {
		for rows.Next() {
			var uid, n, email, source, at string
			if rows.Scan(&uid, &n, &email, &source, &at) != nil {
				continue
			}
			detail := email
			if source != "" {
				detail = strings.TrimSpace(detail + " · via " + source)
			}
			items = append(items, ActivityItem{
				At: at, Kind: "signup", UserID: uid, UserName: n,
				Title: "registered", Detail: detail, Severity: "info",
			})
		}
		rows.Close()
	}

	// Subscriptions started and canceled.
	if rows, err := db.Query(`
		SELECT user_id, plan, status, monthly_usd, started_at, COALESCE(canceled_at,''),
		       COALESCE(cancel_reason,'')
		FROM subscriptions ORDER BY started_at DESC LIMIT ?`, limit); err == nil {
		for rows.Next() {
			var uid, plan, status, at, canceledAt, reason string
			var usd float64
			if rows.Scan(&uid, &plan, &status, &usd, &at, &canceledAt, &reason) != nil {
				continue
			}
			items = append(items, ActivityItem{
				At: at, Kind: "subscription", UserID: uid, UserName: name(uid),
				Title:     "subscribed to " + plan,
				Detail:    fmt.Sprintf("$%.2f/mo · %s", usd, status),
				AmountUSD: usd, Severity: "info",
			})
			if canceledAt != "" {
				items = append(items, ActivityItem{
					At: canceledAt, Kind: "subscription", UserID: uid, UserName: name(uid),
					Title: "canceled " + plan, Detail: reason,
					AmountUSD: -usd, Severity: "warn",
				})
			}
		}
		rows.Close()
	}

	// Credit pack purchases.
	if rows, err := db.Query(`
		SELECT id, user_id, pack_id, credits, amount_usd, status, created_at
		FROM credit_purchases ORDER BY created_at DESC LIMIT ?`, limit); err == nil {
		for rows.Next() {
			var id, uid, pack, status, at string
			var credits, usd float64
			if rows.Scan(&id, &uid, &pack, &credits, &usd, &status, &at) != nil {
				continue
			}
			sev := "info"
			if status == PurchaseRefunded || status == PurchaseFailed {
				sev = "warn"
			}
			items = append(items, ActivityItem{
				At: at, Kind: "purchase", UserID: uid, UserName: name(uid),
				Title:     "bought " + pack,
				Detail:    fmt.Sprintf("%.0f credits · $%.2f · %s", credits, usd, status),
				AmountUSD: usd, Severity: sev, Ref: id,
			})
		}
		rows.Close()
	}

	// Support reports.
	if rows, err := db.Query(`
		SELECT id, user_id, severity, category, subject, status, created_at
		FROM issue_reports ORDER BY created_at DESC LIMIT ?`, limit); err == nil {
		for rows.Next() {
			var id, uid, sev, cat, subject, status, at string
			if rows.Scan(&id, &uid, &sev, &cat, &subject, &status, &at) != nil {
				continue
			}
			level := "warn"
			if sev == "critical" || sev == "high" {
				level = "error"
			}
			items = append(items, ActivityItem{
				At: at, Kind: "issue", UserID: uid, UserName: name(uid),
				Title:    "reported an issue: " + subject,
				Detail:   cat + " · " + sev + " · " + status,
				Severity: level, Ref: id,
			})
		}
		rows.Close()
	}

	// Margin alerts — pricing drifting under cost.
	if rows, err := db.Query(`
		SELECT COALESCE(user_id,''), COALESCE(model,''), COALESCE(detail,''), created_at
		FROM margin_alerts ORDER BY created_at DESC LIMIT ?`, limit); err == nil {
		for rows.Next() {
			var uid, model, detail, at string
			if rows.Scan(&uid, &model, &detail, &at) != nil {
				continue
			}
			items = append(items, ActivityItem{
				At: at, Kind: "margin", UserID: uid, UserName: name(uid),
				Title: "margin alert on " + model, Detail: detail, Severity: "error",
			})
		}
		rows.Close()
	}

	// Operator actions.
	if entries, err := listAudit(limit); err == nil {
		for _, a := range entries {
			items = append(items, ActivityItem{
				At: a.CreatedAt, Kind: "admin", UserID: a.TargetID,
				UserName: a.Actor, Title: "admin: " + a.Action,
				Detail: a.Detail, Severity: "info", Ref: a.TargetID,
			})
		}
	}

	// Every source hands back a different timestamp format, and this sort is a
	// string comparison — without normalising first, an RFC3339 row would sort
	// above a later plain-format one purely because 'T' outranks a space.
	for i := range items {
		items[i].At = normStamp(items[i].At)
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].At > items[j].At })
	if len(items) > limit {
		items = items[:limit]
	}

	if kind := c.Query("kind"); kind != "" && kind != "all" {
		filtered := []ActivityItem{}
		for _, it := range items {
			if it.Kind == kind {
				filtered = append(filtered, it)
			}
		}
		items = filtered
	}

	c.JSON(http.StatusOK, gin.H{"activity": items, "count": len(items)})
}

func userNames() map[string]string {
	out := map[string]string{}
	rows, err := db.Query(`SELECT id, name FROM users`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, n string
		if rows.Scan(&id, &n) == nil {
			out[id] = n
		}
	}
	return out
}

func handleAdminAudit(c *gin.Context) {
	entries, err := listAudit(queryInt(c, "limit", 200))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"audit": entries})
}

// ---------------------------------------------------------------------------
// Privileged actions
// ---------------------------------------------------------------------------

func handleAdminCreateUser(c *gin.Context) {
	var body struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Email   string `json:"email"`
		Company string `json:"company"`
		Country string `json:"country"`
		Plan    string `json:"plan"`
		Source  string `json:"signupSource"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	id := strings.TrimSpace(body.ID)
	if id == "" {
		id = newID("user")
	}
	plan := PlanByID(defaultString(body.Plan, "free"))

	if _, err := db.Exec(
		`INSERT INTO users (id, name, email, company, country, signup_source, plan,
		   status, token_quota, credit_quota, last_seen_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		id, body.Name, body.Email, body.Company, body.Country,
		defaultString(body.Source, "admin"), plan.ID, "active", int64(1_000_000),
		plan.IncludedCredits, time.Now().UTC().Format("2006-01-02 15:04:05"),
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if plan.MonthlyUSD > 0 {
		if _, err := startSubscription(id, plan.ID, "admin", "", false); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	recordAudit(adminActor(c), "user.create", "user", id, body.Name+" on plan "+plan.ID)
	c.JSON(http.StatusCreated, gin.H{"ok": true, "id": id})
}

func handleAdminSuspend(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&body)

	res, err := db.Exec(`UPDATE users SET status = 'suspended', suspended_reason = ? WHERE id = ?`,
		body.Reason, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	recordAudit(adminActor(c), "user.suspend", "user", id, body.Reason)
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id, "status": "suspended"})
}

func handleAdminReactivate(c *gin.Context) {
	id := c.Param("id")
	res, err := db.Exec(`UPDATE users SET status = 'active', suspended_reason = NULL WHERE id = ?`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	recordAudit(adminActor(c), "user.reactivate", "user", id, "")
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id, "status": "active"})
}

func handleAdminSetSubscription(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Plan     string `json:"plan"`
		Trial    bool   `json:"trial"`
		Provider string `json:"provider"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Plan) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan is required"})
		return
	}
	if _, err := userRow(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	sub, err := startSubscription(id, body.Plan, defaultString(body.Provider, "admin"), "", body.Trial)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	recordAudit(adminActor(c), "subscription.start", "user", id,
		fmt.Sprintf("plan=%s status=%s $%.2f/mo", sub.Plan, sub.Status, sub.MonthlyUSD))
	c.JSON(http.StatusOK, gin.H{"ok": true, "subscription": sub})
}

func handleAdminCancelSubscription(c *gin.Context) {
	id := c.Param("id")
	reason := defaultString(c.Query("reason"), "canceled by operator")
	if err := cancelSubscription(id, reason); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	recordAudit(adminActor(c), "subscription.cancel", "user", id, reason)
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id})
}

func handleAdminGrantPack(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		PackID   string `json:"packId"`
		Provider string `json:"provider"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.PackID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "packId is required"})
		return
	}
	p, err := recordPurchase(id, body.PackID, defaultString(body.Provider, "admin"), "", PurchasePaid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	recordAudit(adminActor(c), "purchase.create", "user", id,
		fmt.Sprintf("%s · %.0f credits · $%.2f", p.PackID, p.Credits, p.AmountUSD))
	c.JSON(http.StatusOK, gin.H{"ok": true, "purchase": p})
}

func handleAdminRefundPurchase(c *gin.Context) {
	id := c.Param("id")
	if err := refundPurchase(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	recordAudit(adminActor(c), "purchase.refund", "purchase", id, "")
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id})
}

func handleAdminSetNote(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Note string `json:"note"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	res, err := db.Exec(`UPDATE users SET admin_notes = ? WHERE id = ?`, body.Note, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	recordAudit(adminActor(c), "user.note", "user", id, truncate(body.Note, 120))
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id})
}

func defaultString(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}
