package cache

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Entry struct {
	ETag string `json:"etag"`
	Body string `json:"body"`
}

func cacheDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "envman", "cache")
}

func cacheKey(server, path string) string {
	h := sha256.Sum256([]byte(server + "\n" + path))
	return base64.RawURLEncoding.EncodeToString(h[:]) + ".json"
}

func cachePath(server, path string) string {
	return filepath.Join(cacheDir(), cacheKey(server, path))
}

func Get(server, path string) (*Entry, error) {
	data, err := os.ReadFile(cachePath(server, path))
	if err != nil {
		return nil, err
	}
	var e Entry
	if err := json.Unmarshal(data, &e); err != nil {
		return nil, err
	}
	return &e, nil
}

func Set(server, path string, e *Entry) error {
	dir := cacheDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	data, err := json.Marshal(e)
	if err != nil {
		return err
	}
	dst := cachePath(server, path)
	tmp := dst + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	if err := os.Rename(tmp, dst); err != nil {
		os.Remove(tmp)
		return err
	}
	pruneIfNeeded()
	return nil
}

func pruneIfNeeded() {
	dir := cacheDir()
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) <= 200 {
		return
	}
	type fi struct {
		name  string
		mtime int64
	}
	var files []fi
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		files = append(files, fi{e.Name(), info.ModTime().UnixNano()})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].mtime < files[j].mtime })
	toDelete := len(files) - 200
	for i := 0; i < toDelete && i < len(files); i++ {
		_ = os.Remove(filepath.Join(dir, files[i].name))
	}
}

// ETag returns the cached ETag for a path, or "".
func ETag(server, path string) string {
	e, err := Get(server, path)
	if err != nil || e == nil {
		return ""
	}
	return e.ETag
}

// FormatKey for debugging.
func FormatKey(server, path string) string {
	return fmt.Sprintf("%s/%s", server, path)
}
