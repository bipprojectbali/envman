package envsync

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var fixedNow = time.Date(2026, 7, 29, 10, 0, 0, 0, time.UTC)

// write creates a file in dir and returns its path.
func write(t *testing.T, dir, name, content string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return p
}

func TestDiff(t *testing.T) {
	t.Run("missing keeps source order, not alphabetical", func(t *testing.T) {
		src := ParseBytes([]byte("ZEBRA=1\nALPHA=2\nMANGO=3\n"))
		tgt := ParseBytes([]byte(""))
		missing, _, _, _ := Diff(src, tgt)
		got := strings.Join(MissingKeys(missing), ",")
		if got != "ZEBRA,ALPHA,MANGO" {
			t.Errorf("missing order = %q, want ZEBRA,ALPHA,MANGO", got)
		}
	})

	t.Run("orphans sorted and reported", func(t *testing.T) {
		src := ParseBytes([]byte("A=1\n"))
		tgt := ParseBytes([]byte("A=1\nZED=9\nBOX=8\n"))
		_, orphans, _, _ := Diff(src, tgt)
		if strings.Join(orphans, ",") != "BOX,ZED" {
			t.Errorf("orphans = %v, want [BOX ZED]", orphans)
		}
	})

	t.Run("identical files yield nothing missing", func(t *testing.T) {
		src := ParseBytes([]byte("A=1\nB=2\n"))
		tgt := ParseBytes([]byte("B=2\nA=1\n"))
		missing, orphans, common, _ := Diff(src, tgt)
		if len(missing) != 0 || len(orphans) != 0 {
			t.Errorf("missing=%v orphans=%v, want both empty", MissingKeys(missing), orphans)
		}
		if len(common) != 2 {
			t.Errorf("common = %v, want 2 keys", common)
		}
	})

	t.Run("empty source", func(t *testing.T) {
		missing, orphans, _, _ := Diff(ParseBytes(nil), ParseBytes([]byte("A=1\n")))
		if len(missing) != 0 {
			t.Errorf("missing = %v, want empty", MissingKeys(missing))
		}
		if len(orphans) != 1 {
			t.Errorf("orphans = %v, want [A]", orphans)
		}
	})
}

// TestDiffIgnoresValues is the safety contract: a key present in both files is
// never touched, no matter how different its value is.
func TestDiffIgnoresValues(t *testing.T) {
	src := ParseBytes([]byte("DB_HOST=localhost\n"))
	tgt := ParseBytes([]byte("DB_HOST=127.0.0.1\n"))
	missing, _, common, _ := Diff(src, tgt)
	if len(missing) != 0 {
		t.Errorf("missing = %v, want empty (same key, different value)", MissingKeys(missing))
	}
	if len(common) != 1 {
		t.Errorf("common = %v, want [DB_HOST]", common)
	}
}

