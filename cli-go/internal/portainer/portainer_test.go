package portainer

import "testing"

func TestParseTarget(t *testing.T) {
	cases := []struct {
		in       string
		wantSlug string
		wantEnv  string
		wantErr  bool
	}{
		{"myapp:prod", "myapp", "prod", false},
		{"a:b", "a", "b", false},
		{"proj:staging-2", "proj", "staging-2", false},
		{"noenv", "", "", true},
		{":prod", "", "", true},
		{"myapp:", "", "", true},
		{"", "", "", true},
	}
	for _, c := range cases {
		got, err := ParseTarget(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("ParseTarget(%q) expected error, got %+v", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseTarget(%q) unexpected error: %v", c.in, err)
			continue
		}
		if got.Slug != c.wantSlug || got.Env != c.wantEnv {
			t.Errorf("ParseTarget(%q) = {%q,%q}, want {%q,%q}", c.in, got.Slug, got.Env, c.wantSlug, c.wantEnv)
		}
	}
}

func TestTargetBase(t *testing.T) {
	tg := Target{Slug: "my app", Env: "pr/od"}
	// Slug/env are path-escaped to avoid breaking the URL.
	base := tg.base()
	want := "/api/envman/projects/my%20app/environments/pr%2Fod/portainer"
	if base != want {
		t.Errorf("base() = %q, want %q", base, want)
	}
}

func TestActionPaths(t *testing.T) {
	// Every action exposed by the CLI must map to a server path.
	for _, action := range []string{"restart-soft", "restart-recreate", "restart-repull", "sync-repull", "prune"} {
		if _, ok := actionPaths[action]; !ok {
			t.Errorf("action %q missing from actionPaths", action)
		}
	}
	if _, ok := actionPaths["bogus"]; ok {
		t.Error("unexpected action 'bogus' present")
	}
}
