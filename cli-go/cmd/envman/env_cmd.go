package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/envparser"
	"github.com/bipprojectbali/envman/cli/internal/envvars"
	"github.com/spf13/cobra"
)

func envCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "env <subcommand>",
		Short: "Work with .env files: push, pull, inspect keys, sync",
		Long: `Push a local .env to a project environment (upsert per key), or pull an
environment's vars into a .env file.

Secrets are auto-detected from key names (e.g. *_TOKEN, *_KEY, *PASSWORD*,
*SECRET*, DATABASE_URL). Keys already stored as secret on the server stay
secret. Override per key with --plain / --secret, or disable with --no-detect.`,
	}
	cmd.AddCommand(envPushCmd(), envPullCmd(), envGetCmd(), envKeysCmd(), envSyncCmd())
	return cmd
}

// looksLikeTarget reports whether arg is a project:env ref rather than a file
// path. Same idea as `envman run` file-vs-target disambiguation: a ":" with a
// non-empty slug and env, no path separator around the colon (rules out both
// "./dir:name" paths and Windows "C:\path" drives).
func looksLikeTarget(arg string) bool {
	idx := strings.IndexByte(arg, ':')
	if idx <= 0 || idx == len(arg)-1 {
		return false
	}
	// A separator before the colon means it's a path (e.g. ./dir:name).
	if strings.ContainsAny(arg[:idx], "/\\") {
		return false
	}
	// A separator right after the colon means a drive/path (e.g. C:\path, a:/b).
	if arg[idx+1] == '/' || arg[idx+1] == '\\' {
		return false
	}
	return true
}

// splitCSVList flattens repeated/comma-joined flag values into an ordered,
// de-duplicated list (order of first appearance). Used where order matters,
// e.g. --only reporting.
func splitCSVList(vals []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, v := range vals {
		for _, part := range strings.Split(v, ",") {
			if p := strings.TrimSpace(part); p != "" && !seen[p] {
				seen[p] = true
				out = append(out, p)
			}
		}
	}
	return out
}

// splitCSVSet parses "A,B,C" flag values into a set.
func splitCSVSet(vals []string) map[string]bool {
	out := map[string]bool{}
	for _, v := range vals {
		for _, part := range strings.Split(v, ",") {
			if p := strings.TrimSpace(part); p != "" {
				out[p] = true
			}
		}
	}
	return out
}

func envPushCmd() *cobra.Command {
	var dryRun, noDetect bool
	var plain, secret []string
	cmd := &cobra.Command{
		Use:   "push <project>:<env> [file]",
		Short: "Push a .env to an environment (upsert per key)",
		Long: `Read a .env (from [file], or stdin if omitted) and upsert each key into the
environment. Existing keys are updated; new keys are created. Keys present on
the server but absent from the file are left untouched (never deleted).`,
		Example: "  envman env push myapp:prod .env\n" +
			"  envman env push myapp:prod < .env\n" +
			"  envman env push myapp:prod .env --dry-run\n" +
			"  envman env push myapp:prod .env --plain PUBLIC_URL --secret LICENSE",
		Args: cobra.RangeArgs(1, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			t, err := envvars.ParseTarget(args[0])
			if err != nil {
				return err
			}
			local, err := readEnvInput(args)
			if err != nil {
				return err
			}
			if len(local) == 0 {
				return fmt.Errorf("[envman] tidak ada variabel untuk di-push (input kosong)")
			}
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}

			// Fetch existing to compute created/updated and preserve server secret flags.
			// A not-yet-created environment returns 404 here; that's fine — the PUT
			// below auto-creates it, so treat existing as empty and continue.
			existing, err := envvars.FetchExisting(cfg, t)
			if err != nil {
				if envvars.IsNotFound(err) {
					existing = map[string]string{}
				} else if dryRun {
					fmt.Fprintf(os.Stderr, "[envman] tidak bisa membaca state server (%v) — plan mengasumsikan semua key baru\n", err)
					existing = map[string]string{}
				} else {
					return err
				}
			}
			existingSecret := map[string]bool{}
			for k, v := range existing {
				if v == envvars.MaskedValue {
					existingSecret[k] = true // masked => it's a secret we can't read
				}
			}
			secretKeys := envvars.ClassifySecrets(local, existingSecret, splitCSVSet(plain), splitCSVSet(secret), !noDetect)

			if dryRun {
				printPushPlan(t, local, existing, secretKeys)
				return nil
			}
			res, err := envvars.Push(cfg, t, local, existing, secretKeys)
			if err != nil {
				return err
			}
			fmt.Printf("[envman] %s:%s — %d dibuat, %d diperbarui, %d sebagai secret\n",
				t.Slug, t.Env, len(res.Created), len(res.Updated), len(res.Secrets))
			return nil
		},
	}
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Show what would change without pushing")
	cmd.Flags().BoolVar(&noDetect, "no-detect", false, "Disable secret auto-detection")
	cmd.Flags().StringSliceVar(&plain, "plain", nil, "Keys to force as plaintext (comma-separated)")
	cmd.Flags().StringSliceVar(&secret, "secret", nil, "Keys to force as secret (comma-separated)")
	return cmd
}

