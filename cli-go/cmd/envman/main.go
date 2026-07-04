package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/run"
	"github.com/bipprojectbali/envman/cli/internal/update"
)

const VERSION = "0.17.0"

func main() {
	args := os.Args[1:]

	// Hidden background update check flag
	if len(args) >= 4 && args[0] == "--_update-check" {
		update.RunBgUpdateCheck(args[1], args[2], args[3])
		return
	}

	// Show update notice + spawn background check (skip during update itself)
	if len(args) == 0 || args[0] != "update" {
		update.ShowUpdateNotice(VERSION)
		if sv := auth.SavedServerURL(); sv != "" {
			update.SpawnUpdateCheck(sv, "", VERSION)
		}
	}

	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" {
		printHelp()
		return
	}
	if args[0] == "--version" || args[0] == "-v" {
		fmt.Println(VERSION)
		return
	}

	switch args[0] {
	case "login":
		if err := cmdLogin(args[1:]); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
	case "logout":
		if err := auth.Remove(); err != nil {
			fmt.Fprintln(os.Stderr, "[envman] Failed to remove config:", err)
			os.Exit(1)
		}
		fmt.Println("Logged out.")
	case "whoami":
		if err := cmdWhoami(); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
	case "docs":
		if err := cmdDocs(args[1:]); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
	case "update":
		if err := cmdUpdate(); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
	case "run":
		if err := cmdRun(args[1:]); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
	default:
		// Run mode with -- separator (handles: -e flag, --server-wins, or bare --)
		sepIdx := -1
		for i, a := range args {
			if a == "--" {
				sepIdx = i
				break
			}
		}
		if sepIdx == -1 {
			// If args look like flags (-e, --server-wins) without --, give targeted error
			if strings.HasPrefix(args[0], "-") {
				fmt.Fprintln(os.Stderr, "Missing -- separator.")
				fmt.Fprintln(os.Stderr, "Usage: envman -e <project:env|file> -- <command>")
			} else {
				fmt.Fprintln(os.Stderr, "Unknown command:", args[0])
				fmt.Fprintln(os.Stderr, "Run 'envman --help' for usage.")
			}
			os.Exit(1)
		}
		flagArgs := args[:sepIdx]
		command := args[sepIdx+1:]
		if err := cmdRunWithFlags(flagArgs, command); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
	}
}

func cmdLogin(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("Usage: envman login <server-url> --token <token>")
	}
	server := args[0]
	var token string
	for i, a := range args {
		if a == "--token" && i+1 < len(args) {
			token = args[i+1]
		}
	}
	if token == "" {
		return fmt.Errorf("--token <token> required")
	}
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
}

func cmdWhoami() error {
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
}

