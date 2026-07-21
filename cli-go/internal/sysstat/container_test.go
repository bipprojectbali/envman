package sysstat

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseCgroupBytes(t *testing.T) {
	dir := t.TempDir()
	write := func(name, content string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
		return p
	}

	cases := []struct {
		name    string
		content string
		want    uint64
	}{
		{"limit", "8589934592\n", 8589934592},
		{"max", "max\n", 0},
		{"empty", "", 0},
		{"garbage", "notanumber", 0},
	}
	for _, c := range cases {
		if got := parseCgroupBytes(write(c.name, c.content)); got != c.want {
			t.Errorf("parseCgroupBytes(%q) = %d, want %d", c.content, got, c.want)
		}
	}
	// Missing file → 0.
	if got := parseCgroupBytes(filepath.Join(dir, "nope")); got != 0 {
		t.Errorf("missing file = %d, want 0", got)
	}
}

func TestParseCPUMaxV2(t *testing.T) {
	dir := t.TempDir()
	write := func(content string) string {
		p := filepath.Join(dir, "cpu.max")
		if err := os.WriteFile(p, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
		return p
	}
	cases := []struct {
		content string
		want    float64
	}{
		{"400000 100000\n", 4.0},
		{"150000 100000\n", 1.5},
		{"max 100000\n", 0}, // unlimited
		{"bad\n", 0},
	}
	for _, c := range cases {
		if got := parseCPUMaxV2(write(c.content)); got != c.want {
			t.Errorf("parseCPUMaxV2(%q) = %v, want %v", c.content, got, c.want)
		}
	}
}

func TestCPUCoresFromQuota(t *testing.T) {
	cases := []struct {
		quota, period int64
		want          float64
	}{
		{400000, 100000, 4.0},
		{50000, 100000, 0.5},
		{-1, 100000, 0}, // v1 unlimited sentinel
		{100000, 0, 0},  // guard against divide-by-zero
	}
	for _, c := range cases {
		if got := cpuCoresFromQuota(c.quota, c.period); got != c.want {
			t.Errorf("cpuCoresFromQuota(%d,%d) = %v, want %v", c.quota, c.period, got, c.want)
		}
	}
}

func TestSubFloor(t *testing.T) {
	cases := []struct {
		a, b, want uint64
	}{
		{8589934592, 8589934592, 0}, // memsw == mem → no swap
		{9000000000, 8589934592, 410065408},
		{100, 200, 0}, // underflow guard
		{500, 0, 500},
	}
	for _, c := range cases {
		if got := subFloor(c.a, c.b); got != c.want {
			t.Errorf("subFloor(%d,%d) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestParsePSI(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "cpu.pressure")
	content := "some avg10=0.02 avg60=1.15 avg300=2.71 total=94656565\n" +
		"full avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
	if err := os.WriteFile(p, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	a10, a60, a300 := parsePSI(p)
	if a10 != 0.02 || a60 != 1.15 || a300 != 2.71 {
		t.Errorf("parsePSI = %v/%v/%v, want 0.02/1.15/2.71", a10, a60, a300)
	}
	// Missing file → all -1.
	a10, a60, a300 = parsePSI(filepath.Join(dir, "nope"))
	if a10 != -1 || a60 != -1 || a300 != -1 {
		t.Errorf("missing PSI = %v/%v/%v, want -1/-1/-1", a10, a60, a300)
	}
}
