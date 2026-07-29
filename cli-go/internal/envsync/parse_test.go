package envsync

import (
	"strings"
	"testing"

	"github.com/bipprojectbali/envman/cli/internal/envparser"
)

func TestParseEntries(t *testing.T) {
	cases := []struct {
		name     string
		in       string
		wantKeys []string
		wantRaw  map[string]string
	}{
		{"basic", "A=1\nB=2\n", []string{"A", "B"}, map[string]string{"A": "1", "B": "2"}},
		{"spaces around =", "KEY = v\n", []string{"KEY"}, map[string]string{"KEY": " v"}},
		{"empty value stays empty", "SUPER_ADMIN=\n", []string{"SUPER_ADMIN"}, map[string]string{"SUPER_ADMIN": ""}},
		{"export stripped", "export KEY=v\n", []string{"KEY"}, map[string]string{"KEY": "v"}},
		{"inline hash kept", "PORT=3000 # default\n", []string{"PORT"}, map[string]string{"PORT": "3000 # default"}},
		{"junk line skipped", "no_equals_here\nA=1\n", []string{"A"}, map[string]string{"A": "1"}},
		{"no trailing newline", "A=1", []string{"A"}, map[string]string{"A": "1"}},
		{"dotted key", "app.name=x\n", []string{"app.name"}, map[string]string{"app.name": "x"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc := ParseBytes([]byte(c.in))
			var got []string
			for _, e := range doc.Entries {
				got = append(got, e.Key)
			}
			if strings.Join(got, ",") != strings.Join(c.wantKeys, ",") {
				t.Errorf("keys = %v, want %v", got, c.wantKeys)
			}
			for k, want := range c.wantRaw {
				e, ok := doc.Get(k)
				if !ok {
					t.Fatalf("key %q missing", k)
				}
				if e.RawValue != want {
					t.Errorf("RawValue[%s] = %q, want %q", k, e.RawValue, want)
				}
			}
		})
	}
}

func TestParseExportFlag(t *testing.T) {
	doc := ParseBytes([]byte("export A=1\nB=2\n"))
	a, _ := doc.Get("A")
	b, _ := doc.Get("B")
	if !a.Export {
		t.Errorf("A.Export = false, want true")
	}
	if b.Export {
		t.Errorf("B.Export = true, want false")
	}
}

func TestParseCommentAttachment(t *testing.T) {
	t.Run("comment directly above attaches", func(t *testing.T) {
		doc := ParseBytes([]byte("# koneksi utama\nDB_HOST=x\n"))
		e, _ := doc.Get("DB_HOST")
		if len(e.Comments) != 1 || e.Comments[0] != "# koneksi utama" {
			t.Errorf("Comments = %v, want [# koneksi utama]", e.Comments)
		}
		if e.Group != "" {
			t.Errorf("Group = %q, want empty", e.Group)
		}
	})

	t.Run("comment then blank line becomes group", func(t *testing.T) {
		doc := ParseBytes([]byte("# Database\n\nDB_HOST=x\n"))
		e, _ := doc.Get("DB_HOST")
		if e.Group != "# Database" {
			t.Errorf("Group = %q, want %q", e.Group, "# Database")
		}
		if len(e.Comments) != 0 {
			t.Errorf("Comments = %v, want empty", e.Comments)
		}
	})

	t.Run("two comment lines both attach in order", func(t *testing.T) {
		doc := ParseBytes([]byte("# satu\n# dua\nK=v\n"))
		e, _ := doc.Get("K")
		if len(e.Comments) != 2 || e.Comments[0] != "# satu" || e.Comments[1] != "# dua" {
			t.Errorf("Comments = %v, want [# satu # dua]", e.Comments)
		}
	})

	t.Run("junk line clears pending comments", func(t *testing.T) {
		doc := ParseBytes([]byte("# tidak nempel\nbukan-env\nK=v\n"))
		e, _ := doc.Get("K")
		if len(e.Comments) != 0 {
			t.Errorf("Comments = %v, want empty", e.Comments)
		}
	})
}

func TestParseGroupHeadings(t *testing.T) {
	cases := []struct {
		name      string
		in        string
		wantGroup string
	}{
		{"equals banner", "# === Database ===\nK=v\n", "# === Database ==="},
		{"dash banner", "# --- App ---\nK=v\n", "# --- App ---"},
		{"bare separator is not a group", "# ==========\nK=v\n", ""},
		{"orphan block via blank line", "# Database\n\nK=v\n", "# Database"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc := ParseBytes([]byte(c.in))
			e, ok := doc.Get("K")
			if !ok {
				t.Fatal("key K missing")
			}
			if e.Group != c.wantGroup {
				t.Errorf("Group = %q, want %q", e.Group, c.wantGroup)
			}
		})
	}
}

