package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/bipprojectbali/envman/cli/internal/clipout"
)

// Shared file-output helpers. They live here rather than in env_cmd.go because
// clip_cmd.go and gists_push_cmd.go use them too — a cross-file dependency
// inside package main that was invisible from either side.

// atomicWrite writes content to a temp file in the same dir then renames it,
// so an existing file is never left half-written on error.
func atomicWrite(path, content string) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".envman-pull-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpPath, 0600); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func countLines(s string) int {
	if s == "" {
		return 0
	}
	return strings.Count(s, "\n")
}

// copyToClipboard sends content to the OS clipboard and reports how it got
// there, so a secret never lands in terminal scrollback.
//
// label names the thing copied, e.g. "DB_PASSWORD" or "isi kiriman".
func copyToClipboard(content, label string) (clipout.Method, error) {
	method, err := clipout.Copy([]byte(content), clipout.Options{})
	if err != nil {
		return "", err
	}
	fmt.Fprintf(os.Stderr, "[envman] %s disalin ke clipboard (%d karakter, via %s)\n",
		label, len(content), method)
	// OSC 52 is fire-and-forget: a terminal that ignores it is indistinguishable
	// from success, so say so rather than implying a guarantee.
	if !method.Confirmed() {
		fmt.Fprintln(os.Stderr,
			"[envman] catatan: OSC 52 tak bisa dikonfirmasi — tempel untuk memastikan."+
				" Di tmux perlu: set -g set-clipboard on")
	}
	return method, nil
}
