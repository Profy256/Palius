package main

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// Billing & generation endpoints
//
// The flow a client follows for any image or video generation:
//
//   POST /media/estimate   — show the customer what it will cost. No writes.
//   POST /media/reserve    — hold the credits. Returns operationId, or 402 with
//                            what they'd need, or needsConfirm for a big spend.
//   ... dispatch to the provider ...
//   POST /media/commit     — settle against the units the vendor really used.
//   POST /media/fail       — release the hold if it produced nothing.
//
// Text generation never touches this path: it is covered by the subscription.
// ---------------------------------------------------------------------------

func registerBillingRoutes(api *gin.RouterGroup) {
	api.GET("/billing/plans", handlePlans)
	api.GET("/billing/packs", handleCreditPacks)
	api.GET("/billing/balance", handleBalance)
	api.GET("/billing/models", handleGenModels)

	api.POST("/media/estimate", handleEstimate)
	api.POST("/media/reserve", handleReserve)
	api.POST("/media/commit", handleCommit)
	api.POST("/media/fail", handleFail)
	api.GET("/media/operations", handleMyOperations)
}

// handlePlans returns the price list with derived economics attached, so the
// pricing page and the admin panel read from one source of truth.
func handlePlans(c *gin.Context) {
	type planWithEcon struct {
		Plan      Plan          `json:"plan"`
		Economics PlanEconomics `json:"economics"`
	}
	var out []planWithEcon
	for _, p := range PlanCatalog() {
		out = append(out, planWithEcon{Plan: p, Economics: ComputePlanEconomics(p)})
	}
	c.JSON(http.StatusOK, gin.H{
		"plans":               out,
		"creditValueUSD":      CreditValueUSD,
		"blendedCostPerCredit": BlendedCostPerCredit(),
		"metered":             []string{"image generation", "video generation"},
		"unmetered":           subscriptionIncluded(),
	})
}

func handleCreditPacks(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"packs": CreditPacks()})
}

func handleBalance(c *gin.Context) {
	uid := userId(c)
	ensureUser(uid, "Account "+uid)
	if err := grantMonthlyCredits(uid); err != nil {
		// Non-fatal: the balance read below is still correct.
		c.Header("X-Grant-Warning", err.Error())
	}
	bal, err := creditBalance(uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, bal)
}

// handleGenModels lists what the customer can choose from, with the credit cost
// of a representative unit so the picker can show price next to quality.
func handleGenModels(c *gin.Context) {
	type priced struct {
		GenModel
		CreditsPerUnit    float64 `json:"creditsPerUnit"`
		Credits8sClip     float64 `json:"credits8sClip,omitempty"`
		CreditsPerImage   float64 `json:"creditsPerImage,omitempty"`
	}

	var images, videos []priced
	for _, m := range ImageModels() {
		cost := EstimateCost(GenerationSpec{
			Modality: "image", Model: m.ID, Provider: m.Provider,
			ImageCount: 1, ImageQuality: "standard",
		})
		images = append(images, priced{
			GenModel: m, CreditsPerUnit: cost.Credits, CreditsPerImage: cost.Credits,
		})
	}
	for _, m := range VideoModels() {
		perSec := EstimateCost(GenerationSpec{
			Modality: "video", Model: m.ID, Provider: m.Provider,
			Seconds: 1, Resolution: "1080p", VideoCount: 1, WithAudio: m.HasAudio,
		})
		clip := EstimateCost(GenerationSpec{
			Modality: "video", Model: m.ID, Provider: m.Provider,
			Seconds: 8, Resolution: "1080p", VideoCount: 1, WithAudio: m.HasAudio,
		})
		videos = append(videos, priced{
			GenModel: m, CreditsPerUnit: perSec.Credits, Credits8sClip: clip.Credits,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"image": images,
		"video": videos,
		"note":  "Model choice is unrestricted on paid plans; price scales with the model you pick.",
	})
}

// specFromBody builds a GenerationSpec from a request, defaulting the model to
// the efficient recommendation for the stated intent when none is given.
type mediaRequest struct {
	Modality     string  `json:"modality"`
	Model        string  `json:"model"`
	Intent       string  `json:"intent"`
	ImageCount   int     `json:"imageCount"`
	ImageQuality string  `json:"imageQuality"`
	Seconds      float64 `json:"seconds"`
	Resolution   string  `json:"resolution"`
	WithAudio    bool    `json:"withAudio"`
	VideoCount   int     `json:"videoCount"`
	Confirmed    bool    `json:"confirmed"`
	IdempotencyKey string `json:"idempotencyKey"`
}

func (r mediaRequest) spec() GenerationSpec {
	model := r.Model
	provider := ""
	if model == "" {
		rec := RecommendModel(r.Modality, r.Intent)
		model, provider = rec.ID, rec.Provider
	} else if m, ok := FindModel(model); ok {
		provider = m.Provider
	}
	return GenerationSpec{
		Modality:     r.Modality,
		Model:        model,
		Provider:     provider,
		ImageCount:   r.ImageCount,
		ImageQuality: r.ImageQuality,
		Seconds:      r.Seconds,
		Resolution:   r.Resolution,
		WithAudio:    r.WithAudio,
		VideoCount:   r.VideoCount,
	}
}

// handleEstimate is the cost preview. Pure read — nothing is reserved.
func handleEstimate(c *gin.Context) {
	var body mediaRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Modality != "image" && body.Modality != "video" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "modality must be image or video — text generation is included in the subscription and is not metered",
		})
		return
	}

	uid := userId(c)
	ensureUser(uid, "Account "+uid)
	est := EstimateCost(body.spec())
	bal, _ := creditBalance(uid)
	plan := PlanByID(bal.Plan)

	c.JSON(http.StatusOK, gin.H{
		"estimate":      est,
		"balance":       bal,
		"affordable":    est.Credits <= bal.Available,
		"needsConfirm":  plan.RequireConfirmAboveUSD > 0 && est.BillableUSD > plan.RequireConfirmAboveUSD,
		"mediaEnabled":  plan.MediaEnabled,
		"balanceAfter":  round2(bal.Available - est.Credits),
	})
}

