package envvars

import (
	"sort"
	"strings"
)

// MaskedValue is the sentinel the server returns for secrets the caller cannot
// reveal (VIEWER access). Such vars are skipped on pull and reported instead.
const MaskedValue = "***"

// FormatEnv renders vars as .env lines (KEY=value), sorted by key. Values that
// need it are double-quoted with \n and " escaped. Keys whose value is the
// masked sentinel are omitted and returned in `masked` for a caller warning.
func FormatEnv(vars map[string]string) (out string, masked []string) {
	keys := make([]string, 0, len(vars))
	for k := range vars {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	for _, k := range keys {
		v := vars[k]
		if v == MaskedValue {
			masked = append(masked, k)
			continue
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(quoteIfNeeded(v))
		b.WriteByte('\n')
	}
	return b.String(), masked
}

// quoteIfNeeded wraps a value in double quotes when it contains characters that
// would break a bare KEY=value line, escaping " and newlines.
func quoteIfNeeded(v string) string {
	if v == "" {
		return ""
	}
	needsQuote := strings.ContainsAny(v, " \t\n\r\"'#=") ||
		strings.HasPrefix(v, " ") || strings.HasSuffix(v, " ")
	if !needsQuote {
		return v
	}
	esc := strings.ReplaceAll(v, `\`, `\\`)
	esc = strings.ReplaceAll(esc, `"`, `\"`)
	esc = strings.ReplaceAll(esc, "\n", `\n`)
	esc = strings.ReplaceAll(esc, "\r", `\r`)
	return `"` + esc + `"`
}
