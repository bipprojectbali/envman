package main

import (
	"errors"
	"fmt"
	"strings"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/gists"
	"github.com/bipprojectbali/envman/cli/internal/projects"
	"github.com/spf13/cobra"
)

func gistsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "gists <subcommand>",
		Aliases: []string{"gist"},
		Short:   "Manage gists (snippets) from the CLI",
		Long: `List, search, get, push, pull and remove gists. A gist holds one or more
files and is referenced by its unique title (per account) or its UUID.

Push a folder of files into one gist, pull them back out, or search across your
own and public gists.`,
	}
	cmd.AddCommand(gistsLsCmd(), gistsFindCmd(), gistsGetCmd(), gistsPushCmd(), gistsPullCmd(), gistsRmCmd())
	return cmd
}

func gistsLsCmd() *cobra.Command {
	var quiet, publicOnly bool
	var limit int
	var cursor string
	cmd := &cobra.Command{
		Use:   "ls",
		Short: "List gists you can access (own + public)",
		Long: `List gists: title, file count, visibility, owner, and last update. Shows up to
--limit gists (default 100); pass --cursor <id> for the next page. Use -q for a
bare title list (pipe-friendly).`,
		Example: "  envman gists ls\n" +
			"  envman gists ls --limit 50\n" +
			"  envman gists ls -q | fzf",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			res, err := gists.List(cfg, gists.ListOptions{Limit: limit, Cursor: cursor})
			if err != nil {
				return err
			}
			list := res.Gists
			if publicOnly {
				list = filterPublic(list)
			}
			return renderGistList(list, res.NextCursor, quiet)
		},
	}
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Print bare titles (pipe-friendly)")
	cmd.Flags().BoolVar(&publicOnly, "public", false, "Only public gists")
	cmd.Flags().IntVar(&limit, "limit", 100, "Max gists to list (server caps at 100)")
	cmd.Flags().StringVar(&cursor, "cursor", "", "Pagination cursor (gist id from a previous page)")
	return cmd
}

func gistsFindCmd() *cobra.Command {
	var quiet bool
	var tags []string
	cmd := &cobra.Command{
		Use:   "find <query>",
		Short: "Search gists by title/description",
		Long: `Search across your own and public gists. The query matches title or
description (case-insensitive). Filter by tags with --tags a,b.`,
		Example: "  envman gists find docker\n" +
			"  envman gists find deploy --tags ci,devops",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			res, err := gists.List(cfg, gists.ListOptions{Limit: 100, Search: args[0], Tags: splitCSV(tags)})
			if err != nil {
				return err
			}
			return renderGistList(res.Gists, res.NextCursor, quiet)
		},
	}
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Print bare titles (pipe-friendly)")
	cmd.Flags().StringSliceVar(&tags, "tags", nil, "Filter by tags (comma-separated)")
	return cmd
}

func gistsGetCmd() *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "get <title|id>",
		Short: "Show a gist's details and files",
		Long:  `Show a gist by its title (your own) or UUID: description, tags, and its files.`,
		Example: "  envman gists get 'Docker setup'\n" +
			"  envman gists get 'Docker setup' --json",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			g, err := resolveGist(cfg, args[0])
			if err != nil {
				return err
			}
			return renderGist(g, asJSON)
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output the full gist as JSON")
	return cmd
}

func resolveGist(cfg *auth.Config, ref string) (*gists.Gist, error) {
	uid, err := projects.CurrentUserID(cfg)
	if err != nil {
		return nil, err
	}
	g, err := gists.Resolve(cfg, ref, uid)
	if errors.Is(err, gists.ErrNotFound) {
		return nil, fmt.Errorf("[envman] gist %q tidak ditemukan", ref)
	}
	return g, err
}

// readGistFiles reads each local path into a gist File with a detected language.
func splitCSV(vals []string) []string {
	out := []string{}
	for _, v := range vals {
		for _, part := range strings.Split(v, ",") {
			if p := strings.TrimSpace(part); p != "" {
				out = append(out, p)
			}
		}
	}
	return out
}

func filterPublic(list []gists.Gist) []gists.Gist {
	out := make([]gists.Gist, 0, len(list))
	for _, g := range list {
		if g.IsPublic {
			out = append(out, g)
		}
	}
	return out
}
