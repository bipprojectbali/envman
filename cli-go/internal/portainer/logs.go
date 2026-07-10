package portainer

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// LogLine is one parsed log entry from the snapshot endpoint.
type LogLine struct {
	Stream    string `json:"stream"`
	Timestamp string `json:"timestamp"`
	Message   string `json:"message"`
}

// LogsSnapshot fetches the last `tail` lines (one-shot, no follow).
func LogsSnapshot(cfg *auth.Config, t Target, containerID string, tail int) ([]LogLine, error) {
	path := fmt.Sprintf("%s/logs/%s?tail=%d", t.base(), containerID, tail)
	var out struct {
		Lines []LogLine `json:"lines"`
	}
	if err := api.FetchJSON(cfg, path, &out); err != nil {
		return nil, err
	}
	return out.Lines, nil
}

// LogsFollow opens the SSE stream endpoint and writes each log line to w until
// the server closes the stream or the user interrupts (Ctrl+C). Interrupt
// cancels the request context, which closes the connection and lets the server
// abort its upstream fetch to Docker.
func LogsFollow(cfg *auth.Config, t Target, containerID string, tail int, w io.Writer) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	path := fmt.Sprintf("%s/logs/%s/stream?tail=%d", t.base(), containerID, tail)
	req, err := http.NewRequestWithContext(ctx, "GET", cfg.Server+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Accept", "text/event-stream")

	// No client timeout: a follow stream is intentionally long-lived.
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil // interrupted — clean exit
		}
		return fmt.Errorf("[envman] gagal membuka stream: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden {
		return &api.APIError{Status: 403, Message: "[envman] Akses ditolak untuk env ini"}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("[envman] stream error HTTP %d", resp.StatusCode)
	}

	// Parse SSE: `event: <stream>` lines carry stdout/stderr; `data: <msg>` the
	// payload; `:` comment lines are heartbeats we ignore. Blank line ends event.
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			fmt.Fprintln(w, strings.TrimPrefix(line, "data: "))
		}
		// event:/blank/comment lines are structural — nothing to print.
	}
	if err := scanner.Err(); err != nil && ctx.Err() == nil {
		return fmt.Errorf("[envman] stream terputus: %w", err)
	}
	return nil
}
