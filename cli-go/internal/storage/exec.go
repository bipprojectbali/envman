package storage

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// ExitError signals that the executed binary itself exited non-zero.
// The caller should exit with Code without printing a redundant error.
type ExitError struct {
	Code int
}

func (e *ExitError) Error() string {
	return fmt.Sprintf("[envman] program keluar dengan status %d", e.Code)
}

// ExecOptions tunes caching behaviour for Exec.
type ExecOptions struct {
	// Offline runs a cached binary without contacting the server. Errors if no
	// cache entry exists.
	Offline bool
	// NoCache forces a fresh download and skips reading/writing the cache.
	NoCache bool
}

// Exec runs a binary from project storage. By default it caches the binary at
// ~/.cache/envman/exec/<server>/<slug>_<path> and reuses it when the server's
// size+updatedAt validators match — so unchanged binaries run instantly with no
// re-download. The cached file is mode 0700 (never world-readable).
//
// stdin/stdout/stderr are inherited from the parent process. If the program
// exits non-zero, Exec returns an *ExitError carrying that exit code.
func Exec(cfg *auth.Config, slug, remotePath string, args []string, opts ExecOptions) error {
	binPath, err := resolveExecBinary(cfg, slug, remotePath, opts)
	if err != nil {
		return err
	}
	if opts.NoCache {
		// Ephemeral temp file — clean it up after the program exits.
		defer os.RemoveAll(filepath.Dir(binPath))
	}
	return runBinary(binPath, remotePath, args)
}

// resolveExecBinary returns the path to a ready-to-run binary, using the cache
// when possible. For NoCache it downloads to a throwaway temp dir.
func resolveExecBinary(cfg *auth.Config, slug, remotePath string, opts ExecOptions) (string, error) {
	if opts.NoCache {
		dir, err := os.MkdirTemp("", "envman-exec-")
		if err != nil {
			return "", fmt.Errorf("[envman] buat temp dir: %w", err)
		}
		binPath := filepath.Join(dir, filepath.Base(remotePath))
		if err := downloadTo(cfg, slug, remotePath, binPath); err != nil {
			os.RemoveAll(dir)
			return "", err
		}
		return binPath, nil
	}

	binPath := execCacheKey(cfg.Server, slug, remotePath)

	if opts.Offline {
		if _, err := os.Stat(binPath); err != nil {
			return "", fmt.Errorf("[envman] --offline: tidak ada cache untuk %s:%s", slug, remotePath)
		}
		return binPath, nil
	}

	// Ask the server for validators (small request), reuse cache if fresh.
	info, err := resolveDownload(cfg, slug, remotePath)
	if err != nil {
		return "", err
	}
	want := execCacheMeta{Size: info.Size, UpdatedAt: info.UpdatedAt}
	if readExecCache(binPath, want) {
		return binPath, nil // instant path — no byte transfer
	}

	// Stale or missing — download into cache, reusing the already-resolved URL.
	err = writeExecCache(binPath, want, func(dst *os.File) error {
		return streamFrom(info.URL, dst, nil)
	})
	if err != nil {
		return "", err
	}
	return binPath, nil
}

// downloadTo streams a storage file into an existing path (mode already set).
func downloadTo(cfg *auth.Config, slug, remotePath, binPath string) error {
	f, err := os.OpenFile(binPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o700)
	if err != nil {
		return fmt.Errorf("[envman] buat file %s: %w", binPath, err)
	}
	if err := Download(cfg, slug, remotePath, f, nil); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("[envman] tutup file %s: %w", binPath, err)
	}
	return nil
}

// runBinary executes binPath with args, inheriting the parent's stdio.
func runBinary(binPath, remotePath string, args []string) error {
	cmd := exec.Command(binPath, args...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return &ExitError{Code: exitErr.ExitCode()}
		}
		return fmt.Errorf("[envman] jalankan %s: %w", remotePath, err)
	}
	return nil
}
