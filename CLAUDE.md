# envman — CLAUDE.md

> **⚠️ CLI ada di Go, bukan TypeScript.** Sumber: `cli-go/` (entry `cli-go/cmd/envman/main.go`). CLI TS lama (`src/cli.ts`, `src/cli/`) **SUDAH DIHAPUS** — jangan rujuk/edit `src/cli*`. `src/` = server + frontend saja. Build `go build`, test `go test ./...`.

## Runtime

Bun di seluruh stack (`bun` / `bun test` / `bun install` / `bunx`). Bun auto-load `.env` — jangan pakai dotenv. Cek Bun native API sebelum install npm: `Bun.password.hash/verify`, `Bun.RedisClient`, `Bun.file()`, `crypto.randomUUID()`, `Bun.S3Client`.

## Server

- `src/app.ts` — semua API routes (`createApp()`)
- `src/index.tsx` — server entry + Vite middleware (dev)
- `src/serve.ts` — dev entry: `bun --watch src/serve.ts`
- `src/server.prod.ts` — prod entry (tanpa Vite/Babel). **Jangan compile `src/index.tsx`** (pull `@babel/core`).

**Binary compile:** `bun build src/server.prod.ts --compile --target=bun-linux-x64 --outfile server`

**Migration:** `src/lib/migrate.ts` — zero npm dep, compatible `_prisma_migrations`. Jalan otomatis di startup (`MIGRATE_ON_STARTUP=true` default) sebelum `app.listen()`. `scripts/migrate.ts` = CLI wrapper. ENV: `MIGRATE_ON_STARTUP` (true), `MIGRATE_DATABASE_URL` (`DIRECT_URL ?? DATABASE_URL`), `MIGRATIONS_DIR` (`./prisma/migrations`), `MIGRATE_DB_RETRIES` (5, 2s delay).

## Database

PostgreSQL via Prisma v6. Client singleton `src/lib/db.ts` (`{ prisma }`). Schema `prisma/schema.prisma`. Client → `./generated/prisma`.

### Schema Models

