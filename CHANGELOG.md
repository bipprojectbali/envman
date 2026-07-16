# Changelog

## [Unreleased]

### Added
- **`envman health` — cari file yang terlalu besar untuk konteks AI agent.** Memindai project lokal (tak perlu login) dan melaporkan file yang jumlah baris/karakternya mendekati atau melewati batas — file yang membludakkan context window agent. Status `ok`/`warning` (≥80%)/`critical` (≥100%), default 500 baris / 20.000 karakter (override `--max-lines`/`--max-chars`). Dependency & build dir (`node_modules`, `.git`, `dist`, `vendor`, dst) dan file biner otomatis dilewati; traversal berhenti di kedalaman 20 (`--depth 0` = tanpa batas) — direktori yang dilewati dilaporkan ke stderr. **`--copy critical|warning|all`** mencetak hanya path (satu per baris) supaya bisa langsung di-pipe ke agent AI (`| pbcopy` atau `| envman clip set`) untuk diminta split. `--ext ts,tsx,go` membatasi ekstensi; `--status` memfilter tampilan. CLI-only; berbeda dari File Health web di Dev Console (yang memindai codebase server envman).

## [0.22.5] - 2026-07-15

### Changed
- **Landing page ditulis ulang total — lebih kaya, informatif, dan menarik.** Dari 3 section tipis (hero + features + install) menjadi alur lengkap: Hero (dengan mock terminal + install one-liner) → Trust strip → Problem → How it works (Define→Encrypt→Inject) → Bento features → CLI showcase (tabbed terminal per grup command) → Security (selling point: "trust math, not us") → Use-cases (persona) → Integrations strip → Guide + cheatsheet → FAQ → CTA. Menampilkan fitur yang sebelumnya tak ada di landing: `env push/pull/keys`, `clip`, `projects`, `docs`, Env Import live-link, granular/section permissions, values-hidden-by-default, audit trail. Copy bilingual (headline/istilah Inggris + penjelasan Indonesia), visual SVG/mock (zero copyright), dark/light adaptif, responsif. Cheatsheet CLI dilengkapi command yang sebelumnya hilang.

## [0.22.4] - 2026-07-15

### Added
- **`envman projects` — daftar project & environment dari CLI.** `projects ls` menampilkan semua project yang bisa kamu akses (slug, nama, jumlah env, role-mu, pembuat); `--me` memfilter hanya yang kamu buat; `-q` mencetak slug polos (pipe-friendly). `projects envs <slug>` (atau shortcut `projects <slug>`) menampilkan environment sebuah project beserta role akses dan jumlah var; `-q` untuk nama env polos. Alias `envman project`. CLI-only — memakai endpoint `GET /projects` yang sudah ada, hanya menampilkan yang boleh diakses.

## [0.22.3] - 2026-07-15

### Changed
- **Nilai variabel disembunyikan secara default di halaman vars.** Sebelumnya value `plain` (client ID, fingerprint SHA, dsb) selalu tampil terang — rawan terlihat saat screenshot/screen-share. Kini **semua** value tersembunyi default (`••••`), dengan tombol mata per-baris untuk mengungkap satu, dan tombol **"Tampilkan semua nilai"** di toolbar untuk mengungkap seluruh value `plain` sekaligus. **Secret tetap terpisah** — tidak ikut terbuka oleh tombol global, harus diungkap per-baris (cegah rahasia terpampang massal tak sengaja). Preferensi "tampilkan semua" disimpan per-browser (localStorage) sehingga bertahan antar env/reload. Tombol copy tetap menyalin nilai asli walau tampilan tersembunyi.

## [0.22.2] - 2026-07-15

### Added
- **`envman env keys <file|project:env>` — cetak nama key saja, tanpa value.** Menampilkan daftar key dari sebuah `.env` lokal atau environment server tanpa membocorkan value apa pun — berguna untuk memberi AI agent *bentuk* sebuah env (agent tahu key yang dibutuhkan) tanpa menyerahkan rahasianya. Sumber dideteksi otomatis: argumen berpola `project:env` diambil dari server, selain itu dianggap path file. Output default template `KEY=` (sama dengan tombol "Copy keys" di UI), `--names` untuk nama polos. Komposabel: `envman env keys myapp:prod | pbcopy` atau `| envman clip set` (ke clipboard akun lintas device). CLI-only, reuse endpoint `vars/export` yang sudah ada.

## [0.22.1] - 2026-07-14

### Fixed
- **`envman clip set`/`clear` ditolak untuk token read-only ("Token is read-only").** Clipboard di-gate `canWrite` yang salah — `canWrite` melindungi data project/vars (resource bersama), sedangkan clipboard adalah scratch pribadi per-akun (nempel `userId`, tak menyentuh project). Akibatnya siapa pun dengan token read-only tak bisa memakai clipboard sama sekali. Gate dihapus (konsisten dengan Gist yang juga tak di-gate `canWrite`) — token read-only kini bisa set/clear clipboard-nya sendiri.

## [0.22.0] - 2026-07-14

### Added
- **`envman clip` — clipboard akun lintas device (seperti pbcopy/pbpaste).** Clipboard slot-tunggal yang menempel di akun (bukan device), tersinkron via server — copy di satu mesin (`cat .env | envman clip set`), paste di mesin lain dengan akun sama (`envman clip get > .env`). Berguna terutama di server yang tak punya `pbcopy`. Konten **dienkripsi at-rest** (AES-256-GCM) dan **kedaluwarsa otomatis** (default 24 jam, `--ttl 30m|2h|7d`). Subperintah: `set [file]` (dari file/stdin, menimpa), `get [-o file]` (stdout atau file atomic, `--force` untuk timpa), `clear`. Batas ukuran (default 1 MB) dan TTL maksimum (default 7 hari) dapat diatur SUPER_ADMIN di `/dev > Settings` (`clipboard_max_kb`, `clipboard_max_ttl_hours`). Endpoint baru `GET/PUT/DELETE /api/envman/clip`; kedaluwarsa dibersihkan lazy (saat baca) + sweep periodik.

