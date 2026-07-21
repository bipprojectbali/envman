package storage

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// Verifies that Upload forwards --tag values in the confirm-upload payload.
func TestUploadForwardsTags(t *testing.T) {
	var gotTags []string
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	defer srv.Close()

	mux.HandleFunc("/api/envman/projects/", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Path string   `json:"path"`
			Size int64    `json:"size"`
			Tags []string `json:"tags"`
		}
		_ = json.Unmarshal(body, &req)
		switch {
		case strings.HasSuffix(r.URL.Path, "/presign-upload"):
			_ = json.NewEncoder(w).Encode(map[string]string{
				"uploadUrl": srv.URL + "/sink", "minioKey": "proj/" + req.Path, "path": req.Path,
			})
		case strings.HasSuffix(r.URL.Path, "/confirm-upload"):
			gotTags = req.Tags
			_ = json.NewEncoder(w).Encode(map[string]any{
				"ok":     true,
				"object": map[string]any{"id": "x", "path": req.Path, "size": req.Size, "mimeType": "text/plain"},
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	mux.HandleFunc("/sink", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

	cfg := &auth.Config{Server: srv.URL, Token: "t"}
	local := writeTempFile(t, "logo.png", "data")

	if _, err := Upload(cfg, "proj", local, "logo.png", false, []string{"brand", "logo"}, nil); err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if len(gotTags) != 2 || gotTags[0] != "brand" || gotTags[1] != "logo" {
		t.Errorf("confirm-upload tags = %v, want [brand logo]", gotTags)
	}
}
