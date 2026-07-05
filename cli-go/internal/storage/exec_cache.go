package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// execCacheMeta is the sidecar validator stored next to a cached binary.
// A cache entry is fresh only when both fields match the server's DownloadInfo.
type execCacheMeta struct {
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updatedAt"`
}

// execCacheCapBytes bounds total cache size; oldest entries are pruned past it.
const execCacheCapBytes int64 = 500 << 20 // 500 MB

// execCacheBaseOverride, when non-empty, replaces the OS cache dir. Tests set
// this to avoid polluting the real ~/.cache; empty in normal operation.
var execCacheBaseOverride string

// execCacheDir returns ~/.cache/envman/exec (falls back to a temp dir).
func execCacheDir() string {
	base := execCacheBaseOverride
	if base == "" {
		var err error
		base, err = os.UserCacheDir()
		if err != nil || base == "" {
			base = os.TempDir()
		}
	}
	return filepath.Join(base, "envman", "exec")
}

// execCacheKey derives a per-(server, slug, path) file path for the cached
// binary. Collision-safety matters: two different (slug, path) pairs — even
// across projects that share a binary filename like "tts-go" — must never map
// to the same cache file. We hash the NUL-joined (server, slug, path) tuple so
// no separator-flattening ambiguity is possible, then append the basename purely
// for human readability when inspecting the cache dir.
func execCacheKey(server, slug, remotePath string) string {
	h := sha256.Sum256([]byte(server + "\x00" + slug + "\x00" + remotePath))
	digest := hex.EncodeToString(h[:16])
	base := filepath.Base(remotePath)
	// Sanitise the readable suffix (no separators / traversal in a filename).
	base = strings.NewReplacer("/", "_", "\\", "_", "..", "_").Replace(base)
	return filepath.Join(execCacheDir(), digest+"_"+base)
}

// readExecCache returns the cached binary path if its sidecar meta matches want.
// ok=false means a (re)download is needed.
func readExecCache(binPath string, want execCacheMeta) bool {
	if want.UpdatedAt == "" { // server gave no validator — never trust cache
		return false
	}
	data, err := os.ReadFile(binPath + ".meta")
	if err != nil {
		return false
	}
	var got execCacheMeta
	if err := json.Unmarshal(data, &got); err != nil {
		return false
	}
	if got.Size != want.Size || got.UpdatedAt != want.UpdatedAt {
		return false
	}
	// Meta matches — verify the binary itself is present and non-empty.
	fi, err := os.Stat(binPath)
	if err != nil || fi.Size() != want.Size {
		return false
	}
	return true
}

// writeExecCache stores the binary (0700) and its sidecar meta atomically-ish.
func writeExecCache(binPath string, meta execCacheMeta, download func(dst *os.File) error) error {
	if err := os.MkdirAll(filepath.Dir(binPath), 0o700); err != nil {
		return fmt.Errorf("[envman] buat cache dir: %w", err)
	}
	tmp := binPath + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o700)
	if err != nil {
		return fmt.Errorf("[envman] buat cache file: %w", err)
	}
	if err := download(f); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("[envman] tutup cache file: %w", err)
	}
	if err := os.Rename(tmp, binPath); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("[envman] simpan cache: %w", err)
	}
	metaBytes, _ := json.Marshal(meta)
	if err := os.WriteFile(binPath+".meta", metaBytes, 0o600); err != nil {
		return fmt.Errorf("[envman] simpan cache meta: %w", err)
	}
	pruneExecCache()
	return nil
}

// pruneExecCache deletes oldest binaries (by mtime) until total size ≤ cap.
// Best-effort: any error aborts pruning without failing the caller.
func pruneExecCache() {
	root := execCacheDir()
	type entry struct {
		path  string
		size  int64
		mtime int64
	}
	var entries []entry
	var total int64
	_ = filepath.Walk(root, func(p string, fi os.FileInfo, err error) error {
		if err != nil || fi.IsDir() || strings.HasSuffix(p, ".meta") {
			return nil //nolint:nilerr
		}
		entries = append(entries, entry{p, fi.Size(), fi.ModTime().UnixNano()})
		total += fi.Size()
		return nil
	})
	if total <= execCacheCapBytes {
		return
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].mtime < entries[j].mtime })
	for _, e := range entries {
		if total <= execCacheCapBytes {
			break
		}
		os.Remove(e.path)
		os.Remove(e.path + ".meta")
		total -= e.size
	}
}
