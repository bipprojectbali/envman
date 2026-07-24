package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/storage"
	"github.com/spf13/cobra"
)

func storageCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "storage <subcommand>",
		Short: "Manage project file storage",
		Long: `Upload, download, and list files in a project's storage.

Download streams to stdout by default — composable with pipes:
  envman storage download myapp:compose.yml | docker compose -f - up
  envman storage download myapp:scripts/setup.sh | bash`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error { return cmd.Help() },
	}
	cmd.AddCommand(storageLsCmd(), storageUploadCmd(), storageDownloadCmd(), storageExecCmd(), storageRmCmd())
	return cmd
}

func storageExecCmd() *cobra.Command {
	var offline, noCache bool
	cmd := &cobra.Command{
		Use:   "exec <project>:<path> [-- args...]",
		Short: "Download a binary from storage and run it directly (cached)",
		Long: `Run an executable from project storage. The binary is cached at
~/.cache/envman/exec (mode 0700) and reused when unchanged, so repeat runs are
instant — only a small metadata request hits the server to check freshness.

Arguments after -- are passed through to the program. The program's exit
code is propagated as envman's exit code.

  --offline    run the cached binary without contacting the server
  --no-cache   force a fresh download; do not read or write the cache`,
		Example: "  envman storage exec tts:tts-go\n" +
			"  envman storage exec tts:tts-go -- --port 8080\n" +
			"  envman storage exec --offline tts:tts-go\n" +
			"  envman -e tts:prod -- envman storage exec tts:tts-go",
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			slug, remotePath, err := storage.ParseRef(args[0])
			if err != nil {
				return err
			}
			// With SetInterspersed(false) cobra keeps the "--" separator as a
			// positional arg — strip it so it isn't forwarded to the program.
			passthrough := args[1:]
			if len(passthrough) > 0 && passthrough[0] == "--" {
				passthrough = passthrough[1:]
			}
			return storage.Exec(cfg, slug, remotePath, passthrough, storage.ExecOptions{
				Offline: offline,
				NoCache: noCache,
			})
		},
	}
	// Pass flags after the ref straight to the child program, not to cobra.
	cmd.Flags().SetInterspersed(false)
	cmd.Flags().BoolVar(&offline, "offline", false, "Run cached binary without contacting the server")
	cmd.Flags().BoolVar(&noCache, "no-cache", false, "Force fresh download, bypass cache")
	return cmd
}

func storageLsCmd() *cobra.Command {
	var prefix string
	var page int
	var tags []string
	cmd := &cobra.Command{
		Use:     "ls <project>",
		Short:   "List files and folders in project storage",
		Example: "  envman storage ls myapp\n  envman storage ls myapp --prefix assets/\n  envman storage ls myapp --tag design,logo",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			result, err := storage.List(cfg, args[0], prefix, page)
			if err != nil {
				return err
			}
			// --tag: client-side filter (OR match). Server already scopes what a
			// tag-limited member can see; this just narrows the displayed rows.
			wantTags := splitCSV(tags)
			files := result.Files
			if len(wantTags) > 0 {
				files = filterFilesByTag(files, wantTags)
			}
			fmt.Printf("Storage: %s / %s  (%d files)\n\n",
				storage.FmtBytes(result.Usage.UsedBytes),
				storage.FmtBytes(result.Usage.QuotaBytes),
				result.TotalFiles)
			for _, f := range result.Folders {
				fmt.Printf("  %s/\n", f)
			}
			for _, f := range files {
				pub := ""
				if f.IsPublic {
					pub = " [public]"
				}
				tagStr := ""
				if len(f.Tags) > 0 {
					tagStr = "  #" + strings.Join(f.Tags, " #")
				}
				fmt.Printf("  %-40s  %8s  %s%s%s\n", f.Path, storage.FmtBytes(f.Size), f.MimeType, pub, tagStr)
			}
			if result.TotalFiles > result.PageSize {
				fmt.Printf("\nPage %d / %d  (use --page N for more)\n", result.Page, (result.TotalFiles+result.PageSize-1)/result.PageSize)
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&prefix, "prefix", "", "Folder prefix to list (e.g. assets/)")
	cmd.Flags().IntVar(&page, "page", 1, "Page number")
	cmd.Flags().StringSliceVar(&tags, "tag", nil, "Only show files with any of these tags (comma-separated)")
	return cmd
}

// filterFilesByTag keeps files that carry at least one of the wanted tags (OR).
func filterFilesByTag(files []storage.StorageFile, want []string) []storage.StorageFile {
	wset := make(map[string]bool, len(want))
	for _, t := range want {
		wset[t] = true
	}
	out := make([]storage.StorageFile, 0, len(files))
	for _, f := range files {
		for _, t := range f.Tags {
			if wset[t] {
				out = append(out, f)
				break
			}
		}
	}
	return out
}

func storageUploadCmd() *cobra.Command {
	var remotePath string
	var force bool
	var tags []string
	cmd := &cobra.Command{
		Use:   "upload <project> <file|dir>",
		Short: "Upload a file or folder to project storage (streaming)",
		Long: `Upload a file or folder to project storage.

By default an existing file at the same path is NOT overwritten: a single file
errors if it already exists, and a folder upload skips existing files and
continues with the rest. Pass --force (-f) to overwrite existing files.`,
		Example: "  envman storage upload myapp compose.yml\n" +
			"  envman storage upload myapp ./logo.png --path assets/logo.png\n" +
			"  envman storage upload myapp ./logo.png --force    # timpa jika sudah ada\n" +
			"  envman storage upload myapp ./assets/\n" +
			"  envman storage upload myapp ./dist/ --path static/dist",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			slug := args[0]
			localPath := args[1]

			// Aman-by-default: tolak menimpa kecuali --force. noClobber = kebalikan force.
			noClobber := !force

			stat, err := os.Stat(localPath)
			if err != nil {
				return fmt.Errorf("[envman] %w", err)
			}

			tagList := splitCSV(tags)
			if stat.IsDir() {
				prefix := storage.RemotePath(localPath, remotePath)
				return storage.UploadDir(cfg, slug, localPath, prefix, noClobber, tagList, os.Stderr)
			}

			target := storage.RemotePath(localPath, remotePath)
			name := filepath.Base(localPath)

			var result *storage.UploadResult
			if stat.Size() > storage.MultipartThreshold {
				// File besar: chunked multipart upload melalui server → MinIO.
				// Setiap chunk ≤ 50 MB sehingga aman melewati Cloudflare (100 MB limit).
				// Upload yang terputus bisa dilanjutkan dengan perintah yang sama.
				fmt.Fprintf(os.Stderr, "[envman] File besar (%s) — memakai chunked upload (%d chunk × 50 MB)\n",
					storage.FmtBytes(stat.Size()), (stat.Size()+storage.MultipartThreshold-1)/storage.MultipartThreshold)
				result, err = storage.UploadMultipart(cfg, slug, localPath, target, noClobber, tagList, func(written, total int64, elapsed time.Duration) {
					renderProgress(name, written, total, elapsed)
				})
			} else {
				result, err = storage.Upload(cfg, slug, localPath, target, noClobber, tagList, func(written, total int64, elapsed time.Duration) {
					renderProgress(name, written, total, elapsed)
				})
			}
			clearProgress()
			if err != nil {
				if noClobber && errors.Is(err, storage.ErrExists) {
					return fmt.Errorf("[envman] %s:%s sudah ada — pakai --force untuk menimpa", slug, target)
				}
				return err
			}
			fmt.Fprintf(os.Stderr, "Uploaded: %s (%s)\n", result.Object.Path, storage.FmtBytes(result.Object.Size))
			return nil
		},
	}
	cmd.Flags().StringVar(&remotePath, "path", "", "Remote path or prefix (default: basename of local file/dir)")
	cmd.Flags().BoolVarP(&force, "force", "f", false, "Overwrite existing files (default: refuse if a file already exists)")
	cmd.Flags().StringSliceVar(&tags, "tag", nil, "Tags to attach to the uploaded file(s) (comma-separated)")
	return cmd
}

