package transfer

import (
	"bytes"
	"testing"
)

const oneMB = int64(1024 * 1024)

func TestChooseMode(t *testing.T) {
	text := []byte("DB_HOST=localhost\nAPI_KEY=abc\n")
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0x00, 0x11}, 40)...)

	cases := []struct {
		name      string
		head      []byte
		size      int64
		forceText bool
		forceFile bool
		want      Mode
	}{
		{"small text", text, 30, false, false, ModeText},
		// A NUL byte is the binary tell — images, video, archives, executables.
		{"png stays a file even when tiny", png, 88, false, false, ModeFile},
		{"text over the limit goes to storage", text, oneMB + 1, false, false, ModeFile},
		{"text exactly at the limit stays text", text, oneMB, false, false, ModeText},
		{"--file wins over a text sniff", text, 30, false, true, ModeFile},
		{"--text wins over a binary sniff", png, 88, true, false, ModeText},
		{"--file wins over --text", text, 30, true, true, ModeFile},
		{"empty head, small size", nil, 10, false, false, ModeText},
		// Guard against a misconfigured limit silently forcing everything to storage.
		{"zero limit disables the size rule", text, 999_999_999, false, false, ModeText},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			limit := oneMB
			if c.name == "zero limit disables the size rule" {
				limit = 0
			}
			got := ChooseMode(c.head, c.size, limit, c.forceText, c.forceFile)
			if got != c.want {
				t.Errorf("ChooseMode(size=%d) = %q, want %q", c.size, got, c.want)
			}
		})
	}
}

func TestGuessMimeType(t *testing.T) {
	cases := []struct{ in, want string }{
		{"dump.sql", "application/sql"},
		{"photo.png", "image/png"},
		{"clip.mp4", "video/mp4"},
		{"archive.zip", "application/zip"},
		{"no-extension", "application/octet-stream"},
		{"weird.zzzz", "application/octet-stream"},
	}
	for _, c := range cases {
		got := GuessMimeType(c.in)
		if c.want == "application/octet-stream" {
			if got != c.want {
				t.Errorf("GuessMimeType(%q) = %q, want %q", c.in, got, c.want)
			}
			continue
		}
		// The exact table varies per platform; what matters is that a known
		// extension resolves to something specific and carries no charset
		// parameter, which would break the presigned Content-Type match.
		if got == "application/octet-stream" {
			t.Errorf("GuessMimeType(%q) = %q, want a specific type", c.in, got)
		}
		if bytes.ContainsRune([]byte(got), ';') {
			t.Errorf("GuessMimeType(%q) = %q, must not carry parameters", c.in, got)
		}
	}
}

func TestSniffLen(t *testing.T) {
	if SniffLen() != 8000 {
		t.Errorf("SniffLen() = %d, want 8000", SniffLen())
	}
}
