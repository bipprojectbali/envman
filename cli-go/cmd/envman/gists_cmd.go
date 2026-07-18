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
	var force, public, clean bool
	var desc string
	var tags []string
	cmd := &cobra.Command{
		Use:   "push <title> <file>...",
		Short: "Create or update a gist from local files",
		Long: `Bundle one or more local files into a gist titled <title>. Each file's language
is auto-detected from its extension.

Push is a per-file upsert, so it only touches the files you name:
  - A new gist is created if the title doesn't exist yet.
  - A new filename is added to an existing gist.
  - An existing filename is left untouched unless you pass --force, which
    overwrites just that file. Other files in the gist are never removed.

To replace the whole gist (drop files you didn't name), pass --clean. To delete
a single file use "envman gists rm <title>:<filename>".

--public/--desc/--tags only change those fields when you actually pass them.`,
		Example: "  envman gists push mycfg ./a.ts ./b.json\n" +
			"  envman gists push mycfg ./a.ts --force        # overwrite a.ts, keep the rest\n" +
			"  envman gists push mycfg ./a.ts ./b.json --clean   # gist becomes exactly these\n" +
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
				return pushUpdate(cmd, cfg, existing, files, clean, force, public, desc, tags)
			}
			in := gists.CreateInput{Title: title, Description: desc, Files: files, IsPublic: public, Tags: splitCSV(tags)}
			if _, err := gists.Create(cfg, in); err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "[envman] gist %q dibuat (%d file)\n", title, len(files))
			return nil
		},
	}
	cmd.Flags().BoolVar(&force, "force", false, "Overwrite files that already exist in the gist")
	cmd.Flags().BoolVar(&clean, "clean", false, "Replace the whole gist with exactly the named files")
	cmd.Flags().BoolVar(&public, "public", false, "Make the gist public")
	cmd.Flags().StringVar(&desc, "desc", "", "Gist description")
	cmd.Flags().StringSliceVar(&tags, "tags", nil, "Tags (comma-separated)")
	return cmd
}

func gistsPullCmd() *cobra.Command {
	var outDir string
	var file string
	var force bool
	cmd := &cobra.Command{
		Use:   "pull <title|id>[:filename]",
		Short: "Write a gist's files to disk",
		Long: `Fetch a gist and write its files. With a single file and no -o, the content is
printed to stdout. For multiple files use -o <dir> to write each file into that
directory.

To pull just one file from a multi-file gist, name it with --file <name> or the
"title:filename" ref — the content goes to stdout (pipe-friendly), or to a file
with -o. --force overwrites existing files.`,
		Example: "  envman gists pull mycfg              # single file → stdout\n" +
			"  envman gists pull mycfg -o ./out/    # all files → ./out/\n" +
			"  envman gists pull mycfg --file a.ts  # one file → stdout (pipe-friendly)\n" +
			"  envman gists pull mycfg:a.ts | grep KEY   # same, via title:filename ref\n" +
			"  envman gists pull mycfg -o ./out/ --force",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			// A "title:filename" ref selects one file; an explicit --file wins
			// (lets you target a file when the title itself contains a colon).
			target, refFile := gists.SplitFileRef(args[0])
			if file == "" {
				file = refFile
			}
			g, err := resolveGist(cfg, target)
			if err != nil {
				return err
			}
			return pullGistFiles(g, file, outDir, force)
		},
	}
	cmd.Flags().StringVarP(&outDir, "output", "o", "", "Directory to write files into")
	cmd.Flags().StringVar(&file, "file", "", "Pull only this filename (stdout, or -o <file>)")
	cmd.Flags().BoolVar(&force, "force", false, "Overwrite existing files")
	return cmd
}

func gistsRmCmd() *cobra.Command {
	var file string
	cmd := &cobra.Command{
		Use:     "rm <title|id>[:filename]",
		Aliases: []string{"delete"},
		Short:   "Delete a gist, or a single file within it",
		Long: `Delete a gist by title (your own) or UUID. To delete just one file from a
multi-file gist, name it with the "title:filename" ref or --file <name>; the
rest of the gist is kept. You cannot delete the last remaining file this way —
delete the whole gist instead. Only the owner or a SUPER_ADMIN can delete.`,
		Example: "  envman gists rm mycfg\n" +
			"  envman gists rm mycfg:b.json      # delete one file, keep the rest\n" +
			"  envman gists rm mycfg --file b.json",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			target, refFile := gists.SplitFileRef(args[0])
			if file == "" {
				file = refFile
			}
			g, err := resolveGist(cfg, target)
			if err != nil {
				return err
			}
			if file != "" {
				return rmGistFile(cfg, g, file)
			}
			if err := gists.Delete(cfg, g.ID); err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "[envman] gist %q dihapus\n", g.Title)
			return nil
		},
	}
	cmd.Flags().StringVar(&file, "file", "", "Delete only this filename (keep the rest)")
	return cmd
}

