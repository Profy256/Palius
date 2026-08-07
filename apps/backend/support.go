package main

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// Support: user-reported issues
//
// Users need somewhere to say "this is broken" that is not email, and the
// operator needs those reports in the same panel as the spend they explain — a
// spike in failed video operations and three reports about video generation are
// the same incident, and reading them in two different tools loses that.
//
// A report captures the state the user was in (page, platform, browser, and
// their last operation) because "it didn't work" without context costs a
// round-trip that the user usually never answers.
// ---------------------------------------------------------------------------

// Issue lifecycle. Deliberately short: anything longer is a workflow nobody
// keeps up to date.
const (
	IssueOpen       = "open"
	IssueInProgress = "in_progress"
	IssueResolved   = "resolved"
	IssueClosed     = "closed"
)

// Issue severities, ordered worst first.
var issueSeverities = []string{"critical", "high", "normal", "low"}

// Issue categories the UI offers. Free text is accepted too, but a fixed list
// is what makes "what is breaking most" a query rather than a reading exercise.
var issueCategories = []string{
	"bug", "billing", "credits", "generation", "publishing",
	"connection", "account", "feature-request", "other",
}

const supportSchema = `
CREATE TABLE IF NOT EXISTS issue_reports (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'bug',
  severity     TEXT NOT NULL DEFAULT 'normal',
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  page         TEXT,
  platform     TEXT,
  user_agent   TEXT,
  operation_id TEXT,
  contact_email TEXT,
  status       TEXT NOT NULL DEFAULT 'open',
  assigned_to  TEXT,
  admin_note   TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at  DATETIME
);
CREATE INDEX IF NOT EXISTS idx_issues_user   ON issue_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issue_reports(status);
CREATE INDEX IF NOT EXISTS idx_issues_created ON issue_reports(created_at);
`

func initSupport() {
	if _, err := db.Exec(ddl(supportSchema)); err != nil {
		log.Fatalf("init support schema: %v", err)
	}
}

