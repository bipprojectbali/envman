# envman — CLAUDE.md

> **⚠️ CLI ada di Go, bukan TypeScript.** Sumber CLI: `cli-go/` (entry `cli-go/cmd/envman/main.go`). CLI TypeScript lama (`src/cli.ts`, `src/cli/`) **SUDAH DIHAPUS** — jangan cari/rujuk/edit `src/cli*`. `src/` = server + frontend saja. Build: `go build`, test: `go test ./...`.

## Runtime

Bun di seluruh stack (`bun <file>` / `bun test` / `bun install` / `bunx`). Bun auto-load `.env` — jangan pakai dotenv. Cek Bun native API sebelum install npm. Yang dipakai: `Bun.password.hash/verify`, `Bun.RedisClient`, `Bun.file()`, `crypto.randomUUID()`, `Bun.S3Client`.

---

## Server

- `src/app.ts` — semua API routes (`createApp()`)
- `src/index.tsx` — server entry + Vite middleware (dev)
- `src/serve.ts` — dev entry: `bun --watch src/serve.ts`
- `src/server.prod.ts` — production entry (tanpa Vite/Babel). **Jangan compile `src/index.tsx`** (pull `@babel/core`).

**Binary compile:** `bun build src/server.prod.ts --compile --target=bun-linux-x64 --outfile server`

**Migration:** `src/lib/migrate.ts` — zero npm dep, compatible `_prisma_migrations`. Jalan otomatis di startup (`MIGRATE_ON_STARTUP=true` default) sebelum `app.listen()`. `scripts/migrate.ts` = CLI wrapper. ENV: `MIGRATE_ON_STARTUP` (true), `MIGRATE_DATABASE_URL` (`DIRECT_URL ?? DATABASE_URL`), `MIGRATIONS_DIR` (`./prisma/migrations`), `MIGRATE_DB_RETRIES` (5, 2s delay).

---

## Database

PostgreSQL via Prisma v6. Client singleton: `src/lib/db.ts` (`{ prisma }`). Schema: `prisma/schema.prisma`. Client → `./generated/prisma`.

### Schema Models

