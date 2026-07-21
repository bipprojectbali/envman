package storage

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// noClobberServer mocks presign-upload + confirm-upload. When a request sets
// noClobber=true and the path is in `existing`, it replies 409. Successful
// presign points PUT at an in-memory sink so uploads don't need real MinIO.
func newNoClobberServer(t *testing.T, existing map[string]bool) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	base := srv.URL

	mux.HandleFunc("/api/envman/projects/", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Path      string `json:"path"`
			NoClobber bool   `json:"noClobber"`
			MinioKey  string `json:"minioKey"`
			Size      int64  `json:"size"`
		}
		_ = json.Unmarshal(body, &req)

		switch {
		case strings.HasSuffix(r.URL.Path, "/presign-upload"):
			if req.NoClobber && existing[req.Path] {
				w.WriteHeader(http.StatusConflict)
				_ = json.NewEncoder(w).Encode(map[string]any{"error": "File sudah ada", "exists": true})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{
				"uploadUrl": base + "/sink", "minioKey": "proj/" + req.Path, "path": req.Path,
			})
		case strings.HasSuffix(r.URL.Path, "/confirm-upload"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"ok": true,
				"object": map[string]any{
					"id": "x", "path": req.Path, "size": req.Size, "mimeType": "application/octet-stream",
				},
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	mux.HandleFunc("/sink", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	return srv
}

func writeTempFile(t *testing.T, name, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestUploadNoClobberRejectsExisting(t *testing.T) {
	srv := newNoClobberServer(t, map[string]bool{"logo.png": true})
	defer srv.Close()
	cfg := &auth.Config{Server: srv.URL, Token: "t"}
	local := writeTempFile(t, "logo.png", "data")

	_, err := Upload(cfg, "proj", local, "logo.png", true, nil, nil)
	if err == nil {
		t.Fatal("expected ErrExists, got nil")
	}
	if !errors.Is(err, ErrExists) {
		t.Errorf("expected ErrExists, got %v", err)
	}
}

func TestUploadNoClobberAllowsNew(t *testing.T) {
	srv := newNoClobberServer(t, map[string]bool{"logo.png": true})
	defer srv.Close()
	cfg := &auth.Config{Server: srv.URL, Token: "t"}
	local := writeTempFile(t, "fresh.png", "data")

	res, err := Upload(cfg, "proj", local, "fresh.png", true, nil, nil)
	if err != nil {
		t.Fatalf("new path should upload, got %v", err)
	}
	if res.Object.Path != "fresh.png" {
		t.Errorf("path = %q, want fresh.png", res.Object.Path)
	}
}

func TestUploadWithoutNoClobberOverwrites(t *testing.T) {
	// Existing path + noClobber=false → server never 409s → upload proceeds.
	srv := newNoClobberServer(t, map[string]bool{"logo.png": true})
	defer srv.Close()
	cfg := &auth.Config{Server: srv.URL, Token: "t"}
	local := writeTempFile(t, "logo.png", "data")

	if _, err := Upload(cfg, "proj", local, "logo.png", false, nil, nil); err != nil {
		t.Fatalf("default overwrite should succeed, got %v", err)
	}
}

func TestUploadDirNoClobberSkipsExisting(t *testing.T) {
	// dir has a.txt (exists) + b.txt (new) → a skipped, b uploaded, no error.
	srv := newNoClobberServer(t, map[string]bool{"a.txt": true})
	defer srv.Close()
	cfg := &auth.Config{Server: srv.URL, Token: "t"}

	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "b.txt"), []byte("b"), 0o644)

	var log strings.Builder
	if err := UploadDir(cfg, "proj", dir, "", true, nil, &log); err != nil {
		t.Fatalf("UploadDir should skip existing, not fail: %v", err)
	}
	out := log.String()
	if !strings.Contains(out, "dilewati") {
		t.Errorf("expected a skip notice, got: %s", out)
	}
	if !strings.Contains(out, "1 diupload, 1 dilewati") {
		t.Errorf("expected summary '1 diupload, 1 dilewati', got: %s", out)
	}
}
