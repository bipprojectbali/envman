# Changelog

## [Unreleased]

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
