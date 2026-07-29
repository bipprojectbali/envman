package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/clipboard"
	"github.com/bipprojectbali/envman/cli/internal/storage"
	"github.com/bipprojectbali/envman/cli/internal/transfer"
	"github.com/spf13/cobra"
)

func inboxCmd() *cobra.Command {
	var sent bool

	cmd := &cobra.Command{
		Use:   "inbox",
		Short: "List secrets other users have sent you",
		Long: `List transfers waiting for you, with the id needed to collect each one.
Nothing is claimed by listing — use 'envman recv <id>' for that.

--sent shows what you have sent instead, so you can check whether it has
been picked up (and revoke it with 'envman send rm <id>' if not).`,
		Example: "  envman inbox\n  envman inbox --sent",
		Args:    cobra.NoArgs,
		RunE: func(_ *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}

			items, err := transfer.Inbox(cfg)
			if sent {
				items, err = transfer.Sent(cfg)
			}
			if err != nil {
				return err
			}
			if len(items) == 0 {
				if sent {
					fmt.Fprintln(os.Stderr, "[envman] belum ada transfer terkirim yang aktif")
				} else {
					fmt.Fprintln(os.Stderr, "[envman] inbox kosong")
				}
				return nil
			}

			now := time.Now()
			w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
			if sent {
				fmt.Fprintln(w, "ID\tKE\tCATATAN\tSTATUS\tKEDALUWARSA")
			} else {
				fmt.Fprintln(w, "ID\tDARI\tJENIS\tCATATAN\tUKURAN\tKEDALUWARSA")
			}
			for _, it := range items {
				expiry := clipboard.HumanUntil(it.ExpiresAt, now)
				if sent {
					fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n",
						it.ID, sentTarget(it), dash(it.Label), claimStatus(it), expiry)
					continue
				}
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\n",
					it.ID, fromLabel(it), kindLabel(it), dash(it.Label), storage.FmtBytes(it.Size), expiry)
			}
			w.Flush()

			if !sent {
				fmt.Fprintf(os.Stderr, "\n[envman] ambil dengan: envman recv <id> -o <file>\n")
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&sent, "sent", false, "Show transfers you sent instead of received")
	return cmd
}

func recvCmd() *cobra.Command {
	var outFile string
	var force bool
	var server string

	cmd := &cobra.Command{
		Use:   "recv <id|CODE>",
		Short: "Collect a secret sent to you",
		Long: `Collect a transfer, by its id (from 'envman inbox') or by a one-time code
someone sent you.

The code path needs no account and no login — just the code and the
server URL, so a teammate can pick up a secret on a brand-new machine.

Content goes to stdout unless -o is given, so it pipes cleanly. Files
written with -o are created 0600. Unless the sender passed --keep, the
transfer is gone once collected: nothing else can read it afterwards.`,
		Example: "  envman recv 3f7a1c92-... -o .env\n" +
			"  envman recv EM-3F7K-9QW2-M4XZ-7T1B --server https://envman.example.com > .env\n" +
			"  envman inbox && envman recv <id>",
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

func fromSuffix(res *transfer.ClaimResult) string {
	if res.From == nil {
		return ""
	}
	return " dari " + res.From.Email
}

func fromLabel(it transfer.Item) string {
	if it.From == nil {
		return "-"
	}
	if it.From.Name != "" {
		return it.From.Name
	}
	return it.From.Email
}

func sentTarget(it transfer.Item) string {
	if it.To != nil {
		return it.To.Email
	}
	if it.CodePrefix != "" {
		return "kode " + it.CodePrefix + "…"
	}
	return dash(it.ToHint)
}

func claimStatus(it transfer.Item) string {
	if it.ClaimedAt != "" {
		return "diklaim"
	}
	return "menunggu"
}

// kindLabel names the payload type; file transfers show their filename since
// that is what will land on disk.
func kindLabel(it transfer.Item) string {
	if it.Kind == "FILE" {
		if it.Filename != "" {
			return "file: " + it.Filename
		}
		return "file"
	}
	return "teks"
}

func dash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "-"
	}
	return s
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
