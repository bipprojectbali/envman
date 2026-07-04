# Changelog

## [Unreleased]

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
