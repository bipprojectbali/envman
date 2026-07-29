package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/portainer"
	"github.com/spf13/cobra"
)

func portainerCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "portainer <subcommand>",
		Aliases: []string{"pt"},
		Short:   "Control a project environment's Portainer stack",
		Long: `Inspect and operate the Portainer stack bound to a project environment.

The server holds the connection, stack, and endpoint details per environment,
so you only reference the environment as project:env.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error { return cmd.Help() },
	}
	cmd.AddCommand(
		ptStatusCmd(),
		ptPsCmd(),
		ptInspectCmd(),
		ptLogsCmd(),
		ptActionCmd("restart-soft", "Restart the stack without pulling images (stop→start)"),
		ptActionCmd("restart-recreate", "Recreate the stack (stop→start, redeploy compose)"),
		ptActionCmd("restart-repull", "Pull latest images then recreate the stack"),
		ptActionCmd("sync-repull", "Push env vars to the stack then repull"),
		ptActionCmd("prune", "Prune dangling images on the stack's endpoint"),
	)
	return cmd
}

func ptStatusCmd() *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "status <project>:<env>",
		Short: "Show stack status and container summary",
		Long: `Show whether the stack is running and list its containers.

Requires the stack:operate capability or EDITOR/OWNER on the environment.`,
		Example: "  envman portainer status myapp:prod\n  envman portainer status myapp:prod --json",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, t, err := ptResolve(args[0])
			if err != nil {
				return err
			}
			out, err := portainer.Status(cfg, t)
			if err != nil {
				return err
			}
			if asJSON {
				return emitJSON(out)
			}
			stackState := "inactive"
			if out.Stack.Status == 1 {
				stackState = "active"
			}
			fmt.Printf("Stack:      %s (%s)\n", out.Stack.Name, stackState)
			fmt.Printf("Containers: %d\n", len(out.Containers))
			if len(out.Containers) == 0 {
				return nil
			}
			fmt.Println()
			for _, c := range out.Containers {
				name := ""
				if len(c.Names) > 0 {
					name = c.Names[0]
				}
				ports := "-"
				if len(c.Ports) > 0 {
					ports = strings.Join(c.Ports, ",")
				}
				fmt.Printf("  %-12s  %-8s  %-24s  %-28s  %s\n", portainer.ShortID(c.ID), c.State, name, c.Status, ports)
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

func ptPsCmd() *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "ps <project>:<env>",
		Short: "List containers in the stack",
		Long: `List the stack's containers with their state, name and image.

Requires the stack:operate capability or EDITOR/OWNER on the environment.`,
		Example: "  envman portainer ps myapp:prod\n  envman portainer ps myapp:prod --json",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, t, err := ptResolve(args[0])
			if err != nil {
				return err
			}
			containers, err := portainer.Ps(cfg, t)
			if err != nil {
				return err
			}
			if asJSON {
				return emitJSON(containers)
			}
			if len(containers) == 0 {
				fmt.Println("(tidak ada container)")
				return nil
			}
			for _, c := range containers {
				name := ""
				if len(c.Names) > 0 {
					name = c.Names[0]
				}
				fmt.Printf("  %-12s  %-8s  %-30s  %s\n", c.ShortID, c.State, name, c.Image)
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

func ptInspectCmd() *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:     "inspect <project>:<env> <container>",
		Short:   "Show detailed status of one container",
		Long:    "Detailed view of one container: state, health, uptime, restart count, ports, mounts, and live CPU/memory (when running).",
		Example: "  envman portainer inspect myapp:prod web\n  envman portainer inspect myapp:prod web --json",
		Args:    cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, t, err := ptResolve(args[0])
			if err != nil {
				return err
			}
			i, err := portainer.Inspect(cfg, t, args[1])
			if err != nil {
				return err
			}
			if asJSON {
				return emitJSON(i)
			}
			fmt.Printf("Container: %s (%s)\n", i.Name, i.ID)
			fmt.Printf("Image:     %s\n", i.Image)
			state := i.State
			if i.Health != "" {
				state += " / " + i.Health
			}
			fmt.Printf("State:     %s\n", state)
			if i.Running {
				fmt.Printf("Started:   %s\n", i.StartedAt)
			} else if i.ExitCode != nil {
				fmt.Printf("Exit code: %d\n", *i.ExitCode)
			}
			fmt.Printf("Restarts:  %d\n", i.RestartCount)
			if len(i.Ports) > 0 {
				fmt.Printf("Ports:     %s\n", strings.Join(i.Ports, ", "))
			}
			if i.Stats != nil {
				fmt.Printf("CPU:       %.1f%%\n", i.Stats.CPUPercent)
				fmt.Printf("Memory:    %d/%d MB (%.1f%%)\n", i.Stats.MemUsageMB, i.Stats.MemLimitMB, i.Stats.MemPercent)
			}
			if len(i.Mounts) > 0 {
				fmt.Println("Mounts:")
				for _, m := range i.Mounts {
					fmt.Printf("  %s → %s (%s)\n", m.Source, m.Destination, m.Mode)
				}
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

func ptLogsCmd() *cobra.Command {
	var follow bool
	var tail int
	cmd := &cobra.Command{
		Use:   "logs <project>:<env> <container>",
		Short: "Show container logs (snapshot, or live with -f)",
		Long: `Print container logs. Without -f, prints the last N lines and exits.
With -f (follow), streams new lines live until interrupted (Ctrl+C).`,
		Example: "  envman portainer logs myapp:prod web\n" +
			"  envman portainer logs myapp:prod web --tail 500\n" +
			"  envman portainer logs myapp:prod web -f",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, t, err := ptResolve(args[0])
			if err != nil {
				return err
			}
			containerID := args[1]
			if follow {
				return portainer.LogsFollow(cfg, t, containerID, tail, os.Stdout)
			}
			lines, err := portainer.LogsSnapshot(cfg, t, containerID, tail)
			if err != nil {
				return err
			}
			for _, l := range lines {
				if l.Timestamp != "" {
					fmt.Printf("%s %s\n", l.Timestamp, l.Message)
				} else {
					fmt.Println(l.Message)
				}
			}
			return nil
		},
	}
	cmd.Flags().BoolVarP(&follow, "follow", "f", false, "Stream logs live until interrupted")
	cmd.Flags().IntVar(&tail, "tail", 200, "Number of trailing lines (max 1000)")
	return cmd
}

func ptActionCmd(action, short string) *cobra.Command {
	return &cobra.Command{
		Use:     action + " <project>:<env>",
		Short:   short,
		Example: "  envman portainer " + action + " myapp:prod",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, t, err := ptResolve(args[0])
			if err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "[envman] %s %s:%s ... ", action, t.Slug, t.Env)
			out, err := portainer.Action(cfg, t, action)
			if err != nil {
				fmt.Fprintln(os.Stderr, "gagal")
				return err
			}
			fmt.Fprintln(os.Stderr, "ok")
			if name, ok := out["stackName"].(string); ok && name != "" {
				fmt.Printf("stack: %s\n", name)
			}
			return nil
		},
	}
}

// ptResolve resolves auth config and parses the project:env target.
func ptResolve(ref string) (*auth.Config, portainer.Target, error) {
	cfg, err := auth.Resolve()
	if err != nil {
		return nil, portainer.Target{}, err
	}
	t, err := portainer.ParseTarget(ref)
	if err != nil {
		return nil, portainer.Target{}, err
	}
	return cfg, t, nil
}
