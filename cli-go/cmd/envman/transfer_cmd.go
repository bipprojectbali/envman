package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/clipboard"
	"github.com/bipprojectbali/envman/cli/internal/storage"
	"github.com/bipprojectbali/envman/cli/internal/transfer"
	"github.com/spf13/cobra"
)

// Sending and receiving secrets between users. Grouped under one noun so the
// whole feature is discoverable from `envman transfer --help`, matching clip,
// env, gists, storage and projects. Collecting lives in recv_cmd.go.

// Mirrors MIN_CUSTOM_CODE_LEN and CUSTOM_CODE_MAX_TTL_MINUTES in
// src/lib/transfer-service.ts. Checked here too so the warning prints before
// the request goes out.
const minCustomCodeLen = 12
const customCodeMaxTTLMinutes = 15

var customCodeRe = regexp.MustCompile(`^[a-z0-9._-]+$`)

func transferCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "transfer <subcommand>",
		Aliases: []string{"xfer"},
		Short:   "Send and receive secrets between users",
		Long: `Send a secret straight to another envman user, so .env files, SSH keys
and certificates stop travelling over chat apps.

Recipients are either registered users (--to) or anyone at all (--once,
which mints a one-time claim code needing no account). Transfers burn
after reading by default and always expire.

Content is encrypted at rest on the server. This is NOT end-to-end:
whoever holds the server's MASTER_KEY can read it. It replaces sending
secrets through a third party, not the need to trust your own server.`,
		Example: "  envman transfer send .env.prod --to budi@example.com\n" +
			"  envman transfer ls\n" +
			"  envman transfer get <id> -o .env\n" +
			"  envman transfer send .env --once     # kode untuk orang tanpa akun",
	}
	cmd.AddCommand(transferSendCmd(), transferLsCmd(), transferGetCmd(), transferRmCmd())
	return cmd
}

