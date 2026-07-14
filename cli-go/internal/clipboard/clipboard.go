// Package clipboard implements `envman clip`: an account-scoped, single-slot
// clipboard synced across devices via the server (like pbcopy/pbpaste).
package clipboard

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
)

const path = "/api/envman/clip"

// GetResult is the server's clipboard read response.
type GetResult struct {
	Content   string `json:"content"`
	ExpiresAt string `json:"expiresAt"`
}

// SetResult is the server's clipboard write response.
type SetResult struct {
	OK        bool   `json:"ok"`
	ExpiresAt string `json:"expiresAt"`
	Bytes     int    `json:"bytes"`
}

// Get reads the clipboard content.
func Get(cfg *auth.Config) (*GetResult, error) {
	var res GetResult
	if err := api.FetchJSON(cfg, path, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// Set writes content to the clipboard with an optional TTL (0 = server default).
func Set(cfg *auth.Config, content string, ttlSeconds int) (*SetResult, error) {
	payload := map[string]any{"content": content}
	if ttlSeconds > 0 {
		payload["ttlSeconds"] = ttlSeconds
	}
	var res SetResult
	if err := api.Put(cfg, path, payload, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// Clear empties the clipboard.
func Clear(cfg *auth.Config) error {
	return api.Delete(cfg, path)
}

// ParseTTL parses a duration like "30m", "2h", "7d", or a bare number (seconds).
// Returns seconds. Empty string returns 0 (use server default).
func ParseTTL(s string) (int, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, nil
	}
	// Bare number = seconds.
	if n, err := strconv.Atoi(s); err == nil {
		if n <= 0 {
			return 0, fmt.Errorf("[envman] TTL harus > 0")
		}
		return n, nil
	}
	// Support a "d" (day) suffix that time.ParseDuration lacks.
	if strings.HasSuffix(s, "d") {
		days, err := strconv.Atoi(strings.TrimSuffix(s, "d"))
		if err != nil || days <= 0 {
			return 0, fmt.Errorf("[envman] TTL tidak valid %q", s)
		}
		return days * 24 * 60 * 60, nil
	}
	d, err := time.ParseDuration(s)
	if err != nil || d <= 0 {
		return 0, fmt.Errorf("[envman] TTL tidak valid %q — contoh: 30m, 2h, 7d", s)
	}
	return int(d.Seconds()), nil
}

// HumanUntil renders an RFC3339 timestamp as a short "in Xh Ym" relative string.
func HumanUntil(rfc3339 string, now time.Time) string {
	t, err := time.Parse(time.RFC3339, rfc3339)
	if err != nil {
		return rfc3339
	}
	d := t.Sub(now)
	if d <= 0 {
		return "kedaluwarsa"
	}
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	if h > 0 {
		return fmt.Sprintf("%dj %dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
}
