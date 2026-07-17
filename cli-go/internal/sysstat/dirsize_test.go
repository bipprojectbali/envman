package sysstat

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDirUsage(t *testing.T) {
	root := t.TempDir()
	// Layout:
	//   root/a.txt            (100 bytes)   -> top "a.txt", file at root
	//   root/big/x.bin        (500 bytes)   -> top "big"
	//   root/big/sub/y.bin    (300 bytes)   -> top "big"
	//   root/small/z.txt      ( 50 bytes)   -> top "small"
	write := func(rel string, n int) {
		p := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, make([]byte, n), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("a.txt", 100)
	write("big/x.bin", 500)
	write("big/sub/y.bin", 300)
	write("small/z.txt", 50)

	rep, err := DirUsage(root)
	if err != nil {
		t.Fatalf("DirUsage: %v", err)
	}

	if rep.TotalBytes != 950 {
		t.Errorf("TotalBytes = %d, want 950", rep.TotalBytes)
	}
	if rep.FileCount != 4 {
		t.Errorf("FileCount = %d, want 4", rep.FileCount)
	}
	if len(rep.Children) != 3 {
		t.Fatalf("Children = %d, want 3 (big, a.txt, small)", len(rep.Children))
	}

	// Largest first: big (800) > a.txt (100) > small (50).
	if rep.Children[0].Name != "big" || rep.Children[0].Bytes != 800 {
		t.Errorf("child[0] = %+v, want big/800", rep.Children[0])
	}
	if !rep.Children[0].IsDir {
		t.Error("big should be marked IsDir")
	}
	if rep.Children[0].FileCount != 2 {
		t.Errorf("big FileCount = %d, want 2", rep.Children[0].FileCount)
	}
	if rep.Children[1].Name != "a.txt" || rep.Children[1].Bytes != 100 {
		t.Errorf("child[1] = %+v, want a.txt/100", rep.Children[1])
	}
	if rep.Children[1].IsDir {
		t.Error("a.txt is a file at root, should not be IsDir")
	}
	if rep.Children[2].Name != "small" || rep.Children[2].Bytes != 50 {
		t.Errorf("child[2] = %+v, want small/50", rep.Children[2])
	}
}

func TestDirUsageEmpty(t *testing.T) {
	rep, err := DirUsage(t.TempDir())
	if err != nil {
		t.Fatalf("DirUsage: %v", err)
	}
	if rep.TotalBytes != 0 || rep.FileCount != 0 || len(rep.Children) != 0 {
		t.Errorf("empty dir = %+v, want all zero", rep)
	}
}
