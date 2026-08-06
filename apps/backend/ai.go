package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// ai.go — provider-agnostic AI layer.
//
// Supported providers (select with AI_PROVIDER):
//   - gemini      (Google)              -> GEMINI_API_KEY / GEMINI_MODEL
//   - openai      (OpenAI)              -> OPENAI_API_KEY / OPENAI_MODEL / OPENAI_BASE_URL
//   - deepseek    (DeepSeek)            -> DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL
//   - openrouter  (OpenRouter)          -> OPENROUTER_API_KEY / OPENROUTER_MODEL / OPENROUTER_BASE_URL
//   - anthropic   (Anthropic Claude)    -> ANTHROPIC_API_KEY / ANTHROPIC_MODEL / ANTHROPIC_BASE_URL
//   - auto                                 pick the first provider whose API key is set
//
// OpenAI-compatible providers (openai, deepseek, openrouter, ollama, any custom
// base URL) share one code path. Set OPENAI_BASE_URL to point at any
// OpenAI-compatible gateway, or use the dedicated *_BASE_URL vars.

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// resolveProvider returns the active provider name or "none".
func resolveProvider() string {
	p := env("AI_PROVIDER", "auto")
	switch p {
	case "auto":
		switch {
		case env("GEMINI_API_KEY", "") != "":
			return "gemini"
		case env("ANTHROPIC_API_KEY", "") != "":
			return "anthropic"
		case env("OPENAI_API_KEY", "") != "":
			return "openai"
		case env("DEEPSEEK_API_KEY", "") != "":
			return "deepseek"
		case env("OPENROUTER_API_KEY", "") != "":
			return "openrouter"
		default:
			return "none"
		}
	case "openai", "gemini", "anthropic", "deepseek", "openrouter", "ollama":
		return p
	default:
		// Treat any unknown value as an OpenAI-compatible provider name.
		return p
	}
}

func aiAvailable() bool {
	return resolveProvider() != "none"
}

