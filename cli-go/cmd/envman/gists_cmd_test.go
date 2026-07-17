package main

import (
	"testing"
	"time"
)

func TestSplitCSV(t *testing.T) {
	cases := []struct {
		in   []string
		want []string
	}{
		{nil, []string{}},
		{[]string{"a,b,c"}, []string{"a", "b", "c"}},
		{[]string{"a", "b"}, []string{"a", "b"}},
		{[]string{" a , b ,, c "}, []string{"a", "b", "c"}},
		{[]string{""}, []string{}},
	}
	for _, c := range cases {
		got := splitCSV(c.in)
		if len(got) != len(c.want) {
			t.Errorf("splitCSV(%v) = %v, want %v", c.in, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("splitCSV(%v)[%d] = %q, want %q", c.in, i, got[i], c.want[i])
			}
		}
	}
}

func TestHumanAgo(t *testing.T) {
	now := time.Now()
	cases := []struct {
		t    time.Time
		want string
	}{
		{time.Time{}, "-"},
		{now.Add(-30 * time.Second), "just now"},
		{now.Add(-5 * time.Minute), "5m"},
		{now.Add(-3 * time.Hour), "3h"},
		{now.Add(-2 * 24 * time.Hour), "2d"},
	}
	for _, c := range cases {
		if got := humanAgo(c.t); got != c.want {
			t.Errorf("humanAgo(%v) = %q, want %q", c.t, got, c.want)
		}
	}
	// Older than 30 days → an ISO date, not a relative age.
	old := now.Add(-60 * 24 * time.Hour)
	if got := humanAgo(old); got != old.Format("2006-01-02") {
		t.Errorf("humanAgo(old) = %q, want date %q", got, old.Format("2006-01-02"))
	}
}
