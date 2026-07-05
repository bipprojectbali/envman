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

// Exec downloads a binary from project storage into a private temp file
// (mode 0700), executes it with the given args, then removes it.
//
// stdin/stdout/stderr are inherited from the parent process so the program
// runs interactively. If the program exits non-zero, Exec returns an
// *ExitError carrying that exit code (the download itself succeeded).
func Exec(cfg *auth.Config, slug, remotePath string, args []string) error {
	// Temp file inside its own 0700 dir — the binary bit alone is not enough,
	// downloaded executables must never be world-readable.
	dir, err := os.MkdirTemp("", "envman-exec-")
	if err != nil {
		return fmt.Errorf("[envman] buat temp dir: %w", err)
	}
	defer os.RemoveAll(dir)

	binPath := filepath.Join(dir, filepath.Base(remotePath))
	f, err := os.OpenFile(binPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o700)
	if err != nil {
		return fmt.Errorf("[envman] buat file %s: %w", binPath, err)
	}

	// Stream download to disk (no progress — stdout belongs to the program).
	if err := Download(cfg, slug, remotePath, f, nil); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("[envman] tutup file %s: %w", binPath, err)
	}

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
