# Changelog

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
