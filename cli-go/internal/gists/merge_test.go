package gists

import (
	"sort"
	"strings"
	"testing"
)

func f(name string) File { return File{Filename: name, Content: name + "-content"} }

func names(fs []File) string {
	out := make([]string, len(fs))
	for i := range fs {
		out[i] = fs[i].Filename
	}
	sort.Strings(out)
	return strings.Join(out, ",")
}

func TestMergeFiles_AddNewFile(t *testing.T) {
	existing := []File{f("a.ts"), f("b.json")}
	res := MergeFiles(existing, []File{f("c.md")}, false, false)
	if got := names(res.Files); got != "a.ts,b.json,c.md" {
		t.Errorf("files = %q, want a.ts,b.json,c.md", got)
	}
	if len(res.Conflicts) != 0 {
		t.Errorf("unexpected conflicts: %v", res.Conflicts)
	}
	if len(res.Added) != 1 || res.Added[0] != "c.md" {
		t.Errorf("added = %v, want [c.md]", res.Added)
	}
}

func TestMergeFiles_ExistingWithoutForce_Conflict(t *testing.T) {
	existing := []File{f("a.ts"), f("b.json")}
	res := MergeFiles(existing, []File{f("a.ts")}, false, false)
	if len(res.Conflicts) != 1 || res.Conflicts[0] != "a.ts" {
		t.Errorf("conflicts = %v, want [a.ts]", res.Conflicts)
	}
	// b.json must survive; a.ts unchanged (still existing content).
	if got := names(res.Files); got != "a.ts,b.json" {
		t.Errorf("files = %q, want a.ts,b.json", got)
	}
}

func TestMergeFiles_ExistingWithForce_OverwritesOnlyThat(t *testing.T) {
	existing := []File{{Filename: "a.ts", Content: "old"}, f("b.json")}
	res := MergeFiles(existing, []File{{Filename: "a.ts", Content: "new"}}, false, true)
	if len(res.Conflicts) != 0 {
		t.Errorf("unexpected conflicts: %v", res.Conflicts)
	}
	if len(res.Overwritten) != 1 || res.Overwritten[0] != "a.ts" {
		t.Errorf("overwritten = %v, want [a.ts]", res.Overwritten)
	}
	// b.json survives; a.ts content replaced.
	if got := names(res.Files); got != "a.ts,b.json" {
		t.Errorf("files = %q, want a.ts,b.json", got)
	}
	for _, x := range res.Files {
		if x.Filename == "a.ts" && x.Content != "new" {
			t.Errorf("a.ts content = %q, want new", x.Content)
		}
		if x.Filename == "b.json" && x.Content != "b.json-content" {
			t.Errorf("b.json content changed: %q", x.Content)
		}
	}
}

func TestMergeFiles_Clean_ReplacesAll(t *testing.T) {
	existing := []File{f("a.ts"), f("b.json"), f("c.md")}
	res := MergeFiles(existing, []File{f("x.ts")}, true, false)
	if got := names(res.Files); got != "x.ts" {
		t.Errorf("files = %q, want x.ts (clean drops the rest)", got)
	}
}

func TestMergeFiles_MixedAddAndOverwrite(t *testing.T) {
	existing := []File{{Filename: "a.ts", Content: "old"}, f("b.json")}
	res := MergeFiles(existing, []File{{Filename: "a.ts", Content: "new"}, f("c.md")}, false, true)
	if got := names(res.Files); got != "a.ts,b.json,c.md" {
		t.Errorf("files = %q, want a.ts,b.json,c.md", got)
	}
	if len(res.Added) != 1 || res.Added[0] != "c.md" {
		t.Errorf("added = %v, want [c.md]", res.Added)
	}
	if len(res.Overwritten) != 1 || res.Overwritten[0] != "a.ts" {
		t.Errorf("overwritten = %v, want [a.ts]", res.Overwritten)
	}
}
