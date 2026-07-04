package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/run"
	"github.com/bipprojectbali/envman/cli/internal/storage"
	"github.com/bipprojectbali/envman/cli/internal/update"
	"github.com/spf13/cobra"
)

// VERSION is set at build time via -ldflags "-X main.VERSION=x.y.z"
var VERSION = "0.18.0"

func main() {
	// Handle hidden background update-check before cobra sees the args.
	// Format: envman --_update-check <serverURL> <binaryPath> <currentVersion>
	if len(os.Args) >= 5 && os.Args[1] == "--_update-check" {
		update.RunBgUpdateCheck(os.Args[2], os.Args[3], os.Args[4])
		return
	}

	if err := buildRootCmd().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func buildRootCmd() *cobra.Command {
	var sources []string
	var serverWins bool

	root := &cobra.Command{
		Use:   "envman",
		Short: "Environment variable manager CLI",
		Long: fmt.Sprintf(`envman v%s — Environment variable manager

Inject env vars from your envman server into any command.
Reference project files and aliases stored on the server.`, VERSION),
		Version:       VERSION,
		SilenceErrors: true,
		SilenceUsage:  true,
		// Default run mode: handles "envman -e proj:env -- cmd" and "envman -- bash proj:script.sh"
		Args: cobra.ArbitraryArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				return cmd.Help()
			}
			if len(sources) == 0 && !hasFileRef(args) {
				return fmt.Errorf(
					"specify at least one -e source, or reference a project file\n\n" +
						"Usage:\n" +
						"  envman -e project:env -- command\n" +
						"  envman -- bash myapp:scripts/deploy.sh",
				)
			}
			return run.Run(sources, args, serverWins)
		},
		Example: `  # Inject env vars and run
  envman -e myapp:production -- bun start

  # Multiple sources (later overrides earlier)
  envman -e myapp:base -e myapp:production -- bun dev

  # Execute a project file
  envman -- bash myapp:scripts/deploy.sh

  # Expand and run an alias
  envman run myapp:deploy`,
	}

	// Output just the version number (no "envman version x.y.z" prefix)
	root.SetVersionTemplate("{{.Version}}\n")

	// Flags for root run-mode
	root.Flags().StringArrayVarP(&sources, "env", "e", nil, "Source: `project:env` or local .env file (repeatable)")
	root.Flags().BoolVar(&serverWins, "server-wins", false, "System env overrides merged vars (default: merged wins)")

	// Show update notice before any command except update/help/version.
	// PersistentPreRun is NOT called for --help or --version (cobra handles those first).
	root.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		if cmd.Name() != "update" {
			update.ShowUpdateNotice(VERSION)
			if sv := auth.SavedServerURL(); sv != "" {
				update.SpawnUpdateCheck(sv, "", VERSION)
			}
		}
	}

	root.AddCommand(
		loginCmd(),
		logoutCmd(),
		whoamiCmd(),
		docsCmd(),
		updateCmdFn(),
		runCmd(),
		storageCmd(),
	)

	return root
}

func loginCmd() *cobra.Command {
	var token string
	cmd := &cobra.Command{
		Use:   "login <server-url>",
		Short: "Save server credentials to config file",
		Long: `Authenticate with an envman server and save credentials locally.

Credentials are stored at ~/.config/envman/config.json and used
by default for all subsequent commands.`,
		Args:    cobra.ExactArgs(1),
		Example: `  envman login https://envman.example.com --token em_abc123`,
		RunE: func(cmd *cobra.Command, args []string) error {
			server := strings.TrimRight(args[0], "/")
			cfg := &auth.Config{Server: server, Token: token}
			var result struct {
				User struct {
					Email string `json:"email"`
					Role  string `json:"role"`
				} `json:"user"`
				TokenName string `json:"tokenName"`
			}
			if err := api.FetchJSON(cfg, "/api/envman/whoami", &result); err != nil {
				return fmt.Errorf("login failed — check server URL and token: %w", err)
			}
			if err := auth.Save(cfg); err != nil {
				return fmt.Errorf("save config: %w", err)
			}
			fmt.Printf("Logged in as %s (%s)\n", result.User.Email, result.User.Role)
			if result.TokenName != "" {
				fmt.Printf("Token: %s\n", result.TokenName)
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&token, "token", "", "API token (required)")
	_ = cmd.MarkFlagRequired("token")
	return cmd
}

func logoutCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "logout",
		Short: "Remove saved server credentials",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := auth.Remove(); err != nil {
				return fmt.Errorf("remove config: %w", err)
			}
			fmt.Println("Logged out.")
			return nil
		},
	}
}

func whoamiCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "Show current authenticated user and server",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			var result struct {
				User struct {
					Email string `json:"email"`
					Role  string `json:"role"`
				} `json:"user"`
				TokenName string `json:"tokenName"`
			}
			if err := api.FetchJSON(cfg, "/api/envman/whoami", &result); err != nil {
				return err
			}
			fmt.Printf("User:   %s (%s)\n", result.User.Email, result.User.Role)
			if result.TokenName != "" {
				fmt.Printf("Token:  %s\n", result.TokenName)
			}
			fmt.Printf("Server: %s\n", cfg.Server)
			return nil
		},
	}
}

func docsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "docs",
		Short: "Print CLI reference to stdout (install, auth, inject, storage, CI/CD, troubleshoot)",
		Long: `Fetch and print the complete CLI reference.

Covers: install, auth setup, inject vars, file execution,
alias expansion, storage commands, CI/CD patterns, troubleshooting.

Designed for piping into AI agents, files, or a pager:

  envman docs > context.md
  envman docs | pbcopy
  envman docs | less`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			req, err := http.NewRequest("GET", cfg.Server+"/api/cli-docs.md", nil)
			if err != nil {
				return err
			}
			req.Header.Set("Authorization", "Bearer "+cfg.Token)
			client := &http.Client{Timeout: 60 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				return fmt.Errorf("failed to fetch docs: %w", err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				return fmt.Errorf("failed to fetch docs (HTTP %d)", resp.StatusCode)
			}
			_, err = io.Copy(os.Stdout, resp.Body)
			return err
		},
	}
}

