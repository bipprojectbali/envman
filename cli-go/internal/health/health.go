// Package health scans a local directory tree and reports files whose size
// (lines / characters) approaches or exceeds a limit — useful for finding files
// too large to fit an AI agent's context window.
package health

import (
	"bufio"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Status of a file relative to the configured limits.
type Status string

const (
	OK       Status = "ok"       // < 80% of limit
	Warning  Status = "warning"  // 80–99%
	Critical Status = "critical" // >= 100%
)

// Default limits (universal, language-agnostic).
const (
	DefaultMaxLines = 500
	DefaultMaxChars = 20_000
)

// maxScanBytes caps how much of a file we read; nothing legitimate for context
// purposes is beyond this, and it keeps huge data files cheap to reject.
const maxFileBytes = 5 << 20 // 5 MB

// Directories never traversed (skipped whole, for speed). Covers common
// dependency/build/cache dirs across ecosystems.
var skipDirs = map[string]bool{
	"node_modules": true, ".git": true, "dist": true, "out": true, "build": true,
	"vendor": true, "generated": true, "coverage": true, "target": true,
	".next": true, ".nuxt": true, ".svelte-kit": true, ".turbo": true, ".cache": true,
	".venv": true, "venv": true, "__pycache__": true, ".gradle": true, "Pods": true,
	".idea": true, ".vscode": true,
}

// Binary extensions skipped without reading.
var binaryExt = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".ico": true,
	".pdf": true, ".zip": true, ".gz": true, ".tar": true, ".woff": true, ".woff2": true,
	".ttf": true, ".otf": true, ".eot": true, ".mp4": true, ".mp3": true, ".wav": true,
	".so": true, ".dylib": true, ".dll": true, ".exe": true, ".bin": true, ".wasm": true,
	".lock": true, ".svg": true,
}

// DefaultMaxDepth caps traversal depth as a safety net against pathological
// trees. Legitimate source rarely nests beyond ~15; deep dependency/build dirs
// are already hard-skipped. WalkDir does not follow symlinks, so symlink loops
// are impossible regardless.
const DefaultMaxDepth = 20

// Options controls a scan.
type Options struct {
	Root     string          // directory to scan
	MaxLines int             // 0 → DefaultMaxLines
	MaxChars int             // 0 → DefaultMaxChars
	Exts     map[string]bool // nil/empty → all text files; else whitelist (with leading dot)
	Hidden   bool            // include dot-directories
	MaxDepth int             // -1 unset → DefaultMaxDepth; 0 → unlimited
}

// File is one scanned file's result.
type File struct {
	Path        string
	Lines       int
	Chars       int
	LinePercent int
	CharPercent int
	Status      Status
}

// Summary aggregates a scan.
type Summary struct {
	Total, OK, Warning, Critical int
	SkippedDeep                  int // directories skipped for exceeding MaxDepth
	MaxDepth                     int // the depth limit that was in effect (0 = unlimited)
}

// MaxPercent is the higher of the two ratios — what the status is based on.
func (f File) MaxPercent() int {
	if f.LinePercent > f.CharPercent {
		return f.LinePercent
	}
	return f.CharPercent
}

func statusFor(pct int) Status {
	switch {
	case pct >= 100:
		return Critical
	case pct >= 80:
		return Warning
	default:
		return OK
	}
}

// isBinary reports whether the first chunk of a file contains a NUL byte
// (the standard heuristic for "not text").
func isBinary(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return true // unreadable → treat as skip
	}
	defer f.Close()
	buf := make([]byte, 512)
	n, _ := f.Read(buf)
	for i := 0; i < n; i++ {
		if buf[i] == 0 {
			return true
		}
	}
	return false
}

// countFile returns line and char counts for a text file. Lines are counted the
// way editors show them: number of newlines, plus one final line if the file is
// non-empty and does not end in a newline.
func countFile(path string) (lines, chars int, err error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()
	r := bufio.NewReader(f)
	buf := make([]byte, 32*1024)
	var newlines int
	var lastByte byte
	for {
		n, e := r.Read(buf)
		if n > 0 {
			chars += n
			for i := 0; i < n; i++ {
				if buf[i] == '\n' {
					newlines++
				}
			}
			lastByte = buf[n-1]
		}
		if e != nil {
			break
		}
	}
	lines = newlines
	if chars > 0 && lastByte != '\n' {
		lines++ // trailing partial line
	}
	return lines, chars, nil
}

// Scan walks opts.Root and returns files sorted by MaxPercent descending, plus a summary.
func Scan(opts Options) ([]File, Summary, error) {
	maxLines := opts.MaxLines
	if maxLines <= 0 {
		maxLines = DefaultMaxLines
	}
	maxChars := opts.MaxChars
	if maxChars <= 0 {
		maxChars = DefaultMaxChars
	}
	root := opts.Root
	if root == "" {
		root = "."
	}
	maxDepth := opts.MaxDepth
	if maxDepth < 0 {
		maxDepth = DefaultMaxDepth
	}
	rootDepth := strings.Count(filepath.Clean(root), string(os.PathSeparator))

	var files []File
	skippedDeep := 0
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries, keep going
		}
		name := d.Name()
		if d.IsDir() {
			if path == root {
				return nil
			}
			if skipDirs[name] {
				return filepath.SkipDir
			}
			if !opts.Hidden && strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			if maxDepth > 0 {
				depth := strings.Count(filepath.Clean(path), string(os.PathSeparator)) - rootDepth
				if depth >= maxDepth {
					skippedDeep++
					return filepath.SkipDir
				}
			}
			return nil
		}
		// File filters.
		ext := strings.ToLower(filepath.Ext(name))
		if len(opts.Exts) > 0 {
			if !opts.Exts[ext] {
				return nil
			}
		} else if binaryExt[ext] {
			return nil
		}
		info, e := d.Info()
		if e != nil || info.Size() > maxFileBytes {
			return nil
		}
		if len(opts.Exts) == 0 && isBinary(path) {
			return nil
		}
		lines, chars, e := countFile(path)
		if e != nil {
			return nil
		}
		lp := lines * 100 / maxLines
		cp := chars * 100 / maxChars
		f := File{Path: path, Lines: lines, Chars: chars, LinePercent: lp, CharPercent: cp}
		f.Status = statusFor(f.MaxPercent())
		files = append(files, f)
		return nil
	})
	if err != nil {
		return nil, Summary{}, err
	}

	// Sort by severity (MaxPercent desc).
	for i := 1; i < len(files); i++ {
		for j := i; j > 0 && files[j].MaxPercent() > files[j-1].MaxPercent(); j-- {
			files[j], files[j-1] = files[j-1], files[j]
		}
	}

	sum := Summary{Total: len(files), SkippedDeep: skippedDeep, MaxDepth: maxDepth}
	for _, f := range files {
		switch f.Status {
		case OK:
			sum.OK++
		case Warning:
			sum.Warning++
		case Critical:
			sum.Critical++
		}
	}
	return files, sum, nil
}

// ParseExts turns "ts,tsx,go" into a set of {".ts",".tsx",".go"}. Empty → nil.
func ParseExts(csv string) map[string]bool {
	csv = strings.TrimSpace(csv)
	if csv == "" {
		return nil
	}
	out := map[string]bool{}
	for _, p := range strings.Split(csv, ",") {
		p = strings.TrimSpace(strings.ToLower(p))
		if p == "" {
			continue
		}
		if !strings.HasPrefix(p, ".") {
			p = "." + p
		}
		out[p] = true
	}
	return out
}
