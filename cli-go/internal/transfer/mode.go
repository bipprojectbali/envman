package transfer

import (
	"bytes"
	"mime"
	"path/filepath"
	"strings"
)

// Mode is which path a payload takes: encrypted in the database, or an object
// in storage.
type Mode string

const (
	// ModeText stores the payload hex-encoded and encrypted in a DB column. It
	// travels as a JSON body, costing ~2x on disk and ~2.7x in memory, so it is
	// only for small things — .env files, SSH keys, certificates.
	ModeText Mode = "text"
	// ModeFile uploads straight to storage with a presigned PUT. The bytes never
	// touch the server, so the limit here can be far larger.
	ModeFile Mode = "file"
)

// sniffLen matches git's binary heuristic: a NUL byte in the first 8000 bytes
// means binary.
const sniffLen = 8000

// ChooseMode decides how a payload should travel.
//
// Callers do not have to think about this: sending an image, a video or a
// database dump picks storage automatically, while a .env file stays on the
// cheap encrypted path.
//
// forceText/forceFile come from explicit flags and win outright.
func ChooseMode(head []byte, size int64, maxTextBytes int64, forceText, forceFile bool) Mode {
	switch {
	case forceFile:
		return ModeFile
	case forceText:
		return ModeText
	}
	// A NUL byte means binary — images, video, archives, executables.
	if bytes.IndexByte(head, 0) >= 0 {
		return ModeFile
	}
	if maxTextBytes > 0 && size > maxTextBytes {
		return ModeFile
	}
	return ModeText
}

// SniffLen is how many leading bytes ChooseMode needs.
func SniffLen() int { return sniffLen }

// GuessMimeType derives a Content-Type from a filename, defaulting to a generic
// binary type. The server signs the presigned PUT with whatever it is told, and
// the client must send exactly that back.
func GuessMimeType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != "" {
		if t := mime.TypeByExtension(ext); t != "" {
			// Strip any "; charset=..." parameter: the value has to match the
			// signed header byte for byte.
			if i := strings.IndexByte(t, ';'); i >= 0 {
				t = strings.TrimSpace(t[:i])
			}
			return t
		}
	}
	return "application/octet-stream"
}