### Database
- Migration `20260714163134_add_clipboard` — tabel `clipboard` (PK `userId`, `content` terenkripsi, `expiresAt` + index untuk sweep, FK `ON DELETE CASCADE`). Idempotent, jalan otomatis saat startup.

## [0.21.2] - 2026-07-14

### Added
- **`envman env push` / `envman env pull` — sinkron `.env` dengan environment.** `push <project>:<env> [file]` membaca `.env` (dari file atau stdin) dan meng-**upsert** tiap key ke environment: key yang ada diperbarui, key baru dibuat, key server yang tak ada di file dibiarkan (tidak dihapus). Environment yang belum ada dibuat otomatis. **Secret di-auto-deteksi dari nama key** (mengandung `SECRET`/`TOKEN`/`PASSWORD`/`API_KEY`/`CREDENTIAL`/`DATABASE_URL`/`_DSN` atau suffix `_KEY`; `PUBLIC_KEY` dikecualikan) lalu dienkripsi di server. Key yang sudah secret di server tetap secret walau heuristik meleset (server menang). Override: `--plain K`, `--secret K`, `--no-detect`; `--dry-run` untuk pratinjau. `pull <project>:<env>` mencetak vars sebagai `.env` ke stdout (atau `-o file`, atomic, tolak overwrite kecuali `--force`); secret yang tak bisa di-reveal (akses VIEWER) dilewati + warning ke stderr. Implementasi CLI-only — memakai endpoint `PUT/GET .../vars` yang sudah ada, tanpa perubahan server.

## [0.21.1] - 2026-07-14

### Fixed
- **CLI gagal jalan di server dengan glibc lama (`GLIBC_2.34 not found`).** Build CLI (`scripts/build-cli.ts`) tidak menyetel `CGO_ENABLED=0`, sehingga saat di-compile di CI (Linux native + gcc, default `CGO_ENABLED=1`) binary jadi **dynamic-linked ke glibc** host build (Ubuntu terbaru). Akibatnya biner menolak jalan di distro lama seperti Debian 11 (glibc 2.31) — `version 'GLIBC_2.34' not found (required by envman)`. Kini semua target di-build dengan `CGO_ENABLED=0` → **statically-linked**, tanpa dependensi `libc.so.6`, portabel ke glibc versi berapa pun (dan musl/alpine). Terbukti: biner hasil build kini jalan di Debian 11.

## [0.21.0] - 2026-07-10

### Added
- **`envman portainer` (alias `pt`) — kontrol stack Portainer dari CLI.** Operasikan stack yang terikat ke sebuah environment cukup dengan `project:env` (server menyimpan detail connection/stack/endpoint). Subperintah: `status`, `ps`, `inspect`, `logs <container>` (snapshot, atau `-f` untuk live stream sampai Ctrl+C), `restart-soft` (stop→start tanpa pull image), `restart-recreate`, `restart-repull`, `sync-repull`, `prune`.
- **Detail container.** `envman portainer status` kini menampilkan tabel container (state, status/uptime, image, ports). `envman portainer inspect <container>` memberi detail satu container: state + health check, uptime, jumlah restart, exit code, port, mount, dan penggunaan CPU/memori real-time — via endpoint baru `GET .../portainer/inspect/:containerId`.
- **Live logs (SSE).** Endpoint baru `GET .../portainer/logs/:containerId/stream` mem-broadcast log container real-time sebagai Server-Sent Events — dipakai `envman portainer logs -f` dan siap dikonsumsi panel frontend (`EventSource`).
- **Restart ringan.** Endpoint baru `POST .../portainer/restart` (stop→start tanpa redeploy) di-gate capability `stack:power`, memberi operator dengan izin restart-saja kemampuan memulai ulang stack tanpa perlu izin deploy penuh.
- **Badge Storage di tab project.** Tab **Storage** kini menampilkan badge jumlah file + ukuran terpakai (mis. `8 · 12 MB`), sejajar dengan badge count di tab lain. Data dari field additive `storageStats` di `GET /projects/:slug`; badge segar otomatis setelah upload/hapus file.

## [0.20.0] - 2026-07-07

### Added
- **Izin per-section (Notes / Aliases / Files / Storage)** — sekarang OWNER bisa mengatur akses tiap anggota **per-section**, bukan lagi semua-atau-tidak. Contoh: anggota boleh melihat Storage tapi tidak Notes. Model sama persis dengan izin per-environment: **inherit** (ikut role project), **override** (Viewer/Editor/Owner khusus section itu), atau **denied** (blokir). Kelola di tab **Members → toggle "Sections"**: matrix anggota × section dengan ikon `~ V E O ✕` yang sama seperti matrix environment. Tab section yang diblokir otomatis disembunyikan dari anggota tersebut.
- **Admin parity** — SUPER_ADMIN bisa mengatur override section lewat `PUT /api/envman/admin/users/:userId/projects/:slug/sections/:section` (setara endpoint OWNER).

### Changed
- **⚠️ Perubahan perilaku — secure-by-default untuk section.** Anggota non-OWNER yang **sudah ada** kini **default-deny** di Notes/Aliases/Files/Storage sampai OWNER memberi akses. Sebelumnya semua anggota otomatis bisa mengakses keempat section. Setelah update, OWNER perlu membuka tab **Members → Sections** dan grant akses (bisa massal per kolom). Anggota baru juga default-deny, konsisten dengan kebijakan per-environment yang sudah berjalan. OWNER project tidak terpengaruh (tetap akses penuh).

## [0.19.18] - 2026-07-06

