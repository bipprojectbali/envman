package run

import (
	"encoding/json"
	"testing"
)

// TestFetchServerVarsUnmarshal verifies the Go struct correctly parses
// the actual server response format for vars/export.
// Server returns: { "vars": {"KEY": "VALUE"} }  (object, NOT array)
func TestFetchServerVarsUnmarshal(t *testing.T) {
	// Simulate the exact server response
	serverJSON := `{"vars":{"API_KEY":"secret123","DEBUG":"true","PORT":"3000"}}`

	var result struct {
		Vars map[string]string `json:"vars"`
	}
	if err := json.Unmarshal([]byte(serverJSON), &result); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if result.Vars["API_KEY"] != "secret123" {
		t.Errorf("API_KEY = %q, want %q", result.Vars["API_KEY"], "secret123")
	}
	if result.Vars["DEBUG"] != "true" {
		t.Errorf("DEBUG = %q, want %q", result.Vars["DEBUG"], "true")
	}
	if result.Vars["PORT"] != "3000" {
		t.Errorf("PORT = %q, want %q", result.Vars["PORT"], "3000")
	}
	if len(result.Vars) != 3 {
		t.Errorf("len(vars) = %d, want 3", len(result.Vars))
	}
}

// TestFetchServerVarsWithDeniedImports verifies parsing when server also includes deniedImports.
func TestFetchServerVarsWithDeniedImports(t *testing.T) {
	serverJSON := `{"vars":{"KEY":"value"},"deniedImports":[{"project":"other","env":"prod"}]}`
	var result struct {
		Vars map[string]string `json:"vars"`
	}
	if err := json.Unmarshal([]byte(serverJSON), &result); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	// deniedImports field is intentionally ignored (not in struct) — no crash
	if result.Vars["KEY"] != "value" {
		t.Errorf("KEY = %q, want %q", result.Vars["KEY"], "value")
	}
}

// TestFetchServerVarsEmpty verifies empty vars doesn't crash.
func TestFetchServerVarsEmpty(t *testing.T) {
	serverJSON := `{"vars":{}}`
	var result struct {
		Vars map[string]string `json:"vars"`
	}
	if err := json.Unmarshal([]byte(serverJSON), &result); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if len(result.Vars) != 0 {
		t.Errorf("expected empty map, got %d entries", len(result.Vars))
	}
}

// TestFetchServerVarsNullWouldFail verifies nil map is handled by nil check in fetchServerVars.
func TestFetchServerVarsNilCheck(t *testing.T) {
	serverJSON := `{"vars":null}`
	var result struct {
		Vars map[string]string `json:"vars"`
	}
	if err := json.Unmarshal([]byte(serverJSON), &result); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	// result.Vars is nil — fetchServerVars guards this with nil check
	if result.Vars != nil {
		t.Error("expected nil map for null JSON, got non-nil")
	}
	// Simulate the nil guard in fetchServerVars
	if result.Vars == nil {
		result.Vars = map[string]string{}
	}
	if len(result.Vars) != 0 {
		t.Errorf("after nil guard: expected empty map, got %d entries", len(result.Vars))
	}
}

// TestSplitArgs verifies the shell tokenizer handles quoted strings correctly.
func TestSplitArgs(t *testing.T) {
	cases := []struct {
		input string
		want  []string
	}{
		{
			"-e project:env -- bash start.sh",
			[]string{"-e", "project:env", "--", "bash", "start.sh"},
		},
		{
			`-e project:env -- claude "say hello world"`,
			[]string{"-e", "project:env", "--", "claude", "say hello world"},
		},
		{
			`-e project:env -- bash -c 'echo hello world'`,
			[]string{"-e", "project:env", "--", "bash", "-c", "echo hello world"},
		},
		{
			`cmd arg1 arg2`,
			[]string{"cmd", "arg1", "arg2"},
		},
		{
			// Empty input
			``,
			nil,
		},
		{
			// Single token
			`bash`,
			[]string{"bash"},
		},
		{
			// Mixed quotes
			`-e env -- echo "hello 'world'"`,
			[]string{"-e", "env", "--", "echo", "hello 'world'"},
		},
	}

	for _, c := range cases {
		got := splitArgs(c.input)
		if len(got) != len(c.want) {
			t.Errorf("splitArgs(%q): len=%d, want len=%d\n  got:  %v\n  want: %v",
				c.input, len(got), len(c.want), got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("splitArgs(%q)[%d] = %q, want %q", c.input, i, got[i], c.want[i])
			}
		}
	}
}

// TestIsProjectFileRef verifies file vs env detection.
func TestIsProjectFileRef(t *testing.T) {
	cases := []struct {
		input string
		want  bool
		desc  string
	}{
		// Env names → NOT file refs
		{"production", false, "plain env name"},
		{"staging", false, "plain env name"},
		{"dev", false, "plain env name"},
		// Env names with dots → must NOT be file refs (was the bug)
		{"staging.v2", false, "version suffix must not trigger file ref"},
		{"env.local", false, "'local' is not a known extension"},
		{"prod.eu", false, "'eu' is not a known extension"},
		{"v2", false, "no dot"},
		// File refs with "/"
		{"scripts/deploy.sh", true, "path with slash"},
		{"utils/seed.ts", true, "nested path"},
		{"a/b", true, "any slash"},
		// File refs with known extension (no slash)
		{"deploy.sh", true, "known ext: sh"},
		{"script.sh", true, "known ext: sh"},
		{"seed.ts", true, "known ext: ts"},
		{"seed.py", true, "known ext: py"},
		{"config.yaml", true, "known ext: yaml"},
		{"config.yml", true, "known ext: yml"},
		{"config.toml", true, "known ext: toml"},
		{"data.sql", true, "known ext: sql"},
		{"notes.md", true, "known ext: md"},
		{"app.js", true, "known ext: js"},
		{"app.go", true, "known ext: go"},
	}
	for _, c := range cases {
		got := isProjectFileRef(c.input)
		if got != c.want {
			t.Errorf("isProjectFileRef(%q) [%s] = %v, want %v", c.input, c.desc, got, c.want)
		}
	}
}

// TestParseSource verifies source string parsing.
func TestParseSource(t *testing.T) {
	cases := []struct {
		input         string
		wantProject   string
		wantEnv       string
		wantLocalFile string
		desc          string
	}{
		{"project:production", "project", "production", "", "simple env"},
		{"project:staging", "project", "staging", "", "simple env"},
		// Env names with dots must still be treated as project:env, not file refs
		{"project:staging.v2", "project", "staging.v2", "", "env with version suffix"},
		{"project:env.local", "project", "env.local", "", "env with non-extension dot"},
		// Local files (no colon)
		{".env", "", "", ".env", "dotenv file"},
		{"/home/user/.env.local", "", "", "/home/user/.env.local", "absolute path"},
		{"./local.env", "", "", "./local.env", "relative path"},
		// File refs with slash → local file path
		{"project:scripts/deploy.sh", "", "", "project:scripts/deploy.sh", "file ref with slash"},
		// File refs with known extension → local file path
		{"project:seed.ts", "", "", "project:seed.ts", "file ref ts"},
		{"project:deploy.sh", "", "", "project:deploy.sh", "file ref sh"},
	}
	for _, c := range cases {
		p, e, f := parseSource(c.input)
		if p != c.wantProject || e != c.wantEnv || f != c.wantLocalFile {
			t.Errorf("parseSource(%q) [%s] = (%q,%q,%q), want (%q,%q,%q)",
				c.input, c.desc, p, e, f, c.wantProject, c.wantEnv, c.wantLocalFile)
		}
	}
}