// IssueReport is one report, from submission through to resolution.
type IssueReport struct {
	ID           string `json:"id"`
	UserID       string `json:"userId"`
	UserName     string `json:"userName"`
	UserEmail    string `json:"userEmail"`
	UserPlan     string `json:"userPlan"`
	Category     string `json:"category"`
	Severity     string `json:"severity"`
	Subject      string `json:"subject"`
	Body         string `json:"body"`
	Page         string `json:"page"`
	Platform     string `json:"platform"`
	UserAgent    string `json:"userAgent"`
	OperationID  string `json:"operationId"`
	ContactEmail string `json:"contactEmail"`
	Status       string `json:"status"`
	AssignedTo   string `json:"assignedTo"`
	AdminNote    string `json:"adminNote"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
	ResolvedAt   string `json:"resolvedAt"`
}

// IssueStats is the triage summary the admin header needs.
type IssueStats struct {
	Total           int            `json:"total"`
	Open            int            `json:"open"`
	InProgress      int            `json:"inProgress"`
	Resolved        int            `json:"resolved"`
	Closed          int            `json:"closed"`
	Critical        int            `json:"critical"`
	OpenCritical    int            `json:"openCritical"`
	Last24h         int            `json:"last24h"`
	ByCategory      map[string]int `json:"byCategory"`
	OldestOpenAge   string         `json:"oldestOpenAge"`
	AvgResolveHours float64        `json:"avgResolveHours"`
}

// ---------------------------------------------------------------------------
// User-facing endpoints
// ---------------------------------------------------------------------------

func registerSupportRoutes(api *gin.RouterGroup) {
	api.POST("/issues", handleCreateIssue)
	api.GET("/issues", handleMyIssues)
	api.GET("/issues/meta", handleIssueMeta)
}

// handleIssueMeta gives the report form its category and severity options so
// the two sides cannot drift apart.
func handleIssueMeta(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"categories": issueCategories,
		"severities": issueSeverities,
		"statuses":   []string{IssueOpen, IssueInProgress, IssueResolved, IssueClosed},
	})
}

func handleCreateIssue(c *gin.Context) {
	uid := userId(c)

	var body struct {
		Category     string `json:"category"`
		Severity     string `json:"severity"`
		Subject      string `json:"subject"`
		Body         string `json:"body"`
		Page         string `json:"page"`
		Platform     string `json:"platform"`
		OperationID  string `json:"operationId"`
		ContactEmail string `json:"contactEmail"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	body.Subject = strings.TrimSpace(body.Subject)
	body.Body = strings.TrimSpace(body.Body)
	if body.Subject == "" || body.Body == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subject and description are required"})
		return
	}
	// Bound the fields so one report cannot fill the table.
	if len(body.Subject) > 200 {
		body.Subject = body.Subject[:200]
	}
	if len(body.Body) > 8000 {
		body.Body = body.Body[:8000]
	}

	category := normalizeChoice(body.Category, issueCategories, "bug")
	severity := normalizeChoice(body.Severity, issueSeverities, "normal")

	report := IssueReport{
		ID:           newID("iss"),
		UserID:       uid,
		Category:     category,
		Severity:     severity,
		Subject:      body.Subject,
		Body:         body.Body,
		Page:         body.Page,
		Platform:     body.Platform,
		UserAgent:    c.GetHeader("User-Agent"),
		OperationID:  body.OperationID,
		ContactEmail: strings.TrimSpace(body.ContactEmail),
		Status:       IssueOpen,
		CreatedAt:    time.Now().UTC().Format("2006-01-02 15:04:05"),
	}

	if _, err := db.Exec(
		`INSERT INTO issue_reports (id, user_id, category, severity, subject, body,
		   page, platform, user_agent, operation_id, contact_email, status,
		   created_at, updated_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		report.ID, report.UserID, report.Category, report.Severity, report.Subject,
		report.Body, report.Page, report.Platform, report.UserAgent,
		nullIfEmpty(report.OperationID), report.ContactEmail, report.Status,
		report.CreatedAt, report.CreatedAt,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// A critical report is an incident; make it visible in the log immediately
	// rather than waiting for someone to open the panel.
	if severity == "critical" {
		log.Printf("CRITICAL ISSUE %s from user=%s: %s", report.ID, uid, report.Subject)
	}

	c.JSON(http.StatusCreated, gin.H{
		"ok":     true,
		"issue":  report,
		"status": "Received. You can follow it under Settings → Support.",
	})
}

func handleMyIssues(c *gin.Context) {
	uid := userId(c)
	issues, err := listIssues(issueFilter{UserID: uid, Limit: 100})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"issues": issues})
}

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

func registerAdminSupportRoutes(admin *gin.RouterGroup) {
	admin.GET("/issues", handleAdminIssues)
	admin.GET("/issues/stats", handleAdminIssueStats)
	admin.PATCH("/issues/:id", handleAdminUpdateIssue)
}

func handleAdminIssues(c *gin.Context) {
	f := issueFilter{
		Status:   c.Query("status"),
		Severity: c.Query("severity"),
		Category: c.Query("category"),
		UserID:   c.Query("userId"),
		Query:    c.Query("q"),
		Limit:    queryInt(c, "limit", 200),
	}
	issues, err := listIssues(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	stats, _ := issueStats()
	c.JSON(http.StatusOK, gin.H{"issues": issues, "stats": stats})
}

func handleAdminIssueStats(c *gin.Context) {
	stats, err := issueStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func handleAdminUpdateIssue(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Status     *string `json:"status"`
		Severity   *string `json:"severity"`
		Category   *string `json:"category"`
		AssignedTo *string `json:"assignedTo"`
		AdminNote  *string `json:"adminNote"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	sets := []string{"updated_at = ?"}
	args := []interface{}{time.Now().UTC().Format("2006-01-02 15:04:05")}
	changed := []string{}

	if body.Status != nil {
		st := normalizeChoice(*body.Status, []string{IssueOpen, IssueInProgress, IssueResolved, IssueClosed}, IssueOpen)
		sets = append(sets, "status = ?")
		args = append(args, st)
		changed = append(changed, "status="+st)
		// Stamp resolution time so time-to-resolve is measurable, and clear it
		// again if a report is reopened.
		if st == IssueResolved || st == IssueClosed {
			sets = append(sets, "resolved_at = ?")
			args = append(args, time.Now().UTC().Format("2006-01-02 15:04:05"))
		} else {
			sets = append(sets, "resolved_at = NULL")
		}
	}
	if body.Severity != nil {
		sv := normalizeChoice(*body.Severity, issueSeverities, "normal")
		sets = append(sets, "severity = ?")
		args = append(args, sv)
		changed = append(changed, "severity="+sv)
	}
	if body.Category != nil {
		cat := normalizeChoice(*body.Category, issueCategories, "bug")
		sets = append(sets, "category = ?")
		args = append(args, cat)
		changed = append(changed, "category="+cat)
	}
	if body.AssignedTo != nil {
		sets = append(sets, "assigned_to = ?")
		args = append(args, *body.AssignedTo)
		changed = append(changed, "assignedTo="+*body.AssignedTo)
	}
	if body.AdminNote != nil {
		sets = append(sets, "admin_note = ?")
		args = append(args, *body.AdminNote)
		changed = append(changed, "note updated")
	}
	if len(changed) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nothing to update"})
		return
	}

	args = append(args, id)
	res, err := db.Exec(`UPDATE issue_reports SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "issue not found"})
		return
	}

	recordAudit(adminActor(c), "issue.update", "issue", id, strings.Join(changed, ", "))
	issues, _ := listIssues(issueFilter{ID: id, Limit: 1})
	var updated interface{}
	if len(issues) > 0 {
		updated = issues[0]
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "issue": updated})
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

type issueFilter struct {
	ID       string
	UserID   string
	Status   string
	Severity string
	Category string
	Query    string
	Limit    int
}

func listIssues(f issueFilter) ([]IssueReport, error) {
	if f.Limit <= 0 || f.Limit > 500 {
		f.Limit = 200
	}
	where := []string{"1=1"}
	args := []interface{}{}

	if f.ID != "" {
		where = append(where, "i.id = ?")
		args = append(args, f.ID)
	}
	if f.UserID != "" {
		where = append(where, "i.user_id = ?")
		args = append(args, f.UserID)
	}
	if f.Status != "" && f.Status != "all" {
		where = append(where, "i.status = ?")
		args = append(args, f.Status)
	}
	if f.Severity != "" && f.Severity != "all" {
		where = append(where, "i.severity = ?")
		args = append(args, f.Severity)
	}
	if f.Category != "" && f.Category != "all" {
		where = append(where, "i.category = ?")
		args = append(args, f.Category)
	}
	if q := strings.TrimSpace(f.Query); q != "" {
		where = append(where, "(LOWER(i.subject) LIKE ? OR LOWER(i.body) LIKE ? OR LOWER(COALESCE(u.name,'')) LIKE ? OR LOWER(COALESCE(u.email,'')) LIKE ?)")
		like := "%" + strings.ToLower(q) + "%"
		args = append(args, like, like, like, like)
	}
	args = append(args, f.Limit)

	rows, err := db.Query(`
		SELECT i.id, i.user_id, COALESCE(u.name,''), COALESCE(u.email,''),
		       COALESCE(u.plan,'free'), i.category, i.severity, i.subject, i.body,
		       COALESCE(i.page,''), COALESCE(i.platform,''), COALESCE(i.user_agent,''),
		       COALESCE(i.operation_id,''), COALESCE(i.contact_email,''), i.status,
		       COALESCE(i.assigned_to,''), COALESCE(i.admin_note,''),
		       i.created_at, i.updated_at, COALESCE(i.resolved_at,'')
		FROM issue_reports i LEFT JOIN users u ON u.id = i.user_id
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY
		  CASE i.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
		  CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
		  i.created_at DESC
		LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []IssueReport{}
	for rows.Next() {
		var i IssueReport
		if err := rows.Scan(&i.ID, &i.UserID, &i.UserName, &i.UserEmail, &i.UserPlan,
			&i.Category, &i.Severity, &i.Subject, &i.Body, &i.Page, &i.Platform,
			&i.UserAgent, &i.OperationID, &i.ContactEmail, &i.Status, &i.AssignedTo,
			&i.AdminNote, &i.CreatedAt, &i.UpdatedAt, &i.ResolvedAt); err == nil {
			i.CreatedAt = normStamp(i.CreatedAt)
			i.UpdatedAt = normStamp(i.UpdatedAt)
			i.ResolvedAt = normStamp(i.ResolvedAt)
			out = append(out, i)
		}
	}
	return out, nil
}

