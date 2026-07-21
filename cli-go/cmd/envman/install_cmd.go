package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"

	"github.com/spf13/cobra"
)

// pbcopyScript / pbpasteScript are OSC 52 clipboard shims for headless / SSH
// boxes where the real clipboard lives on your LOCAL machine. They send text to
// the terminal (not a display server), so they need no package manager, no
// sudo, and no X11/Wayland. Copied verbatim from FITUR_PBCOPY.md.
const pbcopyScript = `#!/usr/bin/env bash
# pbcopy ala macOS untuk terminal/SSH via OSC 52.
# Mengirim stdin ke clipboard mesin LOKAL lewat escape sequence terminal.
# Butuh terminal yang mendukung OSC 52 (kitty, wezterm, iTerm2, alacritty,
# foot, xterm allowWindowOps, tmux/screen dgn passthrough aktif).
buf=$(cat)
b64=$(printf %s "$buf" | base64 | tr -d '\n')
seq="\033]52;c;${b64}\a"
if [ -n "$TMUX" ]; then
  # tmux: bungkus dengan DCS passthrough
  seq="\033Ptmux;\033${seq}\033\\"
elif [ "${TERM%%-*}" = "screen" ]; then
  # GNU screen: passthrough serupa
  seq="\033P${seq}\033\\"
fi
# Kirim ke controlling terminal bila ada; jika tidak (mis. pipe/cron),
# jatuh ke stdout supaya tetap bisa di-redirect.
if { printf "%b" "$seq" > /dev/tty; } 2>/dev/null; then
  :
else
  printf "%b" "$seq"
fi
`

const pbpasteScript = `#!/usr/bin/env bash
# pbpaste via OSC 52: minta terminal mengirim balik isi clipboard.
# Catatan: banyak terminal MENOLAK 'paste' OSC 52 demi keamanan
# (kitty & wezterm butuh diaktifkan; iTerm2 sering nonaktif).
# Kalau tidak ada balasan dalam 1 detik, keluar diam-diam.
old=$(stty -g 2>/dev/null)
stty -echo raw 2>/dev/null
printf "\033]52;c;?\a" > /dev/tty
resp=""
IFS= read -r -d $'\a' -t 1 resp < /dev/tty 2>/dev/null
[ -n "$old" ] && stty "$old" 2>/dev/null
b64=${resp##*;c;}
[ -n "$b64" ] && printf %s "$b64" | base64 -d 2>/dev/null
`

// pbcopyShims returns the shim scripts keyed by binary name.
func pbcopyShims() map[string]string {
	return map[string]string{"pbcopy": pbcopyScript, "pbpaste": pbpasteScript}
}

func installCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "install <target>",
		Short: "Install helper shims (e.g. OSC 52 pbcopy/pbpaste)",
		Long: `Install helper tools envman can use. Currently one target:

  pbcopy   Write OSC 52 pbcopy/pbpaste shims to ~/.local/bin so that piping to
           pbcopy works on headless/SSH boxes, where the real clipboard lives on
           the machine running your terminal. No sudo, no package manager, no
           X11/Wayland. Refuses if pbcopy already exists (e.g. on macOS) unless
           --force. Requires an OSC 52-capable terminal; inside tmux enable
           'set -g set-clipboard on'.`,
		Args: cobra.ExactArgs(1),
		Example: "  envman install pbcopy\n" +
			"  envman install pbcopy --dry-run\n" +
			"  envman install pbcopy --force --prefix ~/bin",
		RunE: func(cmd *cobra.Command, args []string) error {
			if args[0] != "pbcopy" {
				return fmt.Errorf("[envman] target tidak dikenal: %s (tersedia: pbcopy)", args[0])
			}
			return runInstallPbcopy(cmd)
		},
	}
	cmd.Flags().Bool("dry-run", false, "Print what would be written without touching the disk")
	cmd.Flags().Bool("force", false, "Overwrite even if pbcopy already exists")
	cmd.Flags().String("prefix", "", "Install dir (default: ~/.local/bin)")
	return cmd
}

func runInstallPbcopy(cmd *cobra.Command) error {
	dryRun, _ := cmd.Flags().GetBool("dry-run")
	force, _ := cmd.Flags().GetBool("force")
	prefix, _ := cmd.Flags().GetString("prefix")

	if prefix == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("[envman] tidak bisa menemukan home dir: %w", err)
		}
		prefix = filepath.Join(home, ".local", "bin")
	}

	// Refuse if pbcopy already exists (unless forced).
	if !force && !dryRun {
		if runtime.GOOS == "darwin" {
			fmt.Fprintln(os.Stderr, "[envman] pbcopy sudah tersedia bawaan macOS — tidak perlu install. Pakai --force untuk tetap memasang shim OSC 52.")
			return nil
		}
		if p, err := exec.LookPath("pbcopy"); err == nil {
			fmt.Fprintf(os.Stderr, "[envman] pbcopy sudah terpasang di %s. Pakai --force untuk menimpa dengan shim OSC 52.\n", p)
			return nil
		}
	}

	shims := pbcopyShims()
	names := make([]string, 0, len(shims))
	for n := range shims {
		names = append(names, n)
	}
	sort.Strings(names)

	if dryRun {
		fmt.Fprintf(os.Stderr, "[envman] (dry-run) Akan memasang ke %s:\n", prefix)
		for _, n := range names {
			fmt.Fprintf(os.Stderr, "\n# %s (chmod 0755)\n", filepath.Join(prefix, n))
			fmt.Fprint(os.Stderr, shims[n])
		}
		return nil
	}

	if err := os.MkdirAll(prefix, 0755); err != nil {
		return fmt.Errorf("[envman] tidak bisa membuat %s: %w", prefix, err)
	}
	fmt.Fprintln(os.Stderr, "[envman] Terpasang:")
	for _, n := range names {
		dest := filepath.Join(prefix, n)
		if err := os.WriteFile(dest, []byte(shims[n]), 0755); err != nil {
			return fmt.Errorf("[envman] gagal menulis %s: %w", dest, err)
		}
		// WriteFile respects umask; force the mode so it is executable.
		if err := os.Chmod(dest, 0755); err != nil {
			return fmt.Errorf("[envman] gagal chmod %s: %w", dest, err)
		}
		fmt.Fprintf(os.Stderr, "  %s\n", dest)
	}

	// PATH check.
	if !pathContains(prefix) {
		fmt.Fprintf(os.Stderr, "\n[envman] Catatan: %s belum ada di PATH. Tambahkan ke ~/.bashrc:\n", prefix)
		fmt.Fprintf(os.Stderr, "  export PATH=\"%s:$PATH\"\n", prefix)
	}

	fmt.Fprintln(os.Stderr, "\n[envman] Contoh pakai:")
	fmt.Fprintln(os.Stderr, "  envman env get myapp:dev DATABASE_URL -n | pbcopy")
	fmt.Fprintln(os.Stderr, "  echo \"halo\" | pbcopy")
	fmt.Fprintln(os.Stderr, "\n[envman] Syarat: terminal harus mendukung OSC 52 (kitty, wezterm, iTerm2, dst).")
	fmt.Fprintln(os.Stderr, "  Di dalam tmux, aktifkan: set -g set-clipboard on")
	return nil
}

// pathContains reports whether dir is one of the entries in $PATH.
func pathContains(dir string) bool {
	for _, p := range filepath.SplitList(os.Getenv("PATH")) {
		if p == dir {
			return true
		}
	}
	return false
}
