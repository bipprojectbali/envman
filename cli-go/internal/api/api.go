package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/cache"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

type DeniedEnv struct {
	Project string `json:"project"`
	Env     string `json:"env"`
}

type APIError struct {
	Status  int
	Message string
	Denied  []DeniedEnv
}

func (e *APIError) Error() string { return e.Message }

// Fetch makes an authenticated API call. Returns body bytes.
// If useCache=true, sends If-None-Match and returns cached body on 304.
func Fetch(cfg *auth.Config, path string, useCache bool) ([]byte, error) {
	url := cfg.Server + path

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)

	if useCache {
		if etag := cache.ETag(cfg.Server, path); etag != "" {
			req.Header.Set("If-None-Match", etag)
		}
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if useCache && resp.StatusCode == http.StatusNotModified {
		e, err := cache.Get(cfg.Server, path)
		if err == nil && e != nil {
			return []byte(e.Body), nil
		}
		// Cache miss despite 304 — re-fetch without conditional
		return fetchFresh(cfg, path)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode == http.StatusForbidden {
		// Parse deniedEnvs for better error message
		var payload struct {
			Error      string      `json:"error"`
			DeniedEnvs []DeniedEnv `json:"deniedEnvs"`
		}
		_ = json.Unmarshal(body, &payload)
		if len(payload.DeniedEnvs) > 0 {
			var names []string
			for _, d := range payload.DeniedEnvs {
				names = append(names, d.Project+":"+d.Env)
			}
			return nil, &APIError{
				Status:  403,
				Message: fmt.Sprintf("[envman] Akses ditolak untuk env: %s", strings.Join(names, ", ")),
				Denied:  payload.DeniedEnvs,
			}
		}
		return nil, &APIError{Status: 403, Message: "[envman] Forbidden"}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var payload struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &payload)
		msg := payload.Error
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return nil, &APIError{Status: resp.StatusCode, Message: fmt.Sprintf("[envman] API error %d: %s", resp.StatusCode, msg)}
	}

	if useCache {
		if etag := resp.Header.Get("ETag"); etag != "" {
			_ = cache.Set(cfg.Server, path, &cache.Entry{ETag: etag, Body: string(body)})
		}
	}

	return body, nil
}

func fetchFresh(cfg *auth.Config, path string) ([]byte, error) {
	req, err := http.NewRequest("GET", cfg.Server+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("[envman] HTTP %d", resp.StatusCode)
	}
	if etag := resp.Header.Get("ETag"); etag != "" {
		_ = cache.Set(cfg.Server, path, &cache.Entry{ETag: etag, Body: string(body)})
	}
	return body, nil
}

// FetchJSON is a convenience wrapper that unmarshals into v.
func FetchJSON(cfg *auth.Config, path string, v any) error {
	body, err := Fetch(cfg, path, false)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, v)
}

// Post sends a JSON POST request and unmarshals the response into v.
func Post(cfg *auth.Config, path string, payload any, v any) error {
	return sendJSON(cfg, "POST", path, payload, v)
}

// Put sends a JSON PUT request and unmarshals the response into v.
func Put(cfg *auth.Config, path string, payload any, v any) error {
	return sendJSON(cfg, "PUT", path, payload, v)
}

// sendJSON marshals payload, sends it with the given method, and unmarshals the
// response into v (nil to ignore). Non-2xx responses become an [envman]-prefixed error.
func sendJSON(cfg *auth.Config, method, path string, payload any, v any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(method, cfg.Server+path, strings.NewReader(string(data)))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errPayload struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &errPayload)
		msg := errPayload.Error
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return fmt.Errorf("[envman] %s", msg)
	}
	if v != nil {
		return json.Unmarshal(body, v)
	}
	return nil
}
