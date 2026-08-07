package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// Customer-facing account endpoints
//
// These are the paths a real checkout eventually calls. There is no payment
// provider wired in yet, so a subscription or purchase created here is marked
// provider="self-serve" and is trusted — which is exactly why the admin panel
// reports the provider on every row rather than hiding it. When Stripe lands,
// its webhook calls the same two functions and the provider column starts
// telling the truth on its own.
// ---------------------------------------------------------------------------

func registerAccountRoutes(api *gin.RouterGroup) {
	api.GET("/account", handleMyAccount)
	api.POST("/account/subscribe", handleSubscribe)
	api.POST("/account/cancel", handleCancelOwnSubscription)
	api.POST("/account/purchase", handleBuyCreditPack)
	api.GET("/account/purchases", handleMyPurchases)
}

// handleMyAccount is what the app shows on a billing screen: who you are, what
// you are on, what you have left.
func handleMyAccount(c *gin.Context) {
	uid := userId(c)

	u, err := userRow(uid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	sub, _ := activeSubscription(uid)
	balance, _ := creditBalance(uid)

	var email, company, registered, lastSeen string
	_ = db.QueryRow(
		`SELECT COALESCE(email,''), COALESCE(company,''), COALESCE(created_at,''),
		        COALESCE(last_seen_at,'') FROM users WHERE id = ?`, uid,
	).Scan(&email, &company, &registered, &lastSeen)

	purchases, _ := listPurchases("", 20)
	mine := []CreditPurchase{}
	for _, p := range purchases {
		if p.UserID == uid {
			mine = append(mine, p)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":           u.ID,
		"name":         u.Name,
		"email":        email,
		"company":      company,
		"plan":         u.Plan,
		"status":       u.Status,
		"registeredAt": registered,
		"lastSeenAt":   lastSeen,
		"subscription": sub,
		"isPaying":     sub != nil && sub.MonthlyUSD > 0,
		"balance":      balance,
		"purchases":    mine,
		"packs":        CreditPacks(),
		"plans":        PlanCatalog(),
	})
}

func handleSubscribe(c *gin.Context) {
	uid := userId(c)
	var body struct {
		Plan  string `json:"plan"`
		Trial bool   `json:"trial"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Plan) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan is required"})
		return
	}
	plan := PlanByID(body.Plan)
	if plan.ID != strings.ToLower(strings.TrimSpace(body.Plan)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown plan " + body.Plan})
		return
	}

	sub, err := startSubscription(uid, plan.ID, "self-serve", "", body.Trial)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	recordAudit("self-serve", "subscription.start", "user", uid,
		"customer subscribed to "+plan.ID)
	c.JSON(http.StatusOK, gin.H{"ok": true, "subscription": sub})
}

func handleCancelOwnSubscription(c *gin.Context) {
	uid := userId(c)
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&body)

	if err := cancelSubscription(uid, defaultString(body.Reason, "canceled by customer")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	recordAudit("self-serve", "subscription.cancel", "user", uid, body.Reason)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleBuyCreditPack(c *gin.Context) {
	uid := userId(c)
	var body struct {
		PackID string `json:"packId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.PackID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "packId is required"})
		return
	}
	p, err := recordPurchase(uid, body.PackID, "self-serve", "", PurchasePaid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	balance, _ := creditBalance(uid)
	recordAudit("self-serve", "purchase.create", "user", uid, p.PackID)
	c.JSON(http.StatusOK, gin.H{"ok": true, "purchase": p, "balance": balance})
}

func handleMyPurchases(c *gin.Context) {
	uid := userId(c)
	purchases, err := listPurchases("", 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	mine := []CreditPurchase{}
	for _, p := range purchases {
		if p.UserID == uid {
			mine = append(mine, p)
		}
	}
	c.JSON(http.StatusOK, gin.H{"purchases": mine})
}
