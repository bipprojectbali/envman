package main

import (
	"testing"

	"github.com/spf13/cobra"
)

// TestTransferSubcommands pins the grouping. Nothing else in the CLI catches an
// unregistered command: CI runs no smoke test, and cobra fails silently by
// falling through to the root injector.
func TestTransferSubcommands(t *testing.T) {
	want := map[string]bool{"send": false, "ls": false, "get": false, "rm": false}
	for _, c := range transferCmd().Commands() {
		if _, ok := want[c.Name()]; ok {
			want[c.Name()] = true
		}
	}
	for name, found := range want {
		if !found {
			t.Errorf("subcommand %q not registered on transfer", name)
		}
	}
}

// TestTransferRegisteredOnRoot guards the top-level surface: `transfer` and
// `recv` must exist, and the old `send`/`inbox` verbs must be gone.
func TestTransferRegisteredOnRoot(t *testing.T) {
	names := map[string]bool{}
	for _, c := range buildRootCmd().Commands() {
		names[c.Name()] = true
	}

	for _, want := range []string{"transfer", "recv"} {
		if !names[want] {
			t.Errorf("top-level command %q missing", want)
		}
	}
	// These moved into the transfer group. Leaving them registered would
	// reintroduce exactly the fragmentation this restructure removed.
	for _, gone := range []string{"send", "inbox"} {
		if names[gone] {
			t.Errorf("top-level command %q should have moved into `transfer`", gone)
		}
	}
}

// TestMovedCommandsHint makes sure a user typing the old name gets told the new
// one, instead of the root injector's unrelated "specify at least one -e" error.
func TestMovedCommandsHint(t *testing.T) {
	for _, old := range []string{"send", "inbox"} {
		if movedCommands[old] == "" {
			t.Errorf("no migration hint for removed command %q", old)
		}
	}
}

func TestTransferSendModeFlag(t *testing.T) {
	cmd := transferSendCmd()
	f := cmd.Flags().Lookup("mode")
	if f == nil {
		t.Fatal("expected --mode flag")
	}
	if f.Value.Type() != "string" {
		t.Errorf("--mode type = %q, want string", f.Value.Type())
	}
	// The old boolean --text/--file pair collided with gists' string --file.
	for _, gone := range []string{"text", "file"} {
		if cmd.Flags().Lookup(gone) != nil {
			t.Errorf("--%s should be replaced by --mode", gone)
		}
	}
}

// TestForceHasNoShorthand pins the CLI-wide rule: -f belongs to --follow
// (portainer logs, matching tail/docker), so no --force may claim it.
func TestForceHasNoShorthand(t *testing.T) {
	cmds := map[string]*cobra.Command{
		"storage upload": storageUploadCmd(),
		"storage rm":     storageRmCmd(),
		"clip get":       clipGetCmd(),
		"env pull":       envPullCmd(),
		"gists push":     gistsPushCmd(),
		"gists pull":     gistsPullCmd(),
		"recv":           recvCmd(),
	}
	for name, cmd := range cmds {
		f := cmd.Flags().Lookup("force")
		if f == nil {
			t.Errorf("%s: --force flag missing", name)
			continue
		}
		if f.Shorthand != "" {
			t.Errorf("%s: --force shorthand = %q, want none", name, f.Shorthand)
		}
	}

	// -f must still mean --follow where the docker/tail convention applies.
	logs := ptLogsCmd()
	if f := logs.Flags().ShorthandLookup("f"); f == nil || f.Name != "follow" {
		t.Errorf("portainer logs -f should map to --follow, got %v", f)
	}
}
