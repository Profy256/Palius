package main

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

// registerPublishingRoutes exposes blog destinations, publishing, and the
// user-defined destination CRUD that makes the list extensible.
func registerPublishingRoutes(api *gin.RouterGroup) {
	api.GET("/publish/destinations", handleListDestinations)
	api.POST("/publish/blog", handlePublishBlog)
	api.POST("/publish/producthunt-kit", handleProductHuntKit)

	api.GET("/destinations/custom", handleListCustomDestinations)
	api.POST("/destinations/custom", handleSaveCustomDestination)
}

// handleListDestinations returns built-in adapters plus the caller's own
// user-defined targets, so the UI renders one combined approval list.
func handleListDestinations(c *gin.Context) {
	uid := userId(c)
	custom, err := listCustomDestinations(uid)
	if err != nil {
		custom = nil
	}
	c.JSON(http.StatusOK, gin.H{
		"builtIn": BlogDestinations(),
		"custom":  custom,
		"note": "Any site can be added: describe its API as JSON, or log in through " +
			"the embedded browser and map its compose form with CSS selectors.",
	})
}

func handlePublishBlog(c *gin.Context) {
	var req BlogPublishRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if req.Title == "" || req.Body == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title and body are required"})
		return
	}

	uid := userId(c)

	// Split the requested destinations into built-in and user-defined.
	builtIn := map[string]bool{}
	for _, d := range BlogDestinations() {
		builtIn[d.ID] = true
	}
	customByID := map[string]CustomDestination{}
	if list, err := listCustomDestinations(uid); err == nil {
		for _, d := range list {
			customByID[d.ID] = d
		}
	}

	var native []string
	results := []BlogPublishResult{}
	for _, dest := range req.Destinations {
		if builtIn[dest] {
			native = append(native, dest)
			continue
		}
		if d, ok := customByID[dest]; ok {
			if !d.Enabled {
				results = append(results, BlogPublishResult{
					Destination: dest, Status: "skipped", Message: "destination disabled",
				})
				continue
			}
			r := publishToCustom(c.Request.Context(), d, req)
			r.Destination = dest
			results = append(results, r)
			continue
		}
		results = append(results, BlogPublishResult{
			Destination: dest, Status: "failed", Message: "unknown destination",
		})
	}

	if len(native) > 0 {
		nativeReq := req
		nativeReq.Destinations = native
		results = append(results, PublishBlog(c.Request.Context(), nativeReq)...)
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}

// handleProductHuntKit returns a paste-ready launch kit. Product Hunt cannot
// accept launches over its API, so this is the honest deliverable.
func handleProductHuntKit(c *gin.Context) {
	var body struct {
		BlogPublishRequest
		WebsiteURL string `json:"websiteUrl"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	c.JSON(http.StatusOK, buildProductHuntKit(body.BlogPublishRequest, body.WebsiteURL))
}

func handleListCustomDestinations(c *gin.Context) {
	list, err := listCustomDestinations(userId(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"destinations": list})
}

func handleSaveCustomDestination(c *gin.Context) {
	var body struct {
		ID      string          `json:"id"`
		Name    string          `json:"name"`
		Kind    string          `json:"kind"`
		Mode    string          `json:"mode"`
		Config  json.RawMessage `json:"config"`
		Enabled bool            `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and config are required"})
		return
	}
	if body.Mode == "" {
		body.Mode = "api"
	}
	if body.Kind == "" {
		body.Kind = "article"
	}
	if len(body.Config) == 0 {
		body.Config = json.RawMessage(`{}`)
	}

	d := CustomDestination{
		ID: body.ID, UserID: userId(c), Name: body.Name,
		Kind: body.Kind, Mode: body.Mode, Config: body.Config, Enabled: body.Enabled,
	}
	if err := saveCustomDestination(&d); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "destination": d})
}