func issueStats() (IssueStats, error) {
	s := IssueStats{ByCategory: map[string]int{}}

	if err := db.QueryRow(`SELECT COUNT(*) FROM issue_reports`).Scan(&s.Total); err != nil {
		return s, err
	}
	_ = db.QueryRow(`SELECT COUNT(*) FROM issue_reports WHERE status = ?`, IssueOpen).Scan(&s.Open)
	_ = db.QueryRow(`SELECT COUNT(*) FROM issue_reports WHERE status = ?`, IssueInProgress).Scan(&s.InProgress)
	_ = db.QueryRow(`SELECT COUNT(*) FROM issue_reports WHERE status = ?`, IssueResolved).Scan(&s.Resolved)
	_ = db.QueryRow(`SELECT COUNT(*) FROM issue_reports WHERE status = ?`, IssueClosed).Scan(&s.Closed)
	_ = db.QueryRow(`SELECT COUNT(*) FROM issue_reports WHERE severity = 'critical'`).Scan(&s.Critical)
	_ = db.QueryRow(`SELECT COUNT(*) FROM issue_reports WHERE severity = 'critical' AND status IN (?,?)`,
		IssueOpen, IssueInProgress).Scan(&s.OpenCritical)

	since := time.Now().UTC().Add(-24 * time.Hour).Format("2006-01-02 15:04:05")
	_ = db.QueryRow(`SELECT COUNT(*) FROM issue_reports WHERE created_at >= ?`, since).Scan(&s.Last24h)

	rows, err := db.Query(`SELECT category, COUNT(*) FROM issue_reports GROUP BY category`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cat string
			var n int
			if err := rows.Scan(&cat, &n); err == nil {
				s.ByCategory[cat] = n
			}
		}
	}

	var oldest string
	_ = db.QueryRow(`SELECT COALESCE(MIN(created_at),'') FROM issue_reports WHERE status IN (?,?)`,
		IssueOpen, IssueInProgress).Scan(&oldest)
	s.OldestOpenAge = humanAge(oldest)

	// Mean time to resolve, over reports that actually reached a resolution.
	rows2, err := db.Query(`SELECT created_at, resolved_at FROM issue_reports
		WHERE resolved_at IS NOT NULL AND resolved_at != ''`)
	if err == nil {
		defer rows2.Close()
		var total float64
		var n int
		for rows2.Next() {
			var created, resolved string
			if err := rows2.Scan(&created, &resolved); err != nil {
				continue
			}
			ct, err1 := parseStamp(created)
			rt, err2 := parseStamp(resolved)
			if err1 != nil || err2 != nil {
				continue
			}
			total += rt.Sub(ct).Hours()
			n++
		}
		if n > 0 {
			s.AvgResolveHours = round2(total / float64(n))
		}
	}

	return s, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// normalizeChoice keeps a free-text field on the known list rather than