### Added
- **Import env per-key (whitelist)** — saat me-link vars dari env lain, kini bisa memilih **sebagian key saja** atau semua. Contoh: env `base-stg` punya 10 var, tapi project `hipmi` cukup menarik `GOOGLE_API` + `GOOGLE_ID` — sisanya tidak ikut. Tanpa pilih apa pun = semua key ikut (perilaku lama, kompatibel). Whitelist bersifat **ketat**: key baru yang muncul di env source **tidak ikut otomatis** sampai ditambahkan manual. Link yang sudah ada bisa diubah whitelist-nya kapan saja lewat tombol edit (tanpa hapus-buat ulang).
- **Tombol "copy value saja"** di halaman vars — di samping tombol copy `KEY=value` yang sudah ada, kini ada tombol untuk menyalin **nilai mentahnya saja** (tanpa prefix `KEY=`). Tersedia di tabel desktop, baris imported, dan kartu mobile.

## [0.19.17] - 2026-07-06

### Fixed
- **`envman run <alias>` kembali menerima flag tambahan** — flag setelah nama alias (mis. `envman run claude:malik-opus --resume`) sempat ditolak dengan `unknown flag: --resume` sejak migrasi CLI ke Go. Sekarang flag apa pun setelah ref alias diteruskan langsung ke command hasil ekspansi, tanpa perlu `--`. Catatan: `-e`/`--server-wins` milik envman harus diletakkan **sebelum** ref alias; `--` tetap valid sebagai pemisah eksplisit.

## [0.19.16] - 2026-07-06

### Changed
- **Filter matrix akses lebih interaktif** — input "Cari anggota" dan "Cari env" kini Autocomplete: bisa ketik bebas **atau** pilih dari dropdown saran (nama anggota / nama env yang ada). Dropdown "Tag env" jadi searchable (bisa diketik untuk mencari tag).

## [0.19.15] - 2026-07-06

### Changed
- **Matrix akses anggota lebih bersih** — badge role (OWNER/EDITOR/dll) di tiap sel dihilangkan karena redundan (tombol aktif sudah berwarna, project role sudah tampil di kolom nama). Diganti **legenda arti** sekali di atas tabel (`~ V E O ✕`). Sel yang diblokir (denied) diberi background merah tipis + ikon gembok agar sinyal keamanan tetap terlihat sekilas.

## [0.19.14] - 2026-07-06

### Added
- **Filter di matrix akses anggota** — halaman project > tab Members (matrix view) kini punya toolbar filter: cari anggota (filter baris by nama/email), cari environment, dan filter tag environment (filter kolom). "Pilih semua" dan penghitung hanya menyentuh anggota yang lolos filter, sehingga bulk action tidak mengenai anggota yang tersembunyi. Dropdown tag hanya muncul jika ada env ber-tag.

### Changed
- **`GET /api/envman/projects/:slug/access-matrix`** kini mengembalikan `environments[].tags` (additive) untuk mendukung filter tag di matrix.

## [0.19.13] - 2026-07-06

### Added
- **Filter project berdasarkan pembuat** — halaman `/envmanager` punya dropdown "Pembuat": *Semua* / *Dibuat oleh saya*. Untuk SUPER_ADMIN, dropdown juga menampilkan daftar user pembuat sehingga bisa memantau project yang dibuat tiap user. Pilihan tersimpan (localStorage), jadi bertahan setelah reload.
- **Kolom `Project.createdById`** — setiap project baru mencatat pembuatnya. Project lama di-backfill ke OWNER paling awal saat migrasi. FK `ON DELETE SET NULL` (hapus user tidak menghapus project).

### Changed
- **`GET /api/envman/projects`** kini mengembalikan `createdById` + `createdBy` (`{id, name, email, image}`) per project (additive, bentuk response lain tidak berubah). `POST` mengisi `createdById` = pembuat.

### Database
- Migration `20260706000600_add_project_created_by` — tambah kolom `createdById` + index + FK, backfill project existing. Idempotent, jalan otomatis saat startup.

## [0.19.12] - 2026-07-06

### Added
- **`envman docs` offline fallback** — dokumentasi CLI kini di-embed ke binary (`//go:embed`). `envman docs` tetap mengambil versi terbaru dari server (`/api/cli-docs.md`) bila terjangkau; saat offline atau belum login, otomatis mencetak dokumentasi bawaan (placeholder `{{SERVER}}` diganti URL server dari config). Notice offline ke stderr — stdout tetap bersih untuk piping.
  - Sumber tunggal tetap `src/lib/cli-docs/*.ts`. `cli-go/internal/docs/DOCS.md` **di-generate** (`scripts/gen-cli-docs.ts`, otomatis di `build:cli`), tidak diedit tangan; unit test `cli-docs-embed` menjaga agar tidak drift dari sumber.

### Changed
- **Docs web** (`api-storage.ts`) disinkronkan dengan fitur terbaru: `storage exec` (cache), response download `{url, size, updatedAt}`, dan `upload --no-clobber`.
- **CLAUDE.md**: peringatan di paling atas bahwa CLI ada di `cli-go/` (bukan `src/cli`), untuk mencegah kesalahpahaman entrypoint.

### Internal
- `cli-go/cmd/envman/main.go` dipecah — grup storage subcommand → `storage_cmd.go`, docs command → `docs_cmd.go` (menjaga batas file health). Tanpa perubahan behavior.

## [0.19.11] - 2026-07-06

### Added
- **`storage upload --no-clobber` / `-n`** — cegah menimpa file yang sudah ada. Default upload tetap **overwrite** (upsert). Dengan `-n`: file tunggal yang sudah ada → error + exit 1; upload folder → file yang sudah ada dilewati, sisanya tetap diupload (seperti `cp -n`).
  - Pengecekan berjalan di server (`presign-upload` & `multipart/init`) **sebelum** transfer byte — path yang sudah ada + `noClobber` → `409 {exists:true}`, jadi bandwidth tidak terbuang.
  - Berlaku untuk file kecil, file besar (chunked multipart), dan upload folder.

