package storage

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// minioUploadClient allows up to 60 min for large direct-to-MinIO uploads.
var minioUploadClient = &http.Client{Timeout: 60 * time.Minute}

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

// presignResponse is returned by POST /storage/presign-upload.
type presignResponse struct {
	UploadURL string `json:"uploadUrl"`
	MinioKey  string `json:"minioKey"`
	Path      string `json:"path"`
	ProjectID string `json:"projectId"`
}

// ErrExists is returned when --no-clobber is set and the target path already
// exists (server responds 409). Callers can detect it via errors.Is.
var ErrExists = errors.New("file sudah ada di storage")

// Upload uploads a local file using a presigned MinIO PUT URL.
// The CLI PUTs directly to MinIO — no reverse-proxy timeout.
// onProgress is optional — pass nil to disable progress reporting.
// noClobber=true makes the server reject an existing path with ErrExists.
func Upload(cfg *auth.Config, slug, localFile, remotePath string, noClobber bool, tags []string, onProgress ProgressFunc) (*UploadResult, error) {
	f, err := os.Open(localFile)
	if err != nil {
		return nil, fmt.Errorf("[envman] open %s: %w", localFile, err)
	}
	defer f.Close()

	var fileSize int64 = -1
	if info, serr := f.Stat(); serr == nil {
		fileSize = info.Size()
	}

	mimeType := detectMIME(localFile)

	// Step 1 — ask server for presigned PUT URL (validates quota, auth, clobber).
	presign, err := requestPresign(cfg, slug, remotePath, fileSize, mimeType, noClobber)
	if err != nil {
		return nil, err
	}

	// Step 2 — PUT directly to MinIO, bypassing the reverse proxy.
	if err := putToMinio(presign.UploadURL, f, fileSize, mimeType, onProgress); err != nil {
		return nil, err
	}

	// Step 3 — tell server to register the object in DB.
	return confirmUpload(cfg, slug, remotePath, presign.MinioKey, fileSize, mimeType, tags)
}

// requestPresign asks the server to issue a presigned MinIO PUT URL.
func requestPresign(cfg *auth.Config, slug, remotePath string, size int64, mimeType string, noClobber bool) (*presignResponse, error) {
	apiPath := fmt.Sprintf("/api/envman/projects/%s/storage/presign-upload", url.PathEscape(slug))
	payload, _ := json.Marshal(map[string]any{"path": remotePath, "size": size, "mimeType": mimeType, "noClobber": noClobber})
	req, err := http.NewRequest("POST", cfg.Server+apiPath, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("[envman] presign request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusConflict {
		return nil, fmt.Errorf("[envman] %s:%s: %w", slug, remotePath, ErrExists)
	}
	if resp.StatusCode != http.StatusOK {
		var e struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &e)
		if e.Error == "" {
			e.Error = http.StatusText(resp.StatusCode)
		}
		return nil, fmt.Errorf("[envman] %s", e.Error)
	}
	var result presignResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("[envman] parse presign response: %w", err)
	}
	return &result, nil
}

// putToMinio uploads directly to a MinIO presigned PUT URL with optional progress.
func putToMinio(uploadURL string, r io.Reader, size int64, mimeType string, onProgress ProgressFunc) error {
	var src io.Reader = r
	if onProgress != nil {
		src = newProgressReader(r, size, onProgress)
	}
	req, err := http.NewRequest("PUT", uploadURL, src)
	if err != nil {
		return err
	}
	req.ContentLength = size
	req.Header.Set("Content-Type", mimeType)

	resp, err := minioUploadClient.Do(req)
	if err != nil {
		return fmt.Errorf("[envman] MinIO upload failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		msg := strings.TrimSpace(string(raw))
		// Strip HTML markup — proxy error pages (Cloudflare, nginx) return full HTML
		if strings.HasPrefix(msg, "<") {
			switch resp.StatusCode {
			case 413:
				msg = "upload ditolak oleh proxy (file terlalu besar). Pastikan MINIO_PRESIGN_BASE_URL diset ke URL direct MinIO yang tidak melewati Cloudflare."
			default:
				msg = fmt.Sprintf("proxy returned HTML error page (status %d)", resp.StatusCode)
			}
		}
		return fmt.Errorf("[envman] MinIO HTTP %d: %s", resp.StatusCode, msg)
	}
	return nil
}

// confirmUpload registers the uploaded object in the server DB.
func confirmUpload(cfg *auth.Config, slug, path, minioKey string, size int64, mimeType string, tags []string) (*UploadResult, error) {
	apiPath := fmt.Sprintf("/api/envman/projects/%s/storage/confirm-upload", url.PathEscape(slug))
	reqBody := map[string]any{
		"path": path, "minioKey": minioKey, "size": size, "mimeType": mimeType,
	}
	if len(tags) > 0 {
		reqBody["tags"] = tags
	}
	payload, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", cfg.Server+apiPath, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("[envman] confirm upload: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		var e struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &e)
		if e.Error == "" {
			e.Error = http.StatusText(resp.StatusCode)
		}
		return nil, fmt.Errorf("[envman] %s", e.Error)
	}
	var result UploadResult
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("[envman] parse confirm response: %w", err)
	}
	return &result, nil
}