func TestParseGroupPersistsAcrossKeys(t *testing.T) {
	doc := ParseBytes([]byte("# === DB ===\nA=1\nB=2\n# === App ===\nC=3\n"))
	want := map[string]string{"A": "# === DB ===", "B": "# === DB ===", "C": "# === App ==="}
	for k, g := range want {
		e, _ := doc.Get(k)
		if e.Group != g {
			t.Errorf("Group[%s] = %q, want %q", k, e.Group, g)
		}
	}
}

func TestParseDuplicateKeys(t *testing.T) {
	doc := ParseBytes([]byte("A=1\nB=2\nA=3\n"))
	if len(doc.Entries) != 2 {
		t.Fatalf("len(Entries) = %d, want 2", len(doc.Entries))
	}
	a, _ := doc.Get("A")
	if a.RawValue != "3" {
		t.Errorf("A.RawValue = %q, want %q (last wins)", a.RawValue, "3")
	}
	if len(doc.Duplicates) != 1 || doc.Duplicates[0].Key != "A" {
		t.Fatalf("Duplicates = %v, want one entry for A", doc.Duplicates)
	}
	if len(doc.Duplicates[0].Lines) != 2 {
		t.Errorf("Duplicates[0].Lines = %v, want 2 line numbers", doc.Duplicates[0].Lines)
	}
	// Index must stay consistent after the earlier entry is dropped.
	b, ok := doc.Get("B")
	if !ok || b.RawValue != "2" {
		t.Errorf("B = %+v, want RawValue 2", b)
	}
}

func TestParseCRLF(t *testing.T) {
	doc := ParseBytes([]byte("A=1\r\nB=2\r\n"))
	if !doc.HasCRLF {
		t.Error("HasCRLF = false, want true")
	}
	for _, e := range doc.Entries {
		if strings.Contains(e.RawValue, "\r") {
			t.Errorf("RawValue[%s] = %q still contains \\r", e.Key, e.RawValue)
		}
	}
}

func TestParseBOM(t *testing.T) {
	doc := ParseBytes([]byte("\ufeffAPP_NAME=x\n"))
	if !doc.Has("APP_NAME") {
		var keys []string
		for _, e := range doc.Entries {
			keys = append(keys, e.Key)
		}
		t.Errorf("keys = %v, want APP_NAME (BOM must be stripped)", keys)
	}
}

func TestParseMultilineQuoted(t *testing.T) {
	t.Run("terminated quote spans lines", func(t *testing.T) {
		doc := ParseBytes([]byte("KEY=\"a\nb\"\nNEXT=1\n"))
		e, ok := doc.Get("KEY")
		if !ok {
			t.Fatal("KEY missing")
		}
		if !strings.Contains(e.RawValue, "\n") {
			t.Errorf("RawValue = %q, want embedded newline", e.RawValue)
		}
		if !doc.Has("NEXT") {
			t.Error("NEXT missing: continuation consumed too much")
		}
	})

	t.Run("unterminated quote does not swallow file", func(t *testing.T) {
		doc := ParseBytes([]byte("KEY=\"oops\nNEXT=1\n"))
		if !doc.Has("NEXT") {
			t.Error("NEXT missing: unterminated quote swallowed the rest")
		}
	})
}

func TestParseCommentedOutKeys(t *testing.T) {
	doc := ParseBytes([]byte("# DB_HOST=x\nA=1\n"))
	if _, ok := doc.Commented["DB_HOST"]; !ok {
		t.Error("DB_HOST not recorded in Commented")
	}
	if doc.Has("DB_HOST") {
		t.Error("DB_HOST must not be a live entry")
	}
}

// TestParseKeySetMatchesEnvparser guards against divergence from the parser the
// rest of the CLI uses. Lines using `export` are excluded on purpose: envparser
// does not strip the prefix and yields the key "export KEY" (a pre-existing bug
// that must not be fixed here, since env push and run depend on its behaviour).
func TestParseKeySetMatchesEnvparser(t *testing.T) {
	src := "# === Group ===\n# komentar\nA=1\nB=\nC=x y\n# D=commented\n"
	doc := ParseBytes([]byte(src))
	legacy := envparser.ParseString(src)

	if len(doc.Entries) != len(legacy) {
		t.Fatalf("key count = %d, envparser = %d", len(doc.Entries), len(legacy))
	}
	for _, e := range doc.Entries {
		if _, ok := legacy[e.Key]; !ok {
			t.Errorf("key %q present in envsync but not envparser", e.Key)
		}
	}
}
