package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/docs"
	"github.com/spf13/cobra"
)

func docsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "docs",
		Short: "Print CLI reference to stdout (install, auth, inject, storage, CI/CD, troubleshoot)",
		Long: `Fetch and print the complete CLI reference.

Covers: install, auth setup, inject vars, file execution,
alias expansion, storage commands, CI/CD patterns, troubleshooting.

The server copy is used when reachable (freshest, with real URLs); otherwise
the docs embedded in the binary are printed as an offline fallback.

Designed for piping into AI agents, files, or a pager:

  envman docs > context.md
  envman docs | pbcopy
  envman docs | less`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			// Server is authoritative (fresh docs + real origin in examples).
			// Fall back to the embedded copy when offline / not logged in.
			if md, ok := fetchServerDocs(); ok {
				_, err := io.Copy(os.Stdout, strings.NewReader(md))
				return err
			}
			fmt.Fprintln(os.Stderr, "[envman] server tidak dapat dihubungi — memakai dokumentasi bawaan (offline)")
			fmt.Print(docs.Render(auth.SavedServerURL()))
			return nil
		},
	}
}

// fetchServerDocs tries to pull the live CLI docs. Returns (md, true) on success;
// ("", false) on any failure so the caller can fall back to the embedded copy.
func fetchServerDocs() (string, bool) {
	cfg, err := auth.Resolve()
	if err != nil {
		return "", false
	}
	req, err := http.NewRequest("GET", cfg.Server+"/api/cli-docs.md", nil)
	if err != nil {
		return "", false
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", false
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", false
	}
	return string(body), true
}
