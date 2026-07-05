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
	"sync/atomic"
	"testing"

	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// execServer is a mock of the two download hops with tunable validators and
// call counters, so tests can assert cache behaviour (no re-download).
type execServer struct {
	srv          *httptest.Server
	script       string
	size         int64
	updatedAt    string
	metaRequests int32 // GET /storage/download (validator fetch)
	blobRequests int32 // GET /blob (actual byte transfer)
}

func newExecServerV2(t *testing.T, script string) *execServer {
	t.Helper()
	es := &execServer{script: script, size: int64(len(script)), updatedAt: "2026-07-05T00:00:00.000Z"}
	mux := http.NewServeMux()
	es.srv = httptest.NewServer(mux)
	base := es.srv.URL
	mux.HandleFunc("/api/envman/projects/", func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&es.metaRequests, 1)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"url":       base + "/blob",
			"size":      es.size,
			"updatedAt": es.updatedAt,
		})
	})
	mux.HandleFunc("/blob", func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&es.blobRequests, 1)
		_, _ = w.Write([]byte(es.script))
	})
	return es
}

// isolateCache points the exec cache at a temp dir for the duration of a test.
func isolateCache(t *testing.T) {
	t.Helper()
	execCacheBaseOverride = t.TempDir()
	t.Cleanup(func() { execCacheBaseOverride = "" })
}

func skipWindows(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell-script exec test is POSIX-only")
	}
}

