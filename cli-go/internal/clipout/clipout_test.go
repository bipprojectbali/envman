package clipout

import (
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const esc = "\x1b"

func TestOSC52Plain(t *testing.T) {
	got := osc52([]byte("hello"), false, "xterm-256color")
	want := esc + "]52;c;" + base64.StdEncoding.EncodeToString([]byte("hello")) + "\a"
	if got != want {
		t.Errorf("osc52 = %q, want %q", got, want)
	}
}

func TestOSC52Tmux(t *testing.T) {
	got := osc52([]byte("hi"), true, "screen-256color")
	b64 := base64.StdEncoding.EncodeToString([]byte("hi"))
	// Inner ESC doubled, wrapped in DCS passthrough and terminated with ST.
	want := esc + "Ptmux;" + esc + esc + "]52;c;" + b64 + "\a" + esc + "\\"
	if got != want {
		t.Errorf("tmux wrapping = %q, want %q", got, want)
	}
	// tmux wins even when TERM also says screen — the shell used if/elif.
	if strings.HasPrefix(got, esc+"P"+esc+"]") {
		t.Error("screen wrapping applied instead of tmux")
	}
}

func TestOSC52Screen(t *testing.T) {
	got := osc52([]byte("hi"), false, "screen-256color")
	b64 := base64.StdEncoding.EncodeToString([]byte("hi"))
	want := esc + "P" + esc + "]52;c;" + b64 + "\a" + esc + "\\"
	if got != want {
		t.Errorf("screen wrapping = %q, want %q", got, want)
	}
}

func TestScreenTerm(t *testing.T) {
	cases := []struct {
		term string
		want bool
	}{
		{"screen", true},
		{"screen-256color", true},
		// Only the segment before the first HYPHEN counts, matching the shell's
		// ${TERM%%-*}. A dot is not a separator, so this stays one word and
		// does not equal "screen".
		{"screen.xterm", false},
		{"screenshot", false},
		{"xterm-256color", false},
		{"", false},
	}
	for _, c := range cases {
		if got := screenTerm(c.term); got != c.want {
			t.Errorf("screenTerm(%q) = %v, want %v", c.term, got, c.want)
		}
	}
}

func TestOSC52Payloads(t *testing.T) {
	cases := []struct {
		name string
		in   []byte
	}{
		{"empty", []byte("")},
		{"binary with NUL", []byte{0x00, 0xff, 0x1b, 0x07}},
		{"multiline", []byte("A=1\nB=2\n")},
		{"large", []byte(strings.Repeat("x", 100_000))},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := osc52(c.in, false, "xterm")
			// Base64 never wraps in Go, so the sequence must stay a single line
			// apart from any newline the payload itself encodes into base64.
			body := strings.TrimSuffix(strings.TrimPrefix(got, esc+"]52;c;"), "\a")
			if strings.Contains(body, "\n") {
				t.Error("base64 body must not contain newlines")
			}
			decoded, err := base64.StdEncoding.DecodeString(body)
			if err != nil {
				t.Fatalf("body is not valid base64: %v", err)
			}
			if string(decoded) != string(c.in) {
				t.Error("payload did not survive the round trip")
			}
		})
	}
}

// fakeLook returns a LookPath that only "finds" the named binaries.
func fakeLook(found ...string) func(string) (string, error) {
	set := map[string]bool{}
	for _, f := range found {
		set[f] = true
	}
	return func(name string) (string, error) {
		if set[name] {
			return "/usr/bin/" + name, nil
		}
		return "", errors.New("not found")
	}
}

// TestCopyFallsBackToOSC52 pins the end of the chain: with no clipboard binary
// on PATH, the escape sequence must be written to the terminal rather than
// leaking to stdout.
func TestCopyFallsBackToOSC52(t *testing.T) {
	dir := t.TempDir()
	ttyPath := filepath.Join(dir, "tty")

	method, err := Copy([]byte("secret"), Options{
		LookPath: fakeLook(), // nothing installed
		Env:      func(string) string { return "" },
		TTY:      func() (*os.File, error) { return os.Create(ttyPath) },
	})
	if err != nil {
		t.Fatalf("Copy: %v", err)
	}
	if method != MethodOSC52 {
		t.Errorf("method = %q, want osc52", method)
	}
	if method.Confirmed() {
		t.Error("OSC 52 must report itself as unconfirmed — a terminal that ignores it looks like success")
	}

	written, err := os.ReadFile(ttyPath)
	if err != nil {
		t.Fatalf("read tty: %v", err)
	}
	if !strings.Contains(string(written), "]52;c;") {
		t.Errorf("tty got %q, want an OSC 52 sequence", written)
	}
	// The point of --copy: the secret must never appear in plaintext.
	if strings.Contains(string(written), "secret") {
		t.Error("plaintext secret written to the terminal")
	}
}

func TestCopyErrorsWithNoTTY(t *testing.T) {
	_, err := Copy([]byte("x"), Options{
		LookPath: fakeLook(),
		Env:      func(string) string { return "" },
		TTY:      func() (*os.File, error) { return nil, errors.New("no tty") },
	})
	// Falling back to stdout here would dump the base64 secret into the pipe,
	// which is exactly what --copy exists to prevent.
	if err == nil {
		t.Fatal("expected an error when there is no clipboard and no terminal")
	}
	if !strings.Contains(err.Error(), "-o") {
		t.Errorf("error should point at -o as the alternative, got %q", err)
	}
}

// TestCopyPrefersRealClippers checks the ordering without spawning anything:
// a confirmable binary must win over OSC 52 whenever one is present.
func TestCopyPrefersRealClippers(t *testing.T) {
	for _, name := range []string{"pbcopy", "wl-copy", "xsel", "xclip"} {
		t.Run(name, func(t *testing.T) {
			var reached bool
			_, _ = Copy([]byte("x"), Options{
				LookPath: fakeLook(name),
				Env:      func(string) string { return "" },
				TTY: func() (*os.File, error) {
					reached = true
					return nil, errors.New("should not be reached")
				},
			})
			if reached {
				t.Errorf("%s was on PATH but Copy fell through to OSC 52", name)
			}
		})
	}
}
