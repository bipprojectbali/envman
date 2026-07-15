package main

import "testing"

func TestLooksLikeTarget(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"myapp:prod", true},
		{"a:b", true},
		// files, not targets
		{".env", false},
		{".env.prod", false},
		{"config/.env", false},
		{"./dir:name", false}, // slash before colon → path
		{"C:\\path", false},   // backslash before colon → windows path
		{"noseparator", false},
		{":noslug", false}, // empty slug
		{"noenv:", false},  // empty env
		{"", false},
	}
	for _, c := range cases {
		if got := looksLikeTarget(c.in); got != c.want {
			t.Errorf("looksLikeTarget(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}