### Changed
- **`POST .../storage/presign-upload`** dan **`POST .../storage/multipart/init`** menerima field opsional `noClobber` (default `false`). Additive — perilaku existing tidak berubah.

## [0.19.10] - 2026-07-05

### Added
- **`storage exec` cache** — binary yang dijalankan via `envman storage exec` kini di-cache di `~/.cache/envman/exec` (mode 0700) dan dipakai ulang selama tidak berubah. Run berulang jadi **instan** (nol transfer byte, hanya request metadata kecil untuk cek kesegaran).
  - **Otomatis update**: cache tervalidasi via `size` + `updatedAt` dari server. File di-replace di storage → `updatedAt` berubah → binary otomatis di-download ulang (tidak pernah menjalankan versi basi diam-diam).
  - **Anti-collision**: cache key = `sha256(server \x00 slug \x00 path)` — binary bernama sama di project berbeda (`a:tts-go` vs `b:tts-go`) tidak pernah bertabrakan.
  - **Prune LRU**: total cache dibatasi 500 MB, entri terlama dihapus.
  - **Flag baru**: `--offline` (pakai cache tanpa menghubungi server), `--no-cache` (paksa download ulang, bypass cache).

### Changed
- **`GET /api/envman/projects/:slug/storage/download`** kini mengembalikan `{url, size, updatedAt}` (sebelumnya `{url}`). Additive — `size` + `updatedAt` diambil dari `ProjectStorageObject` yang sudah ada, dipakai CLI sebagai validator cache.

## [0.19.9] - 2026-07-05

### Added
- **CLI `storage exec`** — jalankan binary dari storage secara langsung. `envman storage exec <project>:<path>` mengunduh file ke temp file privat (mode 0700), menjalankannya (stdin/stdout/stderr inherit), lalu menghapusnya. Argumen setelah `--` diteruskan ke program; exit code program dipropagasi sebagai exit code envman. Untuk binary yang tidak bisa di-pipe ke `| bash` (berbeda dari `storage download` yang stream ke stdout untuk script teks).

### Removed
- **CLI TypeScript lama dihapus** — CLI kini sepenuhnya ditulis dalam Go di `cli-go/` (sudah menjadi sumber `build:cli` dan biner `/download/cli/*`). File mati `src/cli.ts` + `src/cli/*` (~1140 baris) beserta test terkait dihapus. Tidak ada perubahan behavior untuk pengguna CLI — biner yang beredar tetap dari `cli-go/`.
- **Test yatim `envman-mcp-audit`** — menguji endpoint `/api/envman/mcp/audit` yang sudah dihapus bersama MCP; test dihapus.

## [0.19.8] - 2026-07-05

### Added
- **Chunked multipart upload — CLI + Web UI**: upload file besar (>50 MB) kini dipecah otomatis menjadi chunk 50 MB masing-masing, dikirim melalui server envman → MinIO tanpa melewati batas 100 MB Cloudflare (free/pro).
  - **CLI**: file >50 MB otomatis memakai multipart. Upload yang terputus (Ctrl+C, koneksi drop) disimpan ke `~/.cache/envman/upload-*.json` — jalankan perintah yang sama untuk melanjutkan dari chunk terakhir. Retry otomatis 3× per chunk dengan backoff eksponensial.
  - **Web UI**: `StorageUploadModal` mendeteksi file >50 MB dan beralih ke chunked upload via fetch API. Progress menampilkan "Chunk N/M" + bytes total + kecepatan + ETA. Tombol "Batalkan Upload" membersihkan sesi multipart di MinIO.
  - **Server**: 4 endpoint baru `POST /storage/multipart/init`, `POST /storage/multipart/part`, `POST /storage/multipart/complete`, `DELETE /storage/multipart/abort`. Validasi auth, quota, dan minioKey prefix per-project di setiap endpoint.
  - **SigV4**: implementasi AWS Signature V4 di `src/lib/s3-multipart.ts` — tanpa npm package tambahan, murni Node.js `crypto`.

## [0.19.7] - 2026-07-05

### Fixed
- **CLI storage upload — 413 dari Cloudflare pada file besar**: presigned PUT URL yang dihasilkan server mewarisi `MINIO_ENDPOINT` yang berada di belakang Cloudflare (limit 100 MB free/pro). Ditambah env var opsional `MINIO_PRESIGN_BASE_URL` — jika diset ke URL direct MinIO (tidak lewat Cloudflare), presigned URL untuk CLI upload akan mengarah ke URL itu sehingga file besar bisa diupload tanpa terpotong proxy.
  - Operasi server-side (read/write/delete) tetap memakai `MINIO_ENDPOINT`.
  - Download (GET presign) tetap via `MINIO_ENDPOINT` — Cloudflare CDN tetap membantu untuk download.
- **CLI error message 413 lebih informatif**: sebelumnya menampilkan seluruh HTML Cloudflare. Sekarang tampilkan pesan singkat yang menyebut solusi (`MINIO_PRESIGN_BASE_URL`).

## [0.19.6] - 2026-07-05

### Added
- **Batas storage per-project**: SUPER_ADMIN bisa mengatur `storageMaxFileMb` (maks ukuran file) dan `storageQuotaMb` (quota) per-project secara individual, menggantikan batas global untuk project tersebut. Project yang tidak diatur mengikuti batas default global.
  - UI: ikon gear di panel Storage (hanya terlihat SUPER_ADMIN) membuka modal pengaturan batas per-project. Kosongkan field untuk kembali ke default global.
  - Batas default global kini bisa diubah dari `/dev > Storage` — section "Batas Storage Default" dengan input `Maks ukuran file` dan `Quota per project`.
  - Server: `PATCH /api/envman/projects/:slug` (SUPER_ADMIN) menerima `storageMaxFileMb` dan `storageQuotaMb`.
  - DB: kolom `storageMaxFileMb Int?` baru di tabel `project` (nullable = ikuti global default).

