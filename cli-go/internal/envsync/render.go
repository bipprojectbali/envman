package envsync

import (
	"bytes"
	"strings"
	"time"
)

// bannerRule is the horizontal rule framing the block header.
const bannerRule = "# ────────────────────────────────────────"

// RenderBlock renders the append block for the given missing keys, carrying the
// source's group headings and per-key comments over so the additions arrive
// with their original context instead of as a bare list.
//
// Values are written verbatim from RawValue: re-quoting them would be lossy
// (single quotes would become double, an inline "# default" would get swallowed
// into the value), and the source's author already chose its quoting.
//
// nl is the target's newline sequence. Returns "" when there is nothing to add.
func RenderBlock(missing []Missing, sourceLabel, label string, now time.Time, nl string) string {
	if len(missing) == 0 {
		return ""
	}

	var lines []string
	lines = append(lines,
		bannerRule,
		"# Ditambahkan oleh: "+label,
		"# Sumber: "+sourceLabel+" · "+now.Format("2006-01-02"),
		bannerRule,
	)

	prevGroup := ""
	for i, m := range missing {
		groupChanged := m.Group != prevGroup && m.Group != ""
		// Breathing room before a new group, before a documented key, and after
		// the banner. Consecutive bare keys stay tight.
		if i == 0 || groupChanged || len(m.Comments) > 0 {
			lines = append(lines, "")
		}
		if groupChanged {
			lines = append(lines, strings.Split(m.Group, "\n")...)
		}
		if m.Group != "" {
			prevGroup = m.Group
		}
		lines = append(lines, m.Comments...)
		lines = append(lines, m.Key+"="+m.RawValue)
	}

	return strings.Join(lines, nl) + nl
}

// AppendTo splices block onto existing content. The existing bytes are copied
// through untouched and are always a prefix of the result — the target is never
// parsed and re-serialised, so its ordering, comments, quoting and any BOM
// survive exactly.
func AppendTo(existing []byte, block, nl string) string {
	if block == "" {
		return ""
	}
	if len(existing) == 0 {
		return block // new or empty file: no leading blank line
	}

	var b strings.Builder
	b.Grow(len(existing) + len(block) + 2*len(nl))
	b.Write(existing)
	if !bytes.HasSuffix(existing, []byte("\n")) {
		b.WriteString(nl) // target had no trailing newline
	}
	if !endsWithBlankLine(existing) {
		b.WriteString(nl) // exactly one visual blank line as separator
	}
	b.WriteString(block)
	return b.String()
}

// endsWithBlankLine reports whether content already ends in an empty line, so
// AppendTo does not stack a second one.
func endsWithBlankLine(b []byte) bool {
	s := strings.ReplaceAll(string(b), "\r\n", "\n")
	return strings.HasSuffix(s, "\n\n")
}
