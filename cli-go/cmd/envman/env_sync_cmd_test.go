package main

import "testing"

// TestEnvSyncRegistered guards the one-line registration in env_cmd.go: without
// it the whole command is unreachable and nothing else would fail.
func TestEnvSyncRegistered(t *testing.T) {
	found := false
	for _, c := range envCmd().Commands() {
		if c.Name() == "sync" {
			found = true
			break
		}
	}
	if !found {
		t.Error("subcommand 'sync' is not registered on 'env'")
	}
}

// TestEnvSyncFlagContract pins dry-run-by-default. If --write ever defaults to
// true, this command silently starts mutating the user's .env.
func TestEnvSyncFlagContract(t *testing.T) {
	cmd := envSyncCmd()
	cases := []struct{ name, wantDefault string }{
		{"write", "false"},
		{"no-backup", "false"},
		{"keys-only", "false"},
	}
	for _, c := range cases {
		f := cmd.Flags().Lookup(c.name)
		if f == nil {
			t.Errorf("flag --%s missing", c.name)
			continue
		}
		if f.DefValue != c.wantDefault {
			t.Errorf("--%s default = %q, want %q", c.name, f.DefValue, c.wantDefault)
		}
		// No shorthands: --write is destructive and a stray -w must not trigger it.
		if f.Shorthand != "" {
			t.Errorf("--%s shorthand = %q, want none", c.name, f.Shorthand)
		}
	}
}

func TestEnvSyncArgs(t *testing.T) {
	cmd := envSyncCmd()
	cases := []struct {
		name    string
		args    []string
		wantErr bool
	}{
		{"no args", []string{}, true},
		{"source only", []string{".env.example"}, false},
		{"source and target", []string{".env.example", ".env"}, false},
		{"too many", []string{"a", "b", "c"}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := cmd.Args(cmd, c.args)
			if (err != nil) != c.wantErr {
				t.Errorf("Args(%v) error = %v, wantErr %v", c.args, err, c.wantErr)
			}
		})
	}
}

func TestExampleNameRe(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{".env.example", true},
		{".env.sample", true},
		{"env.template", true},
		{".env.dist", true},
		{".env.EXAMPLE", true}, // case-insensitive
		{".env.prod", false},   // holds real values -> should warn
		{".env", false},
	}
	for _, c := range cases {
		if got := exampleNameRe.MatchString(c.in); got != c.want {
			t.Errorf("exampleNameRe(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}
