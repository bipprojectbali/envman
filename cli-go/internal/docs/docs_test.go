package docs

import (
	"strings"
	"testing"
)

func TestRenderSubstitutesServer(t *testing.T) {
	out := Render("https://envman.example.com")
	if strings.Contains(out, "{{SERVER}}") {
		t.Error("placeholder {{SERVER}} not substituted")
	}
	if !strings.Contains(out, "https://envman.example.com") {
		t.Error("server URL not present after render")
	}
}

func TestRenderEmptyServerKeepsPlaceholder(t *testing.T) {
	// Empty server → leave placeholder rather than produce a broken "/api/..." URL.
	out := Render("")
	if !strings.Contains(out, "{{SERVER}}") {
		t.Error("empty server should leave {{SERVER}} placeholder intact")
	}
}

func TestEmbeddedDocsNonEmpty(t *testing.T) {
	// Guards against a missing/empty DOCS.md at embed time.
	if len(strings.TrimSpace(embedded)) < 500 {
		t.Errorf("embedded docs suspiciously short (%d bytes) — generation may have failed", len(embedded))
	}
	if !strings.Contains(embedded, "envman CLI") {
		t.Error("embedded docs missing expected heading")
	}
}
