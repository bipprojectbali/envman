package main

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/run"
	"github.com/bipprojectbali/envman/cli/internal/secretin"
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
		// A binary run via `storage exec` that exits non-zero should propagate
		// its own exit code, not a generic 1, and not print a duplicate error.
		var exitErr *storage.ExitError
		if errors.As(err, &exitErr) {
			os.Exit(exitErr.Code)
		}
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
			// Commands that moved into a group would otherwise fall through to
			// the injector and produce a baffling "specify at least one -e
			// source" error. Name the new form instead.
			if moved, ok := movedCommands[args[0]]; ok {
				return fmt.Errorf("[envman] perintah %q kini %q — jalankan `envman %s --help`", args[0], moved, moved)
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
		installCmd(),
		storageCmd(),
		portainerCmd(),
		envCmd(),
		clipCmd(),
		transferCmd(),
		recvCmd(),
		projectsCmd(),
		healthCmd(),
		sysCmd(),
		gistsCmd(),
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
by default for all subsequent commands.

Prefer ENVMAN_TOKEN over --token: an argument is visible to anyone
running "ps aux" and is kept in your shell history. With neither, the
token is read from stdin or prompted for.`,
		Args: cobra.ExactArgs(1),
		Example: "  ENVMAN_TOKEN=em_abc123 envman login https://envman.example.com\n" +
			"  envman login https://envman.example.com          # prompts for the token\n" +
			"  cat token.txt | envman login https://envman.example.com",
		RunE: func(cmd *cobra.Command, args []string) error {
			server := strings.TrimRight(args[0], "/")
			resolved, err := secretin.Read(secretin.Options{
				Arg:        token,
				EnvVar:     "ENVMAN_TOKEN",
				Prompt:     "API token: ",
				AllowStdin: true,
				Label:      "API token",
			})
			if err != nil {
				return err
			}
			cfg := &auth.Config{Server: server, Token: resolved}
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
	cmd.Flags().StringVar(&token, "token", "",
		"API token. Prefer ENVMAN_TOKEN or stdin — an argument is visible in `ps aux`")
	return cmd
}

func logoutCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "logout",
		Short: "Remove saved server credentials",
		Long: `Delete ~/.config/envman/config.json.

Only removes the local copy — the API token itself stays valid on the
server until you revoke it there.`,
		Example: "  envman logout",
		Args:    cobra.NoArgs,
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
		Long: `Print which account, token and server the CLI is currently using.

Useful when several tokens or servers are in play, or to confirm a token
still works before running something that matters.`,
		Example: "  envman whoami",
		Args:    cobra.NoArgs,
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
  envman run myapp:deploy --resume --verbose`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ref := args[0]
			extraArgs := args[1:]
			return run.Alias(sources, ref, extraArgs)
		},
	}
	cmd.Flags().StringArrayVarP(&sources, "env", "e", nil, "Additional source: `project:env` or local file")
	// Stop flag parsing after the alias ref so trailing flags (e.g. --resume) pass
	// through to the expanded command instead of being rejected as unknown flags.
	// Own flags (-e/--server-wins) must precede the ref, matching every help example.
	cmd.Flags().SetInterspersed(false)
	return cmd
}

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

// movedCommands maps a removed top-level command to its replacement, so the
// root injector can say what happened instead of failing with an unrelated
// error about missing -e sources.
var movedCommands = map[string]string{
	"send":  "transfer send",
	"inbox": "transfer ls",
}
