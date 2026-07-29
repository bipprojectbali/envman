package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/bipprojectbali/envman/cli/internal/sysstat"
	"github.com/spf13/cobra"
)

func sysCmd() *cobra.Command {
	var asJSON bool
	var duDir string
	var publicIP bool
	cmd := &cobra.Command{
		Use:   "sys",
		Short: "Quick health snapshot of the local machine (host, cpu, memory, disk)",
		Long: `Runs entirely offline — no login and no server call.

Report the health of the machine this CLI runs on: host & uptime, current
user & active logins, network addresses, CPU load, memory & swap, and disk
usage per mounted filesystem.

Memory, swap and disks are flagged warning at >=80% used and critical at >=90%.
Load average is judged relative to the logical core count. Use --json for a
machine-readable snapshot you can pipe to an agent or a monitor.

Pass --du <dir> to also measure a project's disk footprint: total size plus a
per-top-level-entry breakdown (node_modules, .git, dist, …), so you can spot at
a glance which subdir is making the project balloon.

Everything is read locally with no network egress EXCEPT --public-ip, which
queries an external service for the machine's public address (opt-in).

This reads the LOCAL machine only. To inspect a remote stack, use "envman pt".`,
		Example: "  envman sys\n  envman sys --json\n  envman sys --du .\n  envman sys --public-ip",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := context.Background()
			rep := sysstat.Collect(ctx)

			if publicIP {
				if ip, err := sysstat.PublicIP(ctx); err == nil {
					rep.Identity.PublicIP = ip
				} else {
					rep.Warnings = append(rep.Warnings, "public IP: "+err.Error())
				}
			}

			var dir *sysstat.DirReport
			if duDir != "" {
				if st, err := os.Stat(duDir); err != nil || !st.IsDir() {
					return fmt.Errorf("[envman] bukan direktori: %s", duDir)
				}
				d, err := sysstat.DirUsage(duDir)
				if err != nil {
					return fmt.Errorf("[envman] gagal memindai %s: %w", duDir, err)
				}
				dir = &d
			}

			if asJSON {
				out := struct {
					sysstat.Report
					Dir *sysstat.DirReport `json:"dir,omitempty"`
				}{Report: rep, Dir: dir}
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(out)
			}
			printSysReport(rep)
			if dir != nil {
				printDirReport(*dir)
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output the snapshot as JSON")
	cmd.Flags().StringVar(&duDir, "du", "", "Also measure this directory's disk footprint (total + subdir breakdown)")
	cmd.Flags().BoolVar(&publicIP, "public-ip", false, "Also fetch the public IP from an external service (network egress)")
	return cmd
}
