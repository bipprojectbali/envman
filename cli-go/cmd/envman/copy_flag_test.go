package main

import (
	"testing"

	"github.com/spf13/cobra"
)

// TestCopyFlagContract pins --copy as a boolean on every secret-bearing
// command. It exists so a future command that prints a secret does not quietly
// ship without a way to keep it out of scrollback.
func TestCopyFlagContract(t *testing.T) {
	cmds := map[string]*cobra.Command{
		"env get":      envGetCmd(),
		"env pull":     envPullCmd(),
		"clip get":     clipGetCmd(),
		"transfer get": transferGetCmd(),
		"gists pull":   gistsPullCmd(),
		"health":       healthCmd(),
	}
	for name, cmd := range cmds {
		f := cmd.Flags().Lookup("copy")
		if f == nil {
			t.Errorf("%s: --copy flag missing", name)
			continue
		}
		if f.Value.Type() != "bool" {
			t.Errorf("%s: --copy type = %q, want bool", name, f.Value.Type())
		}
		if f.DefValue != "false" {
			t.Errorf("%s: --copy default = %q, want false", name, f.DefValue)
		}
		// No shorthand: -c is unclaimed and should stay that way rather than
		// becoming a one-letter route to a clipboard write.
		if f.Shorthand != "" {
			t.Errorf("%s: --copy shorthand = %q, want none", name, f.Shorthand)
		}
	}
}

// TestCopyAndOutputAreExclusive: --copy and -o are two destinations, so asking
// for both is a mistake worth catching rather than silently resolving.
func TestCopyAndOutputAreExclusive(t *testing.T) {
	for name, cmd := range map[string]*cobra.Command{
		"env pull":     envPullCmd(),
		"clip get":     clipGetCmd(),
		"transfer get": transferGetCmd(),
		"gists pull":   gistsPullCmd(),
	} {
		cmd.SetArgs([]string{"dummy", "--copy", "-o", "somefile"})
		cmd.SilenceErrors = true
		cmd.SilenceUsage = true
		// RunE is replaced so the test never touches the network; flag
		// validation still runs first and is what we are asserting on.
		cmd.RunE = func(*cobra.Command, []string) error { return nil }

		err := cmd.Execute()
		if err == nil {
			t.Errorf("%s: --copy with -o should be rejected", name)
		}
	}
}

// TestHealthPathsFlag guards the rename. --copy meant "format for copying" on
// health while meaning "copy for me" everywhere else; --paths says what it does.
func TestHealthPathsFlag(t *testing.T) {
	cmd := healthCmd()

	paths := cmd.Flags().Lookup("paths")
	if paths == nil {
		t.Fatal("--paths flag missing")
	}
	if paths.Value.Type() != "string" {
		t.Errorf("--paths type = %q, want string", paths.Value.Type())
	}

	// The old spelling still works for existing scripts, but is hidden so the
	// help only teaches one way.
	old := cmd.Flags().Lookup("copy-status")
	if old == nil {
		t.Fatal("--copy-status alias missing; existing scripts would break")
	}
	if !old.Hidden {
		t.Error("--copy-status should be hidden — --paths is the documented name")
	}
}

func TestIsStatusWord(t *testing.T) {
	for _, s := range []string{"ok", "warning", "critical", "all"} {
		if !isStatusWord(s) {
			t.Errorf("isStatusWord(%q) = false, want true", s)
		}
	}
	// A real directory must not be mistaken for a status, or `health --copy .`
	// would refuse to run.
	for _, s := range []string{".", "src", "critical/", ""} {
		if isStatusWord(s) {
			t.Errorf("isStatusWord(%q) = true, want false", s)
		}
	}
}