## [0.19.5] - 2026-07-05

### Fixed
- **CLI storage upload — Gateway Timeout pada file besar**: upload sebelumnya melewati reverse proxy (envman server) sehingga file >~50 MB terpotong timeout proxy. Sekarang CLI minta presigned PUT URL ke server (< 1 detik), lalu upload langsung ke MinIO tanpa melewati proxy — tidak ada batas waktu praktis. Progress bar tetap berjalan.
  - Server: `POST /storage/presign-upload` (issue presigned PUT URL + validasi quota) + `POST /storage/confirm-upload` (daftarkan ke DB setelah upload selesai).
  - CLI: tiga langkah atomis — presign → PUT MinIO → confirm.

## [0.19.4] - 2026-07-05

### Changed
- **CLI storage upload/download — progress bar**: upload file tunggal dan download ke file (`-o`) kini menampilkan progress bar animasi + persentase + size + kecepatan transfer + estimasi waktu (ETA) ke stderr. Download pipe ke stdout tetap diam agar output bersih untuk tools downstream. Upload folder tetap menampilkan baris per-file dengan ukuran setelah selesai.

## [0.19.3] - 2026-07-04

### Added
- **Hapus folder**: OWNER bisa menghapus seluruh folder sekaligus (beserta semua isinya) tanpa harus hapus file satu per satu.
  - UI: tombol hapus (merah) muncul di tiap baris folder di list view dan grid view. Konfirmasi sebelum eksekusi.
  - CLI: `envman storage rm myapp:assets/` — hapus folder rekursif, tampilkan jumlah file yang dihapus.
  - Server: endpoint `DELETE /api/envman/projects/:slug/storage/folder?prefix=` — hapus MinIO objects + DB records atomis (OWNER only).

## [0.19.2] - 2026-07-04

### Added
- **Folder upload — CLI + UI**: upload seluruh folder sekaligus.
  - CLI: `envman storage upload myapp ./assets/` otomatis deteksi direktori, upload rekursif dengan progress `[N/total]`. Flag `--path` menjadi remote prefix. Direktori kosong ditolak dengan pesan jelas.
  - UI: drag-drop folder ke panel Storage atau klik tombol folder (picker `webkitdirectory`). Modal antrian menampilkan status per-file (pending/uploading/done/error) dan progress keseluruhan.

## [0.19.1] - 2026-07-04

### Changed
- **`envman docs` — fokus ke CLI**: output sekarang hanya mencakup referensi CLI (install, auth, inject vars, file execution, alias, storage, CI/CD, troubleshooting) dengan banyak contoh nyata per kasus. Referensi API server tetap tersedia di `/api/docs.md`. Endpoint baru `/api/cli-docs.md` di-fetch oleh `envman docs`.

## [0.19.0] - 2026-07-04

### Added
- **CLI Go — `envman storage` subcommand**: akses Project Storage langsung dari terminal tanpa buka browser. Tiga subcommand:
  - `envman storage ls <project> [--prefix folder/] [--page N]` — list file & folder dengan info kuota
  - `envman storage upload <project> <file> [--path remote/path]` — upload streaming dari disk ke server tanpa buffer memori
  - `envman storage download <project>:<path> [-o file]` — download streaming ke stdout (default) atau file. Mendukung pipe langsung ke tools: `envman storage download myapp:compose.yml | docker compose -f - up`

## [0.18.3] - 2026-07-04

### Fixed
- **CLI Go — `envman run` unmarshal error**: endpoint `vars/export` mengembalikan `vars` sebagai JSON object `{"KEY":"VALUE"}`, bukan array. Go struct salah memakai `[]struct{key,value}` — diubah ke `map[string]string`. Perintah `envman run` dan `envman -e proj:env -- cmd` kini berjalan normal.
- **CLI Go — update notice arah terbalik (`v0.18.2 → v0.18.0`)**: `ShowUpdateNotice` sebelumnya menampilkan notice jika versi cache berbeda dari binary, termasuk jika cache lebih tua. Ditambah perbandingan semver — notice hanya muncul jika `latest > current`. Race condition tambahan: cache write di `Update()` kini memakai `CheckedAt = now + 15 menit` sehingga background check yang berjalan bersamaan tidak bisa menimpa dengan data lama.
- **CLI Go — env name dengan titik salah dideteksi sebagai file ref**: `isProjectFileRef` sebelumnya menandai *semua* string yang mengandung `.` sebagai file reference — env name seperti `staging.v2` atau `env.local` akan salah dirouting ke file fetch lalu gagal. Diganti dengan whitelist ekstensi yang dikenal (`sh`, `ts`, `py`, `yaml`, dll.) — hanya string dengan ekstensi valid yang dianggap file ref.

## [0.18.1] - 2026-07-04