func activeModel() string {
	switch resolveProvider() {
	case "gemini":
		return env("GEMINI_MODEL", "gemini-2.0-flash")
	case "anthropic":
		return env("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
	case "openai":
		return env("OPENAI_MODEL", "gpt-4o-mini")
	case "deepseek":
		return env("DEEPSEEK_MODEL", "deepseek-chat")
	case "openrouter":
		return env("OPENROUTER_MODEL", "anthropic/claude-sonnet-4")
	case "ollama":
		return env("OLLAMA_MODEL", "llama3.1")
	default:
		return env("AI_MODEL", "gpt-4o-mini")
	}
}

func activeBaseURL() string {
	switch resolveProvider() {
	case "anthropic":
		return env("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
	case "deepseek":
		return env("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
	case "openrouter":
		return env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
	case "ollama":
		return env("OLLAMA_BASE_URL", "http://localhost:11434/v1")
	default:
		return env("OPENAI_BASE_URL", "https://api.openai.com/v1")
	}
}

// callAI sends a single-turn prompt to the configured provider and returns
// text plus the provider-reported token usage. When jsonMode is true providers
// that support it are forced into JSON output; all providers are additionally
// told to emit JSON via the system prompt.
func callAI(ctx context.Context, system, user string, temperature float64, jsonMode bool) (string, *TokenUsage, error) {
	switch resolveProvider() {
	case "gemini":
		return callGemini(ctx, system, user, temperature, jsonMode)
	case "anthropic":
		return callAnthropic(ctx, system, user, temperature, jsonMode)
	default:
		// OpenAI-compatible path (openai, deepseek, openrouter, ollama, custom).
		return callOpenAICompatible(ctx, system, user, temperature, jsonMode)
	}
}

// ---------------------------------------------------------------- Gemini ----

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiGenConfig struct {
	Temperature      float64 `json:"temperature,omitempty"`
	ResponseMimeType string  `json:"responseMimeType,omitempty"`
	MaxOutputTokens  int     `json:"maxOutputTokens,omitempty"`
}

type geminiRequest struct {
	Contents          []geminiContent  `json:"contents"`
	SystemInstruction *geminiContent   `json:"systemInstruction,omitempty"`
	GenerationConfig  *geminiGenConfig `json:"generationConfig,omitempty"`
}

type geminiUsage struct {
	PromptTokenCount     int `json:"promptTokenCount"`
	CandidatesTokenCount int `json:"candidatesTokenCount"`
	TotalTokenCount      int `json:"totalTokenCount"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	UsageMetadata *geminiUsage `json:"usageMetadata"`
	Error         *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func callGemini(ctx context.Context, system, user string, temperature float64, jsonMode bool) (string, *TokenUsage, error) {
	key := env("GEMINI_API_KEY", "")
	if key == "" {
		return "", nil, fmt.Errorf("GEMINI_API_KEY not set")
	}

	payload := geminiRequest{GenerationConfig: &geminiGenConfig{Temperature: temperature, MaxOutputTokens: 4096}}
	if jsonMode {
		payload.GenerationConfig.ResponseMimeType = "application/json"
	}
	if system != "" {
		payload.SystemInstruction = &geminiContent{Parts: []geminiPart{{Text: system}}}
	}
	payload.Contents = []geminiContent{{Parts: []geminiPart{{Text: user}}}}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", nil, err
	}

	url := "https://generativelanguage.googleapis.com/v1beta/models/" + activeModel() + ":generateContent?key=" + key
	resp, err := doPost(ctx, url, body, map[string]string{"Content-Type": "application/json"})
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("gemini http %d: %s", resp.StatusCode, truncate(string(raw), 300))
	}

	var parsed geminiResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", nil, err
	}
	if parsed.Error != nil {
		return "", nil, fmt.Errorf("gemini error: %s", parsed.Error.Message)
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return "", nil, fmt.Errorf("gemini returned no candidates")
	}
	usage := &TokenUsage{}
	if parsed.UsageMetadata != nil {
		usage.InputTokens = parsed.UsageMetadata.PromptTokenCount
		usage.OutputTokens = parsed.UsageMetadata.CandidatesTokenCount
		usage.TotalTokens = parsed.UsageMetadata.TotalTokenCount
	}
	return strings.TrimSpace(parsed.Candidates[0].Content.Parts[0].Text), usage, nil
}

// ----------------------------------------------------------- Anthropic ------

type anthropicRequest struct {
	Model       string             `json:"model"`
	MaxTokens   int                `json:"max_tokens"`
	Temperature float64            `json:"temperature"`
	System      string             `json:"system,omitempty"`
	Messages    []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Usage *struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func callAnthropic(ctx context.Context, system, user string, temperature float64, jsonMode bool) (string, *TokenUsage, error) {
	key := env("ANTHROPIC_API_KEY", "")
	if key == "" {
		return "", nil, fmt.Errorf("ANTHROPIC_API_KEY not set")
	}

	// Anthropic has no JSON mode; instruct in the prompt instead.
	if jsonMode {
		system += "\nReturn valid JSON only, no markdown fences."
	}
	payload := anthropicRequest{
		Model:       activeModel(),
		MaxTokens:   4096,
		Temperature: temperature,
		System:      system,
		Messages:    []anthropicMessage{{Role: "user", Content: user}},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", nil, err
	}

	resp, err := doPost(ctx, activeBaseURL()+"/v1/messages", body, map[string]string{
		"Content-Type":      "application/json",
		"x-api-key":         key,
		"anthropic-version": "2023-06-01",
	})
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("anthropic http %d: %s", resp.StatusCode, truncate(string(raw), 300))
	}

	var parsed anthropicResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", nil, err
	}
	if parsed.Error != nil {
		return "", nil, fmt.Errorf("anthropic error: %s", parsed.Error.Message)
	}
	var sb strings.Builder
	for _, c := range parsed.Content {
		if c.Type == "text" {
			sb.WriteString(c.Text)
		}
	}
	usage := &TokenUsage{}
	if parsed.Usage != nil {
		usage.InputTokens = parsed.Usage.InputTokens
		usage.OutputTokens = parsed.Usage.OutputTokens
		usage.TotalTokens = parsed.Usage.InputTokens + parsed.Usage.OutputTokens
	}
	return strings.TrimSpace(sb.String()), usage, nil
}

// ------------------------------------------------- OpenAI-compatible ------

type oaiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type oaiChatRequest struct {
	Model          string           `json:"model"`
	Messages       []oaiMessage     `json:"messages"`
	Temperature    float64          `json:"temperature"`
	MaxTokens      int              `json:"max_tokens"`
	ResponseFormat *oaiResponseFmt  `json:"response_format,omitempty"`
}

type oaiResponseFmt struct {
	Type string `json:"type"`
}

type oaiChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// callOpenAICompatible handles openai, deepseek, openrouter, ollama and any
// OpenAI-compatible endpoint (custom OPENAI_BASE_URL).
func callOpenAICompatible(ctx context.Context, system, user string, temperature float64, jsonMode bool) (string, *TokenUsage, error) {
	p := resolveProvider()
	var key string
	switch p {
	case "deepseek":
		key = env("DEEPSEEK_API_KEY", "")
	case "openrouter":
		key = env("OPENROUTER_API_KEY", "")
	case "ollama":
		key = ""
	default:
		key = env("OPENAI_API_KEY", "")
	}
	if key == "" && p != "ollama" {
		return "", nil, fmt.Errorf("missing API key for provider %q", p)
	}

	messages := []oaiMessage{}
	if system != "" {
		messages = append(messages, oaiMessage{Role: "system", Content: system})
	}
	messages = append(messages, oaiMessage{Role: "user", Content: user})

	payload := oaiChatRequest{
		Model:       activeModel(),
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   4096,
	}
	if jsonMode {
		payload.ResponseFormat = &oaiResponseFmt{Type: "json_object"}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", nil, err
	}

	headers := map[string]string{"Content-Type": "application/json"}
	if key != "" {
		headers["Authorization"] = "Bearer " + key
	}

	resp, err := doPost(ctx, activeBaseURL()+"/chat/completions", body, headers)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("%s http %d: %s", p, resp.StatusCode, truncate(string(raw), 300))
	}

	var parsed oaiChatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", nil, err
	}
	if parsed.Error != nil {
		return "", nil, fmt.Errorf("%s error: %s", p, parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return "", nil, fmt.Errorf("%s returned no choices", p)
	}
	usage := &TokenUsage{}
	if parsed.Usage != nil {
		usage.InputTokens = parsed.Usage.PromptTokens
		usage.OutputTokens = parsed.Usage.CompletionTokens
		usage.TotalTokens = parsed.Usage.TotalTokens
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), usage, nil
}

// ----------------------------------------------------------------- helpers -

func doPost(ctx context.Context, url string, body []byte, headers map[string]string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req.Header.Set("User-Agent", "palius-backend")
	client := &http.Client{Timeout: 90 * time.Second}
	return client.Do(req)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
