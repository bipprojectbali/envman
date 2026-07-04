package storage

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// uploadClient uses a longer timeout for potentially large file uploads.
var uploadClient = &http.Client{Timeout: 5 * time.Minute}

// ProgressFunc is called during streaming operations.
// written = bytes transferred so far, total = expected total (-1 if unknown), elapsed = time since start.
type ProgressFunc func(written, total int64, elapsed time.Duration)

// progressReader wraps an io.Reader and calls fn at most every 100 ms (and always at EOF).
type progressReader struct {
	r        io.Reader
	written  int64
	total    int64
	start    time.Time
	fn       ProgressFunc
	lastCall time.Time
}

func newProgressReader(r io.Reader, total int64, fn ProgressFunc) *progressReader {
	return &progressReader{r: r, total: total, fn: fn, start: time.Now()}
}

func (p *progressReader) Read(buf []byte) (int, error) {
	n, err := p.r.Read(buf)
	p.written += int64(n)
	if p.fn != nil && (err == io.EOF || time.Since(p.lastCall) >= 100*time.Millisecond) {
		p.fn(p.written, p.total, time.Since(p.start))
		p.lastCall = time.Now()
	}
	return n, err
}

// StorageFile is a single file entry from the server list response.
type StorageFile struct {
	ID          string   `json:"id"`
	Path        string   `json:"path"`
	Size        int64    `json:"size"`
	MimeType    string   `json:"mimeType"`
	IsPublic    bool     `json:"isPublic"`
	Tags        []string `json:"tags"`
	Description string   `json:"description"`
}

// ListResult is the response from GET /storage.
type ListResult struct {
	Prefix     string        `json:"prefix"`
	Page       int           `json:"page"`
	PageSize   int           `json:"pageSize"`
	TotalFiles int           `json:"totalFiles"`
	Folders    []string      `json:"folders"`
	Files      []StorageFile `json:"files"`
	Usage      struct {
		UsedBytes  int64 `json:"usedBytes"`
		QuotaBytes int64 `json:"quotaBytes"`
	} `json:"usage"`
}

// UploadResult is the response from POST /storage/upload.
type UploadResult struct {
	OK     bool        `json:"ok"`
	Object StorageFile `json:"object"`
}

// ParseRef splits "project:remote/path" into (slug, remotePath).
// Returns an error if the format is invalid.
func ParseRef(ref string) (slug, remotePath string, err error) {
	idx := strings.IndexByte(ref, ':')
	if idx <= 0 || idx == len(ref)-1 {
		return "", "", fmt.Errorf("[envman] invalid ref %q — expected format: project:path/to/file", ref)
	}
	return ref[:idx], ref[idx+1:], nil
}

// RemotePath returns remotePath if non-empty, otherwise the basename of localFile.
func RemotePath(localFile, remotePath string) string {
	if remotePath != "" {
		return remotePath
	}
	return filepath.Base(localFile)
}

// FmtBytes formats a byte count as a human-readable string (B, KB, MB, GB).
func FmtBytes(n int64) string {
	switch {
	case n >= 1<<30:
		return fmt.Sprintf("%.1f GB", float64(n)/(1<<30))
	case n >= 1<<20:
		return fmt.Sprintf("%.1f MB", float64(n)/(1<<20))
	case n >= 1<<10:
		return fmt.Sprintf("%.1f KB", float64(n)/(1<<10))
	default:
		return fmt.Sprintf("%d B", n)
	}
}

