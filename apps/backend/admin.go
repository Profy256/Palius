package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// handleAdminOverview returns top-level KPIs plus daily + provider breakdowns.
func handleAdminOverview(c *gin.Context) {
	days := queryInt(c, "days", 14)
	ov, err := adminOverview(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, ov)
}

// handleAdminUsers returns every user with aggregated usage.
func handleAdminUsers(c *gin.Context) {
	users, err := adminUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"users": users})
}

// handleAdminUserUsage returns one user's usage events.
func handleAdminUserUsage(c *gin.Context) {
	id := c.Param("id")
	events, err := userUsage(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"userId": id, "events": events})
}

// handleAdminUpdateUser updates a user's quota/plan/status.
func handleAdminUpdateUser(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		TokenQuota  *int64   `json:"tokenQuota"`
		CreditQuota *float64 `json:"creditQuota"`
		Plan        *string  `json:"plan"`
		Status      *string  `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	current, err := userRow(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	tq, cq := current.TokenQuota, current.CreditQuota
	plan, status := current.Plan, current.Status
	if body.TokenQuota != nil {
		tq = *body.TokenQuota
	}
	if body.CreditQuota != nil {
		cq = *body.CreditQuota
	}
	if body.Plan != nil {
		plan = *body.Plan
	}
	if body.Status != nil {
		status = *body.Status
	}
	if err := updateUserQuota(id, tq, cq, plan, status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id})
}

// handleAdminUsageLog returns the most recent usage events.
func handleAdminUsageLog(c *gin.Context) {
	limit := queryInt(c, "limit", 100)
	events, err := recentEvents(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"events": events})
}

// handleAdminDaily returns the daily aggregate series.
func handleAdminDaily(c *gin.Context) {
	days := queryInt(c, "days", 14)
	series, err := dailyUsage(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"daily": series})
}

// handleAdminProviders returns per-provider aggregates.
func handleAdminProviders(c *gin.Context) {
	rows, err := providerUsage()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"providers": rows})
}

func queryInt(c *gin.Context, key string, def int) int {
	v := c.Query(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

// userRow fetches a single user's current quota values.
func userRow(id string) (AdminUser, error) {
	var u AdminUser
	err := db.QueryRow(
		`SELECT id, name, COALESCE(plan,'starter'), COALESCE(status,'active'), token_quota, credit_quota FROM users WHERE id = ?`, id,
	).Scan(&u.ID, &u.Name, &u.Plan, &u.Status, &u.TokenQuota, &u.CreditQuota)
	return u, err
}
