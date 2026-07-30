package transfer

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// The TypeScript half of this contract lives in tests/unit/transfer-code.test.ts
// and reads the same file.
//
// normalizeCode is the canonicalisation contract with the database: the server
// hashes its output, so if these two implementations disagree by one byte, a
// code minted on one side cannot be claimed from the other — and the failure is
// silent, surfacing as a 404 deliberately indistinguishable from a wrong guess.
const fixturePath = "../../../tests/fixtures/code-normalization.json"

type codeFixture struct {
	Valid []struct {
		Why      string `json:"why"`
		Input    string `json:"input"`
		Expected string `json:"expected"`
	} `json:"valid"`
	Invalid []struct {
		Why   string `json:"why"`
		Input string `json:"input"`
	} `json:"invalid"`
}

func loadFixture(t *testing.T) codeFixture {
	t.Helper()
	raw, err := os.ReadFile(filepath.Clean(fixturePath))
	if err != nil {
		t.Fatalf("read shared fixture: %v — the TS and Go normalisers must be tested against the same vectors", err)
	}
	var f codeFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("parse shared fixture: %v", err)
	}
	if len(f.Valid) == 0 || len(f.Invalid) == 0 {
		t.Fatal("shared fixture is empty; it is meant to pin both implementations")
	}
	return f
}

func TestNormalizeCodeSharedVectors(t *testing.T) {
	f := loadFixture(t)

	for _, c := range f.Valid {
		t.Run("accepts: "+c.Why, func(t *testing.T) {
			got, err := NormalizeCode(c.Input)
			if err != nil {
				t.Fatalf("NormalizeCode(%q) error = %v, want %q", c.Input, err, c.Expected)
			}
			if got != c.Expected {
				t.Errorf("NormalizeCode(%q) = %q, want %q (TS produces the latter)", c.Input, got, c.Expected)
			}
		})
	}

	for _, c := range f.Invalid {
		t.Run("rejects: "+c.Why, func(t *testing.T) {
			if got, err := NormalizeCode(c.Input); err == nil {
				t.Errorf("NormalizeCode(%q) = %q, want an error", c.Input, got)
			}
		})
	}
}

// TestMnemonicIsNotGlyphFolded is the regression the class-aware rewrite exists
// for: the legacy path maps I/L to 1 and O to 0 to rescue a misread base32
// code, which would turn "viking" into "v1k1ng" and make every mnemonic
// unclaimable.
func TestMnemonicIsNotGlyphFolded(t *testing.T) {
	for _, in := range []string{
		"viking.pudding.alaska.sunny",
		"lookout.oilfield.illness.oyster", // dense in I, L and O
	} {
		got, err := NormalizeCode(in)
		if err != nil {
			t.Fatalf("NormalizeCode(%q) error: %v", in, err)
		}
		if got != in {
			t.Errorf("NormalizeCode(%q) = %q — glyph folding leaked into the mnemonic path", in, got)
		}
	}
}

// TestLegacyCodesStillClaimable guards codes already in the wild. Changing
// normalisation changes the hash, so these must keep resolving exactly as before.
func TestLegacyCodesStillClaimable(t *testing.T) {
	const canonical = "3F7K9QW2M4XZ7T1B"
	for _, in := range []string{
		canonical,
		"EM-3F7K-9QW2-M4XZ-7T1B",
		"em-3f7k-9qw2-m4xz-7t1b",
		"3F7K 9QW2 M4XZ 7T1B",
		"3F7K9QW2M4XZ7TIB", // I read as 1
		"3F7K9QW2M4XZ7TLB", // L read as 1
	} {
		got, err := NormalizeCode(in)
		if err != nil {
			t.Fatalf("NormalizeCode(%q) error: %v — an existing code became unclaimable", in, err)
		}
		if got != canonical {
			t.Errorf("NormalizeCode(%q) = %q, want %q", in, got, canonical)
		}
	}
}
