package health

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStatusFor(t *testing.T) {
	cases := []struct {
		pct  int
		want Status
	}{
		{0, OK}, {79, OK}, {80, Warning}, {99, Warning}, {100, Critical}, {250, Critical},
	}
	for _, c := range cases {
		if got := statusFor(c.pct); got != c.want {
			t.Errorf("statusFor(%d) = %v, want %v", c.pct, got, c.want)
		}
	}
}

func TestParseExts(t *testing.T) {
	if ParseExts("") != nil {
		t.Error("empty should be nil")
	}
	got := ParseExts("ts, tsx ,go")
	for _, want := range []string{".ts", ".tsx", ".go"} {
		if !got[want] {
			t.Errorf("missing %q in %v", want, got)
		}
	}
	if got[".py"] {
		t.Error("unexpected .py")
	}
	// Leading dots preserved / not doubled.
	if d := ParseExts(".md"); !d[".md"] || d["..md"] {
		t.Errorf("dot handling wrong: %v", d)
	}
}

func TestCountFile(t *testing.T) {
	dir := t.TempDir()
	write := func(name, content string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}
	cases := []struct {
		content   string
		wantLines int
		wantChars int
	}{
		{"", 0, 0},          // empty
		{"one line", 1, 8},  // no trailing newline
		{"a\nb\nc\n", 3, 6}, // trailing newline → 3 lines
		{"a\nb\nc", 3, 5},   // no trailing newline → still 3
		{"\n\n", 2, 2},      // two blank lines
	}
	for i, c := range cases {
		p := write("f", c.content)
		lines, chars, err := countFile(p)
		if err != nil {
			t.Fatalf("case %d: %v", i, err)
		}
		if lines != c.wantLines || chars != c.wantChars {
			t.Errorf("case %d %q: got %d lines / %d chars, want %d / %d", i, c.content, lines, chars, c.wantLines, c.wantChars)
		}
	}
}

func TestScanSkipsAndClassifies(t *testing.T) {
	dir := t.TempDir()
	mk := func(rel, content string) {
		p := filepath.Join(dir, rel)
		os.MkdirAll(filepath.Dir(p), 0o755)
		os.WriteFile(p, []byte(content), 0o644)
	}
	big := ""
	for i := 0; i < 600; i++ {
		big += "line\n"
	}
	mk("src/big.txt", big)                // 600 lines → critical
	mk("src/small.txt", "hello\nworld\n") // ok
	mk("node_modules/pkg/index.js", big)  // must be skipped
	mk(".git/objects/x", big)             // must be skipped

	files, sum, err := Scan(Options{Root: dir, MaxDepth: -1})
	if err != nil {
		t.Fatal(err)
	}
	// Only src/ files counted; node_modules + .git skipped.
	if sum.Total != 2 {
		t.Fatalf("expected 2 files, got %d: %+v", sum.Total, files)
	}
	if sum.Critical != 1 || sum.OK != 1 {
		t.Errorf("expected 1 critical + 1 ok, got %+v", sum)
	}
	// Sorted by severity: critical first.
	if files[0].Status != Critical {
		t.Errorf("expected critical first, got %v", files[0].Status)
	}
}

func TestScanDepthLimit(t *testing.T) {
	dir := t.TempDir()
	// Build a/b/c/d/e/deep.txt (5 levels).
	deep := filepath.Join(dir, "a", "b", "c", "d", "e")
	os.MkdirAll(deep, 0o755)
	os.WriteFile(filepath.Join(deep, "deep.txt"), []byte("x\n"), 0o644)
	os.WriteFile(filepath.Join(dir, "top.txt"), []byte("x\n"), 0o644)

	_, sum, _ := Scan(Options{Root: dir, MaxDepth: 2})
	if sum.SkippedDeep == 0 {
		t.Error("expected some directories skipped at depth 2")
	}
	// deep.txt should not have been reached.
	if sum.Total > 1 {
		t.Errorf("depth 2 should exclude deep file, got %d files", sum.Total)
	}

	_, sum2, _ := Scan(Options{Root: dir, MaxDepth: 0}) // unlimited
	if sum2.Total != 2 {
		t.Errorf("unlimited depth should find both files, got %d", sum2.Total)
	}
}