func TestRenderBlockGolden(t *testing.T) {
	missing := []Missing{
		{Key: "DB_HOST", RawValue: "localhost", Group: "# === Database ===", Comments: []string{"# koneksi utama"}},
		{Key: "DB_PORT", RawValue: "5432", Group: "# === Database ==="},
		{Key: "APP_NAME", RawValue: "envman", Group: "# === App ==="},
		{Key: "SUPER_ADMIN", RawValue: "", Group: "# === App ==="},
	}
	got := RenderBlock(missing, ".env.example", DefaultLabel, fixedNow, "\n")

	want := bannerRule + "\n" +
		"# Ditambahkan oleh: envman env sync\n" +
		"# Sumber: .env.example · 2026-07-29\n" +
		bannerRule + "\n" +
		"\n" +
		"# === Database ===\n" +
		"# koneksi utama\n" +
		"DB_HOST=localhost\n" +
		"DB_PORT=5432\n" +
		"\n" +
		"# === App ===\n" +
		"APP_NAME=envman\n" +
		"SUPER_ADMIN=\n"

	if got != want {
		t.Errorf("RenderBlock mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestRenderBlockEmpty(t *testing.T) {
	if got := RenderBlock(nil, ".env.example", DefaultLabel, fixedNow, "\n"); got != "" {
		t.Errorf("RenderBlock(nil) = %q, want empty", got)
	}
}

func TestRenderBlockCRLF(t *testing.T) {
	got := RenderBlock([]Missing{{Key: "A", RawValue: "1"}}, "src", DefaultLabel, fixedNow, "\r\n")
	for _, line := range strings.Split(strings.TrimSuffix(got, "\r\n"), "\r\n") {
		if strings.Contains(line, "\n") {
			t.Errorf("line %q contains a bare \\n", line)
		}
	}
	if !strings.HasSuffix(got, "\r\n") {
		t.Error("block does not end with CRLF")
	}
}

// TestPlanPreservesTargetBytes is the single most important invariant: whatever
// happens, the user's existing file survives as a byte-exact prefix.
func TestPlanPreservesTargetBytes(t *testing.T) {
	dir := t.TempDir()
	target := "# punyaku\nZED=9\n\n# catatan lain\nDB_HOST=127.0.0.1\nOLD_TOKEN=abc"
	src := write(t, dir, ".env.example", "# === DB ===\nDB_HOST=localhost\nAPP_NAME=envman\n")
	tgt := write(t, dir, ".env", target)

	res, err := Plan(Options{SourcePath: src, TargetPath: tgt, Now: fixedNow})
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	if !strings.HasPrefix(res.NewContent, string(res.ExistingBytes)) {
		t.Fatalf("NewContent does not start with the original bytes\n--- new ---\n%s", res.NewContent)
	}
	if len(res.NewContent) <= len(res.ExistingBytes) {
		t.Error("NewContent did not grow")
	}
	if !strings.Contains(res.NewContent, "APP_NAME=envman") {
		t.Error("APP_NAME not appended")
	}
	if strings.Contains(res.NewContent, "DB_HOST=localhost") {
		t.Error("existing DB_HOST must not be overwritten with the source value")
	}
	if strings.Join(res.Orphans, ",") != "OLD_TOKEN,ZED" {
		t.Errorf("Orphans = %v, want [OLD_TOKEN ZED]", res.Orphans)
	}
}

func TestPlanTargetNoTrailingNewline(t *testing.T) {
	dir := t.TempDir()
	src := write(t, dir, ".env.example", "NEW=1\n")
	tgt := write(t, dir, ".env", "OLD=0") // no trailing newline

	res, err := Plan(Options{SourcePath: src, TargetPath: tgt, Now: fixedNow})
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	if !strings.HasPrefix(res.NewContent, "OLD=0\n\n#") {
		t.Errorf("separator wrong; got prefix %q", firstN(res.NewContent, 20))
	}
}

func TestPlanTargetEndsWithBlankLine(t *testing.T) {
	dir := t.TempDir()
	src := write(t, dir, ".env.example", "NEW=1\n")
	tgt := write(t, dir, ".env", "OLD=0\n\n") // already blank-terminated

	res, err := Plan(Options{SourcePath: src, TargetPath: tgt, Now: fixedNow})
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	if strings.Contains(res.NewContent, "OLD=0\n\n\n") {
		t.Error("double blank line inserted")
	}
}

func TestPlanTargetMissing(t *testing.T) {
	dir := t.TempDir()
	src := write(t, dir, ".env.example", "A=1\n")

	res, err := Plan(Options{SourcePath: src, TargetPath: filepath.Join(dir, ".env"), Now: fixedNow})
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	if res.TargetExists {
		t.Error("TargetExists = true, want false")
	}
	if !strings.HasPrefix(res.NewContent, bannerRule) {
		t.Errorf("NewContent should start with the banner, got %q", firstN(res.NewContent, 20))
	}
}

// TestPlanNoMissing proves the cmd layer cannot write when nothing is missing:
// both Block and NewContent are empty.
func TestPlanNoMissing(t *testing.T) {
	dir := t.TempDir()
	src := write(t, dir, ".env.example", "A=1\n")
	tgt := write(t, dir, ".env", "A=999\nEXTRA=2\n")

	res, err := Plan(Options{SourcePath: src, TargetPath: tgt, Now: fixedNow})
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	if res.Block != "" || res.NewContent != "" {
		t.Errorf("Block=%q NewContent=%q, want both empty", res.Block, res.NewContent)
	}
	if res.Summary.Missing != 0 || res.Summary.Orphan != 1 {
		t.Errorf("Summary = %+v, want Missing 0 / Orphan 1", res.Summary)
	}
}

func TestPlanSourceNotFound(t *testing.T) {
	dir := t.TempDir()
	if _, err := Plan(Options{SourcePath: filepath.Join(dir, "nope"), TargetPath: filepath.Join(dir, ".env")}); err == nil {
		t.Error("expected an error for a missing source file")
	}
}

func TestPlanCommentedOutReported(t *testing.T) {
	dir := t.TempDir()
	src := write(t, dir, ".env.example", "DB_HOST=localhost\n")
	tgt := write(t, dir, ".env", "# DB_HOST=old\nA=1\n")

	res, err := Plan(Options{SourcePath: src, TargetPath: tgt, Now: fixedNow})
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	if len(res.Missing) != 1 {
		t.Errorf("Missing = %v, want [DB_HOST]", MissingKeys(res.Missing))
	}
	if strings.Join(res.CommentedOut, ",") != "DB_HOST" {
		t.Errorf("CommentedOut = %v, want [DB_HOST]", res.CommentedOut)
	}
}

func TestPlanCRLFTargetKeepsCRLF(t *testing.T) {
	dir := t.TempDir()
	src := write(t, dir, ".env.example", "NEW=1\n")
	tgt := write(t, dir, ".env", "OLD=0\r\n")

	res, err := Plan(Options{SourcePath: src, TargetPath: tgt, Now: fixedNow})
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	appended := strings.TrimPrefix(res.NewContent, string(res.ExistingBytes))
	if strings.Contains(strings.ReplaceAll(appended, "\r\n", ""), "\n") {
		t.Error("appended block mixes bare LF into a CRLF file")
	}
}

func TestPlanValuesCopiedVerbatim(t *testing.T) {
	dir := t.TempDir()
	src := write(t, dir, ".env.example", "SINGLE='satu'\nHASH=3000 # default\nEMPTY=\n")
	tgt := write(t, dir, ".env", "X=1\n")

	res, err := Plan(Options{SourcePath: src, TargetPath: tgt, Now: fixedNow})
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	for _, want := range []string{"SINGLE='satu'", "HASH=3000 # default", "EMPTY="} {
		if !strings.Contains(res.NewContent, want) {
			t.Errorf("appended block missing verbatim line %q", want)
		}
	}
}

func firstN(s string, n int) string {
	if len(s) < n {
		return s
	}
	return s[:n]
}
