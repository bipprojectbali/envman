package main

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/bipprojectbali/envman/cli/internal/sysstat"
)

func TestNotableSessions(t *testing.T) {
	self := sysstat.SessionInfo{User: "bip", Terminal: "console"}
	selfRemote := sysstat.SessionInfo{User: "bip", Terminal: "ttys0", Host: "10.0.0.5"}
	other := sysstat.SessionInfo{User: "root", Terminal: "ttys1"}

	// Lone local self-session → suppressed (user line already shows it).
	if got := notableSessions([]sysstat.SessionInfo{self}, "bip"); got != nil {
		t.Errorf("lone self session should be suppressed, got %v", got)
	}
	// Empty → nil.
	if got := notableSessions(nil, "bip"); got != nil {
		t.Errorf("empty → %v, want nil", got)
	}
	// Multiple sessions → kept.
	if got := notableSessions([]sysstat.SessionInfo{self, self}, "bip"); len(got) != 2 {
		t.Errorf("two sessions → %d, want 2 kept", len(got))
	}
	// Single but remote → kept.
	if got := notableSessions([]sysstat.SessionInfo{selfRemote}, "bip"); len(got) != 1 {
		t.Errorf("remote session should be kept, got %v", got)
	}
	// Another user present → kept.
	if got := notableSessions([]sysstat.SessionInfo{other}, "bip"); len(got) != 1 {
		t.Errorf("other user's session should be kept, got %v", got)
	}
	// Windows DOMAIN\user normalization: lone self still suppressed.
	if got := notableSessions([]sysstat.SessionInfo{{User: "bip", Terminal: "console"}}, `CORP\bip`); got != nil {
		t.Errorf("DOMAIN\\user lone self should be suppressed, got %v", got)
	}
}

func TestGroupThousands(t *testing.T) {
	cases := map[int]string{0: "0", 5: "5", 999: "999", 1000: "1.000", 48320: "48.320", 1234567: "1.234.567"}
	for in, want := range cases {
		if got := groupThousands(in); got != want {
			t.Errorf("groupThousands(%d) = %q, want %q", in, got, want)
		}
	}
}

func TestTruncMount(t *testing.T) {
	// Short enough → unchanged.
	if got := truncMount("/var/log", 26); got != "/var/log" {
		t.Errorf("short mount changed: %q", got)
	}
	// Long path → truncated to <= width, cut at a separator, ellipsis prefix.
	got := truncMount("/System/Volumes/Update/SFR/mnt1", 26)
	// Width is measured in display columns (runes), not bytes — "…" is 3 bytes.
	if n := utf8.RuneCountInString(got); n > 26 {
		t.Errorf("truncMount width = %d runes, want <= 26 (%q)", n, got)
	}
	if !strings.HasPrefix(got, "…/") {
		t.Errorf("truncMount = %q, want leading \"…/\" (cut at separator)", got)
	}
	if !strings.HasSuffix(got, "mnt1") {
		t.Errorf("truncMount = %q, want meaningful tail preserved", got)
	}
}

func TestFormatSessions(t *testing.T) {
	// Same user → bare terminals joined by " · ".
	got := formatSessions([]sysstat.SessionInfo{
		{User: "bip", Terminal: "console"},
		{User: "bip", Terminal: "ttys0"},
	})
	if got != "console · ttys0" {
		t.Errorf("same-user = %q, want \"console · ttys0\"", got)
	}
	// Different users → prefixed with user@.
	got = formatSessions([]sysstat.SessionInfo{
		{User: "bip", Terminal: "console"},
		{User: "root", Terminal: "ttys1"},
	})
	if !strings.Contains(got, "bip@console") || !strings.Contains(got, "root@ttys1") {
		t.Errorf("multi-user = %q, want user@terminal prefixes", got)
	}
	// Remote host is surfaced.
	got = formatSessions([]sysstat.SessionInfo{{User: "bip", Terminal: "ttys2", Host: "10.0.0.5"}})
	if !strings.Contains(got, "10.0.0.5") {
		t.Errorf("remote session = %q, want host shown", got)
	}
}