// trusting the client, so grouping queries stay meaningful.
func normalizeChoice(v string, allowed []string, def string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	for _, a := range allowed {
		if a == v {
			return v
		}
	}
	return def
}

// parseStamp reads the timestamp formats both drivers hand back.
func parseStamp(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("empty timestamp")
	}
	for _, layout := range []string{
		"2006-01-02 15:04:05.999999999 -0700 MST",
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02 15:04:05",
		"2006-01-02",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognised timestamp %q", s)
}

func humanAge(stamp string) string {
	t, err := parseStamp(stamp)
	if err != nil {
		return ""
	}
	d := time.Since(t)
	switch {
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
}

// adminActor identifies who performed a privileged action. Real operator
// identity arrives with admin auth; until then the header is recorded as given
// and the audit row says so.
func adminActor(c *gin.Context) string {
	if v := strings.TrimSpace(c.GetHeader("X-Admin-Actor")); v != "" {
		return v
	}
	return "admin"
}

// seedIssues gives the support queue something to triage on a clean install.
func seedIssues() {
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM issue_reports`).Scan(&n); err != nil || n > 0 {
		return
	}
	now := time.Now().UTC()
	seed := []struct {
		user, cat, sev, subject, body, page, status, note string
		hoursAgo                                          int
	}{
		{"user-3", "generation", "critical", "Video generation charged credits but returned nothing",
			"I reserved an 8s clip on Kling, the job failed after about two minutes and my balance is still down 220 credits. This is the second time today.",
			"AI Hub", IssueOpen, "", 3},
		{"user-1", "billing", "high", "Credit pack purchase not reflected in balance",
			"Bought the 1k pack this morning, the receipt came through but the dashboard still shows the old balance.",
			"Billing", IssueInProgress, "Confirmed the purchase row exists — checking the ledger grant.", 9},
		{"user-2", "publishing", "normal", "LinkedIn post published without the cover image",
			"The blog cross-post went out fine but the cover image was dropped. Preview showed it correctly.",
			"Social Hub", IssueOpen, "", 26},
		{"user-4", "connection", "normal", "Instagram connection keeps asking me to re-authenticate",
			"Every couple of days the Instagram account drops back to disconnected and I have to log in again.",
			"Social Hub", IssueOpen, "", 50},
		{"user-2", "feature-request", "low", "Let me schedule the same post to two accounts on one platform",
			"We run two brand accounts on X and currently have to duplicate the whole post.",
			"Calendar", IssueResolved, "Shipped in the calendar multi-account update.", 120},
	}

	for _, s := range seed {
		created := now.Add(-time.Duration(s.hoursAgo) * time.Hour).Format("2006-01-02 15:04:05")
		var resolved interface{}
		if s.status == IssueResolved || s.status == IssueClosed {
			resolved = now.Add(-time.Duration(s.hoursAgo-6) * time.Hour).Format("2006-01-02 15:04:05")
		}
		if _, err := db.Exec(
			`INSERT INTO issue_reports (id, user_id, category, severity, subject, body,
			   page, status, admin_note, created_at, updated_at, resolved_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
			newID("iss"), s.user, s.cat, s.sev, s.subject, s.body, s.page, s.status,
			s.note, created, created, resolved,
		); err != nil {
			log.Printf("seed issue: %v", err)
		}
	}
}