### Fixed
- **CLI Go — `envman run` crash**: server mengembalikan `args` alias sebagai string, bukan array — Go CLI salah asumsikan `[]string`. Ditambah shell tokenizer (`splitArgs`) yang menangani single/double quotes.
- **CLI Go — `envman update` binary rusak**: kode secara manual meng-set `Accept-Encoding: gzip` yang menonaktifkan auto-decompress Go HTTP transport. Binary yang tertulis ke disk adalah file gzip mentah (tidak bisa dieksekusi). Difix dengan menghapus header manual — Go transport kini handle gzip secara transparan.
- **CLI Go — update notice spam**: notice muncul di setiap perintah termasuk `--version` dan `--help`. Difix dengan migrasi ke cobra (`PersistentPreRun` tidak dipanggil untuk `--version`/`--help`).
- **CLI Go — `--server-wins` tidak bekerja**: implementasi menggunakan duplicate keys di env slice — perilaku tidak terdefinisi. Difix dengan map approach seperti cabang default.
- **CLI Go — auth resolution di `envman run`**: `Alias()` tidak men-scan sumber `-e` file untuk `ENVMAN_SERVER`/`ENVMAN_TOKEN` — credentials dari file lokal diabaikan.
- **CLI Go — false positive URL di arg parsing**: `curl https://...` salah terdeteksi sebagai file reference. Difix dengan exclusion untuk skema URL (tanda `//` setelah `:`).
- **CLI Go — success message hilang setelah sudo update**: `sudoReplace()` tidak punya pesan sukses. Difix dengan restrukturisasi alur `Update()`.
- **CLI Go — format update notice inkonsisten**: tampil `v0.17.0 → 0.18.0` (tanpa prefix `v`). Difix menjadi `v0.17.0 → v0.18.0`.

