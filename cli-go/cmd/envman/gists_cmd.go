package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
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

func gistsPushCmd() *cobra.Command {
	var force, public bool
	var desc string
	var tags []string
	cmd := &cobra.Command{
		Use:   "push <title> <file>...",
		Short: "Create or update a gist from local files",
		Long: `Bundle one or more local files into a single gist titled <title>. Each file's
language is auto-detected from its extension.

If a gist with that title already exists it is only updated when --force is
given; otherwise a new gist is created. --public marks it public.`,
		Example: "  envman gists push mycfg ./a.ts ./b.json\n" +
			"  envman gists push mycfg ./a.ts --force\n" +
			"  envman gists push notes ./README.md --public --tags docs",
		Args: cobra.MinimumNArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			title := args[0]
			files, err := readGistFiles(args[1:])
			if err != nil {
				return err
			}
			uid, err := projects.CurrentUserID(cfg)
			if err != nil {
				return err
			}
			existing, err := gists.ResolveByName(cfg, title, uid)
			if err != nil && !errors.Is(err, gists.ErrNotFound) {
				return err
			}
			if existing != nil {
				if !force {
					return fmt.Errorf("[envman] gist %q sudah ada — gunakan --force untuk memperbarui", title)
				}
				up := gists.UpdateInput{Files: files, IsPublic: &public}
				if desc != "" {
					up.Description = &desc
				}
				if len(tags) > 0 {
					t := splitCSV(tags)
					up.Tags = &t
				}
				if _, err := gists.Update(cfg, existing.ID, up); err != nil {
					return err
				}
				fmt.Fprintf(os.Stderr, "[envman] gist %q diperbarui (%d file)\n", title, len(files))
				return nil
			}
			in := gists.CreateInput{Title: title, Description: desc, Files: files, IsPublic: public, Tags: splitCSV(tags)}
			if _, err := gists.Create(cfg, in); err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "[envman] gist %q dibuat (%d file)\n", title, len(files))
			return nil
		},
	}
	cmd.Flags().BoolVar(&force, "force", false, "Update the gist if the title already exists")
	cmd.Flags().BoolVar(&public, "public", false, "Make the gist public")
	cmd.Flags().StringVar(&desc, "desc", "", "Gist description")
	cmd.Flags().StringSliceVar(&tags, "tags", nil, "Tags (comma-separated)")
	return cmd
}

func gistsPullCmd() *cobra.Command {
	var outDir string
	var force bool
	cmd := &cobra.Command{
		Use:   "pull <title|id>",
		Short: "Write a gist's files to disk",
		Long: `Fetch a gist and write its files. With a single file and no -o, the content is
printed to stdout. For multiple files use -o <dir> to write each file into that
directory. --force overwrites existing files.`,
		Example: "  envman gists pull mycfg              # single file → stdout\n" +
			"  envman gists pull mycfg -o ./out/    # all files → ./out/\n" +
			"  envman gists pull mycfg -o ./out/ --force",
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
			return pullGistFiles(g, outDir, force)
		},
	}
	cmd.Flags().StringVarP(&outDir, "output", "o", "", "Directory to write files into")
	cmd.Flags().BoolVar(&force, "force", false, "Overwrite existing files")
	return cmd
}

func gistsRmCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "rm <title|id>",
		Aliases: []string{"delete"},
		Short:   "Delete a gist",
		Long:    `Delete a gist by title (your own) or UUID. Only the owner or a SUPER_ADMIN can delete.`,
		Example: "  envman gists rm mycfg",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			g, err := resolveGist(cfg, args[0])
			if err != nil {
				return err
			}
			if err := gists.Delete(cfg, g.ID); err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "[envman] gist %q dihapus\n", g.Title)
			return nil
		},
	}
	return cmd
}

// resolveGist resolves ref (title or UUID) to a gist, needing the caller's user
// id for title matching.
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
func readGistFiles(paths []string) ([]gists.File, error) {
	files := make([]gists.File, 0, len(paths))
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			return nil, fmt.Errorf("[envman] tidak bisa membaca %s: %w", p, err)
		}
		name := filepath.Base(p)
		files = append(files, gists.File{
			Filename: name,
			Content:  string(data),
			Language: gists.DetectLanguage(name),
		})
	}
	return files, nil
}

// pullGistFiles writes a gist's files to stdout (single file, no dir) or into
// outDir (each file), honoring force for overwrite.
func pullGistFiles(g *gists.Gist, outDir string, force bool) error {
	if outDir == "" {
		if len(g.Files) != 1 {
			return fmt.Errorf("[envman] gist %q punya %d file — gunakan -o <dir> untuk menulis ke folder",
				g.Title, len(g.Files))
		}
		fmt.Print(g.Files[0].Content)
		return nil
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}
	for _, f := range g.Files {
		dest := filepath.Join(outDir, f.Filename)
		if !force {
			if _, err := os.Stat(dest); err == nil {
				return fmt.Errorf("[envman] %s sudah ada — gunakan --force untuk menimpa", dest)
			}
		}
		if err := atomicWrite(dest, f.Content); err != nil {
			return err
		}
	}
	fmt.Fprintf(os.Stderr, "[envman] %d file ditulis ke %s\n", len(g.Files), outDir)
	return nil
}

// splitCSV flattens comma-separated flag values into a trimmed slice.
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
