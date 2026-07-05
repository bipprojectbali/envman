// Package docs embeds the CLI reference as an offline fallback for `envman docs`.
// DOCS.md is generated from src/lib/cli-docs/*.ts (see scripts/gen-cli-docs.ts)
// — do not edit it by hand. The {{SERVER}} placeholder is replaced with the
// user's server URL at render time.
package docs

import (
	_ "embed"
	"strings"
)

//go:embed DOCS.md
var embedded string

// Render returns the embedded CLI docs with {{SERVER}} replaced by server.
// If server is empty, the placeholder is left as-is.
func Render(server string) string {
	if server == "" {
		return embedded
	}
	return strings.ReplaceAll(embedded, "{{SERVER}}", server)
}