### Changed
- **CLI Go — cobra integration**: `main.go` di-rewrite menggunakan [cobra](https://github.com/spf13/cobra) untuk UX yang lebih baik — structured help per subcommand, `--token` required flag di `login`, shell completion otomatis (`envman completion bash/zsh/fish`), dan error message yang konsisten. Binary size bertambah ~2 MB (7.8 MB → 8 MB, gzip 3 MB).

## [0.18.0] - 2026-07-04

### Added
- **CLI Go port**: CLI binary di-rewrite dari Bun/TypeScript ke Go. Ukuran binary turun ~90% (61 MB → 5.5–6 MB, gzip 2.2–2.5 MB). Semua fitur terjaga: env inject, file execution via stdin, alias expansion, response cache, background update check, sudo fallback.
- **`envman docs` command**: output seluruh API docs + referensi CLI ke stdout dalam satu perintah — dirancang untuk digunakan sebagai konteks AI agent (`envman docs > context.md`).
- **Docs coverage lengkap**: endpoint Project Storage, Env Import (live-link), Portainer Capabilities, dan semua subcommand CLI kini terdokumentasi di `/api/docs.md`.

### Removed
- **PM Daemon (`envman pm`)**: dihapus dari codebase setelah 2 bulan tidak digunakan. Tidak ada breaking change pada API server.
- **MCP Server (`envman mcp`)**: dihapus dari codebase — dukungan agent dialihkan penuh ke CLI + `envman docs`. Deploy MCP (`scripts/mcp/deploy.ts`) tetap ada.

## [0.17.0] - 2026-07-04

### Added
- **Project Storage (MinIO)**: setiap project kini punya ruang penyimpanan file berbasis MinIO. Upload file via tombol, drag-drop ke panel, atau paste dari clipboard. Navigasi hierarki folder via breadcrumb. Kuota per-project (default 500 MB) dengan indikator penggunaan.
- **Multi-select file**: pilih banyak file sekaligus dengan checkbox (muncul saat hover atau saat mode seleksi aktif). Action bar muncul otomatis — mendukung "Pindah" dan "Hapus" batch. Seleksi reset saat pindah folder.
- **Batch move**: pindah satu atau banyak file ke folder manapun sekaligus. Modal pindah menampilkan chip folder yang sudah ada (BFS discovery satu level) untuk quick-pick, plus input manual untuk folder baru atau nested.
- **Drag-to-download**: seret file dari panel storage langsung ke desktop atau folder OS (Chrome/Edge). Presigned URL di-prefetch saat hover untuk mengurangi latensi.
- **Tampilan grid dan list**: toggle tampilan list ↔ grid (ikon SimpleGrid 2-4 kolom) — preferensi disimpan di localStorage.
- **Preview file in-drawer**: klik file membuka drawer dengan pratinjau — gambar (img tag), teks/kode (Monaco editor dengan syntax highlight), dokumen lain dengan info metadata. Monaco di-lazy-load (~1 MB, Suspense).
- **Rename file**: setiap file bisa di-rename langsung dari panel (list dan grid), path di MinIO dan DB diupdate atomik.
- **Ikon tipe file**: setiap file mendapat ikon sesuai tipe MIME (gambar, PDF, teks, kode, arsip, video, audio, dll.) — representasi visual tanpa thumbnail.
- **Thumbnail private**: file gambar private mendapat presigned URL otomatis saat card dimuat (TTL 5 menit, di-cache per file) untuk ditampilkan sebagai thumbnail di grid view.
- **Auto-copy suffix**: upload file dengan nama yang sudah ada di folder yang sama secara otomatis mendapat suffix `_2`, `_3`, dst. untuk menghindari konflik.
- **Paginasi server-side**: list file dipaginasi 50 per halaman — navigasi halaman di bawah panel. Seleksi reset saat ganti halaman.
- **Paste dari clipboard**: buka modal upload lalu Ctrl+V / ⌘V untuk langsung paste gambar atau file dari clipboard.
- **Upload progress bar**: progress upload realtime dengan persentase, bytes, kecepatan transfer (MB/s), dan estimasi waktu selesai. Tombol "Batalkan Upload" saat upload berlangsung.

### Fixed
- **Drag-drop upload gagal di dalam subfolder**: bug `dragCounter` bertabrakan dengan atribut `draggable` di file card, menyebabkan `dragLeave` terpicu palsu dan overlay hilang. Diganti dengan pengecekan `e.relatedTarget` yang lebih andal.
- **Filename tidak ditambahkan ke path upload di subfolder**: kondisi auto-fill filename hanya memeriksa `!path.trim()`, sehingga path `"satu/"` (prefix + slash) tidak memicu auto-fill — file tersimpan di root. Kini juga memicu bila path berakhiran `/`.

## [0.15.0] - 2026-07-02

### Added
- **Capability Portainer granular**: operasi Portainer kini bisa didelegasikan per-user lewat capability tanpa harus SUPER_ADMIN. Tujuh capability baru — `connection:manage` (CRUD connection), `stack:exec` (exec container), `stack:sync` (push env vars), `stack:power` (start/stop/restart), `stack:deploy` (repull/recreate), `backup:view`, `backup:manage`. Endpoint connection-scoped pakai capability; endpoint env-scoped lolos bila EDITOR/OWNER di env **atau** punya capability terkait (backward-compatible). Editor permission di halaman Users menampilkan seluruh capability, tombol UI di-gate sesuai izin.
- **Kustomisasi avatar project**: OWNER bisa memilih icon (registry Tabler) dan warna background avatar (palet Mantine) di form edit project, dengan pratinjau langsung. Kosong = inisial nama + warna sesuai role.
- **Tint background card project**: warna kartu project bisa diberi sentuhan warna tipis (palet Mantine) yang tetap terbaca di mode gelap & terang. Kosong = tanpa tint.

### Changed
- **Access Matrix (Users) seragam**: kontrol role per-env dan default role kini memakai idiom tombol ringkas `~ V E O ✕` (inherit/VIEWER/EDITOR/OWNER/deny) yang sama dengan matrix members project — menghilangkan card bertingkat dan kontrol ganda.
- Manajemen Portainer connection & backup tidak lagi terkunci SUPER_ADMIN; kini lewat capability (`connection:manage`, `backup:view`/`backup:manage`).

### Fixed
- **Kebocoran otorisasi probe Portainer**: `POST /portainer/probe` yang memakai apiToken tersimpan suatu environment kini wajib punya akses ke environment tersebut — mencegah peminjaman kredensial Portainer milik project lain.

### Security / Breaking
- **`stack:exec` dipisah dari `stack:operate`**: exec ke container kini butuh capability `stack:exec` eksplisit (setara akses shell). User yang sebelumnya hanya punya `stack:operate` kehilangan kemampuan exec sampai di-grant `stack:exec`. Operasi lifecycle lain (restart/repull/recreate) di-backfill otomatis agar pemilik `stack:mutate` lama tidak kehilangan akses.

## [0.14.4] - 2026-06-30

### Added
- **Preview gist layar penuh**: tombol maximize di tiap tab file pada detail gist membuka konten dalam modal full-screen (tanpa batas tinggi 400px), memudahkan membaca file panjang. Tetap dengan syntax highlight yang sama.

### Fixed
- **Tema code block ikut dark mode**: blok kode di preview Markdown (detail gist, dll.) tadinya selalu tampil background terang saat color scheme `auto` mengikuti preferensi sistem dark. Kini meresolusi `auto` → `light`/`dark` nyata sehingga syntax highlight memakai tema gelap dengan benar.

## [0.14.0] - 2026-06-24

### Added
- **Copy hanya key (`.env.example` template)**: salin daftar key tanpa value (format `KEY=`, paste-ready) untuk membagikan kebutuhan env tanpa membocorkan nilai. Tersedia di selection bar ("Copy keys") dan menu export (semua key / key hasil filter / key yang dipilih).
- **Double-click value untuk edit**: klik-ganda pada kolom value sebuah var lokal langsung masuk mode edit (desktop & mobile), mempercepat penyuntingan. Hanya untuk EDITOR/OWNER dan var lokal — baris imported tetap read-only.

## [0.13.0] - 2026-06-23

### Added
- **Env Import (Reference / Live-Link)**: env target bisa meminjam vars dari env lain (boleh lintas project) secara **referensi live**, bukan salinan — base ditulis sekali, semua importer ikut otomatis (hindari drift). Resolusi berlapis `imports (order asc) → local`, **var lokal selalu menang per-key**. Akses source dicek **saat resolve** (denied → var di-skip + warning `deniedImports`, tidak silent); secret reveal/mask ikut akses caller di env source. Cycle detection saat save. Buat/hapus link hanya untuk **OWNER env target** yang juga punya akses ≥VIEWER ke source. UI: baris imported read-only berbadge `from <proj>:<env>`, badge `overrides` pada var lokal yang menimpa, modal kelola link (OWNER). MVP belum mencakup per-key filter / transitive import / per-import override.

## [0.12.0] - 2026-06-21

### Added
- **Gists** di landing page: kartu fitur snippet multi-file (private default / public, syntax highlight, tag & search).

### Changed
- **Secure-by-default member onboarding**: anggota baru (role EDITOR/VIEWER) otomatis di-DENY di semua environment existing. OWNER harus eksplisit grant per-env via matrix view — mencegah kekeliruan memberi akses penuh ke env produksi. Anggota baru dengan role OWNER tetap dapat akses semua env (sesuai semantik OWNER).
- Saat environment baru dibuat, semua project member non-OWNER otomatis di-DENY di env baru tsb.

### Performance
- **Conditional HTTP caching (end-to-end)**: endpoint baca-resource kirim `ETag`/`Last-Modified` dan dukung `If-None-Match`/`If-Modified-Since` → `304 Not Modified`. Di-cover: gist raw & public detail, `files/resolve`, `aliases/resolve` (ETag per-caller cegah kebocoran cross-user), dan `/api/docs.md`. CLI `apiFetch()` kini punya disk cache opt-in (mode 0600) yang mengirim conditional request dan menyajikan body dari cache saat `304` — `envman run`/eksekusi file berulang hanya transfer `304` saat konten tak berubah. Env vars & session sengaja tidak di-cache.

## [0.11.29] - 2026-06-05

### Added
- Token Control panel di Dev Console: lihat semua token lintas user, disable/enable/set-expiry/revoke, warning stale/expiring/wide-access, group by user, card/table view, pagination.
- Token activity log: catat setiap aksi CLI per token (vars_fetch, var_set, var_delete, alias_resolve, file_exec) — klik token di Token Control untuk lihat history lengkap.
- Dev > Settings — section Token Activity Log: master switch, toggle vars_fetch, retensi (hari), cap per token, stats live, tombol cleanup manual dan hapus semua.
- Self-service token creation: user non-QC bisa buat token dari Profile dengan tag, filter, grouping, list/grid view.
- Profile page: AppShell sidebar (Account, Projects, API Tokens, Panduan).
- File Health Panel di Dev Console.
- AppSetting: konfigurasi runtime yang bisa diubah dari UI (GET/PUT /api/envman/settings).
- Endpoint admin: GET /api/admin/tokens, PATCH/DELETE /api/admin/tokens/:id, GET /api/admin/tokens/:id/activity, POST /api/admin/token-activity/cleanup, DELETE /api/admin/token-activity.

### Changed
- Members panel: hapus toggle List/Matrix, default langsung matrix view. Cell env access diganti button group inline `[~][V][E][O][✕]` — satu klik langsung apply tanpa dropdown.
- App.tsx: pindah QueryClientProvider ke atas ModalsProvider agar modal yang dibuka via modals.open() bisa menggunakan useQuery/useMutation.
- Saat user di-block: semua token otomatis di-disable (sebelumnya hanya sessions yang dihapus).
- Token tracking: setiap pemakaian token catat useCount++ dan lastIp.

### Fixed
- Modal BulkRoleModal dan BulkEnvAccessModal menampilkan layar hitam — akibat QueryClientProvider di bawah ModalsProvider.

## [0.11.28] - 2026-06-05

### Added
- Env-level access overrides (`EnvironmentMember`): per-user override `inherit | denied | OWNER | EDITOR | VIEWER` per environment, di atas role project. OWNER UI di `MembersPanel` + `MemberEnvOverrides`; SUPER_ADMIN UI di Users Management → Access Matrix.
- Alias resolve guard: alias yang mereferensikan `-e project:env` ke env yang di-deny dikembalikan 403 dengan `deniedEnvs[]`. CLI tangkap dan tampilkan pesan tolak.
- MCP tools `env_member_list`, `env_member_get` (readonly), `env_member_set`, `env_member_clear` (admin) untuk inspect/manipulasi env-level overrides.
- Users Management → Access Matrix UX baru: collapsible row per project (`ProjectAccessRow`), stats header global (`AccessStatsHeader`), sort by name/role/override-count, no-access section collapsed default. Scalable untuk 100+ project.
- Users Management → tab Access & Permissions: banner peringatan saat user diblokir (perubahan tetap disimpan, tapi user tidak bisa login).
- PermissionsTab: confirm modal saat grant capability destruktif (`stack:prune`).
- Token activity log + admin tokens panel: tracking per-token (useCount, lastIp, disabledBy/At/Reason) + log aktivitas CLI per token.

### Changed
- SUPER_ADMIN endpoint env-override (`PUT /api/envman/admin/users/:userId/projects/:slug/envs/:envName`) sekarang punya kontrol yang sama dengan OWNER endpoint: validasi target user harus project member, last-owner-of-env protection, emit audit `ENV_MEMBER_SET`/`ENV_MEMBER_CLEARED`, cache invalidation lengkap.
- UserDrawerContent stats: `Projects` count sekarang termasuk project yang user-nya tidak punya role tapi punya env-override non-deny.
- UserDrawerContent stats card di-grayscale saat user diblokir agar lebih jelas secara visual.
- PermissionsTab group header: title + description truncate supaya tidak overflow di drawer sempit.
- Route `/download/cli/:platform`: refactor pakai env var `CLI_DATA_DIR` (default `/data/cli`), serve plain binary atau gzipped sesuai `Accept-Encoding`.

### Fixed
- Test suite: 4 test fail pre-existing (migrate × 2, cli-download × 2) diperbaiki — count migrations dinamis, route serve plain bin untuk request tanpa gzip.

## [0.11.27] - 2026-06-04

### Added
- Profile page: layout AppShell dengan sidebar (Account, Projects, API Tokens, Panduan)
- Profile: tab Projects — lihat semua project yang di-assign, role, link ke envmanager
- Profile: tab API Tokens — buat, kelola, filter, search, tag, group by tag, list/grid view
- Profile: tab Panduan — dokumentasi CLI dan penggunaan token untuk end-user
- Self-service token creation: user non-QC bisa buat token sendiri dari Profile
- Dev > Settings: toggle global "izinkan user buat token" + setting maks masa berlaku
- AppSetting: tabel konfigurasi runtime yang bisa diubah dari UI tanpa restart server
- File Health Panel di Dev Console: monitor ukuran file vs limit per kategori
- Dev Console: grouping menu dengan deskripsi, sidebar bisa scroll
- Docs envmanager: ditulis ulang fokus product-user (hapus detail developer internal)

### Changed
- MembersPanel: avatar Google ditampilkan di daftar member dan daftar user yang bisa ditambahkan
- Dev sidebar: user section menggunakan popup menu (Profile + Logout)
- Semua navigasi ke `/profile` menggunakan search param `?tab=account`

### Fixed
- Better Auth `BETTER_AUTH_URL` di staging: tambah `trustedOrigins` dan env var `BETTER_AUTH_TRUSTED_ORIGINS`
- Mobile-friendly: ProfileTokensSection toolbar date filter, TokenRow action icons, ProjectListItem layout

## [0.11.26] - 2026-06-03

### Added
- CLI: tampilan progress yang lebih kaya (rich progress display) saat proses update/download binary

## [0.11.25] - 2026-05-28

### Added
- Aliases: detail view alias via route query `?viewAliasId`
- Files: toggle grouping by tag (default aktif)

## [0.11.24] - 2026-05-26

### Added
- Portainer backup support
- API token tags
- Project `isActive` flag
- Environment tags