func handleReserve(c *gin.Context) {
	var body mediaRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Modality != "image" && body.Modality != "video" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "modality must be image or video"})
		return
	}

	uid := userId(c)
	ensureUser(uid, "Account "+uid)

	res, err := reserveOperation(uid, body.spec(), body.Intent, body.IdempotencyKey, body.Confirmed)
	if err != nil {
		var insuf *InsufficientCreditsError
		if errors.As(err, &insuf) {
			// 402 so the client can route straight to an upgrade prompt.
			c.JSON(http.StatusPaymentRequired, gin.H{
				"error":     err.Error(),
				"required":  insuf.Required,
				"available": insuf.Available,
				"plan":      insuf.Plan,
				"packs":     CreditPacks(),
			})
			return
		}
		if errors.Is(err, ErrBelowCost) {
			// Never dispatch work we would lose money on.
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "generation temporarily unavailable for this model — pricing is being reviewed",
			})
			return
		}
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func handleCommit(c *gin.Context) {
	var body struct {
		OperationID string `json:"operationId"`
		// Actuals as reported by the provider. Falling back to the estimate
		// would quietly eat every under-estimate, so these should always be
		// passed through from the provider response.
		InputTokens  int     `json:"inputTokens"`
		OutputTokens int     `json:"outputTokens"`
		ImageCount   int     `json:"imageCount"`
		ImageQuality string  `json:"imageQuality"`
		Seconds      float64 `json:"seconds"`
		Resolution   string  `json:"resolution"`
		WithAudio    bool    `json:"withAudio"`
		VideoCount   int     `json:"videoCount"`
		Model        string  `json:"model"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.OperationID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "operationId required"})
		return
	}

	final, err := commitOperation(body.OperationID, GenerationSpec{
		Model:        body.Model,
		InputTokens:  body.InputTokens,
		OutputTokens: body.OutputTokens,
		ImageCount:   body.ImageCount,
		ImageQuality: body.ImageQuality,
		Seconds:      body.Seconds,
		Resolution:   body.Resolution,
		WithAudio:    body.WithAudio,
		VideoCount:   body.VideoCount,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	bal, _ := creditBalance(userId(c))
	c.JSON(http.StatusOK, gin.H{"charged": final, "balance": bal})
}

func handleFail(c *gin.Context) {
	var body struct {
		OperationID  string  `json:"operationId"`
		Reason       string  `json:"reason"`
		VendorBilled bool    `json:"vendorBilled"`
		VendorUSD    float64 `json:"vendorUSD"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.OperationID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "operationId required"})
		return
	}
	if err := failOperation(body.OperationID, body.Reason, body.VendorBilled, body.VendorUSD); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	bal, _ := creditBalance(userId(c))
	c.JSON(http.StatusOK, gin.H{"ok": true, "refunded": true, "balance": bal})
}

func handleMyOperations(c *gin.Context) {
	uid := userId(c)
	limit := queryInt(c, "limit", 50)
	rows, err := db.Query(`SELECT `+opColumns+`
		FROM operations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`, uid, limit)
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