func envPullCmd() *cobra.Command {
	var outFile string
	var force bool
	var only []string
	cmd := &cobra.Command{
		Use:   "pull <project>:<env>",
		Short: "Pull an environment's vars as .env",
		Long: `Fetch an environment's vars and print them as .env lines to stdout, or write
them to a file with -o. Secrets you cannot reveal (VIEWER access) are skipped
and reported to stderr.

Use --only KEY1,KEY2 to pull just a subset of keys. Requested keys missing from
the environment are reported to stderr and cause a non-zero exit (the keys that
were found are still printed/written).`,
		Example: "  envman env pull myapp:prod\n" +
			"  envman env pull myapp:prod -o .env\n" +
			"  envman env pull myapp:prod -o .env --force\n" +
			"  envman env pull myapp:prod --only DATABASE_URL,REDIS_URL",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			t, err := envvars.ParseTarget(args[0])
			if err != nil {
				return err
			}
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			vars, err := envvars.FetchExisting(cfg, t)
			if err != nil {
				return err
			}

			// --only: keep just the requested keys (preserving flag order for the
			// missing report), and remember any that were absent.
			vars, missing := envvars.SelectKeys(vars, splitCSVList(only))

			content, masked := envvars.FormatEnv(vars)

			if len(masked) > 0 {
				sort.Strings(masked)
				fmt.Fprintf(os.Stderr, "[envman] %d secret dilewati (akses VIEWER, tak bisa reveal): %s\n",
					len(masked), strings.Join(masked, ", "))
			}

			if outFile == "" {
				fmt.Print(content)
			} else {
				if !force {
					if _, err := os.Stat(outFile); err == nil {
						return fmt.Errorf("[envman] %s sudah ada — gunakan --force untuk menimpa", outFile)
					}
				}
				if err := atomicWrite(outFile, content); err != nil {
					return err
				}
				fmt.Fprintf(os.Stderr, "[envman] %d variabel ditulis ke %s\n", countLines(content), outFile)
			}

			// Report missing --only keys and exit non-zero so scripts can detect it.
			if len(missing) > 0 {
				fmt.Fprintf(os.Stderr, "[envman] key tidak ditemukan: %s\n", strings.Join(missing, ", "))
				return fmt.Errorf("[envman] %d key dari --only tidak ada di %s:%s", len(missing), t.Slug, t.Env)
			}
			return nil
		},
	}
	cmd.Flags().StringVarP(&outFile, "output", "o", "", "Write to file instead of stdout")
	cmd.Flags().BoolVar(&force, "force", false, "Overwrite output file if it exists")
	cmd.Flags().StringSliceVar(&only, "only", nil, "Only pull these keys (comma-separated)")
	return cmd
}

