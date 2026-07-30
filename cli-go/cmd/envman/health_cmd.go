package main

import (
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/bipprojectbali/envman/cli/internal/health"
	"github.com/spf13/cobra"
)

func healthCmd() *cobra.Command {
	var (
		status      string
		exts        string
		maxLines    int
		maxChars    int
		maxDepth    int
		hidden      bool
		quiet       bool
		copyOnly    string
		pathsOnly   string
		toClipboard bool
	)
	cmd := &cobra.Command{
		Use:   "health [dir]",
		Short: "Scan a local project for files too large for an AI agent's context",
		Long: `Runs entirely offline — no login and no server call.

Walk a directory and report files whose size (lines / characters) approaches
or exceeds a limit — the files that blow up an AI agent's context window.

Files are ok (<80% of limit), warning (80–99%), or critical (>=100%). Default
limits are 500 lines / 20,000 chars; override with --max-lines / --max-chars.
Dependency & build dirs (node_modules, .git, dist, vendor, …) are skipped, as
are binary files. Traversal stops at depth 20 by default (--depth 0 = no limit).

Use --paths <status> to print just the paths (one per line) so you can hand
them to an AI agent and ask it to split them. Add --copy to put that list on
the clipboard directly:

  envman health --paths critical --copy
  envman health --paths all | envman clip set`,
		Example: "  envman health\n" +
			"  envman health ./src --status critical\n" +
			"  envman health --ext ts,tsx,go\n" +
			"  envman health --copy warning",
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			root := "."
			if len(args) == 1 {
				root = args[0]
			}
			// `--copy <status>` used to be how you asked for a path list. --copy
			// is now a boolean, so that form silently reinterprets the status as
			// a directory. Catch it and name the new spelling.
			if toClipboard && isStatusWord(root) {
				return fmt.Errorf(
					"[envman] --copy kini hanya menyalin ke clipboard — untuk memilih status pakai: envman health --paths %s --copy", root)
			}
			if st, err := os.Stat(root); err != nil || !st.IsDir() {
				return fmt.Errorf("[envman] bukan direktori: %s", root)
			}

			files, sum, err := health.Scan(health.Options{
				Root:     root,
				MaxLines: maxLines,
				MaxChars: maxChars,
				Exts:     health.ParseExts(exts),
				Hidden:   hidden,
				MaxDepth: maxDepth,
			})
			if err != nil {
				return err
			}

			// --paths: bare paths for the chosen status, nothing else. The old
			// name for this was --copy, which collided with the CLI-wide --copy
			// meaning "put it on my clipboard" — this only formats for copying.
			if pathsOnly == "" && copyOnly != "" {
				pathsOnly = copyOnly
			}
			if pathsOnly != "" {
				var out []string
				for _, f := range files {
					if matchStatus(pathsOnly, f.Status) {
						out = append(out, f.Path)
					}
				}
				joined := strings.Join(out, "\n")
				if toClipboard {
					_, err := copyToClipboard(joined, fmt.Sprintf("%d path", len(out)))
					return err
				}
				for _, p := range out {
					fmt.Println(p)
				}
				return nil
			}

			// --quiet: bare paths of everything (optionally filtered by --status).
			if quiet {
				var out []string
				for _, f := range files {
					if status == "" || matchStatus(status, f.Status) {
						out = append(out, f.Path)
					}
				}
				if toClipboard {
					_, err := copyToClipboard(strings.Join(out, "\n"), fmt.Sprintf("%d path", len(out)))
					return err
				}
				for _, p := range out {
					fmt.Println(p)
				}
				return nil
			}

			printReport(root, files, sum, status)
			return nil
		},
	}
	cmd.Flags().StringVar(&status, "status", "", "Filter output by status: ok|warning|critical")
	cmd.Flags().StringVar(&exts, "ext", "", "Only scan these extensions (comma-separated, e.g. ts,tsx,go)")
	cmd.Flags().IntVar(&maxLines, "max-lines", 0, "Line limit (default 500)")
	cmd.Flags().IntVar(&maxChars, "max-chars", 0, "Character limit (default 20000)")
	cmd.Flags().IntVar(&maxDepth, "depth", -1, "Max directory depth (0 = unlimited; default 20)")
	cmd.Flags().BoolVar(&hidden, "all", false, "Include hidden (dot) directories")
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Print bare paths (pipe-friendly)")
	cmd.Flags().StringVar(&pathsOnly, "paths", "", "Print only paths of this status: critical|warning|all")
	cmd.Flags().BoolVar(&toClipboard, "copy", false, "Copy the output to the clipboard instead of printing")
	// The old string --copy meant "format for copying", not "copy for me". It
	// still works so nobody's scripts break, but it is hidden and superseded by
	// --paths, so --copy means one thing across the whole CLI.
	cmd.Flags().StringVar(&copyOnly, "copy-status", "", "Deprecated alias for --paths")
	_ = cmd.Flags().MarkHidden("copy-status")
	return cmd
}

// matchStatus reports whether a file's status matches a filter keyword.
// "all" matches warning + critical (the actionable ones).
// isStatusWord reports whether s is one of the --paths status values, used to
// detect the old `--copy <status>` form.
func isStatusWord(s string) bool {
	switch s {
	case "ok", "warning", "critical", "all":
		return true
	}
	return false
}

func matchStatus(filter string, s health.Status) bool {
	switch filter {
	case "all":
		return s == health.Warning || s == health.Critical
	case "ok", "warning", "critical":
		return string(s) == filter
	default:
		return false
	}
}

func printReport(root string, files []health.File, sum health.Summary, statusFilter string) {
	fmt.Printf("Scanned %d files in %s\n", sum.Total, root)
	fmt.Printf("  \033[32m✓ ok %d\033[0m   \033[33m⚠ warning %d\033[0m   \033[31m✗ critical %d\033[0m\n",
		sum.OK, sum.Warning, sum.Critical)
	if sum.SkippedDeep > 0 {
		fmt.Fprintf(os.Stderr, "  \033[2m%d direktori dilewati (>%d level). Pakai --depth 0 untuk tanpa batas.\033[0m\n",
			sum.SkippedDeep, sum.MaxDepth)
	}

	// Group output: critical then warning (ok hidden unless explicitly filtered).
	printGroup := func(label string, s health.Status, color string) {
		var rows []health.File
		for _, f := range files {
			if f.Status == s {
				rows = append(rows, f)
			}
		}
		if len(rows) == 0 {
			return
		}
		fmt.Printf("\n%s%s\033[0m\n", color, label)
		w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
		for _, f := range rows {
			fmt.Fprintf(w, "  %s\t%d lines\t%s\t%d%%\n", f.Path, f.Lines, humanChars(f.Chars), f.MaxPercent())
		}
		w.Flush()
	}

	if statusFilter == "ok" {
		printGroup("✓ OK", health.OK, "\033[32m")
		return
	}
	if statusFilter == "" || statusFilter == "critical" {
		printGroup("✗ CRITICAL", health.Critical, "\033[31m")
	}
	if statusFilter == "" || statusFilter == "warning" {
		printGroup("⚠ WARNING", health.Warning, "\033[33m")
	}
	if statusFilter == "" && sum.Warning == 0 && sum.Critical == 0 {
		fmt.Println("\n\033[32mSemua file dalam batas aman.\033[0m")
	}
}

func humanChars(n int) string {
	if n >= 1000 {
		return fmt.Sprintf("%.1fk chars", float64(n)/1000)
	}
	return fmt.Sprintf("%d chars", n)
}
