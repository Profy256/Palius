package main

import (
	"crypto/subtle"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

func main() {
	port := env("PORT", "8080")

	// Default to release unless PALIUS_DEBUG is set.
	if env("PALIUS_DEBUG", "") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	openDB()

	r := gin.Default()
	r.Use(corsMiddleware())

	api := r.Group("/api/v1")
	{
		api.GET("/health", handleHealth)
		api.GET("/config", handleConfig)

		// Create flow & onboarding
		api.POST("/context", handleContext)
		api.POST("/content/analyze", handleAnalyze)
		api.POST("/content/generate", handleGenerate)

		// Viral research
		api.POST("/viral/research", handleViralResearch)

		// AI advisor chat & one-shot post optimisation
		registerAdvisorRoutes(api)

		// Reading text out of uploaded PDFs and Word documents
		registerExtractRoutes(api)

		// Per-platform analytics
		api.GET("/analytics/:platform", handleAnalytics)

		// Billing, credits & metered generation
		registerBillingRoutes(api)

		// Blog publishing & user-defined destinations
		registerPublishingRoutes(api)

		// Platform connections, stored credentials & OAuth
		registerConnectionRoutes(api)
		registerOAuthRoutes(api)

		// Level 3 — signing in to platforms through the embedded browser
		registerBrowserRoutes(api)

		// Customer-facing subscription & credit-pack purchase
		registerAccountRoutes(api)

		// "Report an issue" — open to any signed-in user
		registerSupportRoutes(api)

		// Admin — usage tracking. Guarded by ADMIN_TOKEN: these endpoints
		// expose every customer's spend and let quotas be rewritten, so they
		// must never be open on a public URL.
		admin := api.Group("/admin", adminAuthMiddleware())
		{
			admin.GET("/overview", handleAdminOverview)
			admin.GET("/users", handleAdminUsers)
			admin.GET("/users/:id/usage", handleAdminUserUsage)
			admin.PUT("/users/:id", handleAdminUpdateUser)
			admin.GET("/usage", handleAdminUsageLog)
			admin.GET("/daily", handleAdminDaily)
			admin.GET("/providers", handleAdminProviders)

			// Economics & monitoring
			registerAdminEconomicsRoutes(admin)

			// Customers, segments, revenue, live activity & audit
			registerAdminCustomerRoutes(admin)

			// Support queue
			registerAdminSupportRoutes(admin)

			// Spreadsheet exports
			registerAdminExportRoutes(admin)
		}
	}

	log.Printf("Palius backend listening on :%s (provider=%s model=%s)", port, resolveProvider(), activeModel())
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

// corsMiddleware reflects only origins on the allowlist. Reflecting whatever
// Origin arrives while also sending Allow-Credentials: true is equivalent to
// having no CORS policy at all, so ALLOWED_ORIGINS must be set in production.
// Unset means allow-all, which is acceptable for local development only.
func corsMiddleware() gin.HandlerFunc {
	var allowed []string
	if raw := env("ALLOWED_ORIGINS", ""); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			if o = strings.TrimSpace(o); o != "" {
				allowed = append(allowed, o)
			}
		}
	}
	if len(allowed) == 0 && env("APP_ENV", "development") == "production" {
		log.Printf("WARNING: ALLOWED_ORIGINS is unset in production — all origins will be accepted")
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		switch {
		case len(allowed) == 0:
			// Development: echo the origin so credentialed requests work.
			if origin == "" {
				origin = "*"
			}
		default:
			permitted := false
			for _, a := range allowed {
				if a == origin {
					permitted = true
					break
				}
			}
			if !permitted {
				// Send no CORS headers; the browser blocks the response.
				if c.Request.Method == http.MethodOptions {
					c.AbortWithStatus(http.StatusForbidden)
					return
				}
				c.Next()
				return
			}
		}

		c.Header("Vary", "Origin")
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		// X-User-Id is sent on every call from both web apps for usage
		// attribution; X-Admin-Token carries the admin secret and X-Admin-Actor
		// names the operator for the audit trail. Omitting any of them here
		// fails the preflight and blocks the browser from reaching the API at
		// all — silently, which is the worst way to find out.
		c.Header("Access-Control-Allow-Headers",
			"Origin, Content-Type, Accept, Authorization, X-Requested-With, X-User-Id, X-Admin-Token, X-Admin-Actor")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// adminAuthMiddleware requires a bearer token matching ADMIN_TOKEN. If the
// variable is unset the guard stays open for local development, but refuses to
// do so in production.
func adminAuthMiddleware() gin.HandlerFunc {
	token := env("ADMIN_TOKEN", "")
	production := env("APP_ENV", "development") == "production"

	if token == "" && production {
		log.Printf("FATAL-ADJACENT: ADMIN_TOKEN is unset in production — admin API will refuse all requests")
	}

	return func(c *gin.Context) {
		if token == "" {
			if production {
				c.AbortWithStatusJSON(http.StatusServiceUnavailable,
					gin.H{"error": "admin API is not configured"})
				return
			}
			c.Next() // local development
			return
		}

		supplied := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if supplied == "" {
			supplied = c.GetHeader("X-Admin-Token")
		}
		// Constant-time compare so the token cannot be recovered by timing.
		if subtle.ConstantTimeCompare([]byte(supplied), []byte(token)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Next()
	}
}

func handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":   "ok",
		"service":  "palius-backend",
		"provider": resolveProvider(),
		"model":    activeModel(),
		"env":      env("APP_ENV", "development"),
		// Which providers are in the chain and which are currently parked, so a
		// silent failover is visible without reading the logs.
		"aiChain": aiChainStatus(),
	})
}

func handleConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"provider":        resolveProvider(),
		"model":           activeModel(),
		"aiAvailable":     aiAvailable(),
		"websiteURLField": true,
		"fileUploadTypes": []string{"video", "image", "pdf", "doc", "docx", "md", "txt"},
		"version":         "0.1.0",
	})
}

func mustEnv(name string) string {
	v := os.Getenv(name)
	if v == "" {
		log.Fatalf("required env var %s not set", name)
	}
	return v
}