func envGetCmd() *cobra.Command {
	var noNewline bool
	cmd := &cobra.Command{
		Use:   "get <project>:<env> <KEY>",
		Short: "Print a single var's raw value (no KEY=)",
		Long: `Fetch one variable and print just its value — no KEY= prefix, nothing else on
stdout. Ideal for capturing into a shell var or piping to a clipboard. All
diagnostics go to stderr. Missing key (or a secret you cannot reveal) is an
error with a non-zero exit.`,
		Example: "  envman env get myapp:prod DATABASE_URL\n" +
			"  envman env get myapp:prod DATABASE_URL -n | envman clip set\n" +
			"  DB=$(envman env get myapp:prod DATABASE_URL)",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			t, err := envvars.ParseTarget(args[0])
			if err != nil {
				return err
			}
			key := args[1]
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			vars, err := envvars.FetchExisting(cfg, t)
			if err != nil {
				return err
			}
			val, ok := vars[key]
			if !ok {
				return fmt.Errorf("[envman] key tidak ditemukan: %s", key)
			}
			if val == envvars.MaskedValue {
				return fmt.Errorf("[envman] %s adalah secret yang tak bisa kamu reveal (akses VIEWER)", key)
			}
			if noNewline {
				fmt.Print(val)
			} else {
				fmt.Println(val)
			}
			return nil
		},
	}
	cmd.Flags().BoolVarP(&noNewline, "no-newline", "n", false, "Do not print a trailing newline (ideal for piping to a clipboard)")
	return cmd
}

func envKeysCmd() *cobra.Command {
	var names bool
	cmd := &cobra.Command{
		Use:   "keys <file|project:env>",
		Short: "Print only the keys (no values) of a .env or environment",
		Long: `Print the key names of a local .env file or a server environment, without any
values. The source is a file path, or a project:env reference (auto-detected by
the ":"). Handy for giving an AI agent the shape of an env without leaking
secrets — pipe it to your clipboard or paste it into a prompt.

Default output is a paste-ready template (KEY=); use --names for bare names.`,
		Example: "  envman env keys .env\n" +
			"  envman env keys myapp:prod\n" +
			"  envman env keys myapp:prod --names\n" +
			"  envman env keys myapp:prod | envman clip set",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var vars map[string]string
			if looksLikeTarget(args[0]) {
				t, err := envvars.ParseTarget(args[0])
				if err != nil {
					return err
				}
				cfg, err := auth.Resolve()
				if err != nil {
					return err
				}
				if vars, err = envvars.FetchExisting(cfg, t); err != nil {
					return err
				}
			} else {
				var err error
				if vars, err = envparser.ParseFile(args[0]); err != nil {
					return err
				}
			}
			fmt.Print(envvars.FormatKeys(vars, names))
			return nil
		},
	}
	cmd.Flags().BoolVar(&names, "names", false, "Print bare key names instead of KEY= template")
	return cmd
}

// readEnvInput parses the .env from args[1] (a file) or stdin when omitted.
func readEnvInput(args []string) (map[string]string, error) {
	if len(args) == 2 {
		return envparser.ParseFile(args[1])
	}
	return envparser.ParseReader(bufio.NewReader(os.Stdin)), nil
}

// atomicWrite writes content to a temp file in the same dir then renames it,
// so an existing file is never left half-written on error.
func atomicWrite(path, content string) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".envman-pull-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpPath, 0600); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func countLines(s string) int {
	if s == "" {
		return 0
	}
	return strings.Count(s, "\n")
}

func printPushPlan(t envvars.Target, local, existing map[string]string, secretKeys map[string]bool) {
	keys := make([]string, 0, len(local))
	for k := range local {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	fmt.Printf("[envman] dry-run %s:%s\n", t.Slug, t.Env)
	for _, k := range keys {
		action := "create"
		if _, ok := existing[k]; ok {
			action = "update"
		}
		tag := ""
		if secretKeys[k] {
			tag = " [secret]"
		}
		fmt.Printf("  %-6s %s%s\n", action, k, tag)
	}
}