func transferSendCmd() *cobra.Command {
	var to string
	var once bool
	var message string
	var ttl string
	var keep bool
	var mode string
	var customCode string

	cmd := &cobra.Command{
		Use:   "send [file]",
		Short: "Send a secret to another user (or mint a one-time code)",
		Long: `Send a file or piped text straight to another envman user, so secrets
stop travelling over chat apps. Reads from the given file, or from stdin
when no file is given.

The recipient is either a registered user (--to, by exact email or exact
name) or anyone at all (--once, which prints a one-time claim code they
redeem with 'envman transfer get' — no account needed).

Burn-after-read by default: the transfer disappears once claimed. Pass
--keep to let it be claimed from several machines until it expires.

Content is encrypted at rest on the server. Note this is NOT end-to-end:
whoever holds the server's MASTER_KEY can read it. It replaces sending
secrets through a third party, not the need to trust your own server.`,
		Example: "  envman transfer send .env.prod --to budi@example.com\n" +
			"  cat notes.txt | envman transfer send --to budi\n" +
			"  envman transfer send .env --once --ttl 2h\n" +
			"  envman transfer send id_rsa --to budi -m \"kunci deploy\" --keep",
		Args: cobra.MaximumNArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			if to == "" && !once {
				return fmt.Errorf("[envman] tentukan penerima dengan --to <email|nama>, atau --once untuk kode sekali-pakai")
			}
			if to != "" && once {
				return fmt.Errorf("[envman] --to dan --once tidak bisa dipakai bersamaan")
			}
			if customCode != "" {
				if !once {
					return fmt.Errorf("[envman] --code hanya berlaku dengan --once")
				}
				if len([]rune(customCode)) < minCustomCodeLen {
					return fmt.Errorf("[envman] --code minimal %d karakter", minCustomCodeLen)
				}
				if !customCodeRe.MatchString(strings.ToLower(customCode)) {
					return fmt.Errorf("[envman] --code hanya boleh huruf, angka, titik, garis bawah, dan tanda hubung")
				}
				// Printed before the request so the tradeoff is visible even if
				// the send later fails.
				fmt.Fprintf(os.Stderr,
					"[envman] kode pilihan sendiri lebih mudah ditebak daripada kode acak —"+
						" masa berlakunya dipersingkat jadi %d menit.\n", customCodeMaxTTLMinutes)
			}
			if mode != "" && mode != "text" && mode != "file" {
				return fmt.Errorf("[envman] --mode harus \"text\" atau \"file\", bukan %q", mode)
			}

			ttlSeconds, err := clipboard.ParseTTL(ttl)
			if err != nil {
				return err
			}
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}

			fromFile := len(args) == 1 && args[0] != "-"
			maxText := transfer.MaxTextBytes(cfg)

			var res *transfer.SendResult

			if fromFile {
				st, statErr := os.Stat(args[0])
				if statErr != nil {
					return statErr
				}
				if st.IsDir() {
					return fmt.Errorf("[envman] %s adalah direktori — kirim satu file saja", args[0])
				}
				if st.Size() == 0 {
					return fmt.Errorf("[envman] %s kosong", args[0])
				}

				head, headErr := readHead(args[0], transfer.SniffLen())
				if headErr != nil {
					return headErr
				}
				chosen := transfer.ChooseMode(head, st.Size(), maxText, mode == "text", mode == "file")

				if chosen == transfer.ModeFile {
					name := filepath.Base(args[0])
					mimeType := transfer.GuessMimeType(name)
					fmt.Fprintf(os.Stderr, "[envman] mode: file (%s) — upload langsung ke storage\n",
						storage.FmtBytes(st.Size()))
					res, err = transfer.SendFile(cfg, transfer.FileOptions{
						To: to, Once: once, LocalPath: args[0], Filename: name,
						Size: st.Size(), MimeType: mimeType, Label: message,
						TTLSeconds: ttlSeconds, Keep: keep, CustomCode: customCode,
					}, transfer.ProgressPrinter("upload"))
					if err != nil {
						return err
					}
				} else {
					data, readErr := os.ReadFile(args[0])
					if readErr != nil {
						return readErr
					}
					fmt.Fprintf(os.Stderr, "[envman] mode: teks (%s) — tersimpan terenkripsi di server\n",
						storage.FmtBytes(int64(len(data))))
					res, err = transfer.Send(cfg, transfer.SendOptions{
						To: to, Once: once, Content: string(data), Label: message,
						TTLSeconds: ttlSeconds, Keep: keep, CustomCode: customCode,
					})
					if err != nil {
						return err
					}
				}
			} else {
				// Piped input has no path to stat, so it always takes the text
				// path; the server enforces the limit.
				data, readErr := io.ReadAll(os.Stdin)
				if readErr != nil {
					return readErr
				}
				if len(data) == 0 {
					return fmt.Errorf("[envman] tidak ada konten untuk dikirim (input kosong)")
				}
				res, err = transfer.Send(cfg, transfer.SendOptions{
					To: to, Once: once, Content: string(data), Label: message,
					TTLSeconds: ttlSeconds, Keep: keep, CustomCode: customCode,
				})
				if err != nil {
					return err
				}
			}

			expiry := clipboard.HumanUntil(res.ExpiresAt, time.Now())
			burnNote := "hangus setelah dibaca"
			if keep {
				burnNote = "bisa diambil berkali-kali"
			}

			// Everything goes to stderr: stdout stays clean, and the code line
			// below is meant to be copied on its own.
			if res.Code != "" {
				fmt.Fprintf(os.Stderr, "[envman] kode sekali-pakai: %s\n", res.Code)
				fmt.Fprintf(os.Stderr, "[envman] kedaluwarsa %s — kode ini hanya ditampilkan SEKALI (%s)\n", expiry, burnNote)
				fmt.Fprintf(os.Stderr, "  ENVMAN_CODE='%s' envman transfer get --server %s\n", res.Code, cfg.Server)
			} else {
				fmt.Fprintf(os.Stderr, "[envman] terkirim ke %s (%s, %s)\n", to, storage.FmtBytes(int64(res.Bytes)), burnNote)
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
	cmd.Flags().StringVar(&customCode, "code", "",
		"Pick the claim code yourself (min 12 chars). Easier to remember, so the transfer expires in 15 minutes")
	cmd.Flags().StringVar(&mode, "mode", "",
		"Force a path: text (encrypted in the DB) or file (uploaded to storage). Default: auto-detect")
	return cmd
}

func transferRmCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "rm <id>",
		Short:   "Revoke a transfer you sent (or decline one sent to you)",
		Example: "  envman transfer rm 3f7a1c92-...",
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

// readHead reads the first n bytes of a file for the binary sniff.
func readHead(path string, n int) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	buf := make([]byte, n)
	read, err := f.Read(buf)
	if err != nil && err != io.EOF {
		return nil, err
	}
	return buf[:read], nil
}
