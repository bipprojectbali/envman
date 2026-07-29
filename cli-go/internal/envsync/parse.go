// Package envsync compares two local .env-style files and computes which keys
// exist in the source but are missing from the target, rendered as an
// append-only block that preserves the source's ordering, group headings and
// per-key comments.
//
// It never rewrites or reorders the target's existing bytes: the target is
// treated as opaque and the new block is appended after it, so a caller can
// always assert that the result begins with the original content.
//
// Why a separate parser from internal/envparser: that package returns a plain
// map[string]string and discards comments, ordering and blank lines. That is
// enough to answer "which keys are missing" but cannot carry the source's
// grouping over to the target, which is the point of this command.
//
// Group-heading heuristic (the one judgement call here, stated plainly):
//
//	Rule A — a delimiter banner with non-empty inner text is a group heading,
//	         e.g. "# === Database ===" or "# --- App ---". A bare separator
//	         like "# =========" has no inner text and stays a plain comment.
//	Rule B — a comment block terminated by a blank line, attached to no key,
//	         is a group heading (the "# Database\n\nDB_HOST=..." idiom).
//
// Anything else directly above a key is a per-key comment.
package envsync

import (
	"bytes"
	"os"
	"regexp"
	"strings"
)

// bom is the UTF-8 byte order mark. Left on the first line it would poison the
// first key name (the mark would prefix it), so it is stripped while parsing.
// target file's own BOM survives because its bytes are never rewritten.
const bom = "\ufeff"

// maxContinuation caps how many physical lines a single quoted value may span
// before we give up and treat the opening line as a plain entry. Guards against
// an unterminated quote swallowing the rest of the file.
const maxContinuation = 200

// groupBannerRe matches a delimiter-wrapped heading with non-empty inner text,
// e.g. "# === Database ===". The inner text may not start with a delimiter
// character, otherwise a bare rule like "# ==========" would match itself.
var groupBannerRe = regexp.MustCompile(`^#\s*[-=~*]{2,}\s*([^-=~*\s].*?)\s*[-=~*]{2,}\s*$`)

// commentedKeyRe matches a key that has been commented out, e.g. "# DB_HOST=x".
var commentedKeyRe = regexp.MustCompile(`^#\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=`)

