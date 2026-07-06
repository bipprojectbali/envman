package main

import (
	"testing"

	"github.com/spf13/cobra"
)

// TestRunCmdPassthroughFlags verifies that flags trailing the alias ref
// (e.g. --resume) pass through to extraArgs instead of being rejected as
// unknown flags by cobra. Regression guard for the cli-go migration, where
// interspersed flag parsing broke `envman run project:alias --resume`.
func TestRunCmdPassthroughFlags(t *testing.T) {
	cases := []struct {
		name      string
		args      []string
		wantRef   string
		wantExtra []string
		wantEnv   []string
	}{
		{
			name:      "trailing flag passes through",
			args:      []string{"claude:malik-opus", "--resume"},
			wantRef:   "claude:malik-opus",
			wantExtra: []string{"--resume"},
			wantEnv:   nil,
		},
		{
			name:      "multiple trailing flags pass through",
			args:      []string{"myapp:deploy", "--resume", "--verbose"},
			wantRef:   "myapp:deploy",
			wantExtra: []string{"--resume", "--verbose"},
			wantEnv:   nil,
		},
		{
			name:      "own -e flag before ref is parsed, trailing flags pass through",
			args:      []string{"-e", "other:prod", "myapp:deploy", "--resume"},
			wantRef:   "myapp:deploy",
			wantExtra: []string{"--resume"},
			wantEnv:   []string{"other:prod"},
		},
		{
			name:      "alias with no extra args",
			args:      []string{"myapp:deploy"},
			wantRef:   "myapp:deploy",
			wantExtra: []string{},
			wantEnv:   nil,
		},
		{
			name:      "value-carrying passthrough flag",
			args:      []string{"myapp:deploy", "--session", "abc123"},
			wantRef:   "myapp:deploy",
			wantExtra: []string{"--session", "abc123"},
			wantEnv:   nil,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cmd := runCmd()

			// Replace RunE to capture parse results instead of resolving the
			// alias over the network. This still exercises the real flag config
			// (SetInterspersed(false) + -e binding) from runCmd().
			var gotRef string
			var gotExtra []string
			cmd.RunE = func(c *cobra.Command, args []string) error {
				gotRef = args[0]
				gotExtra = args[1:]
				return nil
			}
			cmd.SetArgs(c.args)
			if err := cmd.Execute(); err != nil {
				t.Fatalf("Execute(%v) error: %v", c.args, err)
			}

			if gotRef != c.wantRef {
				t.Errorf("ref = %q, want %q", gotRef, c.wantRef)
			}
			if !equalStrings(gotExtra, c.wantExtra) {
				t.Errorf("extraArgs = %v, want %v", gotExtra, c.wantExtra)
			}
			gotEnv, _ := cmd.Flags().GetStringArray("env")
			if !equalStrings(gotEnv, c.wantEnv) {
				t.Errorf("-e sources = %v, want %v", gotEnv, c.wantEnv)
			}
		})
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
