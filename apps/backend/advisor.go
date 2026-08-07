package main

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// Advisor: open-ended chat and one-shot content optimisation
//
// These two used to live in the Next.js app as routes that called Google Gemini
// directly, left over from the AI Studio scaffold the frontend was generated
// from. That arrangement had the frontend holding its own provider key and its
// own model choice, which meant:
//
//   - two AI configurations to keep in step, which had already drifted
//   - every one of those calls invisible to the credit ledger and to the
//     margin guard, so the spend they caused could never be reconciled
//   - a failure path that returned confident invented text, so an outage
//     looked exactly like a working feature
//
// Moving them here puts every AI call in the product behind one provider, one
// rate card and one usage ledger.
// ---------------------------------------------------------------------------

func registerAdvisorRoutes(api *gin.RouterGroup) {
	api.POST("/advisor/chat", handleAdvisorChat)
	api.POST("/advisor/optimize", handleAdvisorOptimize)
}

// AdvisorChatRequest is one turn from the user, with optional prior turns so
// the assistant can follow a thread rather than answering each line cold.
type AdvisorChatRequest struct {
	Message string            `json:"message"`
	History []AdvisorChatTurn `json:"history"`
	Context string            `json:"context"`
}

// AdvisorChatTurn is a previous message in the conversation.
type AdvisorChatTurn struct {
	Sender string `json:"sender"` // "user" | "ai"
	Text   string `json:"text"`
}

// AdvisorChatResponse mirrors what the chat UI already expects.
type AdvisorChatResponse struct {
	Reply    string `json:"reply"`
	Status   string `json:"status"` // success | unavailable
	Provider string `json:"provider"`
	Model    string `json:"model"`
	// Degraded is true when the primary provider was down and a fallback
	// answered, so the UI can say the answer came from a backup rather than
	// quietly presenting a downgrade as business as usual.
	Degraded bool `json:"degraded"`
}

const advisorSystem = `You are Palius, an executive-grade AI advisor for social
media strategy, cross-platform audience growth and content optimisation.

Answer in a concise, direct, senior tone. Prefer specific, actionable guidance
over generic marketing advice. When you give a number, say where it comes from
or label it as an estimate — never invent precise-sounding statistics. If the
question is outside social media, content or growth, answer it briefly anyway
rather than refusing.`

func handleAdvisorChat(c *gin.Context) {
	var req AdvisorChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}

	// No provider configured is a real condition, not something to paper over
	// with invented text. Say so, so the UI can say so too.
	if !aiAvailable() {
		c.JSON(http.StatusOK, AdvisorChatResponse{
			Reply: "No AI provider is configured on the server, so I can't answer that yet. " +
				"Set a provider key in the backend environment and this will start working.",
			Status:   "unavailable",
			Provider: resolveProvider(),
			Model:    activeModel(),
		})
		return
	}

	// Room for more than one provider: a reasoning model can take 40s on its
	// own, and if the first one hangs the chain still needs time to reach a
	// working fallback rather than giving up on the customer.
	ctx, cancel := context.WithTimeout(c.Request.Context(), 180*time.Second)
	defer cancel()

	// Chat is prose, not JSON, so it goes down the chain directly rather than
	// through the JSON helper the structured endpoints use.
	res, err := callAIChain(ctx, advisorSystem, buildAdvisorPrompt(req), 0.7, false)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error":    "every configured AI provider failed",
			"detail":   err.Error(),
			"status":   "error",
			"attempts": res.Attempts,
		})
		return
	}

	// Spend is attributed to whoever answered, not to the primary.
	recordTextUsage(userId(c), res.Usage, "text", res.Provider, res.Model)

	c.JSON(http.StatusOK, AdvisorChatResponse{
		Reply:    res.Text,
		Status:   "success",
		Provider: res.Provider,
		Model:    res.Model,
		Degraded: res.Degraded,
	})
}

func buildAdvisorPrompt(req AdvisorChatRequest) string {
	var b strings.Builder
	if req.Context != "" {
		b.WriteString("Brand and product context: " + req.Context + "\n\n")
	}
	// Keep the tail of the conversation only: enough to stay coherent without
	// resending an unbounded history on every turn.
	if n := len(req.History); n > 0 {
		start := 0
		if n > 10 {
			start = n - 10
		}
		b.WriteString("Conversation so far:\n")
		for _, t := range req.History[start:] {
			who := "User"
			if t.Sender == "ai" {
				who = "You"
			}
			b.WriteString(who + ": " + t.Text + "\n")
		}
		b.WriteString("\n")
	}
	b.WriteString("User: " + req.Message)
	return b.String()
}

