// Package secretin reads secrets from places that do not leak them to other
// users on the same machine.
//
// A secret passed as a command-line argument shows up in the process table:
// anyone running `ps aux` (or reading /proc on Linux) sees it, and it lands in
// shell history. croc had exactly this bug — CVE-2023-43621, "leaking the
// secret via the process name" — and fixed it by moving to an environment
// variable. envman had the same shape in `envman login --token` and
// `envman recv <CODE>`, which is worse than average because the code path is
// specifically for a freshly-provisioned machine someone else may share.
//
// Preference order, safest first:
//
//  1. environment variable — not in the process table, not in shell history
//  2. stdin — nothing persists anywhere
//  3. interactive prompt — only when attached to a terminal
//  4. the argument — still accepted, but warned about
package secretin

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"strings"
)

// Options describes where a secret may come from.
type Options struct {
	// Arg is the value taken from the command line, if the user passed one.
	Arg string
	// EnvVar is the environment variable to read instead, e.g. "ENVMAN_CODE".
	EnvVar string
	// Prompt is shown when asking interactively. Empty disables prompting.
	Prompt string
	// AllowStdin reads from stdin when it is piped (not a terminal).
	AllowStdin bool
	// Label names the secret in messages, e.g. "kode klaim".
	Label string
}

// Read resolves a secret, warning when it came from argv.
//
// Returns an error only when no source produced a value; an argv-sourced secret
// still succeeds, because refusing outright would break every existing script
// with no warning period.
func Read(o Options) (string, error) {
	if o.EnvVar != "" {
		if v := strings.TrimSpace(os.Getenv(o.EnvVar)); v != "" {
			return v, nil
		}
	}

	if o.Arg != "" {
		// Accepted, but say why it is worse. Stderr, so piping stays clean.
		fmt.Fprintf(os.Stderr,
			"[envman] peringatan: %s lewat argumen terlihat di `ps aux` dan tersimpan di history shell.\n"+
				"          Lebih aman: %s=… envman …  (atau pipe lewat stdin)\n",
			o.Label, envVarOrDefault(o.EnvVar))
		return o.Arg, nil
	}

	if o.AllowStdin && !isTerminal(os.Stdin) {
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			return "", err
		}
		if v := strings.TrimSpace(string(data)); v != "" {
			return v, nil
		}
	}

	if o.Prompt != "" && isTerminal(os.Stdin) {
		fmt.Fprint(os.Stderr, o.Prompt)
		line, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil && err != io.EOF {
			return "", err
		}
		if v := strings.TrimSpace(line); v != "" {
			return v, nil
		}
	}

	return "", fmt.Errorf("[envman] %s tidak diberikan — set %s, pipe lewat stdin, atau berikan sebagai argumen",
		o.Label, envVarOrDefault(o.EnvVar))
}

func envVarOrDefault(name string) string {
	if name == "" {
		return "ENVMAN_SECRET"
	}
	return name
}

// isTerminal reports whether f is attached to a terminal rather than a pipe or
// file. Uses only os.Stat so the CLI keeps its zero-dependency posture and
// stays CGO_ENABLED=0.
func isTerminal(f *os.File) bool {
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}
