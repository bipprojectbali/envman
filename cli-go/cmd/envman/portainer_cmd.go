package main

import (
	"fmt"
	"os"

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
	return &cobra.Command{
		Use:     "status <project>:<env>",
		Short:   "Show stack status and container summary",
		Example: "  envman portainer status myapp:prod",
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
			if stack, ok := out["stack"].(map[string]any); ok {
				fmt.Printf("Stack:  %v (%v)\n", stack["name"], stack["status"])
			}
			if cs, ok := out["containers"].([]any); ok {
				fmt.Printf("Containers: %d\n", len(cs))
			}
			return nil
		},
	}
}

func ptPsCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "ps <project>:<env>",
		Short:   "List containers in the stack",
		Example: "  envman portainer ps myapp:prod",
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