func storageDownloadCmd() *cobra.Command {
	var outFile string
	cmd := &cobra.Command{
		Use:   "download <project>:<path>",
		Short: "Download a file from project storage (streams to stdout by default)",
		Long: `Download a file and stream it to stdout, or save to a file with -o.

Streaming to stdout enables direct piping:
  envman storage download myapp:compose.yml | docker compose -f - up
  envman storage download myapp:scripts/setup.sh | bash
  envman storage download myapp:dump.sql | psql mydb`,
		Example: "  envman storage download myapp:assets/logo.png -o logo.png\n" +
			"  envman storage download myapp:compose.yml | docker compose -f - up",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			slug, remotePath, err := storage.ParseRef(args[0])
			if err != nil {
				return err
			}
			if outFile == "" || outFile == "-" {
				// Pipe mode: no progress — stdout must stay clean for downstream tools.
				return storage.Download(cfg, slug, remotePath, os.Stdout, nil)
			}
			f, err := os.Create(outFile)
			if err != nil {
				return fmt.Errorf("[envman] create %s: %w", outFile, err)
			}
			defer f.Close()
			name := filepath.Base(remotePath)
			err = storage.Download(cfg, slug, remotePath, f, func(written, total int64, elapsed time.Duration) {
				renderProgress(name, written, total, elapsed)
			})
			clearProgress()
			if err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "Downloaded: %s → %s\n", remotePath, outFile)
			return nil
		},
	}
	cmd.Flags().StringVarP(&outFile, "output", "o", "", "Output file (default: stdout)")
	return cmd
}

func storageRmCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "rm <project>:<folder>/",
		Short: "Delete a folder and all its contents from project storage (OWNER only)",
		Long: `Delete every file under a folder prefix. This action cannot be undone.

Requires OWNER role on the project.`,
		Example: "  envman storage rm myapp:assets/\n" +
			"  envman storage rm myapp:backup/2026-01/",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := auth.Resolve()
			if err != nil {
				return err
			}
			slug, folderPath, err := storage.ParseRef(args[0])
			if err != nil {
				return err
			}
			folderPath = strings.TrimRight(folderPath, "/")
			if folderPath == "" {
				return fmt.Errorf("[envman] folder path tidak boleh kosong")
			}
			fmt.Printf("Menghapus %s:%s/ ... ", slug, folderPath)
			deleted, err := storage.DeleteFolder(cfg, slug, folderPath)
			if err != nil {
				fmt.Println("gagal")
				return err
			}
			fmt.Printf("selesai (%d file dihapus)\n", deleted)
			return nil
		},
	}
}
