package transfer

import (
	"encoding/json"
	"testing"
)

func TestNormalizeCode(t *testing.T) {
	const canonical = "3F7K9QW2M4XZ7T1B"

	cases := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{"canonical", canonical, canonical, false},
		{"dashed with prefix", "EM-3F7K-9QW2-M4XZ-7T1B", canonical, false},
		{"lowercase", "em-3f7k-9qw2-m4xz-7t1b", canonical, false},
		{"surrounding space", "  EM-3F7K-9QW2-M4XZ-7T1B  ", canonical, false},
		{"inner spaces", "3F7K 9QW2 M4XZ 7T1B", canonical, false},
		// The alphabet omits I, L, O and U precisely so these misreadings are
		// recoverable rather than fatal.
		{"I read as 1", "3F7K9QW2M4XZ7TIB", canonical, false},
		{"L read as 1", "3F7K9QW2M4XZ7TLB", canonical, false},
		{"O read as 0", "OF7K9QW2M4XZ7T1B", "0F7K9QW2M4XZ7T1B", false},
		{"too short", "3F7K9QW2", "", true},
		{"too long", canonical + "XX", "", true},
		{"excluded letter U", "3F7K9QW2M4XZ7T1U", "", true},
		{"punctuation", "3F7K9QW2M4XZ7T1!", "", true},
		{"empty", "", "", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := NormalizeCode(c.in)
			if (err != nil) != c.wantErr {
				t.Fatalf("NormalizeCode(%q) error = %v, wantErr %v", c.in, err, c.wantErr)
			}
			if !c.wantErr && got != c.want {
				t.Errorf("NormalizeCode(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestFormatCodeRoundTrip(t *testing.T) {
	const bare = "3F7K9QW2M4XZ7T1B"
	formatted := FormatCode(bare)
	if formatted != "EM-3F7K-9QW2-M4XZ-7T1B" {
		t.Errorf("FormatCode(%q) = %q", bare, formatted)
	}
	back, err := NormalizeCode(formatted)
	if err != nil {
		t.Fatalf("NormalizeCode(%q) error: %v", formatted, err)
	}
	if back != bare {
		t.Errorf("round trip = %q, want %q", back, bare)
	}
}

// TestRefDispatch pins how `envman recv <arg>` decides which path to take: a
// UUID goes to the authenticated endpoint, a code to the anonymous one.
func TestRefDispatch(t *testing.T) {
	cases := []struct {
		in     string
		isUUID bool
		isCode bool
	}{
		{"3f7a1c92-0d1e-4b2a-9c3d-5e6f7a8b9c0d", true, false},
		{"EM-3F7K-9QW2-M4XZ-7T1B", false, true},
		{"3F7K9QW2M4XZ7T1B", false, true},
		{"not-a-ref", false, false},
		{"", false, false},
		// 16 hex chars are a valid code, but not a UUID — must not be routed
		// to the authenticated path.
		{"0123456789ABCDEF", false, true},
	}
	for _, c := range cases {
		if got := IsUUID(c.in); got != c.isUUID {
			t.Errorf("IsUUID(%q) = %v, want %v", c.in, got, c.isUUID)
		}
		if got := IsCode(c.in); got != c.isCode {
			t.Errorf("IsCode(%q) = %v, want %v", c.in, got, c.isCode)
		}
	}
}

// TestItemSizeIsInt64 guards the server's BIGINT column: a size past 2^31 must
// survive decoding, which it would not if Size were a plain int on a 32-bit
// build.
func TestItemSizeIsInt64(t *testing.T) {
	const big = int64(3) * 1024 * 1024 * 1024 // 3 GiB
	raw := `{"id":"x","kind":"FILE","size":3221225472,"mimeType":"application/sql"}`

	var item Item
	if err := json.Unmarshal([]byte(raw), &item); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if item.Size != big {
		t.Errorf("Size = %d, want %d", item.Size, big)
	}
}

func TestListResponseUnmarshal(t *testing.T) {
	raw := `{"transfers":[{"id":"a","from":{"id":"u1","name":"Budi","email":"budi@x.test"},"label":"cek","size":12}]}`
	var res listResponse
	if err := json.Unmarshal([]byte(raw), &res); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(res.Transfers) != 1 {
		t.Fatalf("len = %d, want 1", len(res.Transfers))
	}
	if res.Transfers[0].From == nil || res.Transfers[0].From.Email != "budi@x.test" {
		t.Errorf("From = %+v", res.Transfers[0].From)
	}
}
