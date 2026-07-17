package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/gists"
)

// renderGistList prints a gist listing as a table, or bare titles when quiet.
// nextCursor, if non-empty, is reported to stderr so scripts can page.
func renderGistList(list []gists.Gist, nextCursor string, quiet bool) error {
	if quiet {
		for _, g := range list {
			fmt.Println(g.Title)
		}
		return nil
	}
	if len(list) == 0 {
		fmt.Fprintln(os.Stderr, "[envman] tidak ada gist")
		return nil
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
	fmt.Fprintln(w, "TITLE\tFILES\tVISIBILITY\tUPDATED\tOWNER")
	for _, g := range list {
		vis := "private"
		if g.IsPublic {
			vis = "public"
		}
		fmt.Fprintf(w, "%s\t%d\t%s\t%s\t%s\n",
			g.Title, len(g.Files), vis, humanAgo(g.UpdatedAt), g.User.Name)
	}
	w.Flush()
	if nextCursor != "" {
		fmt.Fprintf(os.Stderr, "[envman] halaman berikutnya: --cursor %s\n", nextCursor)
	}
	return nil
}

// renderGist prints one gist's detail and file list, or the raw JSON.
func renderGist(g *gists.Gist, asJSON bool) error {
	if asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(g)
	}
	vis := "private"
	if g.IsPublic {
		vis = "public"
	}
	fmt.Printf("# %s (%s)\n", g.Title, vis)
	if g.Description != "" {
		fmt.Printf("%s\n", g.Description)
	}
	if len(g.Tags) > 0 {
		fmt.Printf("tags: %s\n", strings.Join(g.Tags, ", "))
	}
	fmt.Printf("owner: %s · updated: %s\n\n", g.User.Name, humanAgo(g.UpdatedAt))
	w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
	fmt.Fprintln(w, "FILE\tLANGUAGE\tSIZE")
	for _, f := range g.Files {
		fmt.Fprintf(w, "%s\t%s\t%s\n", f.Filename, f.Language, gists.FmtBytes(len(f.Content)))
	}
	w.Flush()
	return nil
}

// humanAgo renders a timestamp as a short relative age (e.g. "3h", "2d").
// Falls back to a date for anything older than ~30 days.
func humanAgo(t time.Time) string {
	if t.IsZero() {
		return "-"
	}
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	case d < 30*24*time.Hour:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	default:
		return t.Format("2006-01-02")
	}
}