- `User`, `Session`, `AuditLog` — field standar (lihat schema).
- `Project` (id, slug, name, description, tags[], icon?, color?, cardColor?, storageQuotaMb?, storageMaxFileMb?, createdById?, timestamps) — `icon`/`color`/`cardColor` divalidasi vs registry `src/lib/project-avatar.ts`, null=fallback. `storageQuotaMb`/`storageMaxFileMb` = override storage per-project (SUPER_ADMIN), null=global AppSetting. `createdById` (FK User, `ON DELETE SET NULL`).
- `Environment` (id, name, tags[], projectId, createdAt) — unique(projectId, name)
- `EnvVar` (id, key, value, isSecret, isDisabled, environmentId, timestamps) — unique(environmentId, key)
- `ProjectMember` (userId, projectId, role) — unique(userId, projectId)
- `EnvironmentMember` (userId, environmentId, role?) — unique(userId, environmentId). `role=null` = DENY · role set = override · no record = inherit project role.
- `ProjectSectionMember` (userId, projectId, section, role?, scopeTags[]) — unique(userId, projectId, section). Semantik identik `EnvironmentMember` untuk section non-env. `scopeTags` kosong=full access, isi=limit-by-tag (OR). Lihat [Permission per-Section](#permission-per-section-notes--aliases--files--storage) + [Tag Scope](#tag-scope-per-section-limit-by-tag).
- `ApiToken` (id, userId, name, token, scopes[], tags[], canWrite, isDisabled, lastUsedAt?, expiresAt?, useCount, lastIp?, disabledBy?, disabledAt?, disabledReason?)
- `ProjectAlias` (projectId, name, args, description?, tags[], createdBy) — unique(projectId, name)
- `ProjectFile` (projectId, authorId, title, description, prefix?, files Json, tags[]) — unique(projectId, prefix)
- `PortainerConnection` (id, name, portainerUrl, apiToken, createdById) — global
- `PortainerConfig` (projectId, envName, connectionId?, portainerUrl?, apiToken?, stackId, stackName, endpointId, lastSyncAt?, lastSyncOk?)
- `AppSetting` (key PK, value, updatedAt, updatedById?) — konfigurasi global runtime (Dev > Settings)
- `Gist` (id, userId, title, description, files Json `[{filename,content,language}]`, isPublic, tags[]) — unique(userId, title). `isPublic=false` default. Judul unik per user = natural key untuk CLI `envman gists`. Edit/delete: owner atau SUPER_ADMIN.
- `Clipboard` (userId PK, content, createdAt, expiresAt) — slot-tunggal per-user. `content` dienkripsi (`enc:iv:cipher:tag`). TTL default 24h, lazy-expire + sweep 1h. FK `ON DELETE CASCADE`. Lihat [Clipboard](#clipboard).
- `EnvImport` (id, targetEnvId, sourceEnvId, keys[], order, createdById) — unique(targetEnvId, sourceEnvId). Live-link referensi, boleh lintas project. FK `ON DELETE CASCADE`. Lihat [Env Import](#env-import).
- `ProjectStorageObject` (projectId, path, minioKey, size, mimeType, isPublic, tags[], description?, uploadedById) — unique(projectId, path). `path`=path user, `minioKey`=`{projectId}/{path}`. `isPublic=true` → download tanpa auth. Lihat [Project Storage](#project-storage).

### Enums

- `Role` = `USER | ADMIN | SUPER_ADMIN`
- `ProjectMemberRole` = `OWNER | EDITOR | VIEWER`
- `ProjectSection` = `NOTES | ALIASES | FILES | STORAGE`

### Commands

```bash
bun run db:migrate    # bunx prisma migrate dev
bun run db:seed       # bun run prisma/seed-dev.ts (dev only)
bun run db:generate   # bunx prisma generate
bun run db:studio · db:push
```

### Aturan Migrasi (MUTLAK)

Setiap perubahan `schema.prisma` WAJIB:
1. Buat migration SQL manual `prisma/migrations/YYYYMMDDHHMMSS_deskripsi/migration.sql`: tabel **lowercase** (`"environment"`), selalu `IF NOT EXISTS`/`IF EXISTS`, NOT NULL di tabel berisi data → `DEFAULT`/backfill, comment *kenapa*.
2. `bun run db:migrate` di local (include generate) sebelum commit.
3. Verifikasi: `bun run typecheck` bersih, server dev start, migration ter-commit.

**❌ Larangan:** schema change tanpa migration · commit migration tanpa jalankan lokal · `db:push` pengganti migration · nama tabel PascalCase. **Kenapa:** prod migrasi otomatis di startup — salah = crash saat deploy.

### Secret Encryption

`isSecret=true` → AES-256-GCM. `MASTER_KEY` = 64-char hex. Format `enc:<iv>:<cipher>:<tag>`. Impl `src/lib/crypto.ts`. VIEWER lihat `***`; EDITOR/OWNER reveal.

### Seed Users (dev only)

`superadmin@example.com`/`superadmin123` · `admin@example.com`/`admin123` · `user@example.com`/`user123`. `prisma/seed-dev.ts` gitignored, guard `NODE_ENV !== 'development'` → exit 1.

## Auth

Session-based (HttpOnly cookie + DB). `POST /api/auth/login` → bcrypt verify → Session. Google OAuth `/api/auth/google`. Blocked → 403, sessions dihapus. Dev `GET /api/dev-auth/login-as/:email`.

## Routing Rules (MUTLAK)

Static route wajib untuk navigasi yang merepresentasikan lokasi dalam hierarki data. Search params `?key=value` **hanya** untuk view state satu halaman (tab, filter, sort). **❌** `useState` untuk navigasi antar halaman · search params pengganti path params · "temporary routes".

```
/envmanager                → project list
/envmanager/tokens · /connections
/envmanager/:slug          → project detail (?tab=environments|notes|aliases)
/envmanager/:slug/:env     → vars (?integrations=true, ?compare=true)
```

## Role-Based Routing

| Role | Default | Access |
|------|---------|--------|
| SUPER_ADMIN | `/dev` | `/dev`, `/dashboard`, `/envmanager`, `/profile` |
| ADMIN | `/envmanager` | `/envmanager`, `/profile` (hak di-grant via capability/access matrix) |
| USER | `/profile` | `/profile` |

`getDefaultRoute(role)` di `src/frontend/hooks/useAuth.ts`. Blocked → `/blocked`.

## Permission Hierarchy (Per-Project + Per-Env)

Dua lapis. Default: env/notes/aliases/files **inherit** dari `ProjectMember.role`. OWNER bisa override role per-env atau set DENY explicit per-env per-user.

### Secure-by-Default Onboarding

Member ditambah dengan EDITOR/VIEWER (POST `/members`) → server auto-insert `EnvironmentMember role=null` (DENY) untuk **semua env existing**. Aturan:
- OWNER baru → tidak default-deny (akses semua env).
- Update role existing (re-POST userId sama) → tidak touch override.
- Env baru → semua project member non-OWNER auto-deny.
- Response `POST /members` carry `defaultDenied: boolean`.

### Resolver — `getEnvironmentAccess(userId, role, slug, envName)` (`src/lib/access.ts`)

1. SUPER_ADMIN → `OWNER`.
2. `EnvironmentMember`: `role=null`→DENIED · role set→override · no record→step 3.
3. Inherit `ProjectMember.role`. No record → `null`.

### Defense-in-Depth

Files & aliases accessible di project level, tapi yang reference env via `-e project:env` di-block di env layer:
- **Vars** — semua handler panggil `getEnvironmentAccess()`. DENIED → 403.
- **Alias resolve** — extract `-e project:env` via `extractEnvRefs()` (`src/lib/alias-parser.ts`), cek tiap env → 403 `{error, deniedEnvs}`. List compute `requiresEnvs`+`deniedEnvs` per-alias per-user (di luar Redis cache).
- **Project detail** — `GET /projects/:slug` filter env DENIED untuk non-OWNER; tiap env carry `accessRole`.

### CLI Behavior

`FetchJSON()` (`cli-go/internal/api/api.go`) detect 403 + `deniedEnvs` → cetak `[envman] Akses ditolak untuk env: ...` → exit 1.

### UI

- Env card badge `DENIED` (red) / override `<role>` (grape).
- MembersPanel: chevron expand → `MemberEnvOverrides.tsx` (select `inherit|OWNER|EDITOR|VIEWER|denied`, OWNER-only).
- AliasesPanel: `deniedEnvs.length>0` → Badge merah "needs <env>", sembunyikan CopyButton.
- Users Management (`AccessMatrixTab`): **read-only** ringkasan akses per-user (badge role+override per project, stats global, filter `with-access`). Tiap baris deep-link ke `/envmanager/:slug?tab=members` — **semua penyuntingan akses dilakukan di tab Members project** (single source of truth), bukan dari sisi user.

### Admin Endpoint Parity (SUPER_ADMIN)

`PUT /api/envman/admin/users/:userId/projects/:slug/envs/:envName` = OWNER endpoint: validasi target project member, last-owner-of-env protection, audit `ENV_MEMBER_SET`/`_CLEARED` (suffix `(admin)`), invalidate `projectAccess`/`projectDetail`/`invalidateProjectCaches(slug, [userId])`.

`PUT .../projects/:slug/sections/:section` = OWNER section-member endpoint: validasi section+target project member, audit `SECTION_MEMBER_SET`/`_CLEARED` (suffix `(admin)`), invalidate `projectDetail`/`invalidateProjectCaches`.

### Audit & Cache

- `ENV_MEMBER_SET` — `<slug>/<envName> user=<userId> role=<role>` (+`(admin)`)
- `ENV_MEMBER_CLEARED` — `<slug>/<envName> user=<userId>` (+`(admin)`)
- PUT/DELETE env-member → invalidate `projectAccess(userId, slug)` + `projectDetail(slug)` + `invalidateProjectCaches(slug, [userId])`.

## Permission per-Section (Notes / Aliases / Files / Storage)

Override akses per-member untuk section non-env, **paralel** dengan env members. Model `ProjectSectionMember`. Resolver `getSectionAccess(userId, role, slug, section)` (`src/lib/access.ts`). CRUD `src/routes/envman/section-members.ts`. Matrix `src/routes/envman/section-matrix.ts`. Lihat juga [Tag Scope per-Section](#tag-scope-per-section-limit-by-tag) untuk penyempitan akses berbasis tag.

### Semantik

- Section = enum `ProjectSection`, menempel ke `projectId`+`section`.
- Resolusi (identik env): SUPER_ADMIN→OWNER · `role=null`→DENIED · role set→override · no record→inherit `ProjectMember.role` · no membership→null.
- Enforcement: keempat section gate handler via `getSectionAccess()`. 24 call-site: Notes(4), Aliases(5, hanya section-access — env-ref tetap `getEnvironmentAccess`), Files(4)+resolve(1), Storage(10). Public storage download tak terpengaruh.
- Role-gate per operasi **tidak berubah** (mis. Storage: VIEWER list/download, EDITOR upload/meta/rename/move, OWNER delete/folder/setPublic).

### Secure-by-Default

- **Backfill** (`20260707102900_add_project_section_member`): semua `ProjectMember` non-OWNER existing di-seed `role=null` untuk keempat section. Member existing kehilangan akses section sampai OWNER grant.
- Member baru non-OWNER → auto-seed DENY keempat section (`projects-members.ts`); tercakup di `defaultDenied`.
- OWNER → tidak di-seed. **Tanpa last-owner-protection**.

### Permission & Scope

- Kelola override: OWNER (atau SUPER_ADMIN admin parity).
- `GET /projects/:slug` field additive `sectionAccess: {NOTES,ALIASES,FILES,STORAGE}` (`ProjectRole|null`) — FE sembunyikan tab denied.
- `GET /projects/:slug` field additive `storageStats: {fileCount, usedBytes}` (aggregate) untuk badge Storage — **hanya bila `sectionAccess.STORAGE !== null`**. FE badge `<count> · <size>`; mutasi storage invalidate `['envman','project',slug]`.

### UI

Members = **satu matrix gabungan** (`AccessMatrix.tsx`), diakses via **tombol "Members" di header project** (bukan tab konten; `?tab=members` tetap valid untuk deep-link): baris per anggota, kolom `Environments` + 4 section (Notes/Aliases/Files/Storage), fetch `access-matrix` + `section-matrix` lalu merge by userId. Kolom Environments = **satu kolom untuk semua env** (`EnvAccessCell.tsx`, popover berisi daftar env + cari saat >6) — hindari scroll horizontal. Tiap sel role = `AccessRoleCell.tsx` (pill berlabel + menu, bukan idiom huruf). Tag-scope Storage via `TagScopeEditor.tsx`. Section tab yang `sectionAccess === null` tetap disembunyikan dari panel-nya sendiri.

### Audit & Cache

- `SECTION_MEMBER_SET` — `<slug>/<section> user=<userId> role=<role>` (+` scope=[a,b]` bila di-set) (+`(admin)`)
- `SECTION_MEMBER_CLEARED` — `<slug>/<section> user=<userId>` (+`(admin)`)
- PUT/DELETE → invalidate `projectDetail(slug)` + `invalidateProjectCaches(slug, [userId])`. Matrix cache `projectSectionMatrix(slug)` 60s.

## Tag Scope per-Section (Limit by Tag)

Lapisan ke-4 (ABAC) di atas section access: **mempersempit** akses member di dalam sebuah section ke item bertag tertentu saja. Kolom `ProjectSectionMember.scopeTags String[]` (migration `20260721040000_add_section_scope_tags`, additive default `[]`, tanpa backfill).

### Semantik (MUTLAK)

- **Kosong `[]` = full access** (lihat/kelola semua item, termasuk yang tak bertag) = perilaku lama, backward-compatible.
- **Non-kosong = limit-by-tag**: hanya item yang punya **≥1** tag dari `scopeTags` (**match OR**). Item **tanpa tag** hanya untuk full-access member (**secure-by-default**, otomatis via `hasSome`).
- Berlaku keempat section (NOTES→`ProjectNote`, ALIASES→`ProjectAlias`, FILES→`ProjectFile`, STORAGE→`ProjectStorageObject`; semua punya `tags[]`).
- **Enforcement baca + tulis**: item di luar scope **tak terlihat** (list ter-filter) **dan tak bisa disentuh**.
  - Read-by-id/download/edit/delete item luar scope → **404** (invisibility, jangan bocorkan keberadaan). Bedakan dari section-denied yang tetap **403**.
  - **Section-role OWNER pun di-guard**: OWNER via matrix bisa punya scopeTags → storage delete/folder-delete tetap cek scope (project-OWNER inherit selalu scope kosong = full). Jangan asumsikan OWNER=full-access saat ada `scopeTags`.
  - **Create rule**: user limited WAJIB memberi item baru ≥1 tag scope-nya → else **400** (cegah bikin item invisible-to-self). Edit yang retag keluar scope → **400**.
- SUPER_ADMIN & OWNER (via inherit) selalu `scopeTags=[]` (tak pernah di-limit).

### Resolver & Helper (`src/lib/access.ts`)

- Primitif `getSectionAccessWithScope(userId, role, slug, section) → { role, scopeTags }` (1 DB read). `getSectionAccess()` = wrapper return `.role` (**signature tak berubah** — 34 call-site aman). `getSectionTagScope()` return `.scopeTags`.
- Helper murni: `canAccessItem(itemTags, scopeTags)` (OR; untagged→false saat limited), `filterByTagScope(items, scope)`, `tagScopeWhere(scope)` (`{}` | `{ tags: { hasSome } }`).
- **Cache caveat**: list Aliases/Files pakai `withCache` key **global** → filter `filterByTagScope()` **setelah** cache boundary (per-request), JANGAN cache hasil ter-scope. Notes/Storage tak di-cache → filter di query. Storage 2-query: filter di **Query 1** agar folder/`totalFiles`/pagination benar.

### API & UI

- `PUT .../sections/:section/members/:userId` body additive `{ role, scopeTags? }` (validasi array string, trim/dedupe; `denied`/`inherit`→scope di-clear). Admin parity `PUT admin/.../sections/:section` sama. Response bawa `scopeTags`.
- `GET section-matrix` + `GET .../sections/:section/members` field additive `scopeTags` per cell.
- `GET section-matrix` juga bawa `availableTags: Record<section, string[]>` (union tag item per section) untuk autocomplete editor.
- UI: `AccessMatrix.tsx` per-cell `TagScopeEditor.tsx` (Popover+TagsInput dengan saran `availableTags`; badge `Full`/`N tag`) saat role granted. Storage: badge tag di row/card (`tagColor`), edit tag via `StorageRenameModal` (PATCH `/storage/meta`).
- CLI: `envman storage ls --tag a,b` (filter client-side; server sudah scope; tags dicetak di baris file). `envman storage upload --tag a,b` memberi tag saat upload (folder → semua file; via `confirm-upload`/`multipart/complete`).

### Test

Unit `tests/unit/tag-scope.test.ts` (truth-table + invariant untagged). Integration `tests/integration/section-tag-scope.test.ts` (list-filter, guard 404, create-rule 400, retag 400 — butuh Redis untuk `app.handle`).

## Env Import (Reference / Live-Link)

Env target meminjam vars dari env lain (boleh lintas project) secara **referensi live**, bukan salinan. Model `EnvImport`. Resolver `src/lib/env-import.ts`. CRUD `src/routes/envman/env-imports.ts`.

### Semantik

- **Layered merge**: `imports (order asc, besar menang) → local`. Var lokal SELALU menang per-key; imported yang key-nya ada lokal di-suppress.
- **Per-key whitelist** (`EnvImport.keys[]`): kosong `[]` = **semua** var source (default, backward-compatible); ada isi = **hanya** key itu. Whitelist ketat — key baru di source tidak ikut otomatis. Filter di `resolveImportedVars()` (setelah cek akses).
- **Akses dicek saat resolve**: tiap source env `getEnvironmentAccess(caller,...)`. `null` → skip + dicatat `deniedImports[]` (tidak silent).
- **Secret**: reveal/mask pakai akses caller di SOURCE env. MASTER_KEY global → decrypt lintas project valid.
- **Cycle detection saat save** (`wouldCreateCycle`) → tolak A→B→A (400).
- **EnvVar `isDisabled` di source di-exclude**.

### Permission

Buat/hapus link: OWNER env target; caller juga wajib ≥VIEWER ke source. Self-import→400. Duplikat→409. `order`=max+1.

### Scope Resolusi

- **`GET vars/export`** (CLI/daemon): imported sebagai base, local overwrite. Tambah `deniedImports` bila non-kosong.
- **`GET vars` list** (UI): field additive `imported[]` (`{key,value,isSecret,sourceProject,sourceEnv}`, exclude key lokal), `importedKeys[]`, `deniedImports[]`. Bentuk `vars`/`total` tak berubah.

### UI

Baris imported read-only (badge grape `from <proj>:<env>`, secret reveal sesuai akses). Var lokal ∈ `importedKeys` → badge `overrides`. `deniedImports` → Alert kuning. Tombol kelola (`TbLink`, grape) OWNER-only → `ImportManagerModal.tsx` (`?importMgr=true`). `ImportKeyPicker.tsx` pilih subset key; badge `N key`/`semua key` + edit (PATCH).

### Audit & Cache

- `ENV_IMPORT_ADDED`/`_REMOVED`/`_UPDATED` detail `<slug>/<env> <- <srcSlug>/<srcEnv>` (+ ` keys=[...]`/` keys=[all]` bila whitelist di-set).
- Invalidate `invalidateProjectCaches(slug)` + `projectDetail(slug)`. **Hasil resolve vars TIDAK di-cache**.

**Deferred (TODO):** transitive import, per-import override value.

## Project Storage

MinIO-backed per project. Key prefix `{projectId}/{path}`. DB (`ProjectStorageObject`) = source of truth metadata; MinIO = content.

### Env Vars (wajib aktifkan fitur)

```
MINIO_ENDPOINT · MINIO_ACCESS_KEY · MINIO_SECRET_KEY · MINIO_BUCKET=envman · MINIO_PRESIGN_BASE_URL (opsional)
```

`MINIO_PRESIGN_BASE_URL` khusus presigned PUT URL (CLI upload) — set ke URL non-proxy jika MinIO di belakang Cloudflare (limit 100 MB). Tanpa 4 var pertama, endpoint yang butuh MinIO → 503 (list & metadata PATCH tetap jalan).

### Permission

| Operasi | Role |
|---|---|
| List + folder tree | VIEWER+ |
| Upload / replace / update metadata | EDITOR+ |
| Set `isPublic` / Delete | OWNER only |
| Public download (no auth) | `isPublic=true` |

### Storage Limits

- Global `storage_max_file_mb` (default 50), `storage_default_quota_mb` (default 500) — via `/dev > Storage`.
- `Project.storageMaxFileMb`/`storageQuotaMb` — override per-project (SUPER_ADMIN), null=global.
- Efektif: `project.storageMaxFileMb ?? globalSetting` (`getMaxFileSizeBytesForProject()`).
- UI: gear di panel Storage (SUPER_ADMIN) → `StorageSettingsModal`; defaults di `/dev > Storage` → `StorageAdminPanel`.

### Cleanup & Presign

- Delete file: MinIO dulu, lalu DB. Project soft-delete: `minioDeleteProject(projectId)`. Orphan (upload sukses, DB gagal): auto-delete MinIO object.
- Private download: presigned TTL 5 mnt, `Content-Disposition: attachment`. Public: TTL 1 jam. CLI stream langsung dari MinIO via 302.

### Implementasi

- `src/lib/minio.ts` — `Bun.S3Client` singleton (lazy) · `src/lib/storage-service.ts` — `sanitizePath`, `getQuotaBytes`, `minioUpload/Delete/DeleteProject/Presign`, `buildMinioKey` · `src/lib/s3-multipart.ts` — SigV4 + multipart, `MULTIPART_CHUNK_SIZE=50MB`.
- Routes: `storage-core.ts` (list/download/meta/delete) · `storage-upload.ts` (≤50MB) · `storage-multipart.ts` (>50MB) · `storage-rename.ts` · `storage-move.ts` (batch) · `public-storage.ts` (redirect).
- FE: `slug/StoragePanel.tsx`, `StorageUploadModal.tsx`, `StorageFileRow/Card.tsx`, `StorageMoveModal.tsx`. Hooks `useStorageFileActions.ts`, `useChunkedUpload.ts` (`MULTIPART_THRESHOLD=50MB`).

## API Reference

### Admin API (SUPER_ADMIN)

- `GET /api/admin/users` · `PUT .../users/:id/role` · `PUT .../users/:id/block` (delete sessions + disable tokens)
- `GET .../presence|logs/app|logs/audit` · `DELETE .../logs/app|audit`
- `GET .../tokens` · `PATCH .../tokens/:id` (`{action, reason?, expiresAt?}`) · `DELETE .../tokens/:id` (audit TOKEN_REVOKED_BY_ADMIN)
- `GET .../schema` (Prisma schema → JSON, dipakai Dev > Database)
- `PUT /api/envman/admin/users/:userId/permissions` — set capability array (`isValidCapability`→400).

### Envman API

Auth: session cookie atau `Authorization: Bearer <token>` (`requireEnvAuth()`).

**Projects:** `GET|POST /api/envman/projects` · `PATCH|GET .../projects/:slug`. POST isi `createdById`. GET list additif `createdById`+`createdBy` (`{id,name,email,image}`) untuk filter pembuat (persist `localStorage envman:projects:creatorScope`). PATCH (OWNER) terima `icon`/`color`/`cardColor` (registry `project-avatar.ts`; null=reset).

**Vars:** `GET .../environments/:env/vars` (search,limit,offset) · `GET .../vars/export` (EDITOR+) · `POST|PUT|DELETE .../vars/:key`. Field additive env import — lihat [Env Import](#env-import).

**Environments:** `POST|DELETE|PATCH .../projects/:slug/environments[/:env]`

**Members:** `PUT|DELETE .../projects/:slug/members/:userId/role|member`

**Env Members (OWNER):** `GET .../environments/:envName/members` (list + envRole `inherit`/`denied`/role + `effectiveRole`) · `PUT .../members/:userId {role}` · `DELETE .../members/:userId` (reset inherit). Last-owner-of-env protection.

**Section Members (OWNER):** `GET .../sections/:section/members` (section invalid→400; bawa `scopeTags`) · `PUT .../sections/:section/members/:userId {role, scopeTags?}` (`inherit|denied|OWNER|EDITOR|VIEWER`; `scopeTags` array string, hanya bermakna saat role granted; target wajib project member→400; tanpa last-owner-protection) · `DELETE .../sections/:section/members/:userId` · `GET .../section-matrix` cache 60s (`projectSectionMatrix`; cell bawa `scopeTags`). Audit `SECTION_MEMBER_SET`/`_CLEARED`. Lihat [Tag Scope per-Section](#tag-scope-per-section-limit-by-tag).

**Env Imports (OWNER target):** `GET .../environments/:envName/imports` (bawa `keys[]`) · `POST .../imports {sourceProject, sourceEnv, keys?}` (403/400/404/409/cycle; `keys` opsional, kosong=semua) · `PATCH .../imports/:id {keys}` (400 jika bukan array string) · `DELETE .../imports/:id`.

**Access Matrix (OWNER):** `GET .../projects/:slug/access-matrix` single fetch `{project, environments[], members[]}`. Cache 60s (`projectAccessMatrix`), auto-invalidate. Bulk = fan-out `Promise.allSettled` atas PATCH/PUT (`src/frontend/lib/bulk.ts`). FE: `AccessMatrix.tsx` (gabungan env+section, lihat [UI](#ui)).

**Portainer:** `GET|POST .../portainer/connections` · `PUT|DELETE .../connections/:id` · `POST .../connections/:id/probe` · per-env `GET|PUT|DELETE|POST .../portainer[/sync]`

**Portainer env-scoped (CLI+FE):** `GET .../portainer/status|containers` · `GET .../inspect/:containerId` (state/health/uptime/restartCount/exitCode/ports/mounts + stats CPU/mem best-effort; `portainer-inspect.ts`, `computeContainerStats()`) · `GET .../logs/:containerId` (snapshot) · `GET .../logs/:containerId/stream` (**SSE**, `event: stdout|stderr` + `data:`, heartbeat `:keepalive`, `AbortController` ke `request.signal`; de-mux di `portainer-logs-stream-demux.ts`) · `POST .../restart` (**stop→start tanpa pull**, gate `stack:power` via `editorOrCap`; 409 saat sudah stop) · `POST .../recreate|repull|sync-repull` (`stack:deploy`) · `POST .../prune/images` (`stack:prune`). File `portainer-restart.ts`, `portainer-logs-stream.ts`, register di `portainer-sync.ts`.

**Portainer Capabilities:** operasi di-gate per-capability (`src/lib/permissions.ts`), bukan role. Assign via `PUT .../admin/users/:userId/permissions`. SUPER_ADMIN bypass. Guard `src/routes/envman/portainer-auth.ts` (`requireCap`, `editorOrCap`, `envAccessOrCap`).

| Capability | Mengizinkan |
|---|---|
| `connection:view`/`:manage` | list/detail/health/probe · create/edit/delete connection |
| `stack:operate` | view stacks/logs/status/stats/compose/dangling (**bukan** exec) |
| `stack:exec` | exec container (setara shell, tanpa backfill) |
| `stack:sync` | push env vars → stack |
| `stack:power` | start/stop/restart |
| `stack:deploy` | repull image, recreate, sync-repull |
| `stack:mutate` | edit compose/stack file |
| `stack:prune` | prune images/volumes/networks/containers |
| `backup:view`/`:manage` | list/download · create/delete/schedule |

- Connection-scoped (`/portainer/connections/...`) — murni capability via `requireCap`.
- Env-scoped (`/projects/:slug/.../portainer/...`) — role ATAU capability via `editorOrCap`. Exec env-level → endpoint connection-scoped → `stack:exec`.
- `POST /portainer/probe` via slug+envName wajib akses env. Migration `20260702000000_portainer_caps_backfill` grant `stack:power`+`stack:deploy` ke pemilik `stack:mutate` (idempotent).

**Files:** `GET|POST .../projects/:slug/files` · `GET .../files/resolve?prefix=&filename=` · `PUT|DELETE .../files/:id`

**Aliases:** `GET|POST .../projects/:slug/aliases` · `PATCH|DELETE .../aliases/:name` · `GET .../aliases/resolve/:ref`

**Tokens:** `GET|POST .../tokens` · `PATCH|DELETE .../tokens/:id` · `PATCH .../toggle` · `GET .../reveal` · `POST .../rotate` · `GET /api/envman/whoami`

**Gists:** auth session cookie **atau** `Bearer <token>` (`requireEnvAuth`, untuk CLI). `GET .../gists` (sendiri + public; `?limit&cursor&search&tags&sort` — search `contains` title+description, mirror endpoint public) · `POST .../gists` (cap `gist:create`; judul duplikat per-user → 409) · `PUT|DELETE .../gists/:id` (owner/SUPER_ADMIN; 409 jika rename bentrok) · `GET .../gists/:id/raw/:filename`. Mutasi (POST/PUT/DELETE) di-gate `canWrite` → token read-only ditolak 403 `Token is read-only` (gist = shared content, beda dari clipboard). Judul **unik per user** (`@@unique([userId,title])`) → jadi natural key CLI (`envman gists push <judul>`). Sidebar gated cap `menu:gists`. **Public (no auth):** `GET /api/public/gists` (`?limit&cursor&search&tags&sort`) · `GET /api/public/gists/:id` (403 jika private) · `.../:id/raw/:filename`.

**Clipboard:** `GET /api/envman/clip` (decrypt; expired→404+auto-delete) · `PUT .../clip {content, ttlSeconds?}` (encrypt upsert; size>`clipboard_max_kb`→413; TTL clamp `clipboard_max_ttl_hours`) · `DELETE .../clip`. User-level, **tidak** di-gate `canWrite` (scratch pribadi; token RO tetap boleh set/clear). Lihat [Clipboard](#clipboard).

**Conditional caching:** read-resource endpoint kirim `ETag`+`Cache-Control` (+`Last-Modified`) & support `If-None-Match`/`If-Modified-Since` → `304`. Helper `src/lib/http-cache.ts`. Di-cover: `gists/:id/raw` (strong), `public/gists/:id` (weak), `files/resolve` (weak, log jalan sebelum 304), `aliases/resolve/:ref` (weak, **userId masuk hash**), `/api/docs.md` (strong, `max-age=300`). **Tidak di-cover:** vars, session, list, binary download.

**Storage:** `GET .../storage` (VIEWER+, `?prefix=`) · `POST .../storage/upload` (EDITOR+, ≤50MB) · `POST .../storage/presign-upload` (EDITOR+, `{path,size,mimeType,noClobber?}`; noClobber+exist→409) · `GET .../storage/download?path=` (`{url,size,updatedAt}`) · `PATCH .../storage/meta` (`isPublic` OWNER-only) · `PATCH .../storage/rename|move` (EDITOR+, move=batch) · `DELETE .../storage?path=` (OWNER). **Public:** `GET /api/public/storage/:slug/:path` (302). **Chunked (>50MB):** `POST .../storage/multipart/init|part|complete` · `DELETE .../multipart/abort`. Validasi minioKey prefix per-project.

**Settings:** `GET /api/envman/settings` (public map) · `PUT` (SUPER_ADMIN, `[{key,value}]`) — key valid: `user_token_creation`, `user_token_max_days`, `storage_max_file_mb` (50), `storage_default_quota_mb` (500), `clipboard_max_kb` (1024), `clipboard_max_ttl_hours` (168).

### Auth Endpoints

`POST /api/auth/login` · `GET /api/auth/google` → `/api/auth/callback/google` · `GET /api/auth/session` · `POST /api/auth/logout` · `GET /api/dev-auth/login-as/:email` (dev).

### WebSocket

`WS /ws/presence` — real-time presence (session cookie auth).

## Frontend

React 19 + Vite 8 (middleware mode dev). File-based routing TanStack Router.

- `src/frontend.tsx` — render App, remove splash, DevInspector (dev)
- `src/frontend/App.tsx` — MantineProvider, ModalsProvider, QueryClientProvider, RouterProvider

**Routes** (`src/frontend/routes/`): `__root` · `index` (landing) · `login` · `dev` (SUPER_ADMIN) · `dashboard` (SUPER_ADMIN) · `envmanager` (AppShell) · `envmanager.index` (project list) · `envmanager.tokens.lazy` · `envmanager.connections` · `envmanager.$slug` (`<Outlet/>`) · `envmanager.$slug.index` (environments/notes/aliases) · `envmanager.$slug.$env` (vars; Portainer+History via Drawer `?integrations=true`) · `profile` · `blocked`.

**Components:** `CodeEditor.tsx`+`MonacoCodeEditor.tsx` (lazy ~1MB, mobile→Textarea) · `ThemeToggle` · `PortainerSync` · `slug/AliasesPanel` · `slug/FilesPanel` · `env/CompareModal`.

**Hooks:** `useAuth.ts` (`useSession/useLogin/useLogout/getDefaultRoute`) · `usePresence.ts` (WebSocket, `onlineUserIds`).

**UI Patterns:** Sidebar collapsible 260px→60px (localStorage) · Dark/Light auto device pref, flash-free inline script · Tag colors deterministik `tagColor(tag)`, `variant="light"`.

## CLI (Go)

Module `github.com/bipprojectbali/envman/cli`. Entry `cli-go/cmd/envman/main.go` (cobra). Packages `cli-go/internal/{auth,api,run,storage,cache,update,envparser,docs,sysstat}`. Build `bun run build:cli` → `dist/cli/envman-{platform}`+`.gz`. Test `cd cli-go && go test ./...`. Dep eksternal: `github.com/shirou/gopsutil/v4` (BSD, tanpa cgo) untuk `envman sys`.

### Auth Resolution (high → low)

1. `ENVMAN_SERVER`+`ENVMAN_TOKEN` dari file `-e`
2. `ENVMAN_SERVER`+`ENVMAN_TOKEN` sebagai system env
3. `~/.config/envman/config.json` (dari `envman login`)

`ENVMAN_SERVER`/`ENVMAN_TOKEN` selalu di-strip dari child process env.

### Commands

```bash
envman login <url> --token <token>   # logout · whoami · docs · update
envman run [-e <source>]... <project>:<alias>
envman [options] -- <command>

envman env push <project>:<env> [file]   # .env → server (upsert per-key). --dry-run · --plain K · --secret K · --no-detect
envman env pull <project>:<env> [-o file] # server → .env (stdout/-o). --force
envman env keys <file|project:env>        # cetak KEY saja. --names = nama polos

envman projects ls [--me] [-q]            # daftar project
envman projects [envs] <slug> [-q]        # daftar env (role + #var)

envman health [dir]                       # scan file terlalu besar utk konteks AI (lokal). --copy critical|warning|all

envman sys                                # snapshot kesehatan mesin lokal (host/user/net/cpu/mem/disk). --json · --du <dir> · --public-ip

envman clip set [file] · get [-o file] · clear     # clipboard akun. --ttl 30m|2h|7d (default 24h). --force

envman gists ls [--public] [-q] [--limit N=100] [--cursor id]   # (alias: gist) list gist (sendiri+public)
envman gists find <query> [--tags a,b] [-q]        # cari judul/deskripsi
envman gists get <judul|id> [--json]               # detail + daftar file
envman gists push <judul> <file>... [--force] [--clean] [--public] [--desc ""] [--tags a,b]   # upsert per-file
envman gists pull <judul|id>[:file] [--file f] [-o dir|file] [--force]   # 1 file→stdout; multi wajib --file/-o
envman gists rm <judul|id>[:file] [--file f]       # hapus gist, atau 1 file (owner/SUPER_ADMIN)

envman storage ls <project>[:prefix]
envman storage upload <project> <file|dir> [--path p] [-f|--force]   # default: tolak jika ada; --force timpa
envman storage download <project>:<path> [-o file]
envman storage exec [--offline|--no-cache] <project>:<path> [-- args...]
envman storage rm <project>:<folder>/     # OWNER only

envman portainer status <project>:<env>            # (alias: pt) ringkasan stack + tabel container
envman portainer ps <project>:<env>
envman portainer inspect <project>:<env> <container>
envman portainer logs <project>:<env> <container> [-f] [--tail N]   # -f = live (SSE) sampai Ctrl+C
envman portainer restart-soft <project>:<env>      # stop→start tanpa pull (stack:power)
envman portainer restart-recreate|restart-repull <project>:<env>   # (stack:deploy)
envman portainer sync-repull|prune <project>:<env>
```

- `portainer` (alias `pt`) = thin client atas endpoint env-scoped; server simpan connection/stack/endpoint per-env. `logs -f` konsumsi SSE (Ctrl+C via `signal.NotifyContext` → server auto-abort upstream). Impl `cli-go/internal/portainer/` + `cmd/envman/portainer_cmd.go`.
- `storage exec` untuk binary (stdin/stdout/stderr inherit, args setelah `--`, exit code propagasi). **Cached** `~/.cache/envman/exec` (0700): reuse selama `size`+`updatedAt` cocok. Cache key `sha256(server\x00slug\x00path)`. Prune LRU >500MB. `--offline`/`--no-cache`. Impl `internal/storage/exec.go`+`exec_cache.go`.
- `env push/pull` = sinkron `.env`, **CLI-only** (reuse `PUT vars` bulk-upsert + `GET vars/export`). Impl `cli-go/internal/envvars/` + `cmd/envman/env_cmd.go`; parse via `internal/envparser`.
  - **push**: upsert per-key (key server yg tak ada di file **tak dihapus**). Env belum ada → auto-create. Baca `vars/export` dulu untuk hitung created/updated + preserve secret server.
  - **Auto-deteksi secret** (`DetectSecret`): match `SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|CREDENTIAL|DATABASE_URL|_DSN|TOKEN` atau suffix `_KEY`; **kecuali** `PUBLIC_KEY`. Prioritas (`ClassifySecrets`): `--plain` > `--secret` > **secret server (server-wins)** > auto-deteksi. `--no-detect` matikan.
  - **pull**: `GET vars/export` → `KEY=value` (quote bila spasi/`=`/`#`/newline). Secret ter-mask `***` (VIEWER) dilewati + warning stderr. `-o file` atomic (temp+rename, 0600), tolak overwrite kecuali `--force`.
  - **keys**: nama key saja tanpa value dari file ATAU `project:env` (deteksi via `looksLikeTarget`). Default `KEY=`, `--names`=nama polos. Value tak pernah keluar → aman untuk AI agent. VIEWER cukup.
- `clip` = clipboard slot-tunggal nempel akun (lintas device). Impl `cli-go/internal/clipboard/` + `cmd/envman/clip_cmd.go`; server `src/routes/envman/clipboard.ts`. `set` upsert file/stdin; `get` stdout/`-o file` (atomic+`--force`); `clear`. `--ttl` parse `30m|2h|7d`/detik. Konten dienkripsi (butuh `MASTER_KEY`). **Tidak** di-gate `canWrite`. Expiry: lazy saat GET + sweep `setInterval` 1h di `server.prod.ts`. Test unit `internal/clipboard` + integration `tests/integration/envman-clipboard.test.ts`.
- `gists` (alias `gist`) = kelola gist (snippet multi-file) dari CLI. Impl `cli-go/internal/gists/` (`gists.go` IO: List/Get/Resolve/ResolveByName/Create/Update/Delete; `detect.go` pure: `DetectLanguage`+`looksLikeUUID`+`SplitFileRef`) + `cmd/envman/gists_cmd.go` (command) + `gists_render.go` (tabel/JSON/`humanAgo`). Gist dirujuk by **judul** (unik per akun → `ResolveByName` match exact via whoami userId) atau **UUID** (`looksLikeUUID` → `Get`). `push`: **upsert per-file** (`MergeFiles` di `merge.go`, pure+tested) → baca file lokal → auto-detect language → resolve by judul; belum ada → `Create`; sudah ada → tambah file baru bebas, timpa file existing butuh `--force` (conflict → abort, file lain aman), `--clean` = ganti seluruh set file. Flag `--public`/`--desc`/`--tags` hanya dikirim bila `cmd.Flags().Changed(...)` (tak mereset metadata diam-diam). `pull`: 1 file & tanpa `-o` → stdout; multi-file wajib `--file <name>`/`-o <dir>` (tiap file `atomicWrite`, guard `--force`). **Pilih satu file**: `--file <name>` atau ref `judul:namafile` (`SplitFileRef` split colon pertama, UUID tak di-split; `--file` menang atas ref) → stdout atau `-o <path>`; file tak ada → error + daftar file tersedia. `rm`: tanpa `:file` hapus seluruh gist; dengan ref `judul:file` atau `--file` hapus satu file (via `Update`; file terakhir ditolak → arahkan hapus gist). `find` = `List` dengan `search`. Butuh `Bearer` auth (route gist di-migrasi ke `requireEnvAuth`); create tetap gated cap `gist:create`; mutasi (push/rm) tolak token read-only (`canWrite=false` → 403). Test unit `internal/gists` (DetectLanguage/looksLikeUUID/SplitFileRef/MergeFiles/FmtBytes) + `cmd/envman` (splitCSV/humanAgo) + integration `tests/integration/gists.test.ts` (bearer/duplicate-409/search).
- `projects` (alias `project`) = daftar project & env, **CLI-only** (reuse `GET /projects` + `:slug` + `whoami`). Impl `cli-go/internal/projects/` + `cmd/envman/projects_cmd.go`. `ls` (`--me` filter `createdById==whoami` via `FilterMine`; `-q` slug polos) · `envs <slug>` · `projects <slug>` = shortcut. Server sudah filter akses. Test unit `FilterMine`.
- `health` = scan project **lokal** (tanpa login) untuk file terlalu besar bagi konteks AI. Impl `cli-go/internal/health/health.go` (pure) + `cmd/envman/health_cmd.go`. Status `ok`(<80%)/`warning`(80-99%)/`critical`(≥100%) atas max(baris%,char%); default 500 baris/20k char, override `--max-lines`/`--max-chars`. Skip: hard-skip dir dependency/build (via `WalkDir`+`SkipDir`), hidden dir (kecuali `--all`), file biner, >5MB, depth >`--depth` (default 20, `0`=unlimited; skip → stderr). `--copy critical|warning|all` cetak path bersih (pipeable). `--ext ts,tsx,go` whitelist. Test unit `internal/health`.
- `sys` = snapshot kesehatan **mesin lokal** (tempat CLI jalan, tanpa login) via gopsutil v4. Impl `cli-go/internal/sysstat/` (`sysstat.go` Collect, `status.go` pure, `dirsize.go` `DirUsage`, `identity.go` user/sesi/IP) + `cmd/envman/sys_cmd.go` (command) + `sys_render.go` (presentation). Blok: host+uptime, user+sesi login aktif, net (alamat interface), CPU+load, memory+swap, disk per-mount. Status usage `ok`(<80%)/`warning`(≥80%)/`critical`(≥90%); load per-core ≥1.0 warning / ≥1.5 critical; header bawa verdict keseluruhan (`Report.Overall()` = status terparah). Collect best-effort: section gagal → skip + `Warnings[]` (stderr), tak pernah fatal. Disk skip pseudo-fs + dedup mount berbagi pool fisik (fingerprint total+used byte). Identity: user saat ini (`os/user`), sesi (`host.Users`, sesi lone-self-lokal disembunyikan), IP lokal (`net.Interfaces`, skip loopback/link-local). `--json` mesin-readable. `--du <dir>` (opt-in) tambah footprint project: total + rincian per entri top-level urut terbesar (`DirUsage`, stdlib `WalkDir` tanpa follow symlink); JSON key `dir`. `--public-ip` (opt-in) = **satu-satunya egress jaringan**: fetch IP publik via `api.ipify.org` (override env `ENVMAN_PUBLIC_IP_URL`), gagal → warning. **Lokal saja** — remote via `envman pt`. Test unit `internal/sysstat` + `cmd/envman` (statusFor/loadStatus/humanBytes/humanDuration/worst/Overall/DirUsage/addrIP/notableSessions/groupThousands).

**Catatan:** `envman mcp` sudah dihapus (MCP deprecated).

### CLI Docs (`envman docs`)

Sumber tunggal `src/lib/cli-docs/*.ts` → `buildCliDocsMd(origin)` (`src/lib/cli-docs-builder.ts`). Server serve `GET /api/cli-docs.md` (ETag). `envman docs` fetch server dulu; offline → fallback embed `cli-go/internal/docs/DOCS.md` (`//go:embed`, `{{SERVER}}`→URL config), notice ke **stderr**. **DOCS.md di-generate, JANGAN edit tangan.** Regenerate `bun run scripts/gen-cli-docs.ts` (auto di `build:cli`). Drift-guard `tests/unit/cli-docs-embed.test.ts`.

### Download

`GET /download/cli/:platform` — `Accept-Encoding: gzip` → `.gz` (~60% lebih kecil).

### File Execution

Script `ProjectFile` execute langsung tanpa write disk — content pipe ke stdin.

**Canonical syntax (WAJIB):** `slug:prefix/file.ext`
```bash
envman -- bash myapp:scripts/deploy.sh
envman -e myapp:prod -- bash myapp:scripts/deploy.sh
```

**Disambiguasi:** setelah colon ada `/` ATAU extension → file reference; sisanya → env name. Interpreter stdin (zero disk): `bash sh zsh bun node python3 python deno`; lainnya → temp file 0600. Bun scripts import npm tanpa `node_modules` (`--install=fallback`); pin inline `import { z } from "zod@^3.22"`. **❌ Jangan tulis `files:X`** (legacy).

### Alias Expansion

`envman run myapp:deploy` → fetch args `GET .../aliases/resolve/myapp:deploy`, re-parse. Extra `-e` merged sebelum stored sources (stored wins).

### Options

```
-e <project>:<env>   Fetch vars dari server
-e <file>            Load vars dari file lokal
--server-wins        System env override merged vars (default: merged wins)
```

### Response Caching

`FetchJSON(cfg, path, useCache)` conditional cache **opt-in** (`useCache=true`): baca cache `(server,path)` → `If-None-Match` → 304 sajikan disk / 200+ETag tulis cache. Disk `~/.config/envman/cache/`, `sha256(server+path).base64url.json`, atomik, mode 0600. `pruneIfNeeded()` ≤200 entri. Aktif HANYA di `files/resolve` + `aliases/resolve` (whoami/vars non-cache). Fallback: 304 tapi cache hilang → re-fetch.

## Infrastructure

- **Redis** — singleton `src/lib/redis.ts` → `REDIS_URL`. App logs Redis List `app:logs` (max 500 via LTRIM). Module `src/lib/applog.ts`.
- **Logging** — App Logs (Redis ring 500, via `onAfterResponse`). Audit Logs (DB `AuditLog`, persistent): `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `LOGIN_BLOCKED`, `ROLE_CHANGED`, `BLOCKED`, `UNBLOCKED`. Auto-cleanup > `AUDIT_LOG_RETENTION_DAYS` (90).
- **Local MCP (dev)** — `.mcp.json` register `app-mcp` (`scripts/mcp/server.ts`) + `playwright`. `MCP_SECRET` readonly, `MCP_SECRET_ADMIN` write. Env import tools `scripts/mcp/tools/env-imports.ts`. Stg RO `scripts/mcp/debug-stg.ts`.
- **Dev Tools** — Click-to-source `Ctrl+Shift+Cmd+C`, `REACT_EDITOR`. HMR Vite 8 + `@vitejs/plugin-react` v6.

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

**Wajib:** tolak tambah kode ke file dekat/lewat batas (kecuali <10 baris) · proaktif sarankan refactor · tiap helper file spesifik sendiri · file baru jika tak alami masuk · periksa ukuran sebelum edit (>80% → sarankan pecah). **Larangan:** god file, mix bisnis+transport, mix type+impl panjang. **Pengecualian:** `*.generated.ts`, `*.migration.ts`, `*.seed.ts`, `__fixtures__/`, `__mocks__/`.

## Scaling & Performance

- **Phase 1 (Fondasi):** pecah `app.ts` → `src/routes/` · centralize `requireAuth()`/`unauthorized()`/`forbidden()` (`src/lib/auth-middleware.ts`) · `prisma.$transaction([...])` multi-step · `parsePagination()` semua `findMany` (no `findMany` tanpa `take`); limit list 50, audit 100, search 20.
- **Phase 2 (Reliability):** tiap endpoint ≥3 test (happy + unauthorized + invalid/not found) · Redis `withCache(key,ttl,fetcher)`/`invalidateCache(...)` TTL project list 60s, access/role 120s, token 30s (**jangan cache** vars+session) · soft delete (`deletedAt`) Project/User · `/api/v1/` untuk breaking.
- **Phase 3 (Performance, jika bottleneck):** Cache-Control hashed→`max-age=31536000, immutable`, `index.html`→`must-revalidate` · TanStack staleTime stable 5min/realtime 30s/static Infinity · optimistic update + rollback `onError` · cursor pagination.
- **Frontend Bundle:** `vite.config.ts` manualChunks react/@mantine/@tanstack/react-icons/vendor. Lazy routes non-kritikal. `defaultPreload: 'intent'`.
- **Docker Multi-Stage:** deps → builder (Prisma generate + Vite build + binary compile) → runner (binary only). Server ~300-370MB.
- **Session & 401:** `refetchInterval: 60_000` `useSession`, redirect saat `user:null` · `UnauthorizedError` di `QueryCache.onError` → session null.
- **Anti-patterns:** `findMany` tanpa `take`→`parsePagination()` · auth copy-paste→`requireAuth()` · multi-step tanpa transaction→`$transaction` · hard delete penting→soft delete · catch tanpa feedback→`notifyErr(e)` · optimistic tanpa rollback→`onError`+context.

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

## Aturan Fitur Baru (MUTLAK)

Setiap fitur baru WAJIB disertai **test** (min integration: happy + unauthorized + invalid/not found) di `tests/integration/` atau `tests/unit/`. **❌ Commit fitur tanpa test.**

## Aturan Update Dokumentasi (MUTLAK)

Setiap perubahan **business logic** WAJIB update `CLAUDE.md` dalam commit yang sama. Business logic = auth/otorisasi, status machine, validasi domain, kontrak API publik, behavior CLI, enkripsi, routing, skema DB. BUKAN = refactor internal, optimasi, logging, styling, dependency non-breaking. **❌ Merge yang ubah business logic tanpa update doc.**

## Testing (MUTLAK — Test DB Safety)

`tests/helpers.ts:cleanupTestData()` `deleteMany()` di **seluruh tabel** → WAJIB DB berakhiran `_test`. Guard `assertTestDb()` refuse-to-run jika DB non-test — **jangan disable**.

```bash
createdb envman_test
DATABASE_URL='postgresql://USER:PASS@localhost:5432/envman_test' bunx prisma db push
DATABASE_URL='postgresql://USER:PASS@localhost:5432/envman_test' bun run test
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
