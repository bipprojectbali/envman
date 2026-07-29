package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"text/tabwriter"

	"github.com/bipprojectbali/envman/cli/internal/envsync"
	"github.com/spf13/cobra"
)

// defaultSyncTarget is the file extended when the user names only a source.
const defaultSyncTarget = ".env"

// exampleNameRe recognises files that are meant to be shared (and therefore
// hold placeholder values). Anything else is assumed to hold real values, and
// printing it to the terminal is worth a warning.
var exampleNameRe = regexp.MustCompile(`(?i)(example|sample|template|dist)`)

func envSyncCmd() *cobra.Command {
	var write bool
	var noBackup bool
	var keysOnly bool

	cmd := &cobra.Command{
		Use:   "sync <source> [target]",
		Short: "Add keys that a local .env is missing, comparing against another file",
		Long: `Compare two local .env-style files and add the keys present in <source>
but missing from [target] (default: .env). Runs entirely offline — no login
and no server call.

Only ever ADDS. A key already present in the target is never touched, so its
value is safe. New keys are appended at the end of the file in one block,
carrying over the source's group headings and per-key comments; the target's
existing lines, ordering and comments are preserved byte for byte.

Keys that exist only in the target (possibly stale config) are reported but
never removed. Values are copied from the source verbatim.

Defaults to a dry run — pass --write to apply. Applying first saves a
<target>.bak backup.`,
		Example: "  envman env sync .env.example\n" +
			"  envman env sync .env.example .env\n" +
			"  envman env sync .env.example --write\n" +
			"  envman env sync .env.example --keys-only\n" +
			"  envman env sync .env.example --write --no-backup",
		Args: cobra.RangeArgs(1, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			source := args[0]
			target := defaultSyncTarget
			if len(args) == 2 {
				target = args[1]
			}

			srcStat, err := os.Stat(source)
			if err != nil || srcStat.IsDir() {
				return fmt.Errorf("[envman] bukan file: %s", source)
			}
			// Syncing a file into itself would append its own keys back onto it.
			if tgtStat, err := os.Stat(target); err == nil {
				if os.SameFile(srcStat, tgtStat) {
					return fmt.Errorf("[envman] source dan target adalah file yang sama: %s", target)
				}
			}

			res, err := envsync.Plan(envsync.Options{SourcePath: source, TargetPath: target})
			if err != nil {
				return err
			}

			for _, d := range res.Duplicates {
				fmt.Fprintf(os.Stderr, "[envman] key ganda di %s: %s (baris %v) — nilai terakhir dipakai\n",
					source, d.Key, d.Lines)
			}
			if !res.TargetExists {
				fmt.Fprintf(os.Stderr, "[envman] %s belum ada — akan dibuat\n", target)
			}

			if len(res.Missing) == 0 {
				if keysOnly {
					return nil
				}
				fmt.Printf("[envman] %s sudah sinkron dengan %s (%d key cocok, %d hanya di %s)\n",
					target, source, res.Summary.Common, res.Summary.Orphan, target)
				return nil
			}

			if keysOnly {
				for _, k := range envsync.MissingKeys(res.Missing) {
					fmt.Println(k)
				}
			}

			if !write {
				if !keysOnly {
					warnValueExposure(source)
					printSyncPlan(res, source, target)
				}
				fmt.Fprintf(os.Stderr, "[envman] jalankan ulang dengan --write untuk menerapkan\n")
				return nil
			}

			return applySync(res, target, noBackup, keysOnly)
		},
	}

	cmd.Flags().BoolVar(&write, "write", false, "Apply the changes (default is a dry run)")
	cmd.Flags().BoolVar(&noBackup, "no-backup", false, "Do not write a <target>.bak before applying")
	cmd.Flags().BoolVar(&keysOnly, "keys-only", false, "Print only the missing key names (pipeable)")
	return cmd
}

// applySync writes the planned content, preserving the target's file mode and
// following a symlink rather than replacing it.
func applySync(res envsync.Result, target string, noBackup, keysOnly bool) error {
	if res.TargetExists && !noBackup {
		backup := target + ".bak"
		if err := os.WriteFile(backup, res.ExistingBytes, 0600); err != nil {
			return fmt.Errorf("[envman] gagal menulis backup %s: %w", backup, err)
		}
	}

	// atomicWrite renames a temp file into place, which would replace a symlink
	// with a regular file. Resolve it so the real file is updated instead.
	dest := target
	if fi, err := os.Lstat(target); err == nil && fi.Mode()&os.ModeSymlink != 0 {
		resolved, err := filepath.EvalSymlinks(target)
		if err != nil {
			return fmt.Errorf("[envman] gagal mengikuti symlink %s: %w", target, err)
		}
		fmt.Fprintf(os.Stderr, "[envman] %s adalah symlink → menulis ke %s\n", target, resolved)
		dest = resolved
	}

	// atomicWrite chmods to 0600; restore whatever the file had so a 0644 .env
	// stays readable by other processes.
	var mode os.FileMode
	hadMode := false
	if fi, err := os.Stat(dest); err == nil {
		mode = fi.Mode().Perm()
		hadMode = true
	}

	if err := atomicWrite(dest, res.NewContent); err != nil {
		return err
	}
	if hadMode {
		if err := os.Chmod(dest, mode); err != nil {
			fmt.Fprintf(os.Stderr, "[envman] peringatan: gagal mengembalikan mode file %s: %v\n", dest, err)
		}
	}

	backupNote := ""
	if res.TargetExists && !noBackup {
		backupNote = fmt.Sprintf(" (backup: %s.bak)", target)
	}
	fmt.Fprintf(os.Stderr, "[envman] %d key ditambahkan ke %s%s\n", len(res.Missing), target, backupNote)
	if len(res.Orphans) > 0 {
		fmt.Fprintf(os.Stderr, "[envman] %d key hanya ada di %s (dibiarkan): %s\n",
			len(res.Orphans), target, strings.Join(res.Orphans, ", "))
	}
	return nil
}

// warnValueExposure flags that a dry run is about to print real values when the
// source does not look like a shareable example file.
func warnValueExposure(source string) {
	if exampleNameRe.MatchString(filepath.Base(source)) {
		return
	}
	fmt.Fprintf(os.Stderr,
		"[envman] catatan: nilai dari %s dicetak apa adanya ke layar — pakai --keys-only bila tak diinginkan\n", source)
}

// printSyncPlan renders the dry-run report to stdout. Columns are aligned with
// a tabwriter so long key names do not ragged-edge the group column.
func printSyncPlan(res envsync.Result, source, target string) {
	fmt.Printf("[envman] dry-run  %s → %s\n", source, target)

	w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
	for _, m := range res.Missing {
		fmt.Fprintf(w, "  +\t%s\t%s\n", m.Key, firstLine(m.Group))
	}
	for _, k := range res.Orphans {
		fmt.Fprintf(w, "  ?\t%s\t(hanya di %s — dibiarkan)\n", k, target)
	}
	w.Flush()

	fmt.Printf("\n  %d akan ditambahkan · %d sudah ada (tidak diubah) · %d hanya di %s\n",
		res.Summary.Missing, res.Summary.Common, res.Summary.Orphan, target)

	for _, k := range res.CommentedOut {
		fmt.Fprintf(os.Stderr, "[envman] %s sudah ada di %s tapi dikomentari — akan ditambahkan sebagai baris aktif\n", k, target)
	}

	fmt.Printf("\n--- blok yang akan ditambahkan ke %s ---\n%s", target, res.Block)
}

// firstLine keeps a multi-line group heading to one line in the report.
func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}