// List fetches the folder/file listing for a project.
func List(cfg *auth.Config, slug, prefix string, page int) (*ListResult, error) {
	apiPath := fmt.Sprintf("/api/envman/projects/%s/storage?prefix=%s&page=%d",
		url.PathEscape(slug), url.QueryEscape(prefix), page)
	var result ListResult
	if err := api.FetchJSON(cfg, apiPath, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// Upload streams a local file to the server without buffering the entire file in memory.
// Uses io.Pipe so the multipart body is written and read concurrently.
// onProgress is optional — pass nil to disable progress reporting.
func Upload(cfg *auth.Config, slug, localFile, remotePath string, onProgress ProgressFunc) (*UploadResult, error) {
	f, err := os.Open(localFile)
	if err != nil {
		return nil, fmt.Errorf("[envman] open %s: %w", localFile, err)
	}
	defer f.Close()

	var fileSize int64 = -1
	if info, serr := f.Stat(); serr == nil {
		fileSize = info.Size()
	}

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	contentType := mw.FormDataContentType() // must be captured before goroutine closes mw

	go func() {
		part, ferr := mw.CreateFormFile("file", filepath.Base(localFile))
		if ferr != nil {
			pw.CloseWithError(ferr)
			return
		}
		var src io.Reader = f
		if onProgress != nil {
			src = newProgressReader(f, fileSize, onProgress)
		}
		if _, ferr = io.Copy(part, src); ferr != nil {
			pw.CloseWithError(ferr)
			return
		}
		if ferr = mw.WriteField("path", remotePath); ferr != nil {
			pw.CloseWithError(ferr)
			return
		}
		mw.Close()
		pw.Close()
	}()

	apiPath := fmt.Sprintf("/api/envman/projects/%s/storage/upload", url.PathEscape(slug))
	req, err := http.NewRequest("POST", cfg.Server+apiPath, pr)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", contentType)

	resp, err := uploadClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("[envman] upload failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

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

	var result UploadResult
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("[envman] parse upload response: %w", err)
	}
	return &result, nil
}

// UploadDir walks localDir recursively and uploads every file under it.
// Each file's remote path is: remotePrefix + "/" + relative-path-from-localDir.
// If remotePrefix is empty, files are uploaded at the top level.
// verbose is an optional writer for per-file progress lines (pass nil to suppress).
func UploadDir(cfg *auth.Config, slug, localDir, remotePrefix string, verbose io.Writer) error {
	var files []string
	err := filepath.WalkDir(localDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			files = append(files, p)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("[envman] scan dir %s: %w", localDir, err)
	}
	if len(files) == 0 {
		return fmt.Errorf("[envman] directory %s is empty", localDir)
	}
	for i, f := range files {
		rel, _ := filepath.Rel(localDir, f)
		remotePath := filepath.ToSlash(rel)
		if remotePrefix != "" {
			remotePath = remotePrefix + "/" + remotePath
		}
		if verbose != nil {
			fmt.Fprintf(verbose, "[%d/%d] %-50s", i+1, len(files), remotePath)
		}
		result, err := Upload(cfg, slug, f, remotePath, nil)
		if err != nil {
			if verbose != nil {
				fmt.Fprintln(verbose, " gagal")
			}
			return fmt.Errorf("[envman] upload %s: %w", rel, err)
		}
		if verbose != nil {
			fmt.Fprintf(verbose, " %s ✓\n", FmtBytes(result.Object.Size))
		}
	}
	if verbose != nil {
		fmt.Fprintf(verbose, "\nSelesai: %d file diupload ke %s/\n", len(files), remotePrefix)
	}
	return nil
}

// DeleteFolder removes all files under the given prefix from the server.
// prefix should not include a trailing slash. Returns the number of deleted files.
func DeleteFolder(cfg *auth.Config, slug, prefix string) (int, error) {
	prefix = strings.TrimRight(prefix, "/")
	if prefix == "" {
		return 0, fmt.Errorf("[envman] folder prefix tidak boleh kosong")
	}
	apiPath := fmt.Sprintf("/api/envman/projects/%s/storage/folder?prefix=%s",
		url.PathEscape(slug), url.QueryEscape(prefix))

	req, err := http.NewRequest(http.MethodDelete, cfg.Server+apiPath, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("[envman] hapus folder gagal: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errPayload struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &errPayload)
		msg := errPayload.Error
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return 0, fmt.Errorf("[envman] %s", msg)
	}

	var result struct {
		OK      bool `json:"ok"`
		Deleted int  `json:"deleted"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, fmt.Errorf("[envman] parse response: %w", err)
	}
	return result.Deleted, nil
}

// Download fetches a file and streams it to out.
// It resolves the presigned URL from the server, then streams directly from MinIO.
// onProgress is optional — pass nil when streaming to stdout (pipe mode).
func Download(cfg *auth.Config, slug, remotePath string, out io.Writer, onProgress ProgressFunc) error {
	apiPath := fmt.Sprintf("/api/envman/projects/%s/storage/download?path=%s",
		url.PathEscape(slug), url.QueryEscape(remotePath))

	var dlResp struct {
		URL string `json:"url"`
	}
	if err := api.FetchJSON(cfg, apiPath, &dlResp); err != nil {
		return err
	}
	if dlResp.URL == "" {
		return fmt.Errorf("[envman] server returned empty download URL")
	}

	// Stream directly from MinIO — no auth header (presigned URL is self-authenticating).
	resp, err := http.Get(dlResp.URL) //nolint:noctx
	if err != nil {
		return fmt.Errorf("[envman] download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("[envman] MinIO returned HTTP %d", resp.StatusCode)
	}

	var total int64 = -1
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		fmt.Sscanf(cl, "%d", &total) //nolint:errcheck
	}

	var src io.Reader = resp.Body
	if onProgress != nil {
		src = newProgressReader(resp.Body, total, onProgress)
	}

	if _, err := io.Copy(out, src); err != nil {
		return fmt.Errorf("[envman] stream failed: %w", err)
	}
	return nil
}
