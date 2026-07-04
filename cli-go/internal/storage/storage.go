package storage

import (
	"encoding/json"
	"fmt"
	"io"
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
func Upload(cfg *auth.Config, slug, localFile, remotePath string) (*UploadResult, error) {
	f, err := os.Open(localFile)
	if err != nil {
		return nil, fmt.Errorf("[envman] open %s: %w", localFile, err)
	}
	defer f.Close()

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	contentType := mw.FormDataContentType() // must be captured before goroutine closes mw

	go func() {
		part, ferr := mw.CreateFormFile("file", filepath.Base(localFile))
		if ferr != nil {
			pw.CloseWithError(ferr)
			return
		}
		if _, ferr = io.Copy(part, f); ferr != nil {
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

// Download fetches a file and streams it to out.
// It resolves the presigned URL from the server, then streams directly from MinIO.
// If out is os.Stdout, the binary stream goes directly — suitable for piping.
func Download(cfg *auth.Config, slug, remotePath string, out io.Writer) error {
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

	if _, err := io.Copy(out, resp.Body); err != nil {
		return fmt.Errorf("[envman] stream failed: %w", err)
	}
	return nil
}
