package main

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/clipboard"
	"github.com/spf13/cobra"
)

func clipCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "clip <subcommand>",
		Short: "Account clipboard synced across devices (like pbcopy/pbpaste)",
		Long: `A single-slot clipboard tied to your account, synced across devices via the
server. Content is encrypted at rest and expires after 24h by default.

Copy on one machine, paste on another:
  server$  cat .env | envman clip set
  laptop$  envman clip get > .env`,
	}
	cmd.AddCommand(clipSetCmd(), clipGetCmd(), clipClearCmd())
	return cmd
}

func clipSetCmd() *cobra.Command {
	var ttl string
	cmd := &cobra.Command{
		Use: "set [file]",
		Long: `Put content on your account clipboard, from a file or stdin.

Replaces whatever was there — the clipboard holds one item. Content is
encrypted at rest and expires automatically (default 24h, see --ttl).`,
		Short: "Set the clipboard from a file or stdin",
		Example: "  cat .env | envman clip set\n" +
			"  envman clip set .env\n" +
			"  envman clip set --ttl 1h < notes.txt",
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var data []byte
			var err error
			if len(args) == 1 {
				data, err = os.ReadFile(args[0])
			} else {
				data, err = io.ReadAll(os.Stdin)
			}
			if err != nil {
				return err
			}
			if len(data) == 0 {
				return fmt.Errorf("[envman] tidak ada konten untuk di-set (input kosong)")
			}
			ttlSeconds, err := clipboard.ParseTTL(ttl)
			if err != nil {
				return err
			}
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			res, err := clipboard.Set(cfg, string(data), ttlSeconds)
			if err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "[envman] clipboard di-set (%d byte, kedaluwarsa dalam %s)\n",
				res.Bytes, clipboard.HumanUntil(res.ExpiresAt, time.Now()))
			return nil
		},
	}
	cmd.Flags().StringVar(&ttl, "ttl", "", "Time-to-live (e.g. 30m, 2h, 7d; default 24h)")
	return cmd
}

func clipGetCmd() *cobra.Command {
	var outFile string
	var toClipboard bool
	var force bool
	cmd := &cobra.Command{
		Use:   "get",
		Short: "Print the clipboard to stdout (or a file with -o)",
		Example: "  envman clip get\n" +
			"  envman clip get > .env\n" +
			"  envman clip get -o .env --force",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			res, err := clipboard.Get(cfg)
			if err != nil {
				return err
			}
			if toClipboard {
				_, err := copyToClipboard(res.Content, "isi clipboard akun")
				return err
			}
			if outFile == "" {
				fmt.Print(res.Content)
				return nil
			}
			if !force {
				if _, err := os.Stat(outFile); err == nil {
					return fmt.Errorf("[envman] %s sudah ada — gunakan --force untuk menimpa", outFile)
				}
			}
			if err := atomicWrite(outFile, res.Content); err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "[envman] clipboard ditulis ke %s\n", outFile)
			return nil
		},
	}
	cmd.Flags().StringVarP(&outFile, "output", "o", "", "Write to file instead of stdout")
	cmd.Flags().BoolVar(&toClipboard, "copy", false, "Copy to the OS clipboard instead of printing")
	cmd.MarkFlagsMutuallyExclusive("copy", "output")
	cmd.Flags().BoolVar(&force, "force", false, "Overwrite output file if it exists")
	return cmd
}

func clipClearCmd() *cobra.Command {
	return &cobra.Command{
		Use: "clear",
		Long: `Empty your account clipboard immediately, without waiting for its TTL.

Succeeds even when the clipboard is already empty.`,
		Short:   "Clear the clipboard",
		Args:    cobra.NoArgs,
		Example: "  envman clip clear",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			if err := clipboard.Clear(cfg); err != nil {
				return err
			}
			fmt.Fprintln(os.Stderr, "[envman] clipboard dikosongkan")
			return nil
		},
	}
}