// detectMIME guesses a MIME type from the file extension.
func detectMIME(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".pdf":
		return "application/pdf"
	case ".txt", ".md":
		return "text/plain"
	case ".html", ".htm":
		return "text/html"
	case ".json":
		return "application/json"
	case ".yml", ".yaml":
		return "application/yaml"
	case ".sh", ".bash":
		return "application/x-sh"
	case ".tar":
		return "application/x-tar"
	case ".gz", ".tgz":
		return "application/gzip"
	case ".zip":
		return "application/zip"
	case ".mp4":
		return "video/mp4"
	case ".mp3":
		return "audio/mpeg"
	default:
		return "application/octet-stream"
	}
}

// UploadDir walks localDir recursively and uploads every file under it.
// Each file's remote path is: remotePrefix + "/" + relative-path-from-localDir.
// If remotePrefix is empty, files are uploaded at the top level.
// verbose is an optional writer for per-file progress lines (pass nil to suppress).
// With noClobber, files that already exist on the server are skipped (like
// `cp -n`) rather than aborting the whole directory upload.
func UploadDir(cfg *auth.Config, slug, localDir, remotePrefix string, noClobber bool, tags []string, verbose io.Writer) error {
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
	uploaded, skipped := 0, 0
	for i, f := range files {
		rel, _ := filepath.Rel(localDir, f)
		remotePath := filepath.ToSlash(rel)
		if remotePrefix != "" {
			remotePath = remotePrefix + "/" + remotePath
		}
		if verbose != nil {
			fmt.Fprintf(verbose, "[%d/%d] %-50s", i+1, len(files), remotePath)
		}
		result, err := Upload(cfg, slug, f, remotePath, noClobber, tags, nil)
		if err != nil {
			if noClobber && errors.Is(err, ErrExists) {
				skipped++
				if verbose != nil {
					fmt.Fprintln(verbose, " dilewati (sudah ada)")
				}
				continue
			}
			if verbose != nil {
				fmt.Fprintln(verbose, " gagal")
			}
			return fmt.Errorf("[envman] upload %s: %w", rel, err)
		}
		uploaded++
		if verbose != nil {
			fmt.Fprintf(verbose, " %s ✓\n", FmtBytes(result.Object.Size))
		}
	}
	if verbose != nil {
		if skipped > 0 {
			fmt.Fprintf(verbose, "\nSelesai: %d diupload, %d dilewati ke %s/\n", uploaded, skipped, remotePrefix)
		} else {
			fmt.Fprintf(verbose, "\nSelesai: %d file diupload ke %s/\n", uploaded, remotePrefix)
		}
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

// DownloadInfo carries the presigned URL plus cache validators from the server.
// Size/UpdatedAt come from the DB (ProjectStorageObject) and let `storage exec`
// reuse a cached binary without re-downloading unchanged files.
type DownloadInfo struct {
	URL       string `json:"url"`
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updatedAt"`
}

// resolveDownload asks the server for a presigned URL + cache validators.
func resolveDownload(cfg *auth.Config, slug, remotePath string) (*DownloadInfo, error) {
	apiPath := fmt.Sprintf("/api/envman/projects/%s/storage/download?path=%s",
		url.PathEscape(slug), url.QueryEscape(remotePath))
	var info DownloadInfo
	if err := api.FetchJSON(cfg, apiPath, &info); err != nil {
		return nil, err
	}
	if info.URL == "" {
		return nil, fmt.Errorf("[envman] server returned empty download URL")
	}
	return &info, nil
}

// streamFrom streams a presigned URL to out, reporting progress if onProgress != nil.
func streamFrom(presignedURL string, out io.Writer, onProgress ProgressFunc) error {
	// Stream directly from MinIO — no auth header (presigned URL is self-authenticating).
	resp, err := http.Get(presignedURL) //nolint:noctx
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

// Download fetches a file and streams it to out.
// It resolves the presigned URL from the server, then streams directly from MinIO.
// onProgress is optional — pass nil when streaming to stdout (pipe mode).
func Download(cfg *auth.Config, slug, remotePath string, out io.Writer, onProgress ProgressFunc) error {
	info, err := resolveDownload(cfg, slug, remotePath)
	if err != nil {
		return err
	}
	return streamFrom(info.URL, out, onProgress)
}
