package main

import (
	"testing"

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
