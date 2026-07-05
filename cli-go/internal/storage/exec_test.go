package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"strings"
	"testing"

	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// newExecServer returns an httptest server that mimics the two hops of a
// storage download: the JSON presign endpoint, then the raw content at /blob.
// script is written verbatim as the file body.
func newExecServer(t *testing.T, script string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	var base string
	srv := httptest.NewServer(mux)
	base = srv.URL
	mux.HandleFunc("/api/envman/projects/", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"url": base + "/blob"})
	})
	mux.HandleFunc("/blob", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(script))
	})
	return srv
}

func TestExecRunsBinaryAndPassesArgs(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell-script exec test is POSIX-only")
	}
	// Script echoes its first arg to a file so we can assert arg passthrough.
	out := t.TempDir() + "/arg.txt"
	script := fmt.Sprintf("#!/bin/sh\nprintf '%%s' \"$1\" > %s\n", out)
	srv := newExecServer(t, script)
	defer srv.Close()

	cfg := &auth.Config{Server: srv.URL, Token: "test"}
	if err := Exec(cfg, "tts", "tts-go", []string{"hello-arg"}); err != nil {
		t.Fatalf("Exec returned error: %v", err)
	}

	got, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("read arg file: %v", err)
	}
	if string(got) != "hello-arg" {
		t.Errorf("arg passthrough = %q, want %q", string(got), "hello-arg")
	}
}

func TestExecPropagatesExitCode(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell-script exec test is POSIX-only")
	}
	srv := newExecServer(t, "#!/bin/sh\nexit 42\n")
	defer srv.Close()

	cfg := &auth.Config{Server: srv.URL, Token: "test"}
	err := Exec(cfg, "tts", "tts-go", nil)
	if err == nil {
		t.Fatal("expected ExitError, got nil")
	}
	var exitErr *ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("expected *ExitError, got %T: %v", err, err)
	}
	if exitErr.Code != 42 {
		t.Errorf("exit code = %d, want 42", exitErr.Code)
	}
}

func TestExecCleansUpTempFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell-script exec test is POSIX-only")
	}
	// Script leaks the path of its own executable ($0) so we can assert it's gone.
	out := t.TempDir() + "/self.txt"
	script := fmt.Sprintf("#!/bin/sh\nprintf '%%s' \"$0\" > %s\n", out)
	srv := newExecServer(t, script)
	defer srv.Close()

	cfg := &auth.Config{Server: srv.URL, Token: "test"}
	if err := Exec(cfg, "tts", "tts-go", nil); err != nil {
		t.Fatalf("Exec returned error: %v", err)
	}

	selfPath, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("read self path: %v", err)
	}
	if !strings.Contains(string(selfPath), "envman-exec-") {
		t.Errorf("temp path %q does not look like an envman temp file", string(selfPath))
	}
	if _, err := os.Stat(string(selfPath)); !os.IsNotExist(err) {
		t.Errorf("temp binary %q was not cleaned up (stat err = %v)", string(selfPath), err)
	}
}

func TestExecDownloadFailureSurfaces(t *testing.T) {
	// Server returns 500 on the presign endpoint — Exec must surface an error,
	// not a bogus ExitError.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	cfg := &auth.Config{Server: srv.URL, Token: "test"}
	err := Exec(cfg, "tts", "tts-go", nil)
	if err == nil {
		t.Fatal("expected download error, got nil")
	}
	var exitErr *ExitError
	if errors.As(err, &exitErr) {
		t.Errorf("download failure should not be an ExitError, got %v", err)
	}
}
