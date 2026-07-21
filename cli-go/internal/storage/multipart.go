package storage

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// MultipartThreshold — file lebih besar dari ini memakai chunked multipart upload.
const MultipartThreshold = 50 * 1024 * 1024 // 50 MB
const multipartChunkSize = 50 * 1024 * 1024
const maxRetries = 3

// ─── State file (pause/resume) ─────────────────────────────────────────────

type uploadState struct {
	UploadID   string          `json:"uploadId"`
	MinioKey   string          `json:"minioKey"`
	Slug       string          `json:"slug"`
	RemotePath string          `json:"remotePath"`
	LocalPath  string          `json:"localPath"`
	FileSize   int64           `json:"fileSize"`
	TotalParts int             `json:"totalParts"`
	MimeType   string          `json:"mimeType"`
	Tags       []string        `json:"tags,omitempty"`
	Completed  []completedPart `json:"completed"`
}

type completedPart struct {
	PartNumber int    `json:"partNumber"`
	ETag       string `json:"etag"`
}

func stateFilePath(server, slug, remotePath string) string {
	h := sha256.Sum256([]byte(server + "|" + slug + "|" + remotePath))
	cacheDir, _ := os.UserCacheDir()
	return filepath.Join(cacheDir, "envman", fmt.Sprintf("upload-%x.json", h[:8]))
}

func loadState(server, slug, remotePath string) (*uploadState, error) {
	p := stateFilePath(server, slug, remotePath)
	data, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	var s uploadState
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func saveState(server string, state *uploadState) {
	p := stateFilePath(server, state.Slug, state.RemotePath)
	if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
		return
	}
	data, _ := json.Marshal(state)
	_ = os.WriteFile(p, data, 0600)
}

func deleteState(server string, state *uploadState) {
	os.Remove(stateFilePath(server, state.Slug, state.RemotePath))
}

// ─── Server API calls ──────────────────────────────────────────────────────

type initResponse struct {
	UploadID   string `json:"uploadId"`
	MinioKey   string `json:"minioKey"`
	ChunkSize  int64  `json:"chunkSize"`
	TotalParts int    `json:"totalParts"`
	Error      string `json:"error"`
}

type partResponse struct {
	ETag  string `json:"etag"`
	Error string `json:"error"`
}