// ---------------------------------------------------------------------------
// Optimise
// ---------------------------------------------------------------------------

// AdvisorOptimizeRequest is a draft the creator wants rewritten.
type AdvisorOptimizeRequest struct {
	Caption  string `json:"caption"`
	Platform string `json:"platform"`
	Hook     string `json:"hook"`
	Style    string `json:"style"`
}

// AdvisorOptimizeResponse is the shape the compose modal already renders.
type AdvisorOptimizeResponse struct {
	Score           int      `json:"score"`
	ImprovedCaption string   `json:"improvedCaption"`
	Hooks           []string `json:"hooks"`
	Hashtags        []string `json:"hashtags"`
	Critique        string   `json:"critique"`
}

func handleAdvisorOptimize(c *gin.Context) {
	var req AdvisorOptimizeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if strings.TrimSpace(req.Caption) == "" && strings.TrimSpace(req.Hook) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "caption or hook is required"})
		return
	}

	var out AdvisorOptimizeResponse
	if aiAvailable() && aiCall(c, "text", systemJSON(), buildOptimizePrompt(req), &out) {
		if out.Score < 1 || out.Score > 100 {
			out.Score = 75
		}
		if strings.TrimSpace(out.ImprovedCaption) == "" {
			out.ImprovedCaption = req.Caption
		}
		c.JSON(http.StatusOK, out)
		return
	}

	c.JSON(http.StatusOK, fallbackOptimize(req))
}

func buildOptimizePrompt(req AdvisorOptimizeRequest) string {
	platform := defaultString(req.Platform, "cross-platform")
	style := defaultString(req.Style, "Professional")

	var b strings.Builder
	b.WriteString("Rewrite and improve this social post.\n")
	b.WriteString("Platform: " + platform + "\n")
	b.WriteString("Tone/style: " + style + "\n")
	b.WriteString("Draft caption: " + req.Caption + "\n")
	if req.Hook != "" {
		b.WriteString("Current hook: " + req.Hook + "\n")
	}
	b.WriteString(`
Return JSON with exactly these keys:
  score            integer 1-100, how strong the ORIGINAL draft is
  improvedCaption  string, the rewritten caption, ready to publish
  hooks            array of 3 alternative opening hooks
  hashtags         array of 4-5 relevant hashtags, each starting with #
  critique         string, one or two sentences on what you changed and why

Write for the named platform's conventions and length. Do not invent statistics
or company names that were not in the draft.`)
	return b.String()
}

// fallbackOptimize runs when no provider is configured. It reworks the creator's
// own words instead of substituting invented marketing copy, and says plainly in
// the critique that no AI was involved — a fallback that pretends to be a result
// is worse than no fallback at all.
func fallbackOptimize(req AdvisorOptimizeRequest) AdvisorOptimizeResponse {
	caption := strings.TrimSpace(req.Caption)
	platform := defaultString(req.Platform, "cross-platform")

	hook := strings.TrimSpace(req.Hook)
	if hook == "" {
		hook = firstSentence(caption)
	}

	return AdvisorOptimizeResponse{
		Score:           60,
		ImprovedCaption: caption,
		Hooks: []string{
			hook,
			"Here's what changed for us — and what I'd do differently.",
			"Most people get this wrong. Here's the short version.",
		},
		Hashtags: platformHashtags(platform),
		Critique: "No AI provider is configured on the server, so this draft was left as you wrote it. " +
			"Set a provider key in the backend environment to get a real rewrite.",
	}
}

func firstSentence(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "Something worth sharing."
	}
	if i := strings.IndexAny(s, ".!?\n"); i > 0 {
		return strings.TrimSpace(s[:i+1])
	}
	if len(s) > 90 {
		return strings.TrimSpace(s[:90]) + "…"
	}
	return s
}

func platformHashtags(platform string) []string {
	switch strings.ToLower(platform) {
	case "linkedin":
		return []string{"#Leadership", "#Startups", "#BuildInPublic", "#Growth"}
	case "tiktok", "instagram", "threads":
		return []string{"#fyp", "#creator", "#behindthescenes", "#howto"}
	case "x", "twitter":
		return []string{"#buildinpublic", "#startup", "#tech"}
	case "youtube":
		return []string{"#shorts", "#tutorial", "#creator", "#howto"}
	default:
		return []string{"#content", "#creator", "#growth", "#socialmedia"}
	}
}
