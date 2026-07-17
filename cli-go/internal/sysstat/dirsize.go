package sysstat

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
)

// DirReport is the disk footprint of a directory tree: its total size plus a
// per-top-level-entry breakdown, so an operator can see at a glance which
// subdir (node_modules, .git, dist, …) is making a project balloon.
type DirReport struct {
	Root       string     `json:"root"`
	TotalBytes uint64     `json:"totalBytes"`
	FileCount  int        `json:"fileCount"`
	Children   []DirEntry `json:"children"` // top-level entries, largest first
}

// DirEntry is one immediate child of the scanned root (a subdir or a file),
// with the aggregate size of everything beneath it.
type DirEntry struct {
	Name      string `json:"name"`
	Bytes     uint64 `json:"bytes"`
	IsDir     bool   `json:"isDir"`
	FileCount int    `json:"fileCount"`
}

// DirUsage walks root and aggregates apparent file sizes per top-level entry.
// Symlinks are not followed (WalkDir does not descend them), so cycles are safe;
// unreadable entries are skipped rather than aborting the whole scan.
func DirUsage(root string) (DirReport, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return DirReport{}, err
	}
	rep := DirReport{Root: root}
	// Aggregate by top-level segment relative to root.
	type agg struct {
		bytes uint64
		files int
		isDir bool
	}
	byTop := map[string]*agg{}

	walkErr := filepath.WalkDir(abs, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			// Unreadable dir/file (permissions, races) — skip it, keep going.
			if d != nil && d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if path == abs || d.IsDir() {
			return nil // directories contribute via their files, not themselves
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		size := uint64(info.Size())
		rep.TotalBytes += size
		rep.FileCount++

		// Determine the top-level segment this file lives under.
		rel, err := filepath.Rel(abs, path)
		if err != nil {
			return nil
		}
		top := rel
		if i := indexSep(rel); i >= 0 {
			top = rel[:i]
		}
		a := byTop[top]
		if a == nil {
			a = &agg{isDir: top != rel} // isDir=false means the file sits directly in root
			byTop[top] = a
		}
		a.bytes += size
		a.files++
		return nil
	})
	if walkErr != nil {
		return DirReport{}, walkErr
	}

	for name, a := range byTop {
		rep.Children = append(rep.Children, DirEntry{
			Name:      name,
			Bytes:     a.bytes,
			IsDir:     a.isDir,
			FileCount: a.files,
		})
	}
	// Largest first; ties broken by name for a stable order.
	sort.Slice(rep.Children, func(i, j int) bool {
		if rep.Children[i].Bytes != rep.Children[j].Bytes {
			return rep.Children[i].Bytes > rep.Children[j].Bytes
		}
		return rep.Children[i].Name < rep.Children[j].Name
	})
	return rep, nil
}

// indexSep returns the index of the first path separator in s, or -1.
func indexSep(s string) int {
	for i := 0; i < len(s); i++ {
		if s[i] == os.PathSeparator || s[i] == '/' {
			return i
		}
	}
	return -1
}
