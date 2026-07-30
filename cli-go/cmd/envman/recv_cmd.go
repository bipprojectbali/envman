package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/secretin"
	"github.com/bipprojectbali/envman/cli/internal/storage"
	"github.com/bipprojectbali/envman/cli/internal/transfer"
	"github.com/spf13/cobra"
)

// Collecting a transfer.
//
// This was briefly exposed twice — as `envman transfer get` and as a top-level
// `envman recv` — on the theory that someone without an account deserved a
// shorter form. That reasoning did not hold: such a person never reads --help,
// they paste the one line the sender gives them, so the length is irrelevant.
// What they did see was two commands advertising the same job, right after
// `transfer` had been created to stop exactly that kind of fragmentation.
func transferGetCmd() *cobra.Command {
	var outFile string
	var force bool
	var server string
	var toClipboard bool

	cmd := &cobra.Command{
		Use:   "get <id|CODE>",
		Short: "Collect a secret sent to you",
		Long: `Collect a transfer, by its id (from 'envman transfer ls') or by a one-time code
someone sent you.

The code path needs no account and no login — just the code and the
server URL, so a teammate can pick up a secret on a brand-new machine.

Prefer ENVMAN_CODE=<code> over passing the code as an argument: an
argument is visible to anyone running "ps aux" on the machine and is
kept in your shell history. With neither, the code is read from stdin
or prompted for.

Content goes to stdout unless -o is given, so it pipes cleanly. Files
written with -o are created 0600. Unless the sender passed --keep, the
transfer is gone once collected: nothing else can read it afterwards.`,
		Example: "  envman transfer get 3f7a1c92-... -o .env\n" +
			"  ENVMAN_CODE=EM-3F7K-9QW2-M4XZ-7T1B envman transfer get --server https://envman.example.com > .env\n" +
			"  envman transfer ls && envman transfer get <id>",
		Args: cobra.MaximumNArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			argRef := ""
			if len(args) == 1 {
				argRef = args[0]
			}
			ref, err := secretin.Read(secretin.Options{
				Arg:        argRef,
				EnvVar:     "ENVMAN_CODE",
				Prompt:     "Kode klaim / id transfer: ",
				AllowStdin: true,
				Label:      "kode klaim",
			})
			if err != nil {
				return err
			}

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
			if res.IsFile() && toClipboard {
				return fmt.Errorf("[envman] --copy hanya untuk kiriman teks — ini file %q, pakai -o <file>", res.Filename)
			}

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

			// Burn-after-read: the server copy is ALREADY gone by the time we get
			// here (see the comment below). So a clipboard failure must never
			// swallow the content — fall back to stdout and say why.
			if toClipboard {
				method, err := copyToClipboard(res.Content, "isi kiriman")
				if err != nil {
					fmt.Fprintf(os.Stderr,
						"[envman] clipboard gagal (%v) — transfer sudah terbakar, jadi isinya dicetak di bawah:\n", err)
					fmt.Print(res.Content)
					if !strings.HasSuffix(res.Content, "\n") {
						fmt.Println()
					}
					return nil
				}
				if !method.Confirmed() {
					fmt.Fprintln(os.Stderr,
						"[envman] PERINGATAN: transfer ini hangus-sekali-baca dan sudah terbakar."+
							" Pengiriman lewat OSC 52 tak bisa dikonfirmasi — TEMPEL SEKARANG untuk memastikan.")
				}
				fmt.Fprintf(os.Stderr, "[envman] diterima%s\n", fromSuffix(res))
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
	cmd.Flags().BoolVar(&toClipboard, "copy", false, "Copy to the clipboard instead of printing (keeps it out of scrollback)")
	cmd.MarkFlagsMutuallyExclusive("copy", "output")
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
