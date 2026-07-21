package main

import (
	"sort"
	"strings"
	"testing"
)

func TestPbcopyShims(t *testing.T) {
	shims := pbcopyShims()

	t.Run("has both shims", func(t *testing.T) {
		names := make([]string, 0, len(shims))
		for n := range shims {
			names = append(names, n)
		}
		sort.Strings(names)
		if len(names) != 2 || names[0] != "pbcopy" || names[1] != "pbpaste" {
			t.Errorf("shim names = %v, want [pbcopy pbpaste]", names)
		}
	})

	t.Run("pbcopy is an OSC 52 bash script", func(t *testing.T) {
		s := shims["pbcopy"]
		if !strings.HasPrefix(s, "#!/usr/bin/env bash") {
			t.Errorf("pbcopy missing bash shebang")
		}
		if !strings.Contains(s, `\033]52;c;`) {
			t.Errorf("pbcopy missing OSC 52 sequence")
		}
		if !strings.Contains(s, "base64") {
			t.Errorf("pbcopy should base64-encode the payload")
		}
		// tmux and screen passthrough wrapping
		if !strings.Contains(s, "$TMUX") || !strings.Contains(s, `\033Ptmux;`) {
			t.Errorf("pbcopy missing tmux passthrough")
		}
		if !strings.Contains(s, "screen") {
			t.Errorf("pbcopy missing screen passthrough")
		}
		// writes to the terminal, with stdout fallback
		if !strings.Contains(s, "/dev/tty") {
			t.Errorf("pbcopy should target /dev/tty")
		}
	})

	t.Run("pbpaste queries clipboard and decodes", func(t *testing.T) {
		s := shims["pbpaste"]
		if !strings.HasPrefix(s, "#!/usr/bin/env bash") {
			t.Errorf("pbpaste missing bash shebang")
		}
		if !strings.Contains(s, `\033]52;c;?`) {
			t.Errorf("pbpaste missing OSC 52 query")
		}
		if !strings.Contains(s, "base64 -d") {
			t.Errorf("pbpaste should base64-decode the reply")
		}
	})
}

func TestPathContains(t *testing.T) {
	t.Setenv("PATH", "/usr/bin:/home/me/.local/bin:/bin")
	if !pathContains("/home/me/.local/bin") {
		t.Errorf("expected PATH to contain /home/me/.local/bin")
	}
	if pathContains("/nope") {
		t.Errorf("did not expect /nope in PATH")
	}
}
