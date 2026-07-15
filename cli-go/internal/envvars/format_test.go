package envvars

import (
	"strings"
	"testing"
)

func TestFormatKeys(t *testing.T) {
	vars := map[string]string{"PORT": "3000", "API_KEY": "secret", "DATABASE_URL": "x"}

	t.Run("template default (KEY=)", func(t *testing.T) {
		got := FormatKeys(vars, false)
		want := "API_KEY=\nDATABASE_URL=\nPORT=\n"
		if got != want {
			t.Errorf("FormatKeys(template) = %q, want %q", got, want)
		}
	})

	t.Run("names only", func(t *testing.T) {
		got := FormatKeys(vars, true)
		want := "API_KEY\nDATABASE_URL\nPORT\n"
		if got != want {
			t.Errorf("FormatKeys(names) = %q, want %q", got, want)
		}
	})

	t.Run("never leaks values", func(t *testing.T) {
		for _, out := range []string{FormatKeys(vars, false), FormatKeys(vars, true)} {
			if strings.Contains(out, "3000") || strings.Contains(out, "secret") {
				t.Errorf("output leaked a value: %q", out)
			}
		}
	})

	t.Run("empty", func(t *testing.T) {
		if got := FormatKeys(map[string]string{}, false); got != "" {
			t.Errorf("empty = %q, want empty", got)
		}
	})
}

func TestFormatEnv(t *testing.T) {
	vars := map[string]string{
		"PORT":         "3000",
		"APP_NAME":     "my app",       // space → quoted
		"MULTILINE":    "line1\nline2", // newline → quoted+escaped
		"WITH_QUOTE":   `say "hi"`,     // quote → escaped
		"EMPTY":        "",             // empty stays bare
		"SECRET_TOKEN": MaskedValue,    // masked → skipped
	}
	out, masked := FormatEnv(vars)

	// masked reported, not written
	if len(masked) != 1 || masked[0] != "SECRET_TOKEN" {
		t.Errorf("expected SECRET_TOKEN masked, got %v", masked)
	}
	if strings.Contains(out, "SECRET_TOKEN") {
		t.Errorf("masked key should be omitted from output:\n%s", out)
	}

	// sorted order: APP_NAME before PORT
	if strings.Index(out, "APP_NAME") > strings.Index(out, "PORT") {
		t.Errorf("output not sorted:\n%s", out)
	}

	// specific line formats
	checks := map[string]string{
		"PORT":       "PORT=3000",
		"APP_NAME":   `APP_NAME="my app"`,
		"MULTILINE":  `MULTILINE="line1\nline2"`,
		"WITH_QUOTE": `WITH_QUOTE="say \"hi\""`,
		"EMPTY":      "EMPTY=",
	}
	for key, want := range checks {
		if !strings.Contains(out, want) {
			t.Errorf("%s: expected line %q in:\n%s", key, want, out)
		}
	}
}

func TestQuoteIfNeeded(t *testing.T) {
	cases := []struct{ in, want string }{
		{"simple", "simple"},
		{"3000", "3000"},
		{"", ""},
		{"has space", `"has space"`},
		{"a=b", `"a=b"`},
		{"with#hash", `"with#hash"`},
		{"tab\there", "\"tab\there\""}, // tab triggers quote, kept literal
	}
	for _, c := range cases {
		if got := quoteIfNeeded(c.in); got != c.want {
			t.Errorf("quoteIfNeeded(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
