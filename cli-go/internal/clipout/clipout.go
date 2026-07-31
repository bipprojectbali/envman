// Package clipout puts text on the clipboard so secrets never reach the
// terminal.
//
// Printing a secret to stdout leaves it in scrollback, where a screenshot,
// screen-share or passer-by can read it. Piping to pbcopy works but is easy to
// forget — and forgetting means it prints — and pbcopy does not exist on Linux
// or on the SSH boxes where this matters most.
//
// Order of attempts: pbcopy (macOS) → wl-copy (Wayland) → xclip (X11) → OSC 52.
// The last one is an escape sequence the terminal itself acts on, so over SSH
// it fills the clipboard of your LOCAL machine rather than the server's.
package clipout

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// Method names how the text reached the clipboard, so callers can adjust their
// message — OSC 52 in particular cannot be confirmed.
type Method string

const (
	MethodPbcopy Method = "pbcopy"
	MethodWlCopy Method = "wl-copy"
	MethodXclip  Method = "xclip"
	MethodOSC52  Method = "osc52"
)

// Confirmed reports whether the write was acknowledged. OSC 52 is
// fire-and-forget: a terminal that ignores it looks exactly like success.
// Callers holding a burn-after-read secret must warn when this is false.
func (m Method) Confirmed() bool { return m != MethodOSC52 }

// Options allows tests to drive the dispatch without spawning processes.
type Options struct {
	LookPath func(string) (string, error)
	// Env reads environment variables; nil uses os.Getenv.
	Env func(string) string
	// TTY overrides where the OSC 52 sequence is written; nil opens /dev/tty.
	TTY func() (*os.File, error)
}

func (o Options) lookPath() func(string) (string, error) {
	if o.LookPath != nil {
		return o.LookPath
	}
	return exec.LookPath
}

func (o Options) env() func(string) string {
	if o.Env != nil {
		return o.Env
	}
	return os.Getenv
}

// Copy writes data to the clipboard, returning which method succeeded.
func Copy(data []byte, o Options) (Method, error) {
	look := o.lookPath()

	// A real clipboard binary reports failure through its exit code, which is
	// what lets a caller recover. Prefer these over the unverifiable OSC 52.
	for _, c := range []struct {
		name   string
		method Method
		args   []string
	}{
		// On Linux `envman install pbcopy` puts an OSC 52 shim on PATH under
		// this name. Running it is redundant with our own OSC 52 path but
		// harmless, and respecting it keeps behaviour predictable.
		{"pbcopy", MethodPbcopy, nil},
		{"wl-copy", MethodWlCopy, nil},
		// xsel first: `xclip -selection clipboard` forks to hold the selection,
		// so waiting on it can hang. xsel -ib does not.
		{"xsel", MethodXclip, []string{"-ib"}},
		{"xclip", MethodXclip, []string{"-selection", "clipboard"}},
	} {
		if _, err := look(c.name); err != nil {
			continue
		}
		if err := runClipper(c.name, c.args, data); err != nil {
			return "", err
		}
		return c.method, nil
	}

	if err := writeOSC52(data, o); err != nil {
		return "", err
	}
	return MethodOSC52, nil
}

// runClipper feeds data to a clipboard binary over stdin.
func runClipper(name string, args []string, data []byte) error {
	cmd := exec.Command(name, args...)
	cmd.Stdin = strings.NewReader(string(data))
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("[envman] %s gagal menulis clipboard: %w", name, err)
	}
	return nil
}

// writeOSC52 sends the escape sequence to the controlling terminal.
//
// Unlike the bash shim in install_cmd.go this does NOT fall back to stdout when
// /dev/tty is unavailable: that would dump the base64-encoded secret into the
// pipe or scrollback, defeating the entire point of --copy.
func writeOSC52(data []byte, o Options) error {
	if runtime.GOOS == "windows" {
		return fmt.Errorf("[envman] tak ada clipboard di mesin ini — pakai -o <file>")
	}

	getenv := o.env()
	seq := osc52(data, getenv("TMUX") != "", getenv("TERM"))

	open := o.TTY
	if open == nil {
		open = func() (*os.File, error) { return os.OpenFile("/dev/tty", os.O_WRONLY, 0) }
	}
	tty, err := open()
	if err != nil {
		return fmt.Errorf("[envman] tak ada clipboard maupun terminal di mesin ini — pakai -o <file>")
	}
	defer tty.Close()

	if _, err := tty.WriteString(seq); err != nil {
		return fmt.Errorf("[envman] gagal mengirim ke terminal: %w", err)
	}
	return nil
}

// osc52 builds the clipboard escape sequence. Pure, so the wrapping rules can
// be tested byte for byte without a terminal.
//
// Ported from the bash shim at cmd/envman/install_cmd.go. "c" selects the
// clipboard (as opposed to "p", the primary selection).
func osc52(payload []byte, tmux bool, term string) string {
	seq := "\x1b]52;c;" + base64.StdEncoding.EncodeToString(payload) + "\a"

	switch {
	case tmux:
		// tmux DCS passthrough requires every inner ESC to be doubled. The
		// payload holds exactly one, at its start, so a single leading ESC is
		// equivalent — but double them properly in case that ever changes.
		return "\x1bPtmux;" + strings.ReplaceAll(seq, "\x1b", "\x1b\x1b") + "\x1b\\"
	case screenTerm(term):
		return "\x1bP" + seq + "\x1b\\"
	}
	return seq
}

// screenTerm matches the shell's ${TERM%%-*} == "screen", so screen-256color
// counts while screenshot-like names do not.
func screenTerm(term string) bool {
	return strings.SplitN(term, "-", 2)[0] == "screen"
}
