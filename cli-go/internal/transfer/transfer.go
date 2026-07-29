// Package transfer wraps the user-to-user transfer API (envman transfer and
// the top-level envman recv shortcut, which works without a login).
package transfer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
)

const basePath = "/api/envman/transfers"

// Crockford base32, same as the server: no I, L, O or U, so the code survives
// being read aloud or retyped.
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

const codeLen = 16

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// Item is one transfer as listed in an inbox or sent list.
type Item struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	From     *User  `json:"from"`
	To       *User  `json:"to"`
	ToHint   string `json:"toHint"`
	Filename string `json:"filename"`
	// int64, not int: the server column is BIGINT so a large file would
	// overflow a 32-bit platform's int.
	Size       int64  `json:"size"`
	MimeType   string `json:"mimeType"`
	Label      string `json:"label"`
	Burn       bool   `json:"burn"`
	CodePrefix string `json:"codePrefix"`
	ClaimedAt  string `json:"claimedAt"`
	CreatedAt  string `json:"createdAt"`
	ExpiresAt  string `json:"expiresAt"`
}

type User struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type SendResult struct {
	ID        string `json:"id"`
	ExpiresAt string `json:"expiresAt"`
	Bytes     int    `json:"bytes"`
	// Returned exactly once; the server only stores its hash.
	Code string `json:"code"`
}

type ClaimResult struct {
	Kind    string `json:"kind"`
	Content string `json:"content"`
	// Presigned GET URL, set only for FILE transfers.
	DownloadURL string `json:"downloadUrl"`
	Filename    string `json:"filename"`
	Size        int64  `json:"size"`
	Label       string `json:"label"`
	From        *User  `json:"from"`
}

// IsFile reports whether the claim carries a storage object rather than inline
// text.
func (c *ClaimResult) IsFile() bool { return c.Kind == "FILE" && c.DownloadURL != "" }

type listResponse struct {
	Transfers []Item `json:"transfers"`
}

// SendOptions describes one outgoing transfer. Exactly one of To or Once must
// be set.
type SendOptions struct {
	To         string
	Once       bool
	Content    string
	Label      string
	TTLSeconds int
	Keep       bool
}

// Send creates a transfer. With Once set the result carries a claim code.
func Send(cfg *auth.Config, opts SendOptions) (*SendResult, error) {
	payload := map[string]any{"content": opts.Content}
	if opts.Once {
		payload["once"] = true
	} else {
		payload["to"] = opts.To
	}
	if opts.Label != "" {
		payload["label"] = opts.Label
	}
	if opts.TTLSeconds > 0 {
		payload["ttlHours"] = float64(opts.TTLSeconds) / 3600.0
	}
	if opts.Keep {
		payload["burn"] = false
	}
	var res SendResult
	if err := api.Post(cfg, basePath, payload, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// MaxTextBytes reads the server's text-payload limit, which is also the size
// at which ChooseMode switches a payload to the file path. Falls back to 1 MB
// when the settings endpoint cannot be read, matching the server default.
func MaxTextBytes(cfg *auth.Config) int64 {
	const fallback = 1024 * 1024
	var settings map[string]string
	if err := api.FetchJSON(cfg, "/api/envman/settings", &settings); err != nil {
		return fallback
	}
	kb, err := strconv.ParseInt(settings["transfer_max_text_kb"], 10, 64)
	if err != nil || kb <= 0 {
		return fallback
	}
	return kb * 1024
}

// Inbox lists transfers waiting for the caller.
func Inbox(cfg *auth.Config) ([]Item, error) {
	var res listResponse
	if err := api.FetchJSON(cfg, basePath+"/inbox", &res); err != nil {
		return nil, err
	}
	return res.Transfers, nil
}

// Sent lists transfers the caller has sent.
func Sent(cfg *auth.Config) ([]Item, error) {
	var res listResponse
	if err := api.FetchJSON(cfg, basePath+"/sent", &res); err != nil {
		return nil, err
	}
	return res.Transfers, nil
}

// ClaimByID claims a transfer addressed to the caller.
func ClaimByID(cfg *auth.Config, id string) (*ClaimResult, error) {
	var res ClaimResult
	if err := api.Post(cfg, basePath+"/"+id+"/claim", map[string]any{}, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// Remove revokes (as sender) or declines (as recipient) a transfer.
func Remove(cfg *auth.Config, id string) error {
	return api.Delete(cfg, basePath+"/"+id)
}

// ClaimByCode claims a transfer with a one-time code.
//
// Takes a bare server URL rather than an *auth.Config because this path is for
// people who have never run `envman login` — auth.Resolve() would fail for them
// and no token is required. The code goes in the body, never the URL: the
// server logs and broadcasts request paths.
func ClaimByCode(server, code string) (*ClaimResult, error) {
	payload, err := json.Marshal(map[string]any{"code": code})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest("POST", strings.TrimRight(server, "/")+basePath+"/claim", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
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
		return nil, fmt.Errorf("[envman] %s", msg)
	}
	var res ClaimResult
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// NormalizeCode converts user input to the canonical 16-char code, or returns
// an error. Accepts lowercase, dashes/spaces, an EM- prefix, and the glyphs the
// alphabet excludes (I/L read as 1, O as 0).
func NormalizeCode(raw string) (string, error) {
	s := strings.ToUpper(strings.TrimSpace(raw))
	s = strings.TrimPrefix(s, "EM-")
	s = strings.TrimPrefix(s, "EM")
	s = strings.NewReplacer("-", "", " ", "", "\t", "", "I", "1", "L", "1", "O", "0").Replace(s)
	if len(s) != codeLen {
		return "", fmt.Errorf("[envman] format kode tidak valid (butuh %d karakter)", codeLen)
	}
	for _, ch := range s {
		if !strings.ContainsRune(alphabet, ch) {
			return "", fmt.Errorf("[envman] kode memuat karakter tidak dikenal: %q", ch)
		}
	}
	return s, nil
}

// FormatCode renders a bare code for display.
func FormatCode(code string) string {
	if len(code) != codeLen {
		return code
	}
	return fmt.Sprintf("EM-%s-%s-%s-%s", code[0:4], code[4:8], code[8:12], code[12:16])
}

// IsCode reports whether the argument looks like a claim code rather than an id.
func IsCode(raw string) bool {
	_, err := NormalizeCode(raw)
	return err == nil
}

// IsUUID reports whether the argument is a transfer id.
func IsUUID(raw string) bool {
	return uuidRe.MatchString(strings.TrimSpace(raw))
}
