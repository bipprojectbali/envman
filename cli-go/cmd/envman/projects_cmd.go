package main

import (
	"fmt"
	"os"
	"sort"
	"text/tabwriter"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/projects"
	"github.com/spf13/cobra"
)

func projectsCmd() *cobra.Command {
	var mine, quiet, asJSON bool
	cmd := &cobra.Command{
		Use:     "projects [slug]",
		Aliases: []string{"project"},
		Short:   "List projects and their environments",
		Long: `List projects you can access. Pass a slug to list that project's
environments instead (envman projects <slug> = envman projects envs <slug>).

Bare "envman projects" lists projects rather than printing help, since that
is what the name promises; the subcommands ls and envs remain available.`,
		Example: "  envman projects\n" +
			"  envman projects --me\n" +
			"  envman projects -q | fzf\n" +
			"  envman projects myapp        # = projects envs myapp",
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 1 {
				return runProjectEnvs(args[0], quiet, asJSON)
			}
			return runProjectsList(mine, quiet, asJSON)
		},
	}
	cmd.Flags().BoolVar(&mine, "me", false, "Only projects you created")
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Print bare slugs/names (pipe-friendly)")
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.AddCommand(projectsLsCmd(), projectsEnvsCmd())
	return cmd
}

func projectsLsCmd() *cobra.Command {
	var mine, quiet, asJSON bool
	cmd := &cobra.Command{
		Use:   "ls",
		Short: "List all projects you can access",
		Long: `List projects visible to you: slug, name, environment count, and creator.
Use --me to show only projects you created, or -q for a bare slug list
(pipe-friendly). Identical to bare "envman projects".`,
		Example: "  envman projects ls\n" +
			"  envman projects ls --me\n" +
			"  envman projects ls -q | fzf",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runProjectsList(mine, quiet, asJSON)
		},
	}
	cmd.Flags().BoolVar(&mine, "me", false, "Only projects you created")
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Print bare slugs (pipe-friendly)")
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// runProjectsList backs both `projects ls` and bare `projects`, so the two can
// never drift apart.
func runProjectsList(mine, quiet, asJSON bool) error {
	cfg, err := auth.Resolve()
	if err != nil {
		return err
	}
	list, err := projects.List(cfg)
	if err != nil {
		return err
	}
	if mine {
		uid, err := projects.CurrentUserID(cfg)
		if err != nil {
			return err
		}
		list = projects.FilterMine(list, uid)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Slug < list[j].Slug })

	if asJSON {
		return emitJSON(list)
	}
	if quiet {
		for _, p := range list {
			fmt.Println(p.Slug)
		}
		return nil
	}
	if len(list) == 0 {
		fmt.Fprintln(os.Stderr, "[envman] tidak ada project")
		return nil
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
	fmt.Fprintln(w, "SLUG\tNAME\tENVS\tROLE\tCREATED BY")
	for _, p := range list {
		creator := p.CreatedBy.Name
		if creator == "" {
			creator = p.CreatedBy.Email
		}
		fmt.Fprintf(w, "%s\t%s\t%d\t%s\t%s\n", p.Slug, p.Name, p.Count.Environments, p.MyRole, creator)
	}
	w.Flush()
	return nil
}

func projectsEnvsCmd() *cobra.Command {
	var quiet, asJSON bool
	cmd := &cobra.Command{
		Use:   "envs <slug>",
		Short: "List environments in a project",
		Long:  `List the environments of a project: name, your access role, and var count.`,
		Example: "  envman projects envs myapp\n" +
			"  envman projects envs myapp -q",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runProjectEnvs(args[0], quiet, asJSON)
		},
	}
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Print bare env names (pipe-friendly)")
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

// runProjectEnvs lists a project's environments (shared by `projects envs` and
// the `projects <slug>` shortcut).
func runProjectEnvs(slug string, quiet, asJSON bool) error {
	cfg, err := auth.Resolve()
	if err != nil {
		return err
	}
	d, err := projects.Get(cfg, slug)
	if err != nil {
		return err
	}
	envs := d.Environments
	sort.Slice(envs, func(i, j int) bool { return envs[i].Name < envs[j].Name })

	if asJSON {
		return emitJSON(d)
	}
	if quiet {
		for _, e := range envs {
			fmt.Println(e.Name)
		}
		return nil
	}
	if len(envs) == 0 {
		fmt.Fprintf(os.Stderr, "[envman] %s belum punya environment\n", slug)
		return nil
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
	fmt.Fprintf(w, "# %s (%s)\n", d.Name, d.Slug)
	fmt.Fprintln(w, "ENV\tROLE\tVARS")
	for _, e := range envs {
		role := e.AccessRole
		if role == "" {
			role = "-"
		}
		fmt.Fprintf(w, "%s\t%s\t%d\n", e.Name, role, e.Count.Vars)
	}
	w.Flush()
	return nil
}
