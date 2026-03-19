package captcha

import (
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"saas_pos/internal/config"
)

const verifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

type verifyResponse struct {
	Success bool `json:"success"`
}

// Verify validates a Turnstile token server-side.
// If TURNSTILE_SECRET is empty, verification is skipped (dev mode).
func Verify(token string) bool {
	secret := config.App.TurnstileSecret
	if secret == "" {
		return true // no secret configured → skip (dev mode)
	}
	if token == "" {
		return false
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.PostForm(verifyURL, url.Values{
		"secret":   {secret},
		"response": {token},
	})
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	var result verifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	return result.Success
}