// rmGistFile removes a single file from a gist via an update. Refuses to remove
// the last file (that would leave an empty gist — delete the whole gist instead).
func rmGistFile(cfg *auth.Config, g *gists.Gist, filename string) error {
	if findGistFile(g, filename) == nil {
		return fmt.Errorf("[envman] file %q tidak ada di gist %q — file tersedia: %s",
			filename, g.Title, strings.Join(gistFilenames(g), ", "))
	}
	if len(g.Files) == 1 {
		return fmt.Errorf("[envman] %q file terakhir di gist %q — hapus seluruh gist: envman gists rm %q",
			filename, g.Title, g.Title)
	}
	remaining := make([]gists.File, 0, len(g.Files)-1)
	for _, f := range g.Files {
		if f.Filename != filename {
			remaining = append(remaining, f)
		}
	}
	if _, err := gists.Update(cfg, g.ID, gists.UpdateInput{Files: remaining}); err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "[envman] file %q dihapus dari gist %q (%d file tersisa)\n",
		filename, g.Title, len(remaining))
	return nil
}

// pushUpdate applies a per-file upsert to an existing gist. Conflicting files
// (already present, no --force) abort the whole push so nothing is half-applied.
// public/desc/tags are only sent when their flags were actually set, so an
// update never silently resets metadata.
func pushUpdate(
	cmd *cobra.Command, cfg *auth.Config, existing *gists.Gist,
	files []gists.File, clean, force, public bool, desc string, tags []string,
) error {
	merged := gists.MergeFiles(existing.Files, files, clean, force)
	if len(merged.Conflicts) > 0 {
		return fmt.Errorf(
			"[envman] file sudah ada di gist %q: %s — gunakan --force untuk menimpa (file lain tetap aman)",
			existing.Title, strings.Join(merged.Conflicts, ", "))
	}

	up := gists.UpdateInput{Files: merged.Files}
	if cmd.Flags().Changed("public") {
		up.IsPublic = &public
	}
	if cmd.Flags().Changed("desc") {
		up.Description = &desc
	}
	if cmd.Flags().Changed("tags") {
		t := splitCSV(tags)
		up.Tags = &t
	}
	if _, err := gists.Update(cfg, existing.ID, up); err != nil {
		return err
	}

	switch {
	case clean:
		fmt.Fprintf(os.Stderr, "[envman] gist %q diganti — kini %d file\n", existing.Title, len(merged.Files))
	default:
		fmt.Fprintf(os.Stderr, "[envman] gist %q diperbarui — %d ditambah, %d ditimpa (total %d file)\n",
			existing.Title, len(merged.Added), len(merged.Overwritten), len(merged.Files))
	}
	return nil
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

// pullGistFiles writes a gist's files. When file is set, only that file is
// pulled (to stdout, or to outDir as a path/file). Otherwise: a single-file gist
// prints to stdout when outDir is empty, and any gist writes each file into
// outDir. force allows overwriting existing files.
func pullGistFiles(g *gists.Gist, file, outDir string, force bool) error {
	if file != "" {
		f := findGistFile(g, file)
		if f == nil {
			return fmt.Errorf("[envman] file %q tidak ada di gist %q — file tersedia: %s",
				file, g.Title, strings.Join(gistFilenames(g), ", "))
		}
		if outDir == "" {
			fmt.Print(f.Content)
			return nil
		}
		return writeGistFile(outDir, f.Filename, f.Content, force)
	}
	if outDir == "" {
		if len(g.Files) != 1 {
			return fmt.Errorf("[envman] gist %q punya %d file — gunakan --file <name> atau -o <dir>",
				g.Title, len(g.Files))
		}
		fmt.Print(g.Files[0].Content)
		return nil
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}
	for _, f := range g.Files {
		if err := writeGistFile(outDir, f.Filename, f.Content, force); err != nil {
			return err
		}
	}
	fmt.Fprintf(os.Stderr, "[envman] %d file ditulis ke %s\n", len(g.Files), outDir)
	return nil
}

// writeGistFile writes content to dest. If dest is an existing directory (or ends
// in a separator), filename is joined into it; otherwise dest is the file path.
func writeGistFile(dest, filename, content string, force bool) error {
	path := dest
	if info, err := os.Stat(dest); (err == nil && info.IsDir()) || os.IsPathSeparator(dest[len(dest)-1]) {
		if err := os.MkdirAll(dest, 0o755); err != nil {
			return err
		}
		path = filepath.Join(dest, filename)
	}
	if !force {
		if _, err := os.Stat(path); err == nil {
			return fmt.Errorf("[envman] %s sudah ada — gunakan --force untuk menimpa", path)
		}
	}
	return atomicWrite(path, content)
}

// findGistFile returns the file named name, or nil if absent.
func findGistFile(g *gists.Gist, name string) *gists.File {
	for i := range g.Files {
		if g.Files[i].Filename == name {
			return &g.Files[i]
		}
	}
	return nil
}

// gistFilenames returns the gist's filenames, for error messages.
func gistFilenames(g *gists.Gist) []string {
	names := make([]string, len(g.Files))
	for i := range g.Files {
		names[i] = g.Files[i].Filename
	}
	return names
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
