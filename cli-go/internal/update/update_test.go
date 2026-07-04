package update

import "testing"

func TestSemverGT(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		// newer > older
		{"0.18.3", "0.18.2", true},
		{"0.19.0", "0.18.9", true},
		{"1.0.0", "0.18.2", true},
		{"1.1.0", "1.0.9", true},
		// same
		{"0.18.2", "0.18.2", false},
		{"1.0.0", "1.0.0", false},
		// older < newer (the backwards-notice bug scenario)
		{"0.18.0", "0.18.2", false},
		{"0.18.2", "0.19.0", false},
		{"0.17.0", "0.18.2", false},
		// stale cache = older version in cache: should NOT trigger notice
		{"0.18.0", "0.18.2", false},
		// empty latest (no cache yet): should not trigger notice
		{"", "0.18.2", false},
		// edge: single-component version
		{"2", "1", true},
		{"1", "2", false},
		// two-component
		{"0.2", "0.1", true},
		{"0.1", "0.2", false},
		{"0.18", "0.18", false},
	}

	for _, c := range cases {
		got := semverGT(c.a, c.b)
		if got != c.want {
			t.Errorf("semverGT(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestShowUpdateNotice_NoBug(t *testing.T) {
	// Verify: if cache has older version than current binary, notice must NOT show.
	// This was the "v0.18.2 → v0.18.0" bug.
	current := "0.18.2"
	cacheLatest := "0.18.0" // stale cache from before deploy

	// semverGT(stale, current) must be false → no notice shown
	if semverGT(cacheLatest, current) {
		t.Errorf("semverGT(%q, %q) should be false — stale cache must not trigger notice", cacheLatest, current)
	}

	// And: actual newer version should trigger notice
	if !semverGT("0.18.3", current) {
		t.Errorf("semverGT(%q, %q) should be true — real update must trigger notice", "0.18.3", current)
	}
}
