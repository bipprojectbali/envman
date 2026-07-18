package gists

import (
	"path/filepath"
	"strings"
)

// langByExt maps a lowercase file extension (with dot) to the language label
// stored on a gist file. Mirrors the languages the web editor understands.
var langByExt = map[string]string{
	".ts":         "typescript",
	".tsx":        "typescript",
	".js":         "javascript",
	".jsx":        "javascript",
	".mjs":        "javascript",
	".cjs":        "javascript",
	".go":         "go",
	".py":         "python",
	".rb":         "ruby",
	".rs":         "rust",
	".java":       "java",
	".kt":         "kotlin",
	".c":          "c",
	".h":          "c",
	".cpp":        "cpp",
	".cc":         "cpp",
	".cs":         "csharp",
	".php":        "php",
	".swift":      "swift",
	".sh":         "bash",
	".bash":       "bash",
	".zsh":        "bash",
	".fish":       "bash",
	".sql":        "sql",
	".json":       "json",
	".yaml":       "yaml",
	".yml":        "yaml",
	".toml":       "toml",
	".xml":        "xml",
	".html":       "html",
	".css":        "css",
	".scss":       "scss",
	".md":         "markdown",
	".markdown":   "markdown",
	".dockerfile": "dockerfile",
	".env":        "dotenv",
}

// langByName maps a lowercase full filename (no directory) to a language, for
// files identified by name rather than extension.
var langByName = map[string]string{
	"dockerfile":    "dockerfile",
	"makefile":      "makefile",
	".env":          "dotenv",
	".gitignore":    "gitignore",
	".dockerignore": "gitignore",
}

// DetectLanguage guesses a gist file's language from its name, falling back to
// "plaintext" when nothing matches.
func DetectLanguage(filename string) string {
	base := strings.ToLower(filepath.Base(filename))
	if lang, ok := langByName[base]; ok {
		return lang
	}
	ext := strings.ToLower(filepath.Ext(base))
	if lang, ok := langByExt[ext]; ok {
		return lang
	}
	return "plaintext"
}

// SplitFileRef splits a "title:filename" ref into its title and filename parts,
// mirroring the storage "project:path" convention. It splits on the FIRST colon
// so a filename may itself contain colons. A ref with no colon (a bare title or
// UUID) returns (ref, ""). A UUID is never split — it has no colon — so callers
// resolving by id are unaffected.
func SplitFileRef(ref string) (target, filename string) {
	if looksLikeUUID(ref) {
		return ref, ""
	}
	if i := strings.IndexByte(ref, ':'); i >= 0 {
		return ref[:i], ref[i+1:]
	}
	return ref, ""
}

// looksLikeUUID reports whether s is a canonical 36-char UUID (8-4-4-4-12).
// Used to decide whether a gists arg is an id (use directly) or a title (resolve).
func looksLikeUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if c != '-' {
				return false
			}
			continue
		}
		isHex := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
		if !isHex {
			return false
		}
	}
	return true
}
