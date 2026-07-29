package main

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/clipboard"
	"github.com/bipprojectbali/envman/cli/internal/storage"
	"github.com/bipprojectbali/envman/cli/internal/transfer"
	"github.com/spf13/cobra"
)

func sendCmd() *cobra.Command {
	var to string
	var once bool
	var message string
	var ttl string
	var keep bool

	cmd := &cobra.Command{
		Use:   "send [file]",
		Short: "Send a secret to another user (or mint a one-time code)",
		Long: `Send a file or piped text straight to another envman user, so secrets
stop travelling over chat apps. Reads from the given file, or from stdin
when no file is given.

The recipient is either a registered user (--to, by exact email or exact
name) or anyone at all (--once, which prints a one-time claim code they
redeem with 'envman recv <code>' — no account needed).

Burn-after-read by default: the transfer disappears once claimed. Pass
--keep to let it be claimed from several machines until it expires.

Content is encrypted at rest on the server. Note this is NOT end-to-end:
whoever holds the server's MASTER_KEY can read it. It replaces sending
secrets through a third party, not the need to trust your own server.`,
		Example: "  envman send .env.prod --to budi@example.com\n" +
			"  cat notes.txt | envman send --to budi\n" +
			"  envman send .env --once --ttl 2h\n" +
			"  envman send id_rsa --to budi -m \"kunci deploy\" --keep",
		Args: cobra.MaximumNArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			if to == "" && !once {
				return fmt.Errorf("[envman] tentukan penerima dengan --to <email|nama>, atau --once untuk kode sekali-pakai")
			}
			if to != "" && once {
				return fmt.Errorf("[envman] --to dan --once tidak bisa dipakai bersamaan")
			}

			var data []byte
			var err error
			if len(args) == 1 && args[0] != "-" {
				data, err = os.ReadFile(args[0])
			} else {
				data, err = io.ReadAll(os.Stdin)
			}
			if err != nil {
				return err
			}
			if len(data) == 0 {
				return fmt.Errorf("[envman] tidak ada konten untuk dikirim (input kosong)")
			}

			ttlSeconds, err := clipboard.ParseTTL(ttl)
			if err != nil {
				return err
			}

			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}

			res, err := transfer.Send(cfg, transfer.SendOptions{
				To:         to,
				Once:       once,
				Content:    string(data),
				Label:      message,
				TTLSeconds: ttlSeconds,
				Keep:       keep,
			})
			if err != nil {
				return err
			}

			expiry := clipboard.HumanUntil(res.ExpiresAt, time.Now())
			mode := "hangus setelah dibaca"
			if keep {
				mode = "bisa diambil berkali-kali"
			}

			// Everything goes to stderr: stdout stays clean, and the code line
			// below is meant to be copied on its own.
			if res.Code != "" {
				fmt.Fprintf(os.Stderr, "[envman] kode sekali-pakai: %s\n", res.Code)
				fmt.Fprintf(os.Stderr, "[envman] kedaluwarsa %s — kode ini hanya ditampilkan SEKALI (%s)\n", expiry, mode)
				fmt.Fprintf(os.Stderr, "  envman recv %s --server %s\n", res.Code, cfg.Server)
			} else {
				fmt.Fprintf(os.Stderr, "[envman] terkirim ke %s (%s, %s)\n", to, storage.FmtBytes(int64(res.Bytes)), mode)
				fmt.Fprintf(os.Stderr, "[envman] id: %s  kedaluwarsa %s\n", res.ID, expiry)
			}
			return nil
		},
	}

	cmd.Flags().StringVar(&to, "to", "", "Recipient: exact email or exact name of a registered user")
	cmd.Flags().BoolVar(&once, "once", false, "Mint a one-time claim code instead of targeting a user")
	cmd.Flags().StringVarP(&message, "message", "m", "", "Short note shown to the recipient")
	cmd.Flags().StringVar(&ttl, "ttl", "", "Expiry, e.g. 30m, 2h, 7d (default: server setting)")
	cmd.Flags().BoolVar(&keep, "keep", false, "Do not burn after reading")
	cmd.AddCommand(sendRmCmd())
	return cmd
}

func sendRmCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "rm <id>",
		Short:   "Revoke a transfer you sent (or decline one sent to you)",
		Example: "  envman send rm 3f7a1c92-...",
		Args:    cobra.ExactArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			if err := transfer.Remove(cfg, args[0]); err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "[envman] transfer %s dihapus\n", args[0])
			return nil
		},
	}
}
