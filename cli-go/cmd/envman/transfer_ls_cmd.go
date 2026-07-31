package main

import (
	"fmt"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/clipboard"
	"github.com/bipprojectbali/envman/cli/internal/storage"
	"github.com/bipprojectbali/envman/cli/internal/transfer"
	"github.com/spf13/cobra"
)

// Listing transfers, plus the display helpers only the list needs. Split from
// transfer_cmd.go along the existing seam so the send command has room to grow.

func transferLsCmd() *cobra.Command {
	var sent bool
	var asJSON bool

	cmd := &cobra.Command{
		Use:   "ls",
		Short: "List secrets other users have sent you",
		Long: `List transfers waiting for you, with the id needed to collect each one.
Nothing is claimed by listing — use 'envman transfer get <id>' for that.

--sent shows what you have sent instead, so you can check whether it has
been picked up (and revoke it with 'envman transfer rm <id>' if not).`,
		Example: "  envman transfer ls\n  envman transfer ls --sent",
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
			if asJSON {
				return emitJSON(items)
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
				fmt.Fprintf(os.Stderr, "\n[envman] ambil dengan: envman transfer get <id> -o <file>\n")
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&sent, "sent", false, "Show transfers you sent instead of received")
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
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
		// One word of a four-word code — enough to recognise which send this
		// was, not enough to reconstruct it.
		return "kode " + it.CodePrefix + "…"
	}
	if it.ToHint == "" {
		// A custom code stores no prefix at all: a memorable code is often
		// reused, so even a fragment is a real disclosure.
		return "kode kustom"
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