func updateCmdFn() *cobra.Command {
	return &cobra.Command{
		Use:   "update",
		Short: "Update CLI to the latest version from the server",
		Long: `Download and replace the current binary with the latest version.

The server URL is read from the saved credentials (envman login).
On macOS/Linux the binary is replaced in-place; sudo is used as fallback.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return fmt.Errorf("need auth to check update server — %w", err)
			}
			return update.Update(cfg.Server, VERSION)
		},
	}
}

func runCmd() *cobra.Command {
	var sources []string
	cmd := &cobra.Command{
		Use:   "run [-e source]... project:alias [-- extra args]",
		Short: "Expand a stored alias and run it",
		Long: `Fetch a stored alias from the server, expand its command args, and execute.

The alias defines the full command including any -e sources.
Extra -e flags you pass here are merged in (alias sources take precedence).`,
		Example: `  envman run myapp:deploy
  envman run -e .env.local myapp:deploy
  envman run myapp:deploy -- --verbose`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ref := args[0]
			extraArgs := args[1:]
			return run.Alias(sources, ref, extraArgs)
		},
	}
	cmd.Flags().StringArrayVarP(&sources, "env", "e", nil, "Additional source: `project:env` or local file")
	return cmd
}

func storageCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "storage <subcommand>",
		Short: "Manage project file storage",
		Long: `Upload, download, and list files in a project's storage.

Download streams to stdout by default — composable with pipes:
  envman storage download myapp:compose.yml | docker compose -f - up
  envman storage download myapp:scripts/setup.sh | bash`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error { return cmd.Help() },
	}
	cmd.AddCommand(storageLsCmd(), storageUploadCmd(), storageDownloadCmd(), storageRmCmd())
	return cmd
}

func storageLsCmd() *cobra.Command {
	var prefix string
	var page int
	cmd := &cobra.Command{
		Use:     "ls <project>",
		Short:   "List files and folders in project storage",
		Example: "  envman storage ls myapp\n  envman storage ls myapp --prefix assets/",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			result, err := storage.List(cfg, args[0], prefix, page)
			if err != nil {
				return err
			}
			fmt.Printf("Storage: %s / %s  (%d files)\n\n",
				storage.FmtBytes(result.Usage.UsedBytes),
				storage.FmtBytes(result.Usage.QuotaBytes),
				result.TotalFiles)
			for _, f := range result.Folders {
				fmt.Printf("  %s/\n", f)
			}
			for _, f := range result.Files {
				pub := ""
				if f.IsPublic {
					pub = " [public]"
				}
				fmt.Printf("  %-40s  %8s  %s%s\n", f.Path, storage.FmtBytes(f.Size), f.MimeType, pub)
			}
			if result.TotalFiles > result.PageSize {
				fmt.Printf("\nPage %d / %d  (use --page N for more)\n", result.Page, (result.TotalFiles+result.PageSize-1)/result.PageSize)
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&prefix, "prefix", "", "Folder prefix to list (e.g. assets/)")
	cmd.Flags().IntVar(&page, "page", 1, "Page number")
	return cmd
}

func storageUploadCmd() *cobra.Command {
	var remotePath string
	cmd := &cobra.Command{
		Use:   "upload <project> <file|dir>",
		Short: "Upload a file or folder to project storage (streaming)",
		Example: "  envman storage upload myapp compose.yml\n" +
			"  envman storage upload myapp ./logo.png --path assets/logo.png\n" +
			"  envman storage upload myapp ./assets/\n" +
			"  envman storage upload myapp ./dist/ --path static/dist",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			slug := args[0]
			localPath := args[1]

			stat, err := os.Stat(localPath)
			if err != nil {
				return fmt.Errorf("[envman] %w", err)
			}

			if stat.IsDir() {
				prefix := storage.RemotePath(localPath, remotePath)
				return storage.UploadDir(cfg, slug, localPath, prefix, os.Stderr)
			}

			target := storage.RemotePath(localPath, remotePath)
			name := filepath.Base(localPath)
			result, err := storage.Upload(cfg, slug, localPath, target, func(written, total int64, elapsed time.Duration) {
				renderProgress(name, written, total, elapsed)
			})
			clearProgress()
			if err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "Uploaded: %s (%s)\n", result.Object.Path, storage.FmtBytes(result.Object.Size))
			return nil
		},
	}
	cmd.Flags().StringVar(&remotePath, "path", "", "Remote path or prefix (default: basename of local file/dir)")
	return cmd
}

func storageDownloadCmd() *cobra.Command {
	var outFile string
	cmd := &cobra.Command{
		Use:   "download <project>:<path>",
		Short: "Download a file from project storage (streams to stdout by default)",
		Long: `Download a file and stream it to stdout, or save to a file with -o.

Streaming to stdout enables direct piping:
  envman storage download myapp:compose.yml | docker compose -f - up
  envman storage download myapp:scripts/setup.sh | bash
  envman storage download myapp:dump.sql | psql mydb`,
		Example: "  envman storage download myapp:assets/logo.png -o logo.png\n" +
			"  envman storage download myapp:compose.yml | docker compose -f - up",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			slug, remotePath, err := storage.ParseRef(args[0])
			if err != nil {
				return err
			}
			if outFile == "" || outFile == "-" {
				// Pipe mode: no progress — stdout must stay clean for downstream tools.
				return storage.Download(cfg, slug, remotePath, os.Stdout, nil)
			}
			f, err := os.Create(outFile)
			if err != nil {
				return fmt.Errorf("[envman] create %s: %w", outFile, err)
			}
			defer f.Close()
			name := filepath.Base(remotePath)
			err = storage.Download(cfg, slug, remotePath, f, func(written, total int64, elapsed time.Duration) {
				renderProgress(name, written, total, elapsed)
			})
			clearProgress()
			if err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "Downloaded: %s → %s\n", remotePath, outFile)
			return nil
		},
	}
	cmd.Flags().StringVarP(&outFile, "output", "o", "", "Output file (default: stdout)")
	return cmd
}

func storageRmCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "rm <project>:<folder>/",
		Short: "Delete a folder and all its contents from project storage (OWNER only)",
		Long: `Delete every file under a folder prefix. This action cannot be undone.

Requires OWNER role on the project.`,
		Example: "  envman storage rm myapp:assets/\n" +
			"  envman storage rm myapp:backup/2026-01/",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			slug, folderPath, err := storage.ParseRef(args[0])
			if err != nil {
				return err
			}
			folderPath = strings.TrimRight(folderPath, "/")
			if folderPath == "" {
				return fmt.Errorf("[envman] folder path tidak boleh kosong")
			}
			fmt.Printf("Menghapus %s:%s/ ... ", slug, folderPath)
			deleted, err := storage.DeleteFolder(cfg, slug, folderPath)
			if err != nil {
				fmt.Println("gagal")
				return err
			}
			fmt.Printf("selesai (%d file dihapus)\n", deleted)
			return nil
		},
	}
}

// hasFileRef returns true if any arg looks like a project file reference (slug:path/or.ext).
// Delegates to run.IsProjectFileRef for consistent logic with the run package.
// Excludes URL schemes (http://, https://, ftp://, etc.) to avoid false positives.
func hasFileRef(args []string) bool {
	for _, arg := range args {
		colon := strings.IndexByte(arg, ':')
		if colon <= 0 {
			continue
		}
		rest := arg[colon+1:]
		// Exclude URL schemes: they always have "//" immediately after ":"
		if strings.HasPrefix(rest, "//") {
			continue
		}
		if run.IsProjectFileRef(rest) {
			return true
		}
	}
	return false
}
