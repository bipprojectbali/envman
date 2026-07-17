package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/bipprojectbali/envman/cli/internal/sysstat"
	"github.com/spf13/cobra"
)

// ANSI colors, matching the file-health command's palette.
const (
	cReset  = "\033[0m"
	cGreen  = "\033[32m"
	cYellow = "\033[33m"
	cRed    = "\033[31m"
	cDim    = "\033[2m"
	cBold   = "\033[1m"
)

func sysCmd() *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "sys",
		Short: "Quick health snapshot of the local machine (host, cpu, memory, disk)",
		Long: `Report the health of the machine this CLI runs on: host & uptime, CPU model
and load, memory & swap usage, and disk usage per mounted filesystem.

Memory, swap and disks are flagged warning at >=80% used and critical at >=90%.
Load average is judged relative to the logical core count. Use --json for a
machine-readable snapshot you can pipe to an agent or a monitor.

This reads the LOCAL machine only. To inspect a remote stack, use "envman pt".`,
		Example: "  envman sys\n  envman sys --json",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rep := sysstat.Collect(context.Background())
			if asJSON {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(rep)
			}
			printSysReport(rep)
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output the snapshot as JSON")
	return cmd
}

// statusColor maps a status to its ANSI color.
func statusColor(s sysstat.Status) string {
	switch s {
	case sysstat.Critical:
		return cRed
	case sysstat.Warning:
		return cYellow
	default:
		return cGreen
	}
}

// statusIcon maps a status to a glyph.
func statusIcon(s sysstat.Status) string {
	switch s {
	case sysstat.Critical:
		return "✗"
	case sysstat.Warning:
		return "⚠"
	default:
		return "✓"
	}
}

func printSysReport(r sysstat.Report) {
	// Header line with overall verdict.
	overall := r.Overall()
	fmt.Printf("%s%s %s%s  %s%s%s\n",
		statusColor(overall), statusIcon(overall), r.Host.Hostname, cReset,
		cDim, sysLabel(overall), cReset)

	// Host block.
	fmt.Printf("%shost%s   %s %s (%s) · kernel %s · up %s\n",
		cBold, cReset, r.Host.Platform, r.Host.Version, r.Host.Arch,
		r.Host.Kernel, r.Host.UptimeHuman)
	if r.Host.Virtualization != "" {
		fmt.Printf("       %svirt: %s%s\n", cDim, r.Host.Virtualization, cReset)
	}

	// CPU block.
	fmt.Printf("%scpu%s    %s · %d cores (%d logical) · %.0f%% busy · load %s%.2f%s / %.2f / %.2f\n",
		cBold, cReset, cpuModel(r.CPU.Model), r.CPU.CoresPhysical, r.CPU.CoresLogical,
		r.CPU.UsedPercent, statusColor(r.CPU.LoadStatus), r.CPU.Load1, cReset,
		r.CPU.Load5, r.CPU.Load15)

	// Memory + swap block.
	printMemLine("mem", r.Memory)
	if r.Swap.Total > 0 {
		printMemLine("swap", r.Swap)
	}

	// Disk block.
	if len(r.Disks) > 0 {
		fmt.Printf("%sdisk%s\n", cBold, cReset)
		w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
		for _, d := range r.Disks {
			col := statusColor(d.Status)
			fmt.Fprintf(w, "  %s%s%s\t%s\t%s%.0f%%%s\t%s / %s\t%s\n",
				col, statusIcon(d.Status), cReset, d.Mount,
				col, d.UsedPercent, cReset,
				human(d.Used), human(d.Total), d.Fstype)
		}
		w.Flush()
	}

	// Non-fatal collection warnings.
	for _, msg := range r.Warnings {
		fmt.Fprintf(os.Stderr, "%s[envman] tidak bisa membaca %s%s\n", cDim, msg, cReset)
	}
}

func printMemLine(label string, m sysstat.MemInfo) {
	col := statusColor(m.Status)
	fmt.Printf("%s%-4s%s   %s%s %.0f%%%s  %s / %s used\n",
		cBold, label, cReset, col, statusIcon(m.Status), m.UsedPercent, cReset,
		human(m.Used), human(m.Total))
}

// sysLabel renders a short verdict word for the header.
func sysLabel(s sysstat.Status) string {
	switch s {
	case sysstat.Critical:
		return "perlu perhatian"
	case sysstat.Warning:
		return "ada peringatan"
	default:
		return "sehat"
	}
}

// cpuModel falls back to a placeholder when the model string is empty.
func cpuModel(m string) string {
	if m == "" {
		return "unknown CPU"
	}
	return m
}

// human is a thin exported-style wrapper so the command can format bytes
// without reaching into the package's unexported helper.
func human(b uint64) string { return sysstat.HumanBytes(b) }