func TestExecRunsBinaryAndPassesArgs(t *testing.T) {
	skipWindows(t)
	isolateCache(t)
	out := t.TempDir() + "/arg.txt"
	es := newExecServerV2(t, fmt.Sprintf("#!/bin/sh\nprintf '%%s' \"$1\" > %s\n", out))
	defer es.srv.Close()

	cfg := &auth.Config{Server: es.srv.URL, Token: "test"}
	if err := Exec(cfg, "tts", "tts-go", []string{"hello-arg"}, ExecOptions{}); err != nil {
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
	skipWindows(t)
	isolateCache(t)
	es := newExecServerV2(t, "#!/bin/sh\nexit 42\n")
	defer es.srv.Close()

	cfg := &auth.Config{Server: es.srv.URL, Token: "test"}
	err := Exec(cfg, "tts", "tts-go", nil, ExecOptions{})
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

// TestExecCachesAndReuses is the core win: a second run with unchanged
// validators must NOT re-download the blob.
func TestExecCachesAndReuses(t *testing.T) {
	skipWindows(t)
	isolateCache(t)
	es := newExecServerV2(t, "#!/bin/sh\nexit 0\n")
	defer es.srv.Close()
	cfg := &auth.Config{Server: es.srv.URL, Token: "test"}

	for i := 0; i < 3; i++ {
		if err := Exec(cfg, "tts", "tts-go", nil, ExecOptions{}); err != nil {
			t.Fatalf("run %d: %v", i, err)
		}
	}
	if got := atomic.LoadInt32(&es.blobRequests); got != 1 {
		t.Errorf("blob downloaded %d times, want 1 (cache should serve runs 2-3)", got)
	}
	if got := atomic.LoadInt32(&es.metaRequests); got != 3 {
		t.Errorf("meta requested %d times, want 3 (validator checked each run)", got)
	}
}

// TestExecRedownloadsOnChange: when updatedAt changes, the cache is stale and
// the blob must be fetched again.
func TestExecRedownloadsOnChange(t *testing.T) {
	skipWindows(t)
	isolateCache(t)
	es := newExecServerV2(t, "#!/bin/sh\nexit 0\n")
	defer es.srv.Close()
	cfg := &auth.Config{Server: es.srv.URL, Token: "test"}

	if err := Exec(cfg, "tts", "tts-go", nil, ExecOptions{}); err != nil {
		t.Fatal(err)
	}
	es.updatedAt = "2026-07-06T00:00:00.000Z" // file replaced on server
	if err := Exec(cfg, "tts", "tts-go", nil, ExecOptions{}); err != nil {
		t.Fatal(err)
	}
	if got := atomic.LoadInt32(&es.blobRequests); got != 2 {
		t.Errorf("blob downloaded %d times, want 2 (stale cache must refetch)", got)
	}
}

// TestExecNoCollisionSameFilename: two different projects sharing the binary
// filename "tts-go" must map to distinct cache entries with distinct content.
func TestExecNoCollisionSameFilename(t *testing.T) {
	skipWindows(t)
	isolateCache(t)
	outA := t.TempDir() + "/a.txt"
	outB := t.TempDir() + "/b.txt"
	esA := newExecServerV2(t, fmt.Sprintf("#!/bin/sh\nprintf projA > %s\n", outA))
	defer esA.srv.Close()
	esB := newExecServerV2(t, fmt.Sprintf("#!/bin/sh\nprintf projB > %s\n", outB))
	defer esB.srv.Close()

	// Same server host is simulated per-httptest, but the real risk is same
	// server + different slug. Point both cfgs at the same server URL is not
	// possible here; instead assert the cache keys differ for the ambiguous
	// (slug, path) pairs that would flatten to the same string.
	if k1, k2 := execCacheKey("http://s", "a_b", "c"), execCacheKey("http://s", "a", "b_c"); k1 == k2 {
		t.Fatalf("cache key collision: %q == %q", k1, k2)
	}
	if k1, k2 := execCacheKey("http://s", "tts", "tts-go"), execCacheKey("http://s", "other", "tts-go"); k1 == k2 {
		t.Fatalf("same-filename cross-project collision: %q == %q", k1, k2)
	}

	// End-to-end: run from project A then B, assert each ran its own script.
	cfgA := &auth.Config{Server: esA.srv.URL, Token: "t"}
	cfgB := &auth.Config{Server: esB.srv.URL, Token: "t"}
	if err := Exec(cfgA, "tts", "tts-go", nil, ExecOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := Exec(cfgB, "other", "tts-go", nil, ExecOptions{}); err != nil {
		t.Fatal(err)
	}
	a, _ := os.ReadFile(outA)
	b, _ := os.ReadFile(outB)
	if string(a) != "projA" || string(b) != "projB" {
		t.Errorf("wrong binary executed: A=%q B=%q", a, b)
	}
}

func TestExecOffline(t *testing.T) {
	skipWindows(t)
	isolateCache(t)
	es := newExecServerV2(t, "#!/bin/sh\nexit 0\n")
	cfg := &auth.Config{Server: es.srv.URL, Token: "test"}

	// Offline with no cache → error.
	if err := Exec(cfg, "tts", "tts-go", nil, ExecOptions{Offline: true}); err == nil {
		t.Fatal("expected error for --offline with empty cache")
	}
	// Warm the cache online.
	if err := Exec(cfg, "tts", "tts-go", nil, ExecOptions{}); err != nil {
		t.Fatal(err)
	}
	// Now offline works without any server contact.
	es.srv.Close()
	if err := Exec(cfg, "tts", "tts-go", nil, ExecOptions{Offline: true}); err != nil {
		t.Fatalf("offline run after warm cache failed: %v", err)
	}
}

func TestExecNoCacheBypasses(t *testing.T) {
	skipWindows(t)
	isolateCache(t)
	es := newExecServerV2(t, "#!/bin/sh\nexit 0\n")
	defer es.srv.Close()
	cfg := &auth.Config{Server: es.srv.URL, Token: "test"}

	for i := 0; i < 2; i++ {
		if err := Exec(cfg, "tts", "tts-go", nil, ExecOptions{NoCache: true}); err != nil {
			t.Fatal(err)
		}
	}
	if got := atomic.LoadInt32(&es.blobRequests); got != 2 {
		t.Errorf("blob downloaded %d times, want 2 (--no-cache always downloads)", got)
	}
	// No cache file should be left behind.
	entries, _ := os.ReadDir(execCacheDir())
	if len(entries) != 0 {
		t.Errorf("--no-cache left %d cache entries, want 0", len(entries))
	}
}

func TestExecDownloadFailureSurfaces(t *testing.T) {
	isolateCache(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	cfg := &auth.Config{Server: srv.URL, Token: "test"}
	err := Exec(cfg, "tts", "tts-go", nil, ExecOptions{})
	if err == nil {
		t.Fatal("expected download error, got nil")
	}
	var exitErr *ExitError
	if errors.As(err, &exitErr) {
		t.Errorf("download failure should not be an ExitError, got %v", err)
	}
	if !strings.Contains(err.Error(), "envman") {
		t.Errorf("unexpected error: %v", err)
	}
}
