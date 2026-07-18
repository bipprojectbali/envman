package gists

import "testing"

func TestDetectLanguage(t *testing.T) {
	cases := map[string]string{
		"a.ts":               "typescript",
		"comp.tsx":           "typescript",
		"main.go":            "go",
		"script.sh":          "bash",
		"data.json":          "json",
		"compose.yml":        "yaml",
		"README.md":          "markdown",
		"Dockerfile":         "dockerfile",
		"dir/Dockerfile":     "dockerfile",
		"Makefile":           "makefile",
		".env":               "dotenv",
		".gitignore":         "gitignore",
		"UPPER.GO":           "go",
		"noext":              "plaintext",
		"archive.unknownext": "plaintext",
	}
	for name, want := range cases {
		if got := DetectLanguage(name); got != want {
			t.Errorf("DetectLanguage(%q) = %q, want %q", name, got, want)
		}
	}
}

func TestLooksLikeUUID(t *testing.T) {
	valid := []string{
		"123e4567-e89b-12d3-a456-426614174000",
		"00000000-0000-0000-0000-000000000000",
		"ABCDEF01-2345-6789-ABCD-EF0123456789",
	}
	for _, s := range valid {
		if !looksLikeUUID(s) {
			t.Errorf("looksLikeUUID(%q) = false, want true", s)
		}
	}
	invalid := []string{
		"",
		"my-gist-title",
		"Docker setup",
		"123e4567e89b12d3a456426614174000",      // no dashes
		"123e4567-e89b-12d3-a456-42661417400",   // too short
		"123e4567-e89b-12d3-a456-4266141740000", // too long
		"123e4567-e89b-12d3-a456-42661417400g",  // non-hex
		"123e4567xe89b-12d3-a456-426614174000",  // dash in wrong place
	}
	for _, s := range invalid {
		if looksLikeUUID(s) {
			t.Errorf("looksLikeUUID(%q) = true, want false", s)
		}
	}
}

func TestSplitFileRef(t *testing.T) {
	cases := []struct {
		ref          string
		wantTarget   string
		wantFilename string
	}{
		{"mycfg", "mycfg", ""},
		{"mycfg:a.ts", "mycfg", "a.ts"},
		{"mycfg:dir/a.ts", "mycfg", "dir/a.ts"},
		{"mycfg:weird:name.txt", "mycfg", "weird:name.txt"}, // split on first colon only
		{"mycfg:", "mycfg", ""},
		// A UUID must never be split even though it contains no colon anyway.
		{"123e4567-e89b-12d3-a456-426614174000", "123e4567-e89b-12d3-a456-426614174000", ""},
	}
	for _, c := range cases {
		gotT, gotF := SplitFileRef(c.ref)
		if gotT != c.wantTarget || gotF != c.wantFilename {
			t.Errorf("SplitFileRef(%q) = (%q, %q), want (%q, %q)",
				c.ref, gotT, gotF, c.wantTarget, c.wantFilename)
		}
	}
}

func TestFmtBytes(t *testing.T) {
	cases := map[int]string{
		0:       "0B",
		512:     "512B",
		1024:    "1.0KB",
		1536:    "1.5KB",
		1048576: "1.0MB",
	}
	for n, want := range cases {
		if got := FmtBytes(n); got != want {
			t.Errorf("FmtBytes(%d) = %q, want %q", n, got, want)
		}
	}
}