- `User` (id, name, email, password, role, blocked, timestamps)
- `Session` (id, token, userId, expiresAt, createdAt)
- `AuditLog` (id, userId, action, detail, ip, createdAt)
- `Ticket` (id, title, description, status, priority, route, reporterId, assigneeId, timestamps, closedAt)
- `TicketComment` (id, ticketId, authorId, authorTag, body, createdAt)
- `TicketEvidence` (id, ticketId, kind, url, note, createdAt)
- `Project` (id, slug, name, description, tags[], icon?, color?, cardColor?, storageQuotaMb?, storageMaxFileMb?, createdById?, timestamps) — `icon`/`color`/`cardColor` divalidasi terhadap registry `src/lib/project-avatar.ts`, null = fallback. `storageQuotaMb`/`storageMaxFileMb` = override storage per-project (SUPER_ADMIN), null = global AppSetting. `createdById` (FK User, `ON DELETE SET NULL`) = pembuat project.
- `Environment` (id, name, tags[], projectId, createdAt) — unique(projectId, name)
- `EnvVar` (id, key, value, isSecret, environmentId, timestamps) — unique(environmentId, key)
- `ProjectMember` (id, userId, projectId, role, createdAt) — unique(userId, projectId)
- `EnvironmentMember` (id, userId, environmentId, role?, createdAt) — unique(userId, environmentId). `role=null` = explicit DENY; role set = override; no record = inherit project role
- `ProjectSectionMember` (id, userId, projectId, section, role?, createdAt) — unique(userId, projectId, section). `section` ∈ `ProjectSection`. Semantik identik `EnvironmentMember`: `role=null` = DENY · role set = override · no record = inherit project role. Override akses per-member untuk section non-env (Notes/Aliases/Files/Storage). Lihat [Permission per-Section](#permission-per-section-notes--aliases--files--storage).
- `ApiToken` (id, userId, name, token, scopes[], tags[], canWrite, isDisabled, lastUsedAt?, expiresAt?, createdAt, useCount, lastIp?, disabledBy?, disabledAt?, disabledReason?)
- `ProjectAlias` (id, projectId, name, args, description?, tags[], createdBy, timestamps) — unique(projectId, name)
- `ProjectFile` (id, projectId, authorId, title, description, prefix?, files Json, tags[], timestamps) — unique(projectId, prefix)
- `PortainerConnection` (id, name, portainerUrl, apiToken, createdById, timestamps) — global
- `PortainerConfig` (id, projectId, envName, connectionId?, portainerUrl?, apiToken?, stackId, stackName, endpointId, lastSyncAt?, lastSyncOk?, timestamps)
- `AppSetting` (key PK, value, updatedAt, updatedById?) — konfigurasi global runtime (Dev > Settings)
- `Gist` (id, userId, title, description, files Json `[{filename, content, language}]`, isPublic, tags[], timestamps). `isPublic=false` (default) = private; `true` = terlihat user lain. Edit/delete: owner atau SUPER_ADMIN.
- `EnvImport` (id, targetEnvId, sourceEnvId, order, createdById, createdAt) — unique(targetEnvId, sourceEnvId). Live-link referensi (bukan salinan), boleh lintas project. FK `ON DELETE CASCADE`. Lihat [Env Import](#env-import).
- `ProjectStorageObject` (id, projectId, path, minioKey, size, mimeType, isPublic, tags[], description?, uploadedById, timestamps) — unique(projectId, path). `path` = path user, `minioKey` = `{projectId}/{path}`. `isPublic=true` → `/api/public/storage/:slug/:path` tanpa auth. Lihat [Project Storage](#project-storage).

### Enums

- `Role` = `USER | QC | ADMIN | SUPER_ADMIN`
- `ProjectMemberRole` = `OWNER | EDITOR | VIEWER`
- `ProjectSection` = `NOTES | ALIASES | FILES | STORAGE`
- `TicketStatus` = `OPEN | IN_PROGRESS | READY_FOR_QC | REOPENED | CLOSED`
- `TicketPriority` = `LOW | MEDIUM | HIGH | CRITICAL`

### Commands

```bash
bun run db:migrate    # bunx prisma migrate dev
bun run db:seed       # bun run prisma/seed-dev.ts (dev only)
bun run db:generate   # bunx prisma generate
bun run db:studio     # bunx prisma studio
bun run db:push       # bunx prisma db push
```

### Aturan Migrasi (MUTLAK)

Setiap perubahan `prisma/schema.prisma` WAJIB:

1. **Buat migration SQL manual** di `prisma/migrations/YYYYMMDDHHMMSS_deskripsi/migration.sql`:
   - Nama tabel **lowercase** (`"environment"`, bukan `"Environment"`)
   - Selalu `IF NOT EXISTS`/`IF EXISTS` (idempotent)
   - Kolom NOT NULL di tabel berisi data → `DEFAULT` atau backfill dulu
   - Comment *kenapa*, bukan *apa*
2. **`bun run db:migrate`** di local dev — WAJIB sebelum commit (include generate)
3. **Verifikasi**: `bun run typecheck` bersih, server dev start, migration file ter-commit

**❌ Larangan:** schema change tanpa migration file · commit migration tanpa jalankan di local · `db:push` sebagai pengganti migration · nama tabel PascalCase di SQL.

**Kenapa:** production migrasi otomatis di startup — migration salah = crash saat deploy.

### Secret Encryption

`isSecret=true` → AES-256-GCM. `MASTER_KEY` = 64-char hex. Format: `enc:<iv>:<cipher>:<tag>`. Impl: `src/lib/crypto.ts`. VIEWER lihat `***`; EDITOR/OWNER bisa reveal.

### Seed Users (dev only)

`superadmin@example.com`/`superadmin123` (SUPER_ADMIN) · `admin@example.com`/`admin123` (ADMIN) · `user@example.com`/`user123` (USER). `prisma/seed-dev.ts` gitignored, guard `NODE_ENV !== 'development'` → exit 1.

---

## Auth

Session-based (HttpOnly cookie + DB). `POST /api/auth/login` → bcrypt verify → Session record. Google OAuth: `/api/auth/google`. Blocked → 403, sessions dihapus. Dev: `GET /api/dev-auth/login-as/:email`.

---

## Routing Rules (MUTLAK)

Static route wajib untuk semua navigasi yang merepresentasikan lokasi dalam hierarki data. Search params `?key=value` **hanya** untuk view state satu halaman (tab, filter, sort).

**❌ Larangan:** `useState` untuk navigasi antar halaman · search params sebagai pengganti path params untuk resource hierarchy · "temporary routes" yang hilang saat reload.

```
/envmanager                    → project list
/envmanager/tokens             → tokens
/envmanager/connections        → global Portainer connections
/envmanager/:slug              → project detail (?tab=environments|notes|aliases)
/envmanager/:slug/:env         → vars (?integrations=true, ?compare=true)
```

---

## Role-Based Routing

| Role | Default | Can Access |
|------|---------|------------|
| SUPER_ADMIN | `/dev` | `/dev`, `/dashboard`, `/envmanager`, `/profile` |
| ADMIN | `/dashboard` | `/dashboard`, `/envmanager`, `/profile` |
| QC | `/dashboard` | `/dashboard` (QC tickets only), `/profile` |
| USER | `/profile` | `/profile` |

`getDefaultRoute(role)` di `src/frontend/hooks/useAuth.ts`. Blocked → `/blocked`.

---

## Permission Hierarchy (Per-Project + Per-Env)

Dua lapis. Default: env/notes/aliases/files **inherit** dari `ProjectMember.role`. OWNER bisa override role per-env atau set DENY explicit per-env per-user.

### Secure-by-Default Onboarding

Member ditambah dengan **EDITOR/VIEWER** (POST `/members`) → server auto-insert `EnvironmentMember role=null` (DENY) untuk **semua env existing**. Member baru tak punya akses sampai OWNER grant per-env. Aturan:
- Role **OWNER** baru → tidak default-deny (OWNER akses semua env).
- Update role existing (re-POST userId sama) → tidak touch override.
- Env baru dibuat → semua project member non-OWNER auto-deny di env itu.
- Response `POST /members` carry `defaultDenied: boolean`.

### Resolver — `getEnvironmentAccess(userId, role, slug, envName)` (`src/lib/access.ts`)

1. SUPER_ADMIN → `OWNER` selalu.
2. Cek `EnvironmentMember`: `role=null` → DENIED · role set → override · no record → step 3.
3. Inherit `ProjectMember.role`. No record → `null` (no access).

### Defense-in-Depth

Files & aliases accessible di project level, tapi yang reference env via `-e project:env` di-block di env layer:
- **Vars endpoint** — semua handler panggil `getEnvironmentAccess()`. DENIED → 403.
- **Alias resolve** — `GET /aliases/resolve/:ref` extract `-e project:env` via `extractEnvRefs()` (`src/lib/alias-parser.ts`), cek akses tiap env → 403 `{error, deniedEnvs}`. List endpoint compute `requiresEnvs` + `deniedEnvs` per-alias per-user (di luar Redis cache).
- **Project detail** — `GET /projects/:slug` filter env DENIED untuk non-OWNER; tiap env carry `accessRole`.

### CLI Behavior

`FetchJSON()` (`cli-go/internal/api/api.go`) detect 403 + `deniedEnvs` → cetak `[envman] Akses ditolak untuk env: ...` → exit 1.

### UI

- Project detail: env card badge `DENIED` (red) / override `<role>` (grape).
- MembersPanel: chevron expand → `MemberEnvOverrides.tsx` (select `inherit|OWNER|EDITOR|VIEWER|denied`, OWNER-only mutate).
- AliasesPanel: alias `deniedEnvs.length>0` → Badge merah "needs <env>", sembunyikan CopyButton.
- Users Management (`AccessMatrixTab`): collapsible row per project (`ProjectAccessRow`), badge counts, stats global (`AccessStatsHeader`), default filter `with-access`.

### Admin Endpoint Parity

`PUT /api/envman/admin/users/:userId/projects/:slug/envs/:envName` (SUPER_ADMIN) sama dengan OWNER endpoint: validasi target harus project member, last-owner-of-env protection, audit `ENV_MEMBER_SET`/`ENV_MEMBER_CLEARED` (suffix `(admin)`), invalidate `projectAccess`/`projectDetail`/`invalidateProjectCaches(slug, [userId])`.

`PUT /api/envman/admin/users/:userId/projects/:slug/sections/:section` (SUPER_ADMIN) sama dengan OWNER section-member endpoint: validasi section valid + target project member, audit `SECTION_MEMBER_SET`/`SECTION_MEMBER_CLEARED` (suffix `(admin)`), invalidate `projectDetail`/`invalidateProjectCaches(slug, [userId])`.

### Audit & Cache

- `ENV_MEMBER_SET` — `<slug>/<envName> user=<userId> role=<role>` (+`(admin)`)
- `ENV_MEMBER_CLEARED` — `<slug>/<envName> user=<userId>` (+`(admin)`)
- PUT/DELETE env-member → invalidate `cacheKeys.projectAccess(userId, slug)` + `projectDetail(slug)` + `invalidateProjectCaches(slug, [userId])`.

---

## Permission per-Section (Notes / Aliases / Files / Storage)

Lapis override akses per-member untuk section non-env, **paralel** dengan [Env Members](#permission-hierarchy-per-project--per-env). Model: `ProjectSectionMember`. Resolver: `getSectionAccess(userId, role, slug, section)` di `src/lib/access.ts`. CRUD: `src/routes/envman/section-members.ts`. Matrix: `src/routes/envman/section-matrix.ts`.

### Semantik

- Section = enum `ProjectSection` (`NOTES/ALIASES/FILES/STORAGE`), bukan row. Menempel ke `projectId` + `section`.
- Resolusi (identik env): SUPER_ADMIN → OWNER · record `role=null` → DENIED · record role set → override · no record → inherit `ProjectMember.role` · no project membership → null.
- Enforcement: keempat section men-gate handler via `getSectionAccess()` (bukan lagi `getProjectAccess()`). 24 call-site: Notes(4), Aliases(5, hanya section-access — env-ref via `getEnvironmentAccess` tak berubah), Files(4)+files-resolve(1), Storage(10). Public storage download (`isPublic`) tak terpengaruh.
- Role-gate per operasi **tidak berubah** (mis. Storage: VIEWER list/download, EDITOR upload/meta/rename/move, OWNER delete/folder/setPublic).

### Secure-by-Default

- **Backfill migration** (`20260707102900_add_project_section_member`): semua `ProjectMember` non-OWNER existing di-seed `role=null` (DENY) untuk keempat section. **Perubahan perilaku**: member existing kehilangan akses section sampai OWNER grant.
- Member baru non-OWNER (POST `/members`) → auto-seed DENY keempat section (`projects-members.ts`), sejalan dengan env default-deny. Response `defaultDenied` mencakup ini.
- OWNER project → tidak di-seed (inherit = OWNER). **Tanpa last-owner-protection** (deny section pada OWNER tak mengunci project; role project tetap OWNER).

### Permission & Scope

- Kelola override: **OWNER project** (atau SUPER_ADMIN via admin parity).
- `GET /projects/:slug` menambah field additive `sectionAccess: { NOTES, ALIASES, FILES, STORAGE }` (`ProjectRole | null`) untuk caller — FE pakai untuk sembunyikan tab yang denied.

### UI

Tab Members punya `SegmentedControl` **Environments | Sections**. View Sections = matrix member × 4 section (ikon `~ V E O ✕` sama, `SectionMatrixView.tsx`). Tab section yang `sectionAccess === null` disembunyikan; deep-link ke tab denied → fallback ke Environments.

### Audit & Cache

- `SECTION_MEMBER_SET` — `<slug>/<section> user=<userId> role=<role>` (+`(admin)`)
- `SECTION_MEMBER_CLEARED` — `<slug>/<section> user=<userId>` (+`(admin)`)
- PUT/DELETE section-member → invalidate `cacheKeys.projectDetail(slug)` + `invalidateProjectCaches(slug, [userId])`. Matrix di-cache `cacheKeys.projectSectionMatrix(slug)` 60s.

---

## Env Import (Reference / Live-Link)

Env target meminjam vars dari env lain (boleh lintas project) secara **referensi live**, bukan salinan. Model: `EnvImport`. Resolver: `src/lib/env-import.ts`. CRUD: `src/routes/envman/env-imports.ts`.

### Semantik

- **Layered merge**: `imports (order asc, besar menang) → local`. **Var lokal SELALU menang per-key**. Imported yang key-nya ada lokal di-suppress.
- **Per-key whitelist** (`EnvImport.keys String[]`): kosong `[]` = **semua** var source ikut (default, backward-compatible); ada isi = **hanya** key itu yang di-resolve. Whitelist **ketat** — key baru di source **tidak ikut otomatis** sampai ditambah manual. Filter di `resolveImportedVars()` (setelah cek akses), otomatis menyebar ke `GET vars` + `vars/export`.
- **Akses dicek saat resolve**: tiap source env panggil `getEnvironmentAccess(caller, ...)`. `null` → var di-skip + dicatat di `deniedImports[]` (warning eksplisit, tidak silent).
- **Secret**: reveal/mask pakai akses caller di **SOURCE env**. MASTER_KEY global → decrypt lintas project valid.
- **Cycle detection saat save** (`wouldCreateCycle`) → tolak A→B→A (400).
- **EnvVar `isDisabled` di source di-exclude**.

### Permission

- Buat/hapus link: hanya **OWNER env target**; caller juga wajib akses ≥VIEWER ke source.
- Self-import ditolak (400). Duplikat ditolak (409). `order` = max+1.

### Scope Resolusi

- **`GET vars/export`** (CLI/daemon): merge imported sebagai base, local overwrite. Tambah `deniedImports` hanya jika non-kosong (additive).
- **`GET vars` list** (UI): tambah field additive `imported[]` (`{key, value, isSecret, sourceProject, sourceEnv}`, sudah exclude key lokal), `importedKeys[]`, `deniedImports[]`. Bentuk `vars`/`total` tidak berubah.

### UI

Halaman vars: baris imported **read-only** (badge grape `from <proj>:<env>`, secret tetap reveal sesuai akses). Var lokal yang key-nya ∈ `importedKeys` → badge `overrides`. `deniedImports` → Alert warning kuning. Tombol kelola (`TbLink`, grape) OWNER-only → `ImportManagerModal.tsx` (`?importMgr=true`). Saat tambah/edit link, `ImportKeyPicker.tsx` (fetch key source via `GET vars`) pilih subset key + "pilih semua/kosongkan"; badge `N key`/`semua key` per link + tombol edit (PATCH).

### Audit & Cache

- `ENV_IMPORT_ADDED`/`ENV_IMPORT_REMOVED`/`ENV_IMPORT_UPDATED` detail `<slug>/<env> <- <srcSlug>/<srcEnv>` (+ suffix ` keys=[...]`/` keys=[all]` bila whitelist di-set).
- Invalidate `invalidateProjectCaches(slug)` + `projectDetail(slug)`. **Hasil resolve vars TIDAK di-cache**.

**Deferred (TODO):** transitive import, per-import override value — belum diimplementasi.

---

## Project Storage

MinIO-backed per project. Key prefix `{projectId}/{path}`. DB (`ProjectStorageObject`) = source of truth metadata; MinIO = content.

### Env Vars (wajib aktifkan fitur)

```
MINIO_ENDPOINT=...        MINIO_ACCESS_KEY=...   MINIO_SECRET_KEY=...
MINIO_BUCKET=envman       MINIO_PRESIGN_BASE_URL=...   # opsional
```

`MINIO_PRESIGN_BASE_URL` khusus presigned PUT URL (CLI upload) — set ke URL non-proxy jika MinIO di belakang Cloudflare (limit 100 MB). Tanpa 4 var pertama, endpoint yang butuh MinIO → 503 (list & metadata PATCH tetap jalan).

### Permission

| Operasi | Role |
|---|---|
| List + folder tree | VIEWER+ |
| Upload / replace / update metadata | EDITOR+ |
| Set `isPublic` / Delete | OWNER only |
| Public download (no auth) | `isPublic=true` |

### Storage Limits (AppSetting + per-project override)

- `storage_max_file_mb` (global default 50), `storage_default_quota_mb` (global default 500) — via `/dev > Storage`
- `Project.storageMaxFileMb`/`storageQuotaMb` — override per-project (SUPER_ADMIN), null = global
- Resolusi efektif: `project.storageMaxFileMb ?? globalSetting` (`getMaxFileSizeBytesForProject()` di `storage-service.ts`)
- UI: gear di panel Storage (SUPER_ADMIN) → `StorageSettingsModal`; defaults di `/dev > Storage` → `StorageAdminPanel`

### Cleanup & Presign

- Delete file: MinIO dulu, lalu DB. Project soft-delete: `minioDeleteProject(projectId)` di handler DELETE. Orphan (upload sukses, DB gagal): upload handler auto-delete MinIO object.
- Private download: presigned TTL 5 mnt, `Content-Disposition: attachment`. Public: TTL 1 jam. CLI stream langsung dari MinIO via 302 (server bukan proxy).

### Implementasi

- `src/lib/minio.ts` — `Bun.S3Client` singleton (lazy)
- `src/lib/storage-service.ts` — `sanitizePath`, `getQuotaBytes`, `minioUpload/Delete/DeleteProject/Presign`, `buildMinioKey`
- `src/lib/s3-multipart.ts` — SigV4 + multipart ops. `MULTIPART_CHUNK_SIZE = 50 MB`
- `src/routes/envman/storage-core.ts` (list/download/meta/delete) · `storage-upload.ts` (≤50 MB) · `storage-multipart.ts` (>50 MB: init/part/complete/abort, validasi minioKey prefix per-project) · `storage-rename.ts` (EDITOR+) · `storage-move.ts` (batch `{paths[], targetFolder}`)
- `src/routes/public-storage.ts` — public redirect
- FE: `slug/StoragePanel.tsx` (breadcrumb tree, drag-drop, list/grid, multi-select) · `StorageUploadModal.tsx` (clipboard paste, XHR ≤50 MB / `useChunkedUpload` >50 MB) · `StorageFileRow.tsx`/`StorageFileCard.tsx` (checkbox, drag-to-download) · `StorageMoveModal.tsx`
- Hooks: `useStorageFileActions.ts` (share/copy/download/presigned cache 4 mnt) · `useChunkedUpload.ts` (`MULTIPART_THRESHOLD = 50 MB`, `upload/abort/progress`)

---

## API Reference

### Admin API (SUPER_ADMIN only)

- `GET /api/admin/users` · `PUT .../users/:id/role` · `PUT .../users/:id/block` (block → delete sessions + disable tokens)
- `GET .../presence` · `GET .../logs/app|audit` · `DELETE .../logs/app|audit`
- `GET .../tokens` · `PATCH .../tokens/:id` (`{action, reason?, expiresAt?}`) · `DELETE .../tokens/:id` (audit TOKEN_REVOKED_BY_ADMIN)
- `GET .../file-health` · `GET .../routes|project-structure|env-map|test-coverage|dependencies|migrations|sessions|schema`
- `PUT /api/envman/admin/users/:userId/permissions` — set capability array (validasi `isValidCapability` → 400). Lihat **Portainer Capabilities**.

### Tickets API

Status: `OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED` (+ `REOPENED`).
`GET|POST /api/tickets` · `GET|PATCH /api/tickets/:id` · `POST /api/tickets/:id/comments|evidence`. FE: `TicketsPanel.tsx`.

### Envman API

Auth: session cookie atau `Authorization: Bearer <token>` (`requireEnvAuth()` di `src/app.ts`).

**Projects:** `GET|POST /api/envman/projects` · `PATCH|GET /api/envman/projects/:slug`. POST isi `createdById`. GET list bawa additif `createdById` + `createdBy` (`{id, name, email, image}`) untuk filter "pembuat" (persist `localStorage envman:projects:creatorScope`; SUPER_ADMIN per-user, ADMIN Semua/Milik saya). PATCH (OWNER) terima additif `icon`/`color`/`cardColor` (registry `src/lib/project-avatar.ts`; null = reset; tak dikenal diabaikan).

**Vars:** `GET .../environments/:env/vars` (search, limit, offset) · `GET .../vars/export` (EDITOR+) · `POST|PUT|DELETE .../vars/:key`. Field additive (env import) — lihat [Env Import](#env-import).

**Environments:** `POST|DELETE|PATCH .../projects/:slug/environments[/:env]`

**Members:** `PUT|DELETE .../projects/:slug/members/:userId/role|member`

**Env Members (OWNER):** `GET .../environments/:envName/members` (list + envRole `inherit`/`denied`/role + `effectiveRole`) · `PUT .../members/:userId` `{role}` · `DELETE .../members/:userId` (reset inherit). Last-owner-of-env protection.

**Section Members (OWNER):** `GET .../projects/:slug/sections/:section/members` (list + sectionRole `inherit`/`denied`/role + `effectiveRole`; section invalid → 400) · `PUT .../sections/:section/members/:userId` `{role}` (`inherit|denied|OWNER|EDITOR|VIEWER`; target wajib project member → 400; tanpa last-owner-protection) · `DELETE .../sections/:section/members/:userId` (reset inherit). `GET .../projects/:slug/section-matrix` — `{project, sections[], members[{userId, user, projectRole, sectionAccess}]}`, cached 60s (`cacheKeys.projectSectionMatrix`). Audit `SECTION_MEMBER_SET`/`SECTION_MEMBER_CLEARED`. Lihat [Permission per-Section](#permission-per-section-notes--aliases--files--storage).

**Env Imports (OWNER target):** `GET .../environments/:envName/imports` (bawa `keys[]` per link) · `POST .../imports` `{sourceProject, sourceEnv, keys?}` (403/400/404/409/cycle; `keys` opsional array string, kosong/absen = semua) · `PATCH .../imports/:id` `{keys}` (ubah whitelist, 400 jika bukan array string) · `DELETE .../imports/:id`. Audit `ENV_IMPORT_ADDED`/`_UPDATED`/`_REMOVED`.

**Access Matrix (OWNER):** `GET .../projects/:slug/access-matrix` — single fetch `{project, environments[{name, tags}], members[{userId, user, projectRole, envAccess}]}`. Cached 60s (`cacheKeys.projectAccessMatrix`), auto-invalidate. Bulk action FE = fan-out `Promise.allSettled` atas PATCH/PUT existing, last-owner per-item, partial failure aggregate (`src/frontend/lib/bulk.ts`). `MembersMatrixView` + toolbar `MatrixFilterBar` (cari anggota/env, filter tag env; "Pilih semua" hanya yang lolos filter).

**Portainer:** `GET|POST .../portainer/connections` · `PUT|DELETE .../connections/:id` · `POST .../connections/:id/probe` · per-env `GET|PUT|DELETE|POST .../portainer[/sync]`

**Portainer env-scoped ops (CLI + FE):** `GET .../portainer/status|containers` (akses env) · `GET .../portainer/inspect/:containerId` (detail 1 container: state/health/uptime/restartCount/exitCode/ports/mounts + stats CPU/mem best-effort saat running; akses env; `portainer-inspect.ts`, math stats via `computeContainerStats()` di helpers) · `GET .../portainer/logs/:containerId` (snapshot, akses env) · `GET .../portainer/logs/:containerId/stream` (**SSE live logs**, `event: stdout|stderr` + `data:`, heartbeat `:keepalive`, `AbortController` ikat ke `request.signal`; gate akses env; de-mux frame Docker incremental di `portainer-logs-stream-demux.ts`) · `POST .../portainer/restart` (**stop→start tanpa pull**, gate `stack:power` via `editorOrCap`; 409 saat sudah stop di-skip) · `POST .../portainer/recreate|repull|sync-repull` (`stack:deploy`) · `POST .../portainer/prune/images` (`stack:prune`). File: `portainer-restart.ts`, `portainer-logs-stream.ts` (+demux), register di `portainer-sync.ts`.

**Portainer Capabilities:** operasi di-gate per-capability (`src/lib/permissions.ts`), bukan role SUPER_ADMIN. Assign via `PUT .../admin/users/:userId/permissions`. SUPER_ADMIN bypass. Guard: `src/routes/envman/portainer-auth.ts` (`requireCap`, `editorOrCap`, `envAccessOrCap`).

| Capability | Mengizinkan |
|---|---|
| `connection:view` / `connection:manage` | list/detail/health/probe · create/edit/delete connection |
| `stack:operate` | view stacks/logs/status/stats/compose/dangling (**bukan** exec) |
| `stack:exec` | exec container (setara shell, **tanpa backfill**) |
| `stack:sync` | push env vars → stack |
| `stack:power` | start/stop/restart |
| `stack:deploy` | repull image, recreate, sync-repull |
| `stack:mutate` | edit compose/stack file |
| `stack:prune` | prune images/volumes/networks/containers |
| `backup:view` / `backup:manage` | list/download · create/delete/schedule |

- **Connection-scoped** (`/portainer/connections/...`) — murni capability via `requireCap`.
- **Env-scoped** (`/projects/:slug/.../portainer/...`) — role ATAU capability via `editorOrCap` (EDITOR/OWNER di env **atau** capability). Exec env-level → endpoint connection-scoped → `stack:exec`.
- **Security:** `POST /portainer/probe` via slug+envName wajib akses env tsb. Migration `20260702000000_portainer_caps_backfill` grant `stack:power`+`stack:deploy` ke pemilik `stack:mutate` (idempotent).

**Files:** `GET|POST .../projects/:slug/files` · `GET .../files/resolve?prefix=&filename=` · `PUT|DELETE .../files/:id`

**Aliases:** `GET|POST .../projects/:slug/aliases` · `PATCH|DELETE .../aliases/:name` · `GET .../aliases/resolve/:ref`

**Tokens:** `GET|POST .../tokens` · `PATCH|DELETE .../tokens/:id` · `PATCH .../toggle` · `GET .../reveal` · `POST .../rotate` · `GET /api/envman/whoami`

**Gists:** `GET .../gists` (session; sendiri + public; `?limit&cursor&search&filter`) · `POST .../gists` (cap `gist:create`) · `PUT|DELETE .../gists/:id` (owner/SUPER_ADMIN) · `GET .../gists/:id/raw/:filename`. Sidebar gated cap `menu:gists`.

**Public Gists (no auth):** `GET /api/public/gists` (`?limit&cursor&search&tags&sort`) · `GET /api/public/gists/:id` (403 jika private) · `GET .../:id/raw/:filename`.

**Conditional caching:** endpoint baca-resource kirim `ETag` + `Cache-Control` (+ `Last-Modified` bila ada) & support `If-None-Match`/`If-Modified-Since` → `304`. Helper: `src/lib/http-cache.ts` (`strongEtag`, `weakEtag`, `conditional`, `notModifiedResponse`). Di-cover: `gists/:id/raw` (strong), `public/gists/:id` (weak), `files/resolve` (weak, log tetap jalan sebelum 304), `aliases/resolve/:ref` (weak, **userId masuk hash** — per-caller), `/api/docs.md` (strong, `public, max-age=300`). **Tidak di-cover (sengaja):** vars, session, list endpoint, binary CLI download.

**Storage:** `GET .../storage` (VIEWER+, `?prefix=`) · `POST .../storage/upload` (EDITOR+, ≤50 MB) · `POST .../storage/presign-upload` (EDITOR+, `{path, size, mimeType, noClobber?}`; `noClobber` + exist → 409) · `GET .../storage/download?path=` (VIEWER+, `{url, size, updatedAt}`) · `PATCH .../storage/meta` (EDITOR+; `isPublic` OWNER-only) · `PATCH .../storage/rename` (EDITOR+) · `PATCH .../storage/move` (EDITOR+, batch) · `DELETE .../storage?path=` (OWNER). **Public:** `GET /api/public/storage/:slug/:path` (302). **Chunked (>50 MB):** `POST .../storage/multipart/init|part|complete` · `DELETE .../storage/multipart/abort`. Validasi minioKey prefix per-project. Lihat [Project Storage](#project-storage).

**Settings:** `GET /api/envman/settings` (public, key-value map) · `PUT /api/envman/settings` (SUPER_ADMIN, `[{key, value}]`) — key valid: `user_token_creation`, `user_token_max_days`, `storage_max_file_mb` (default 50), `storage_default_quota_mb` (default 500).

### Auth Endpoints

`POST /api/auth/login` · `GET /api/auth/google` → `GET /api/auth/callback/google` · `GET /api/auth/session` · `POST /api/auth/logout` · `GET /api/dev-auth/login-as/:email` (dev).

### WebSocket

`WS /ws/presence` — real-time presence (session cookie auth).

---

## Frontend

React 19 + Vite 8 (middleware mode dev). File-based routing: TanStack Router.

- `src/frontend.tsx` — render App, remove splash, DevInspector (dev)
- `src/frontend/App.tsx` — MantineProvider, ModalsProvider, QueryClientProvider, RouterProvider

### Routes (`src/frontend/routes/`)

`__root.tsx` · `index.tsx` (landing) · `login.tsx` · `dev.tsx` (SUPER_ADMIN) · `dashboard.tsx` (ADMIN+) · `envmanager.tsx` (AppShell) · `envmanager.index.tsx` (project list, search+tag persist localStorage) · `envmanager.tokens.lazy.tsx` · `envmanager.connections.tsx` · `envmanager.$slug.tsx` (`<Outlet />`) · `envmanager.$slug.index.tsx` (detail: environments/notes/aliases) · `envmanager.$slug.$env.tsx` (vars; Portainer+History via Drawer `?integrations=true`) · `profile.tsx` · `blocked.tsx`

### Components

`CodeEditor.tsx` + `MonacoCodeEditor.tsx` (Monaco lazy ~1MB, Suspense, mobile → Textarea) · `ThemeToggle.tsx` · `TicketsPanel.tsx` (shared `/dev`+`/dashboard`) · `PortainerSync.tsx` · `slug/AliasesPanel.tsx` · `slug/FilesPanel.tsx` (multi-file, Markdown, search, tag, pagination) · `env/CompareModal.tsx`

### Hooks

`useAuth.ts` — `useSession()`, `useLogin()`, `useLogout()`, `getDefaultRoute(role)` · `usePresence.ts` — WebSocket, `onlineUserIds`

### UI Patterns

Sidebar collapsible 260px → 60px (localStorage) · Dark/Light auto device pref, flash-free inline script · Tag colors deterministik `tagColor(tag)` (`envmanager.index.tsx`), `variant="light"`.

---

## CLI (Go)

Module `github.com/bipprojectbali/envman/cli`. Entry `cli-go/cmd/envman/main.go` (cobra). Packages: `cli-go/internal/{auth,api,run,storage,cache,update,envparser,docs}`. Build: `bun run build:cli` → `dist/cli/envman-{platform}` + `.gz`. Test: `cd cli-go && go test ./...`. **`src/cli*` sudah dihapus — semua perubahan di `cli-go/`.**

### Auth Resolution (high → low)

1. `ENVMAN_SERVER` + `ENVMAN_TOKEN` dari file `-e`
2. `ENVMAN_SERVER` + `ENVMAN_TOKEN` sebagai system env
3. `~/.config/envman/config.json` (dari `envman login`)

`ENVMAN_SERVER`/`ENVMAN_TOKEN` selalu di-strip dari child process env.

### Commands

```bash
envman login <server-url> --token <token>   # logout · whoami · docs · update
envman run [-e <source>]... <project>:<alias>
envman [options] -- <command>

envman storage ls <project>[:prefix]
envman storage upload <project> <file|dir> [--path p] [-n|--no-clobber]   # default overwrite
envman storage download <project>:<path> [-o file]                         # default stdout
envman storage exec [--offline|--no-cache] <project>:<path> [-- args...]   # jalankan binary (cached)
envman storage rm <project>:<folder>/                                      # OWNER only

envman portainer status <project>:<env>                                    # (alias: pt) ringkasan stack + tabel container
envman portainer ps <project>:<env>                                        # daftar container ringkas
envman portainer inspect <project>:<env> <container>                       # detail 1 container (health/uptime/restart/ports/mounts/CPU/mem)
envman portainer logs <project>:<env> <container> [-f] [--tail N]          # snapshot; -f = live (SSE) sampai Ctrl+C
envman portainer restart-soft <project>:<env>                              # stop→start tanpa pull (stack:power)
envman portainer restart-recreate|restart-repull <project>:<env>           # recreate / pull+recreate (stack:deploy)
envman portainer sync-repull|prune <project>:<env>                         # push vars+repull / prune image
```

`portainer` (alias `pt`) = thin client atas endpoint env-scoped Portainer; server simpan connection/stack/endpoint per-env, CLI cukup `project:env`. `logs -f` konsumsi SSE (`data:` → stdout, Ctrl+C via `signal.NotifyContext` → context cancel → server auto-abort upstream). Impl: `cli-go/internal/portainer/` (`portainer.go`, `logs.go`) + `cmd/envman/portainer_cmd.go`.

`storage exec` untuk binary (stdin/stdout/stderr inherit, args setelah `--`, exit code propagasi). **Cached** `~/.cache/envman/exec` (0700): reuse selama `size`+`updatedAt` cocok. Cache key = `sha256(server \x00 slug \x00 path)`. Prune LRU >500 MB. `--offline` (cache tanpa server), `--no-cache` (paksa download). Impl: `cli-go/internal/storage/exec.go` + `exec_cache.go`. Server `GET .../storage/download` kirim `{url, size, updatedAt}` validator.

**Catatan:** `envman mcp` sudah dihapus (MCP deprecated).

### CLI Docs (`envman docs`) — single source + embed fallback

Sumber tunggal `src/lib/cli-docs/*.ts` → `buildCliDocsMd(origin)` (`src/lib/cli-docs-builder.ts`). Server serve `GET /api/cli-docs.md` (ETag). `envman docs` fetch server dulu (versi terbaru + origin asli); offline → fallback docs embed `cli-go/internal/docs/DOCS.md` (`//go:embed`, `{{SERVER}}` → URL config), notice ke **stderr** (stdout bersih untuk pipe).

**DOCS.md di-generate, JANGAN diedit tangan.** Sumber `src/lib/cli-docs/*.ts`. Regenerate: `bun run scripts/gen-cli-docs.ts` (auto di `build:cli`). Drift-guard: `tests/unit/cli-docs-embed.test.ts`.

### Download

`GET /download/cli/:platform` — `Accept-Encoding: gzip` → `.gz` (~60% lebih kecil).

### File Execution

Script `ProjectFile` execute langsung tanpa write disk — content pipe ke stdin.

**Canonical syntax (WAJIB):** `slug:prefix/file.ext`
```bash
envman -- bash myapp:scripts/deploy.sh
envman -- bun myapp:utils/seed.ts
envman -e myapp:prod -- bash myapp:scripts/deploy.sh
```

**Disambiguasi:** setelah colon ada `/` ATAU extension → file reference; sisanya → env name. Interpreter stdin (zero disk): `bash sh zsh bun node python3 python deno`; lainnya → temp file 0600. Bun scripts import npm tanpa `node_modules` (`--install=fallback`); pin inline `import { z } from "zod@^3.22"`. **❌ Jangan tulis `files:X`** (legacy, support tapi jangan pakai di code baru).

### Alias Expansion

`envman run myapp:deploy` → fetch args `GET .../aliases/resolve/myapp:deploy`, re-parse. Extra `-e` merged sebelum stored sources (stored wins).

### Options

```
-e <project>:<env>   Fetch vars dari server
-e <file>            Load vars dari file lokal
--server-wins        System env override merged vars (default: merged wins)
```

### Response Caching

`FetchJSON(cfg, path, useCache)` (`cli-go/internal/api/api.go`) conditional cache **opt-in** (`useCache=true`): baca cache `(server, path)` → `If-None-Match` → `304` sajikan disk / `200+ETag` tulis cache. Disk: `~/.config/envman/cache/`, `sha256(server+path).base64url.json`, atomik, **mode 0600**. `pruneIfNeeded()` ≤200 entri. Aktif HANYA di `files/resolve` + `aliases/resolve` (**whoami/vars/lain non-cache**). Fallback: 304 tapi cache hilang → re-fetch.

---

## Infrastructure

### Redis

Singleton `src/lib/redis.ts` → `REDIS_URL`. App logs: Redis List `app:logs` (max 500 via LTRIM). Module: `src/lib/applog.ts`.

### Logging

- **App Logs** — Redis ring buffer 500. Logs requests/errors/auth via `onAfterResponse`.
- **Audit Logs** (DB `AuditLog`) — persistent. `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `LOGIN_BLOCKED`, `ROLE_CHANGED`, `BLOCKED`, `UNBLOCKED`. Auto-cleanup > `AUDIT_LOG_RETENTION_DAYS` (90).

### Local MCP Server (dev)

`.mcp.json` register `app-mcp` (`scripts/mcp/server.ts`) + `playwright`. `MCP_SECRET` readonly, `MCP_SECRET_ADMIN` write. Env import tools (`scripts/mcp/tools/env-imports.ts`): RO `envimport_list/get`, admin `envimport_create/delete`. Stg RO (`scripts/mcp/debug-stg.ts`): `stg_envimport_list/get`.

### Dev Tools

Click-to-source `Ctrl+Shift+Cmd+C`, `REACT_EDITOR`. HMR: Vite 8 + `@vitejs/plugin-react` v6.

---

## File Health (MUTLAK)

| Tipe | Maks Baris / Char |
|------|---|
| Route handler | 150 / 6k |
| Service/use-case | 300 / 12k |
| Repository/query | 250 / 10k |
| Schema/validation | 200 / 8k |
| Types/interfaces | 300 / 10k |
| Utility/helper | 200 / 8k |
| Config | 100 / 4k |
| Test | 400 / 16k |

**Hard limit global: 500 baris / 20k char** (kecuali generated).

**Wajib:** tolak tambah kode ke file dekat/lewat batas (kecuali <10 baris) · proaktif sarankan refactor · tiap helper file spesifik sendiri (no "helper dump") · file baru jika tak alami masuk · periksa ukuran sebelum edit (>80% → sarankan pecah). **Larangan:** god file, mix bisnis+transport, mix type+impl panjang. **Pengecualian:** `*.generated.ts`, `*.migration.ts`, `*.seed.ts`, `__fixtures__/`, `__mocks__/`.

---

## Scaling & Performance

### Phase 1 — Fondasi

Pecah `app.ts` >300 baris → `src/routes/` · centralize `requireAuth()`/`unauthorized()`/`forbidden()` (`src/lib/auth-middleware.ts`) · `prisma.$transaction([...])` multi-step · `parsePagination()` semua `findMany` (no `findMany` tanpa `take`) · limit: list 50, audit 100, search 20.

### Phase 2 — Reliability

Tiap endpoint ≥3 test (happy + unauthorized + invalid/not found) · Redis cache `withCache(key, ttl, fetcher)`/`invalidateCache(...)` TTL project list 60s, access/role 120s, token 30s (**jangan cache** vars + session) · soft delete (`deletedAt`) untuk Project/User · `/api/v1/` untuk breaking (additive tak perlu bump).

### Phase 3 — Performance (hanya jika ada bottleneck)

Cache-Control: hashed → `max-age=31536000, immutable`, `index.html` → `must-revalidate` · TanStack staleTime stable 5min/realtime 30s/static Infinity · optimistic update + rollback `onError` · cursor pagination list panjang.

### Frontend Bundle

`vite.config.ts` manualChunks: react / @mantine / @tanstack / react-icons / vendor. Lazy routes (`createLazyFileRoute`) non-kritikal. `defaultPreload: 'intent'`.

### Docker Multi-Stage

deps → builder (Prisma generate + Vite build + binary compile) → runner (binary only). Server ~300-370MB.

### Session & 401

`refetchInterval: 60_000` `useSession`, redirect saat `user: null` · `UnauthorizedError` di `QueryCache.onError` → session null.

### Anti-patterns

`findMany` tanpa `take` → `parsePagination()` · auth copy-paste → `requireAuth()` · multi-step tanpa transaction → `$transaction` · hard delete penting → soft delete · catch tanpa feedback → `notifyErr(e)` · optimistic tanpa rollback → `onError` + context.

---

## AI Contract (Wajib)

1. **Minimal diff, maximal pemahaman.** Baca sebelum ubah. Jangan refactor yang tak diminta.
2. **Fix akar, bukan gejala.** Penyebab di layer B → perbaiki B.
3. **Satu masalah = satu perubahan logis.**
4. **Tidak ada asumsi diam-diam.** Tanya/baca — jangan tebak.
5. **Setiap perubahan reversible.**

**Cara baca kode:** simbol dulu (signature, referensi) · range baris relevan · file utuh **hanya jika** <300 baris atau perlu. ❌ baca file utuh refleks, baca ulang yang sudah di context, telan >500 baris tanpa alasan.

**Saat fix bug:** reproduksi di kepala, temukan akar. Perbaiki sekecil mungkin. Jangan try/catch untuk sembunyikan error, jangan fallback spekulatif, jangan rename/reorder di sekitar fix. Setelah: typecheck + test relevan.

**Dilarang:** silent catch · comment-out sebagai backup · copy-paste antar file · duplikasi util/hook · destructive git (`reset --hard`, `push --force`, `clean -fdx`) tanpa instruksi · skip hook (`--no-verify`) · schema tanpa migration · dependency tanpa izin · hardcode credential/secret/URL prod.

**Kontrak Public API — freeze:** nama endpoint/tool, nama+tipe param, required fields, enum values, format error, bentuk output. **Boleh additive:** endpoint/param optional/output field baru, refactor internal. ❌ jangan rename/hapus enum, naikkan optional→required, ubah format error tanpa bump versi.

**Eskalasi (stop & tanya):** fix butuh >5 file · ketemu bug lain di tengah · menyentuh data produksi/session aktif · instruksi bertentangan dengan docs.

> Lebih baik tidak melakukan apa-apa daripada memperburuk kode. 2x fix masih muncul bug baru → **STOP**, lapor.

---

## Aturan Fitur Baru (MUTLAK)

Setiap fitur baru WAJIB disertai **test** (min integration: happy + unauthorized + invalid/not found) di `tests/integration/` atau `tests/unit/`. MCP tool inspeksi opsional (stg tetap **readonly**). **❌ Commit fitur tanpa test.**

---

## Aturan Update Dokumentasi (MUTLAK)

Setiap perubahan **business logic** WAJIB update `CLAUDE.md` dalam commit yang sama. Business logic = auth/otorisasi, status machine, validasi domain, kontrak API publik, behavior CLI, enkripsi, routing, skema DB. BUKAN (boleh skip) = refactor internal, optimasi, logging, styling, dependency non-breaking. **❌ Merge yang ubah business logic tanpa update doc.**

---

## Testing (MUTLAK — Test DB Safety)

`tests/helpers.ts:cleanupTestData()` `deleteMany()` di **seluruh tabel** → WAJIB DB berakhiran `_test`. Guard `assertTestDb()` refuse-to-run jika DB non-test — **jangan disable**.

```bash
createdb envman_test
DATABASE_URL='postgresql://USER:PASS@localhost:5432/envman_test' bunx prisma db push
DATABASE_URL='postgresql://USER:PASS@localhost:5432/envman_test' bun run test        # test:unit · test:integration
```

**AI notes:** jangan `bun test` tanpa override DATABASE_URL ke `_test` · user tanpa DB test → tawarkan setup, JANGAN reuse dev · `bun run typecheck` aman kapan saja.

Helpers: `createTestApp()`, `seedTestUser()`, `createTestSession()`, `cleanupTestData()`, `assertTestDb()`.

```typescript
const app = createTestApp()
const res = await app.handle(new Request('http://localhost/api/...', {
  method: 'POST',
  headers: { cookie: `session=${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ... }),
}))
expect(res.status).toBe(200)
```
