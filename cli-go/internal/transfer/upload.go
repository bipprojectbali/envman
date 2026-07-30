package transfer

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/storage"
)

// downloadClient has no overall timeout: a multi-GB body over a slow link must
// not be cut off mid-stream.
var downloadClient = &http.Client{Timeout: 0}

type presignResult struct {
	ID        string `json:"id"`
	UploadURL string `json:"uploadUrl"`
	MimeType  string `json:"mimeType"`
	ExpiresAt string `json:"expiresAt"`
	Code      string `json:"code"`
}

// FileOptions describes an outgoing file transfer.
type FileOptions struct {
	To         string
	Once       bool
	LocalPath  string
	Filename   string
	Size       int64
	MimeType   string
	Label      string
	TTLSeconds int
	Keep       bool
}

// SendFile uploads a file in three steps: ask the server to presign (which
// creates the row), PUT the bytes straight to storage, then confirm so the
// server can verify what actually landed and make it claimable.
//
// The row is created first on purpose — it is the only record that an object
// exists, so an upload that dies midway is still reachable by the TTL sweep
// instead of leaking forever.
func SendFile(cfg *auth.Config, opts FileOptions, onProgress storage.ProgressFunc) (*SendResult, error) {
	payload := map[string]any{
		"filename": opts.Filename,
		"size":     opts.Size,
		"mimeType": opts.MimeType,
	}
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

	var pre presignResult
	if err := api.Post(cfg, basePath+"/presign", payload, &pre); err != nil {
		return nil, err
	}

	f, err := os.Open(opts.LocalPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	// Sends the server's own mimeType back, not a locally re-derived one: the
	// PUT is signed against that exact value.
	if err := storage.PutPresigned(pre.UploadURL, f, opts.Size, pre.MimeType, onProgress); err != nil {
		return nil, err
	}

	var confirmed struct {
		OK   bool   `json:"ok"`
		ID   string `json:"id"`
		Size int64  `json:"size"`
	}
	if err := api.Post(cfg, basePath+"/"+pre.ID+"/confirm", map[string]any{}, &confirmed); err != nil {
		return nil, fmt.Errorf("%w (upload selesai tapi gagal dikonfirmasi — jalankan `envman transfer rm %s` lalu ulangi)", err, pre.ID)
	}

	return &SendResult{
		ID:        pre.ID,
		ExpiresAt: pre.ExpiresAt,
		Bytes:     int(confirmed.Size),
		Code:      pre.Code,
	}, nil
}

// DownloadTo streams a claimed file's presigned URL to disk.
//
// Writes to a temp file in the destination directory and renames on success,
// so an interrupted download never leaves a half-written file that looks
// complete — which matters when the server copy is already burned.
func DownloadTo(url, destPath string, size int64, onProgress storage.ProgressFunc) error {
	resp, err := downloadClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("[envman] gagal mengunduh file (HTTP %d)", resp.StatusCode)
	}

	dir := "."
	if d := parentDir(destPath); d != "" {
		dir = d
	}
	tmp, err := os.CreateTemp(dir, ".envman-recv-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	var src io.Reader = resp.Body
	if onProgress != nil {
		src = storage.NewProgressReader(resp.Body, size, onProgress)
	}
	if _, err := io.Copy(tmp, src); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	// Secrets on a shared machine must not be world-readable.
	if err := os.Chmod(tmpPath, 0600); err != nil {
		return err
	}
	return os.Rename(tmpPath, destPath)
}

func parentDir(p string) string {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '/' {
			return p[:i]
		}
	}
	return ""
}

// ProgressPrinter renders a simple percentage line to stderr, so a large
// transfer does not look frozen.
func ProgressPrinter(label string) storage.ProgressFunc {
	var lastPct int64 = -1
	return func(written, total int64, _ time.Duration) {
		if total <= 0 {
			return
		}
		pct := written * 100 / total
		if pct == lastPct {
			return
		}
		lastPct = pct
		fmt.Fprintf(os.Stderr, "\r[envman] %s %d%%", label, pct)
		if written >= total {
			fmt.Fprintln(os.Stderr)
		}
	}
}