// keyRe is the set of key names we accept. Kept deliberately close to what
// internal/envparser tolerates so the two agree on which lines are keys.
var keyRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.-]*$`)

// exportRe strips a leading "export " so "export KEY=v" yields the key "KEY".
var exportRe = regexp.MustCompile(`^export\s+`)

// Entry is one key definition in a .env file, with the comments that document it.
type Entry struct {
	Key      string
	RawValue string   // verbatim bytes after the first '='; never re-quoted
	Value    string   // trimmed + unquoted; for display and comparison only
	Export   bool     // line was "export KEY=..."
	Comments []string // raw comment lines directly above this key
	Group    string   // raw group-heading line in effect at this key
	Line     int      // 1-based line number in the source file
}

// Dup records a key that appears more than once. The last occurrence wins,
// matching internal/envparser's map-overwrite behaviour.
type Dup struct {
	Key   string
	Lines []int
}

// Doc is a parsed .env file that remembers order and comments.
type Doc struct {
	Entries    []Entry
	Index      map[string]int // key -> index into Entries (last occurrence)
	Commented  map[string]int // commented-out key -> line number
	Duplicates []Dup
	HasCRLF    bool
}

// Has reports whether the document defines key as a live (uncommented) entry.
func (d *Doc) Has(key string) bool {
	_, ok := d.Index[key]
	return ok
}

// Get returns the entry for key, if any.
func (d *Doc) Get(key string) (Entry, bool) {
	i, ok := d.Index[key]
	if !ok {
		return Entry{}, false
	}
	return d.Entries[i], true
}

// ParseFile reads and parses a .env-style file.
func ParseFile(path string) (*Doc, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return ParseBytes(b), nil
}

// ParseBytes parses .env-style content.
func ParseBytes(b []byte) *Doc {
	doc := &Doc{Index: map[string]int{}, Commented: map[string]int{}}
	if bytes.Contains(b, []byte("\r\n")) {
		doc.HasCRLF = true
	}

	lines := splitLines(b)
	var pending []string // comment lines awaiting a key
	var currentGroup string
	dupLines := map[string][]int{}

	for i := 0; i < len(lines); i++ {
		raw := lines[i]
		if i == 0 {
			raw = strings.TrimPrefix(raw, bom) // BOM would poison the first key
		}
		trimmed := strings.TrimSpace(raw)

		// Blank line: a comment block that never reached a key is a group (Rule B).
		if trimmed == "" {
			if len(pending) > 0 {
				currentGroup = strings.Join(pending, "\n")
				pending = nil
			}
			continue
		}

		if strings.HasPrefix(trimmed, "#") {
			if groupBannerRe.MatchString(trimmed) { // Rule A
				currentGroup = trimmed
				pending = nil
				continue
			}
			if m := commentedKeyRe.FindStringSubmatch(trimmed); m != nil {
				if _, seen := doc.Commented[m[1]]; !seen {
					doc.Commented[m[1]] = i + 1
				}
			}
			pending = append(pending, trimmed)
			continue
		}

		body := trimmed
		export := false
		if exportRe.MatchString(body) {
			body = exportRe.ReplaceAllString(body, "")
			export = true
		}

		idx := strings.IndexByte(body, '=')
		if idx < 0 {
			pending = nil // junk line must not leak its comments onto the next key
			continue
		}
		key := strings.TrimSpace(body[:idx])
		if !keyRe.MatchString(key) {
			pending = nil
			continue
		}

		rawValue := body[idx+1:]
		// A quoted value may span physical lines; consume until it closes so the
		// verbatim copy round-trips.
		if consumed, joined, ok := consumeQuoted(lines, i, rawValue); ok {
			rawValue = joined
			i = consumed
		}

		entry := Entry{
			Key:      key,
			RawValue: rawValue,
			Value:    stripQuotes(strings.TrimSpace(rawValue)),
			Export:   export,
			Comments: append([]string(nil), pending...),
			Group:    currentGroup,
			Line:     i + 1,
		}
		pending = nil

		dupLines[key] = append(dupLines[key], entry.Line)
		if prev, exists := doc.Index[key]; exists {
			// Last wins: drop the earlier entry, keep order stable for the rest.
			doc.Entries = append(doc.Entries[:prev], doc.Entries[prev+1:]...)
			for k, at := range doc.Index {
				if at > prev {
					doc.Index[k] = at - 1
				}
			}
		}
		doc.Entries = append(doc.Entries, entry)
		doc.Index[key] = len(doc.Entries) - 1
	}

	for _, e := range doc.Entries {
		if ls := dupLines[e.Key]; len(ls) > 1 {
			doc.Duplicates = append(doc.Duplicates, Dup{Key: e.Key, Lines: ls})
		}
	}
	return doc
}

// consumeQuoted joins physical lines when a value opens a quote that does not
// close on the same line. Returns the index of the last consumed line.
func consumeQuoted(lines []string, start int, rawValue string) (int, string, bool) {
	v := strings.TrimSpace(rawValue)
	if len(v) == 0 {
		return start, rawValue, false
	}
	q := v[0]
	if q != '"' && q != '\'' {
		return start, rawValue, false
	}
	if closesQuote(v[1:], q) {
		return start, rawValue, false
	}
	joined := rawValue
	for j := start + 1; j < len(lines) && j-start <= maxContinuation; j++ {
		joined += "\n" + lines[j]
		if closesQuote(lines[j], q) {
			return j, joined, true
		}
	}
	return start, rawValue, false // unterminated: leave the file alone
}

// closesQuote reports whether s contains an unescaped closing quote q.
func closesQuote(s string, q byte) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' {
			i++
			continue
		}
		if s[i] == q {
			return true
		}
	}
	return false
}

// splitLines splits on \n and strips a trailing \r, so CRLF files parse the
// same as LF ones. A trailing newline does not produce a final empty line.
func splitLines(b []byte) []string {
	s := strings.ReplaceAll(string(b), "\r\n", "\n")
	s = strings.TrimSuffix(s, "\n")
	if s == "" {
		return nil
	}
	return strings.Split(s, "\n")
}

// stripQuotes unwraps matching surrounding quotes, mirroring envparser so the
// two packages agree on a value's logical content.
func stripQuotes(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}