func initMultipart(cfg *auth.Config, slug, remotePath string, size int64, mimeType string, noClobber bool) (*uploadState, error) {
	apiURL := fmt.Sprintf("%s/api/envman/projects/%s/storage/multipart/init", cfg.Server, url.PathEscape(slug))
	payload, _ := json.Marshal(map[string]any{"path": remotePath, "size": size, "mimeType": mimeType, "noClobber": noClobber})

	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("[envman] koneksi ke server gagal: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var r initResponse
	_ = json.Unmarshal(body, &r)
	if resp.StatusCode == http.StatusConflict {
		return nil, fmt.Errorf("[envman] %s:%s: %w", slug, remotePath, ErrExists)
	}
	if resp.StatusCode != http.StatusOK {
		if r.Error != "" {
			return nil, fmt.Errorf("[envman] %s", r.Error)
		}
		return nil, fmt.Errorf("[envman] init gagal (%d)", resp.StatusCode)
	}

	return &uploadState{
		UploadID:   r.UploadID,
		MinioKey:   r.MinioKey,
		Slug:       slug,
		RemotePath: remotePath,
		FileSize:   size,
		TotalParts: r.TotalParts,
		MimeType:   mimeType,
	}, nil
}

func uploadChunk(cfg *auth.Config, slug string, state *uploadState, partNum int, chunk []byte) (string, error) {
	params := url.Values{
		"uploadId":   {state.UploadID},
		"minioKey":   {state.MinioKey},
		"partNumber": {fmt.Sprint(partNum)},
	}
	apiURL := fmt.Sprintf("%s/api/envman/projects/%s/storage/multipart/part?%s",
		cfg.Server, url.PathEscape(slug), params.Encode())

	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(chunk))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", "application/octet-stream")
	req.ContentLength = int64(len(chunk))

	resp, err := (&http.Client{Timeout: 10 * time.Minute}).Do(req)
	if err != nil {
		return "", fmt.Errorf("koneksi gagal: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var r partResponse
	_ = json.Unmarshal(body, &r)
	if resp.StatusCode != http.StatusOK {
		if r.Error != "" {
			return "", fmt.Errorf("%s", r.Error)
		}
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return r.ETag, nil
}

func uploadChunkWithRetry(cfg *auth.Config, slug string, state *uploadState, partNum int, chunk []byte) (string, error) {
	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		etag, err := uploadChunk(cfg, slug, state, partNum, chunk)
		if err == nil {
			return etag, nil
		}
		lastErr = err
		if attempt < maxRetries {
			backoff := time.Duration(attempt*attempt) * 2 * time.Second
			fmt.Fprintf(os.Stderr, "\n[envman] chunk %d gagal (%v) — retry dalam %v (percobaan %d/%d)\n",
				partNum, err, backoff, attempt, maxRetries)
			time.Sleep(backoff)
		}
	}
	return "", lastErr
}

func completeMultipart(cfg *auth.Config, slug string, state *uploadState) (*UploadResult, error) {
	apiURL := fmt.Sprintf("%s/api/envman/projects/%s/storage/multipart/complete",
		cfg.Server, url.PathEscape(slug))

	completeBody := map[string]any{
		"path":     state.RemotePath,
		"uploadId": state.UploadID,
		"minioKey": state.MinioKey,
		"parts":    state.Completed,
		"size":     state.FileSize,
		"mimeType": state.MimeType,
	}
	if len(state.Tags) > 0 {
		completeBody["tags"] = state.Tags
	}
	payload, _ := json.Marshal(completeBody)

	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("[envman] complete gagal: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result UploadResult
	if err := json.Unmarshal(body, &result); err != nil || resp.StatusCode != http.StatusOK {
		var e struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &e)
		if e.Error != "" {
			return nil, fmt.Errorf("[envman] %s", e.Error)
		}
		return nil, fmt.Errorf("[envman] complete HTTP %d", resp.StatusCode)
	}
	return &result, nil
}

// ─── UploadMultipart ───────────────────────────────────────────────────────

// UploadMultipart uploads a large file using server-coordinated S3 multipart.
// Each chunk (≤ 50 MB) goes through the envman server → MinIO, bypassing Cloudflare's
// per-request body limit. State is persisted to ~/.cache/envman/upload-*.json so
// interrupted uploads can be resumed by re-running the same command.
func UploadMultipart(cfg *auth.Config, slug, localFile, remotePath string, noClobber bool, tags []string, onProgress ProgressFunc) (*UploadResult, error) {
	f, err := os.Open(localFile)
	if err != nil {
		return nil, fmt.Errorf("[envman] open %s: %w", localFile, err)
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return nil, fmt.Errorf("[envman] stat: %w", err)
	}
	fileSize := info.Size()
	mimeType := detectMIME(localFile)

	// ── Resume detection ──────────────────────────────────────────────────
	var state *uploadState
	if saved, err := loadState(cfg.Server, slug, remotePath); err == nil &&
		saved.LocalPath == localFile && saved.FileSize == fileSize {
		fmt.Fprintf(os.Stderr, "[envman] Melanjutkan upload dari chunk %d/%d...\n",
			len(saved.Completed)+1, saved.TotalParts)
		state = saved
	} else {
		state, err = initMultipart(cfg, slug, remotePath, fileSize, mimeType, noClobber)
		if err != nil {
			return nil, err
		}
		state.LocalPath = localFile
		state.Tags = tags
		saveState(cfg.Server, state)
	}

	// ── Ctrl+C handler: simpan state dan exit bersih ──────────────────────
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigCh
		saveState(cfg.Server, state)
		fmt.Fprintf(os.Stderr,
			"\n[envman] Upload dijeda di chunk %d/%d. Jalankan perintah yang sama untuk melanjutkan.\n",
			len(state.Completed)+1, state.TotalParts)
		os.Exit(1)
	}()
	defer signal.Stop(sigCh)

	// ── Upload chunks ─────────────────────────────────────────────────────
	completedSet := make(map[int]bool, len(state.Completed))
	for _, p := range state.Completed {
		completedSet[p.PartNumber] = true
	}

	var totalUploaded int64
	for _, p := range state.Completed {
		chunk := int64(multipartChunkSize)
		if int64(p.PartNumber)*multipartChunkSize > fileSize {
			chunk = fileSize % multipartChunkSize
		}
		totalUploaded += chunk
	}

	start := time.Now()

	for partNum := 1; partNum <= state.TotalParts; partNum++ {
		if completedSet[partNum] {
			continue
		}

		offset := int64(partNum-1) * multipartChunkSize
		chunkSize := int64(multipartChunkSize)
		if offset+chunkSize > fileSize {
			chunkSize = fileSize - offset
		}

		chunk := make([]byte, chunkSize)
		if _, err := f.ReadAt(chunk, offset); err != nil && err != io.EOF {
			saveState(cfg.Server, state)
			return nil, fmt.Errorf("[envman] baca chunk %d: %w\nJalankan perintah yang sama untuk melanjutkan.", partNum, err)
		}

		if onProgress != nil {
			onProgress(totalUploaded, fileSize, time.Since(start))
		}

		etag, err := uploadChunkWithRetry(cfg, slug, state, partNum, chunk)
		if err != nil {
			saveState(cfg.Server, state)
			return nil, fmt.Errorf(
				"[envman] chunk %d/%d gagal setelah %d percobaan: %v\nJalankan perintah yang sama untuk melanjutkan.",
				partNum, state.TotalParts, maxRetries, err)
		}

		state.Completed = append(state.Completed, completedPart{PartNumber: partNum, ETag: etag})
		totalUploaded += chunkSize
		saveState(cfg.Server, state)

		if onProgress != nil {
			onProgress(totalUploaded, fileSize, time.Since(start))
		}
	}

	// ── Complete ──────────────────────────────────────────────────────────
	result, err := completeMultipart(cfg, slug, state)
	if err != nil {
		return nil, err
	}
	deleteState(cfg.Server, state)
	return result, nil
}
