package clipboard

import (
	"testing"
	"time"
)

func TestParseTTL(t *testing.T) {
	cases := []struct {
		in      string
		want    int
		wantErr bool
	}{
		{"", 0, false},        // empty → server default
		{"30m", 1800, false},  // minutes
		{"2h", 7200, false},   // hours
		{"7d", 604800, false}, // days (custom suffix)
		{"1d", 86400, false},  // 1 day
		{"3600", 3600, false}, // bare number = seconds
		{"90s", 90, false},    // seconds via duration
		{"0", 0, true},        // non-positive
		{"-5", 0, true},       // negative number
		{"abc", 0, true},      // invalid
		{"0d", 0, true},       // zero days
	}
	for _, c := range cases {
		got, err := ParseTTL(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("ParseTTL(%q) expected error, got %d", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseTTL(%q) unexpected error: %v", c.in, err)
		}
		if got != c.want {
			t.Errorf("ParseTTL(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestHumanUntil(t *testing.T) {
	now := time.Date(2026, 7, 14, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		expires string
		want    string
	}{
		{now.Add(24 * time.Hour).Format(time.RFC3339), "24j 0m"},
		{now.Add(90 * time.Minute).Format(time.RFC3339), "1j 30m"},
		{now.Add(45 * time.Minute).Format(time.RFC3339), "45m"},
		{now.Add(-time.Hour).Format(time.RFC3339), "kedaluwarsa"},
	}
	for _, c := range cases {
		if got := HumanUntil(c.expires, now); got != c.want {
			t.Errorf("HumanUntil(%q) = %q, want %q", c.expires, got, c.want)
		}
	}
}
