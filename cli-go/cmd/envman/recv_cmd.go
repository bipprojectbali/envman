package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/storage"
	"github.com/bipprojectbali/envman/cli/internal/transfer"
	"github.com/spf13/cobra"
)

// Collecting a transfer. Exposed twice on purpose: as `envman transfer get` for
// people working inside the CLI, and as top-level `envman recv` for someone who
// has never logged in and was handed a one-time code over chat — that path
// needs no account, so making them type the longer form helps nobody.

func recvCmd() *cobra.Command {
	return claimCmd("recv <id|CODE>", true)
}

// transferGetCmd is the same command inside the transfer group.
func transferGetCmd() *cobra.Command {
	return claimCmd("get <id|CODE>", false)
}

// claimCmd builds the collect command. topLevel toggles the wording, since the
// top-level `envman recv` is what a person with no account is handed, while
// `envman transfer get` is what a logged-in user reaches from `transfer ls`.
func claimCmd(use string, topLevel bool) *cobra.Command {
	var outFile string
	var force bool
	var server string

	cmd := &cobra.Command{
		Use:   use,
		Short: "Collect a secret sent to you",
		Long: `Collect a transfer, by its id (from 'envman transfer ls') or by a one-time code
someone sent you.

The code path needs no account and no login — just the code and the
server URL, so a teammate can pick up a secret on a brand-new machine.

Content goes to stdout unless -o is given, so it pipes cleanly. Files
written with -o are created 0600. Unless the sender passed --keep, the
transfer is gone once collected: nothing else can read it afterwards.`,
		Example: "  envman transfer get 3f7a1c92-... -o .env\n" +
			"  envman recv EM-3F7K-9QW2-M4XZ-7T1B --server https://envman.example.com > .env\n" +
			"  envman transfer ls && envman transfer get <id>",
		Args: cobra.ExactArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			ref := args[0]

			// Refuse an existing output file BEFORE claiming. Claiming burns the
			// transfer, so failing afterwards would destroy the only copy and
			// leave the user with nothing — which is exactly what happened
			// before this check was hoisted.
			if outFile != "" && !force {
				if _, statErr := os.Stat(outFile); statErr == nil {
					return fmt.Errorf("[envman] %s sudah ada — gunakan --force untuk menimpa", outFile)
				}
			}

			var res *transfer.ClaimResult
			var err error

			switch {
			case transfer.IsUUID(ref):
				cfg, cfgErr := auth.Resolve()
				if cfgErr != nil {
					return cfgErr
				}
				res, err = transfer.ClaimByID(cfg, ref)

			case transfer.IsCode(ref):
				// Deliberately does not call auth.Resolve(): whoever holds a code
				// may never have logged in, and this path needs no token.
				target := resolveServerURL(server)
				if target == "" {
					return fmt.Errorf("[envman] tentukan server dengan --server <url> (atau jalankan envman login dulu)")
				}
				code, codeErr := transfer.NormalizeCode(ref)
				if codeErr != nil {
					return codeErr
				}
				res, err = transfer.ClaimByCode(target, code)

			default:
				return fmt.Errorf("[envman] %q bukan id transfer maupun kode klaim", ref)
			}
			if err != nil {
				return err
			}

			// File transfers: the payload is an object in storage, reached via a
			// presigned URL. Default to the sender's filename rather than dumping
			// binary into a terminal.
			if res.IsFile() {
				dest := outFile
				if dest == "" {
					dest = res.Filename
					if dest == "" {
						dest = "download"
					}
					// The transfer is already claimed by now, so a name clash must
					// not abort: that would burn the secret and save nothing. Pick a
					// free name instead and say so.
					if !force {
						if free := uniquePath(dest); free != dest {
							fmt.Fprintf(os.Stderr, "[envman] %s sudah ada — disimpan sebagai %s\n", dest, free)
							dest = free
						}
					}
				}
				if err := transfer.DownloadTo(res.DownloadURL, dest, res.Size, transfer.ProgressPrinter("download")); err != nil {
					return err
				}
				fmt.Fprintf(os.Stderr, "[envman] tersimpan → %s (%s)%s\n", dest, storage.FmtBytes(res.Size), fromSuffix(res))
				return nil
			}

			if outFile != "" {
				if !force {
					if _, statErr := os.Stat(outFile); statErr == nil {
						return fmt.Errorf("[envman] %s sudah ada — gunakan --force untuk menimpa", outFile)
					}
				}
				// Write before reporting success: with burn-after-read the server
				// copy is already gone, so the bytes must reach disk first.
				if err := atomicWrite(outFile, res.Content); err != nil {
					return err
				}
				fmt.Fprintf(os.Stderr, "[envman] tersimpan → %s%s\n", outFile, fromSuffix(res))
				return nil
			}

			fmt.Print(res.Content)
			if !strings.HasSuffix(res.Content, "\n") {
				fmt.Println()
			}
			fmt.Fprintf(os.Stderr, "[envman] diterima%s\n", fromSuffix(res))
			return nil
		},
	}
	cmd.Flags().StringVarP(&outFile, "output", "o", "", "Write to this file instead of stdout (0600)")
	cmd.Flags().BoolVar(&force, "force", false, "Overwrite the output file if it exists")
	cmd.Flags().StringVar(&server, "server", "", "Server URL (only needed for code claims without a login)")
	return cmd
}

// resolveServerURL picks the server for an anonymous claim: explicit flag, then
// the environment, then a saved login.
func resolveServerURL(flag string) string {
	if flag != "" {
		return flag
	}
	if env := os.Getenv("ENVMAN_SERVER"); env != "" {
		return env
	}
	return auth.SavedServerURL()
}

// uniquePath returns path if free, else path with a numeric suffix inserted
// before the extension (report.pdf -> report-2.pdf). Used only after a claim
// has already burned the transfer, where aborting would lose the payload.
func uniquePath(path string) string {
	if _, err := os.Stat(path); err != nil {
		return path
	}
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	for i := 2; i < 1000; i++ {
		candidate := fmt.Sprintf("%s-%d%s", base, i, ext)
		if _, err := os.Stat(candidate); err != nil {
			return candidate
		}
	}
	return path
}