func cmdDocs(args []string) error {
	if len(args) > 0 && (args[0] == "--help" || args[0] == "-h") {
		fmt.Println("Usage: envman docs")
		fmt.Println()
		fmt.Println("Print the full API docs and CLI reference to stdout.")
		fmt.Println("Pipe to a file or clipboard for use as AI agent context:")
		fmt.Println()
		fmt.Println("  envman docs > context.md")
		fmt.Println("  envman docs | pbcopy")
		return nil
	}
	cfg, err := auth.Resolve()
	if err != nil {
		return err
	}
	req, err := http.NewRequest("GET", cfg.Server+"/api/docs.md", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("[envman] failed to fetch docs: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("[envman] failed to fetch docs (HTTP %d)", resp.StatusCode)
	}
	_, err = io.Copy(os.Stdout, resp.Body)
	return err
}

func cmdUpdate() error {
	cfg, err := auth.Resolve()
	if err != nil {
		return fmt.Errorf("need auth to check update server — %w", err)
	}
	return update.Update(cfg.Server, VERSION)
}

func cmdRun(args []string) error {
	// "envman run [-e <source>]... <project>:<alias> [-- extraArgs...]"
	var sources []string
	var ref string
	var extraArgs []string

	i := 0
	for i < len(args) {
		if args[i] == "-e" && i+1 < len(args) {
			sources = append(sources, args[i+1])
			i += 2
		} else if args[i] == "--" {
			extraArgs = args[i+1:]
			i = len(args)
		} else if ref == "" {
			ref = args[i]
			i++
		} else {
			extraArgs = append(extraArgs, args[i])
			i++
		}
	}

	if ref == "" {
		return fmt.Errorf("Usage: envman run [-e <source>]... <project>:<alias>")
	}

	return run.Alias(sources, ref, extraArgs)
}

func cmdRunWithFlags(flagArgs []string, command []string) error {
	var sources []string
	serverWins := false
	i := 0
	for i < len(flagArgs) {
		switch flagArgs[i] {
		case "-e":
			if i+1 >= len(flagArgs) {
				return fmt.Errorf("-e requires a value")
			}
			sources = append(sources, flagArgs[i+1])
			i += 2
		case "--server-wins":
			serverWins = true
			i++
		default:
			return fmt.Errorf("unknown flag: %s\nRun 'envman --help' for usage.", flagArgs[i])
		}
	}

	if len(sources) == 0 && !hasFileRef(command) {
		return fmt.Errorf("Specify at least one -e source, or reference a project file directly.\n" +
			"Usage: envman -e project:env -- command\n" +
			"       envman -- bash myapp:scripts/deploy.sh")
	}

	return run.Run(sources, command, serverWins)
}

// hasFileRef checks if any command arg looks like a project file reference (slug:path/file.ext).
func hasFileRef(command []string) bool {
	for _, arg := range command {
		idx := strings.IndexByte(arg, ':')
		if idx < 0 {
			continue
		}
		rest := arg[idx+1:]
		if strings.Contains(rest, "/") || strings.Contains(rest, ".") {
			return true
		}
	}
	return false
}

func printHelp() {
	fmt.Printf(`envman v%s

USAGE:
  envman login <server-url> --token <token>   Save credentials to config file
  envman logout                                Remove saved credentials
  envman whoami                                Show current authenticated user
  envman update                                Update CLI to latest version
  envman docs                                  Print full API docs + CLI reference to stdout
  envman run [-e <source>]... <project>:<alias> [args...]  Expand alias + run
  envman [options] -- <command>                Inject env vars and run command
  envman -- <interpreter> <project>:<path/file.ext>  Execute project file

OPTIONS:
  -e <project>:<env>   Fetch vars from server environment
  -e <file>            Load vars from local file (.env, etc.)
  --server-wins        System env overrides merged vars (default: merged wins)

FILE REFERENCE (in command args, after --)
  slug:prefix/file.ext   Short form — disambiguated by "/" or extension
  slug:file.ext          Short form — single file

AUTHENTICATION (highest priority first):
  1. ENVMAN_SERVER + ENVMAN_TOKEN in a local -e file
  2. ENVMAN_SERVER + ENVMAN_TOKEN as system env vars
  3. Config file saved by envman login (~/.config/envman/config.json)

EXAMPLES:
  # Login
  envman login https://envman.example.com --token em_abc123

  # Single server env
  envman -e myapp:production -- bun start

  # Multiple server envs (later overrides earlier)
  envman -e myapp:base -e myapp:production -- bun dev

  # Mix server + local
  envman -e myapp:production -e .env.local -- bun dev

  # Execute project file
  envman -- bash myapp:scripts/deploy.sh
  envman -- bun myapp:utils/seed.ts

  # With env vars
  envman -e myapp:production -- bash myapp:scripts/deploy.sh

  # CI/CD — auth via env vars
  ENVMAN_SERVER=https://envman.example.com ENVMAN_TOKEN=em_xxx \
    envman -e myapp:production -- bun start

Manage projects at: <server-url>/envmanager
`, VERSION)
}

// Ensure api package is imported (used indirectly via FetchJSON)
var _ = json.Marshal
