# envman — CLAUDE.md

> **⚠️ CLI ada di Go, bukan TypeScript.** Sumber `cli-go/` (entry `cmd/envman/main.go`). CLI TS lama (`src/cli.ts`, `src/cli/`) **SUDAH DIHAPUS** — jangan rujuk/edit `src/cli*`. `src/` = server + frontend saja.

## Runtime

Bun di seluruh stack (`bun` / `bun test` / `bun install` / `bunx`). Bun auto-load `.env` — jangan pakai dotenv. Cek Bun native API sebelum install npm: `Bun.password.hash/verify`, `Bun.RedisClient`, `Bun.file()`, `crypto.randomUUID()`, `Bun.S3Client`.

## Server

- `src/app.ts` — semua API routes (`createApp()`)
- `src/index.tsx` — server entry + Vite middleware (dev)
- `src/serve.ts` — dev entry: `bun --watch src/serve.ts`
- `src/server.prod.ts` — prod entry (tanpa Vite/Babel). **Jangan compile `src/index.tsx`** (pull `@babel/core`).

**Binary compile:** `bun build src/server.prod.ts --compile --target=bun-linux-x64 --outfile server`

**Migration:** `src/lib/migrate.ts` — zero npm dep, compatible `_prisma_migrations`. Jalan otomatis di startup (`MIGRATE_ON_STARTUP=true` default) sebelum `app.listen()`. `scripts/migrate.ts`=CLI wrapper. ENV: `MIGRATE_ON_STARTUP` (true), `MIGRATE_DATABASE_URL` (`DIRECT_URL ?? DATABASE_URL`), `MIGRATIONS_DIR` (`./prisma/migrations`), `MIGRATE_DB_RETRIES` (5, 2s delay).

## Database

PostgreSQL via Prisma v6. Client singleton `db.ts` (`{ prisma }`). Schema `prisma/schema.prisma`. Client → `./generated/prisma`.

### Schema Models

- `User`, `Session`, `AuditLog` — field standar (lihat schema).
- `Project` (id, slug, name, description, tags[], icon?/color?/cardColor?, storageQuotaMb?/storageMaxFileMb?, createdById?, timestamps) — avatar vs registry `project-avatar.ts` (null=fallback); storage override per-project (null=global); `createdById` FK User `ON DELETE SET NULL`.
- `Environment` (id, name, tags[], projectId, timestamps) — unique(projectId, name)
- `EnvVar` (id, key, value, isSecret, isDisabled, environmentId, timestamps) — unique(environmentId, key)
- `ProjectMember` (userId, projectId, role) — unique(userId, projectId)
- `EnvironmentMember` (userId, environmentId, role?) — unique(userId, environmentId). `role=null`=DENY · role set=override · no record=inherit project role.
- `ProjectSectionMember` (userId, projectId, section, role?, scopeTags[]) — unique(userId, projectId, section). Role identik `EnvironmentMember`. `scopeTags` kosong=full, isi=limit-by-tag (OR).
- `ApiToken` (id, userId, name, token, scopes[], tags[], canWrite, isDisabled, expiresAt?, useCount, lastUsedAt?/lastIp?, disabledBy?/disabledAt?/disabledReason?)
- `ProjectAlias` (projectId, name, args, description?, tags[], createdBy) — unique(projectId, name)
- `ProjectFile` (projectId, authorId, title, description, prefix?, files Json, tags[]) — unique(projectId, prefix)
- `PortainerConnection` (id, name, portainerUrl, apiToken, createdById) — global
- `PortainerConfig` (projectId, envName, connectionId?/portainerUrl?/apiToken?, stackId, stackName, endpointId, lastSyncAt?/lastSyncOk?)
- `AppSetting` (key PK, value, updatedAt, updatedById?) — konfigurasi global runtime (Dev > Settings)
- `Gist` (id, userId, title, description, files Json `[{filename,content,language}]`, isPublic, tags[]) — unique(userId, title). `isPublic=false` default. Judul unik per user = natural key CLI.
- `Clipboard` (userId PK, content, createdAt, expiresAt) — slot-tunggal per-user. `content` dienkripsi (`enc:iv:cipher:tag`). TTL default 24h, lazy-expire + sweep 1h. FK `CASCADE`.
- `Transfer` (id, kind `TEXT|FILE`, fromUserId, toUserId?, toHint?, content?, minioKey?/filename?/size BigInt/mimeType/uploaded, label?, burn, codeHash? unique, codePrefix?, claimedAt?, claimedByUserId?, claimedIp?, expiresAt) — `toUserId=null`=kode sekali-pakai. **FK `CASCADE`** (RESTRICT mematikan `user.deleteMany()` di test). `size` **BigInt** → shaper wajib `Number()`.
- `EnvImport` (id, targetEnvId, sourceEnvId, keys[], order, createdById) — unique(targetEnvId, sourceEnvId). Live-link, boleh lintas project. FK `CASCADE`.
- `ProjectStorageObject` (projectId, path, minioKey, size, mimeType, isPublic, tags[], description?, uploadedById) — unique(projectId, path). `path`=path user, `minioKey`=`{projectId}/{path}`. `isPublic=true`→download tanpa auth.

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

`isSecret=true` → AES-256-GCM. `MASTER_KEY`=64-char hex. Format `enc:<iv>:<cipher>:<tag>`. Impl `crypto.ts`. VIEWER lihat `***`; EDITOR/OWNER reveal.

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

`getDefaultRoute(role)` di `useAuth.ts`. Blocked → `/blocked`.

## Permission Hierarchy (Per-Project + Per-Env)

Dua lapis. Default: env/notes/aliases/files **inherit** dari `ProjectMember.role`. OWNER bisa override role per-env atau set DENY explicit per-env per-user.

**Resolver `getEnvironmentAccess(userId, role, slug, envName)` (`access.ts`):** (1) SUPER_ADMIN→`OWNER`. (2) `EnvironmentMember`: `role=null`→DENIED · role set→override · no record→step 3. (3) inherit `ProjectMember.role`; no record→`null`.

### Secure-by-Default Onboarding

Member ditambah EDITOR/VIEWER (POST `/members`) → server auto-insert `EnvironmentMember role=null` (DENY) untuk **semua env existing**. OWNER baru → tidak default-deny. Update role existing (re-POST userId sama) → tidak touch override. Env baru → semua member non-OWNER auto-deny. Response carry `defaultDenied: boolean`.

### Defense-in-Depth

Files & aliases accessible di project level, tapi yang reference env via `-e project:env` di-block di env layer:
- **Vars** — semua handler panggil `getEnvironmentAccess()`. DENIED → 403.
- **Alias resolve** — extract `-e project:env` via `extractEnvRefs()`, cek tiap env → 403 `{error, deniedEnvs}`. List compute `requiresEnvs`+`deniedEnvs` per-alias per-user (di luar Redis cache).
- **Project detail** — `GET /projects/:slug` filter env DENIED untuk non-OWNER; tiap env carry `accessRole`.

**CLI:** `FetchJSON()` detect 403 + `deniedEnvs` → cetak `[envman] Akses ditolak untuk env: ...` → exit 1. **UI:** **semua penyuntingan akses di tab Members project** (single source of truth), `AccessMatrixTab` read-only.

### Admin Endpoint Parity (SUPER_ADMIN)

- `PUT /api/envman/admin/users/:userId/projects/:slug/envs/:envName` = OWNER env-member endpoint: validasi target project member, last-owner-of-env protection, audit `ENV_MEMBER_SET`/`_CLEARED` (suffix `(admin)`), invalidate seperti OWNER.
- `PUT .../projects/:slug/sections/:section` = OWNER section-member endpoint: validasi section+target project member, audit `SECTION_MEMBER_SET`/`_CLEARED` (suffix `(admin)`), invalidate `projectDetail`/`invalidateProjectCaches`.

**Audit & Cache (env-member):** `ENV_MEMBER_SET`/`_CLEARED` (`<slug>/<envName> user=<userId>` +`role=` +`(admin)`). PUT/DELETE → invalidate `projectAccess(userId,slug)` + `projectDetail(slug)` + `invalidateProjectCaches(slug,[userId])`.

## Permission per-Section (Notes / Aliases / Files / Storage)

Override akses per-member untuk section non-env, **paralel** dengan env members. Model `ProjectSectionMember`. Resolver `getSectionAccess(userId, role, slug, section)`.

### Semantik

- Resolusi **identik** `getEnvironmentAccess` (SUPER_ADMIN→OWNER · `null`→DENIED · set→override · no record→inherit · no membership→null).
- Enforcement: keempat section gate handler via `getSectionAccess()` (Aliases env-ref tetap `getEnvironmentAccess`). Public storage download tak terpengaruh.
- Role-gate per operasi **tidak berubah** (mis. Storage: VIEWER list/download, EDITOR upload/meta/rename/move, OWNER delete/folder/setPublic).

### Secure-by-Default

- **Backfill migration**: semua `ProjectMember` non-OWNER existing di-seed `role=null` keempat section → kehilangan akses sampai OWNER grant.
- Member baru non-OWNER → auto-seed DENY keempat section (`projects-members.ts`); tercakup di `defaultDenied`.
- OWNER → tidak di-seed. **Tanpa last-owner-protection**.

### Permission & Scope

- Kelola override: OWNER (atau SUPER_ADMIN admin parity).
- `GET /projects/:slug` field additive `sectionAccess: {NOTES,ALIASES,FILES,STORAGE}` (`ProjectRole|null`) — FE sembunyikan tab denied.
- `GET /projects/:slug` field additive `storageStats: {fileCount, usedBytes}` untuk badge Storage — **hanya bila `sectionAccess.STORAGE !== null`**. Mutasi storage invalidate `['envman','project',slug]`.
- UI: Members = satu matrix gabungan via tombol "Members" di header (`?tab=members` deep-link); merge `access-matrix`+`section-matrix` by userId. Section tab `sectionAccess === null` disembunyikan.

**Audit & Cache:** `SECTION_MEMBER_SET`/`_CLEARED` (`<slug>/<section> user=<userId>` +`role=` +` scope=[a,b]` +`(admin)`). PUT/DELETE → invalidate `projectDetail(slug)` + `invalidateProjectCaches(slug,[userId])`. Matrix cache `projectSectionMatrix(slug)` 60s.

## Tag Scope per-Section (Limit by Tag)

Lapisan ke-4 (ABAC) di atas section access: **mempersempit** akses member ke item bertag tertentu. Kolom `ProjectSectionMember.scopeTags String[]` (migration `20260721040000_add_section_scope_tags`, additive default `[]`, tanpa backfill).

### Semantik (MUTLAK)

- **Kosong `[]` = full access** (semua item termasuk tanpa tag) = perilaku lama, backward-compatible.
- **Non-kosong = limit-by-tag**: hanya item dengan **≥1** tag dari `scopeTags` (**match OR**). Item **tanpa tag** hanya untuk full-access member (secure-by-default via `hasSome`).
- Berlaku keempat section (NOTES→`ProjectNote`, ALIASES→`ProjectAlias`, FILES→`ProjectFile`, STORAGE→`ProjectStorageObject`; semua punya `tags[]`).
- **Enforcement baca + tulis**: item di luar scope **tak terlihat** (list ter-filter) **dan tak bisa disentuh**.
  - Read-by-id/download/edit/delete item luar scope → **404** (invisibility). Section-denied tetap **403**.
  - **Section-role OWNER pun di-guard**: OWNER via matrix bisa punya scopeTags → tetap cek scope (project-OWNER inherit selalu kosong=full). Jangan asumsikan OWNER=full saat ada `scopeTags`.
  - **Create rule**: user limited WAJIB beri item baru ≥1 tag scope-nya → else **400**. Edit yang retag keluar scope → **400**.
- SUPER_ADMIN & OWNER (via inherit) selalu `scopeTags=[]`.

### Resolver & Helper (`access.ts`)

- Primitif `getSectionAccessWithScope(...) → { role, scopeTags }` (1 DB read). `getSectionAccess()`=wrapper return `.role` (**signature tak berubah** — 34 call-site aman). `getSectionTagScope()` return `.scopeTags`.
- Helper murni: `canAccessItem` (OR; untagged→false saat limited), `filterByTagScope`, `tagScopeWhere` (`{}` | `{ tags: { hasSome } }`).
- **Cache caveat**: list Aliases/Files pakai `withCache` key **global** → filter `filterByTagScope()` **setelah** cache boundary (per-request), JANGAN cache hasil ter-scope. Storage 2-query: filter di **Query 1** agar folder/`totalFiles`/pagination benar.

### API & UI

- `PUT .../sections/:section/members/:userId` body additive `{ role, scopeTags? }` (validasi array string, trim/dedupe; `denied`/`inherit`→scope di-clear). Admin parity sama. Response bawa `scopeTags`.
- `GET section-matrix` + `GET .../sections/:section/members` field additive `scopeTags` per cell. `section-matrix` juga bawa `availableTags: Record<section, string[]>` untuk autocomplete.
- UI per-cell `TagScopeEditor` (badge `Full`/`N tag`); Storage edit tag via PATCH `/storage/meta`. CLI `storage ls/upload --tag a,b`. Test `tag-scope`+`section-tag-scope`.

## Env Import (Reference / Live-Link)

Env target meminjam vars dari env lain (boleh lintas project) secara **referensi live**, bukan salinan. Resolver `env-import.ts`.

### Semantik

- **Layered merge**: `imports (order asc, besar menang) → local`. Var lokal SELALU menang per-key; imported yang key-nya ada lokal di-suppress.
- **Per-key whitelist** (`EnvImport.keys[]`): kosong `[]`=**semua** var source (default); ada isi=**hanya** key itu. Whitelist ketat — key baru di source tidak ikut otomatis.
- **Akses dicek saat resolve**: tiap source env `getEnvironmentAccess(caller,...)`. `null`→skip + dicatat `deniedImports[]`.
- **Secret**: reveal/mask pakai akses caller di SOURCE env. MASTER_KEY global → decrypt lintas project valid.
- **Cycle detection saat save** (`wouldCreateCycle`) → tolak A→B→A (400). **EnvVar `isDisabled` di source di-exclude**.

**Permission:** Buat/hapus link: OWNER env target; caller wajib ≥VIEWER ke source. Self-import→400. Duplikat→409. `order`=max+1.

**Scope resolusi:** `GET vars/export` (CLI): imported sebagai base, local overwrite, +`deniedImports` bila non-kosong. `GET vars` (UI): field additive `imported[]` (`{key,value,isSecret,sourceProject,sourceEnv}`, exclude key lokal), `importedKeys[]`, `deniedImports[]`; bentuk `vars`/`total` tak berubah.

**UI:** Baris imported read-only (badge `from <proj>:<env>`); var lokal ∈ `importedKeys` → badge `overrides`. Kelola OWNER-only → `ImportManagerModal` (`?importMgr=true`).

**Audit & Cache:** `ENV_IMPORT_ADDED`/`_REMOVED`/`_UPDATED`. Invalidate `invalidateProjectCaches(slug)` + `projectDetail(slug)`. **Hasil resolve vars TIDAK di-cache.** Deferred: transitive import, per-import override value.

## Project Storage

MinIO-backed per project. Key prefix `{projectId}/{path}`. DB (`ProjectStorageObject`)=source of truth metadata; MinIO=content.

**Env vars (wajib aktifkan fitur):** `MINIO_ENDPOINT · MINIO_ACCESS_KEY · MINIO_SECRET_KEY · MINIO_BUCKET=envman · MINIO_PRESIGN_BASE_URL (opsional)`. `MINIO_PRESIGN_BASE_URL` khusus presigned PUT (CLI upload) — set URL non-proxy jika MinIO di belakang Cloudflare. Tanpa 4 var pertama → 503 (list & metadata PATCH tetap jalan). Gate per operasi: lihat API Reference Storage.

**Storage limits:** Global `storage_max_file_mb` (50), `storage_default_quota_mb` (500) via `/dev > Storage`; `Project.storageMaxFileMb`/`storageQuotaMb`=override per-project (SUPER_ADMIN, null=global). Efektif `project.storageMaxFileMb ?? globalSetting`.

**Cleanup & presign:** Delete: MinIO dulu, lalu DB. Project soft-delete: `minioDeleteProject()`. Orphan (upload sukses, DB gagal): auto-delete object. Private download presigned TTL 5 mnt (`Content-Disposition: attachment`); public TTL 1 jam; CLI stream via 302.

**Impl:** `Bun.S3Client` singleton lazy; SigV4 multipart, `MULTIPART_CHUNK_SIZE=50MB`; routes `storage-*.ts`.

## Transfer (envman transfer)

Kirim secret **user-ke-user** (`.env`, SSH, cert). Beda dari `clip` (slot-tunggal milik sendiri), transfer punya **penerima**. Impl `transfer-service.ts` + `transfers-*.ts`; CLI `internal/transfer/` (recv_cmd.go=`transfer get`).

> ⚠️ **Bukan E2E.** Enkripsi at-rest dgn `MASTER_KEY` **server** — aman dari pihak ketiga & kebocoran DB, tapi pemegang `MASTER_KEY` (admin) bisa baca. Sebut apa adanya di docs.

### Semantik

- **Penerima**: user terdaftar (`to`, email/nama **persis**, sengaja tak fuzzy) **atau** `once:true` → kode sekali-pakai. Nama ambigu→409; blocked/deleted→**404 body sama** dgn "tak ada" (bukan oracle status akun).
- **Burn-after-read** default; `--keep` (`burn:false`) bisa diambil berkali-kali sampai TTL.
- **Klaim = CAS** `updateMany where {id, claimedAt:null}` → `count===0`=kalah balapan → 409. **Bukan** read-then-write.
- **Klaim MENANDAI, tak menghapus.** Hapus hanya di sweep (`expiresAt<now` ATAU `burn && claimedAt<now-2j`) — satu jalur; object MinIO dulu, baru baris.
- **Kode**: **4 kata** EFF Short #2 (1296 kata, prefix 3-huruf unik) → `viking.pudding.alaska.sunny`, ≈41 bit. Pemisah **titik** bukan hubung (daftar memuat `yo-yo`). Simpan **codeHash** (sha256) saja. `generateCode` wajib **`randomInt`** bukan `% length` (bias).
- **Normalisasi sadar-kelas** (`normalizeCode`): legacy base32 16-char (uppercase, buang `-`, `I L→1`, `O→0` — **wajib dipertahankan**) / mnemonic & kustom (lowercase, spasi→titik, **JANGAN lipat glyph** — `viking` bukan `v1k1ng`). ⚠️ `hashCode` jalan pada hasilnya = **kontrak kanonikalisasi dgn DB**; TS & Go wajib sepakat byte-per-byte (fixture `tests/fixtures/code-normalization.json`). Divergensi = 404 senyap.
- **`--code` kustom**: min 12 char, `[a-z0-9._-]`. **TTL dipaksa ≤15 mnt** di `resolveTtlMs`. `codePrefix`=**null** utk kustom, **kata pertama** utk mnemonic.

### Aturan keamanan (MUTLAK)

- **Kode di BODY POST, JANGAN di path** — `src/app.ts` mencatat `${method} ${pathname}` ke Redis app-log **dan** broadcast ke panel dev. Audit hanya boleh memuat `codePrefix`.
- **Rate limit** `src/lib/rate-limit.ts`: `xfer:claim:ip:<ip>` 10 gagal/10mnt + `xfer:claim:global` 100/10mnt. `peekLimit` (tak increment) sebelum lookup + `hitLimit` **hanya saat gagal** → klaim sukses tak makan budget, budget habis tetap menolak kode benar. **Fail-closed** (Redis mati → 503), beda dari `cache.ts` fail-open.
- **404 identik** untuk kode tak dikenal/kedaluwarsa/sudah diklaim.
- **MASTER_KEY hilang → 503 saat kirim** (`encryptSecret` fail-open menyimpan plaintext — tak boleh untuk transfer). Klaim tak hard-fail, tapi sentinel `'[decryption failed]'` dicek **sebelum CAS** → 500; kalau tidak, burn menghapus satu-satunya salinan.
- **Gate**: mutasi yang membuat state untuk **orang lain** butuh `canWrite` (POST); klaim/hapus/inbox **tidak** (token RO wajib bisa menguras inbox-nya sendiri).
- Klaim-by-id `where {id, toUserId: caller}` → **404 bukan 403**.

### API

`POST /api/envman/transfers` (TEXT; `canWrite`; 400/403/404/409/413/429/503) · `POST .../transfers/presign` + `POST .../transfers/:id/confirm` (FILE; `canWrite`; 503 MinIO mati, 502 stat gagal, 413 ukuran nyata > batas) · `GET .../transfers/inbox|sent` · `POST .../transfers/:id/claim` (FILE → `downloadUrl` presigned) · `DELETE .../transfers/:id` · **`POST .../transfers/claim` (tanpa auth**, kode di body).

Audit `TRANSFER_SENT`/`_CLAIMED`/`_REVOKED`. Setting (UI `/dev > Storage`): `transfer_max_text_kb` (1024), `transfer_max_file_mb` (100), `transfer_max_ttl_hours` (168), `transfer_default_ttl_hours` (72), `transfer_max_pending_per_user` (20).

### Konvensi permukaan perintah (MUTLAK)

- **Fitur = noun-group.** Semua subcommand di bawah satu kata benda (`clip`/`env`/`gists`/`storage`/`projects`/`portainer`/`transfer`). **Jangan** sebar verba fitur ke tingkat atas — tak tertemukan di `--help` alfabetis. **Tanpa pengecualian.**
- **`-f` = `--follow` saja** (`portainer logs`). `--force` **long-only** seluruh CLI — dijaga `TestForceHasNoShorthand`.
- **`--tags`** (jamak) di mana-mana; wire field selalu `tags`. **`--json`** tanpa shorthand via `emitJSON()`; stdout **hanya data**, status ke stderr.
- **Destruktif default aman**: `storage rm` pratinjau dulu (butuh `--force`); `gists push --clean` tolak tanpa `--force` + **sebut file yang hilang** (`MergeResult.Dropped`).
- **Rahasia JANGAN ke stdout bila ada `--copy`** (bool, tanpa shorthand, eksklusif `-o`) → clipboard via `internal/clipout`: pbcopy → wl-copy → xsel/xclip → **OSC 52** (clipboard mesin LOKAL lewat SSH). ⚠️ OSC 52 tak bisa dikonfirmasi; utk data hangus-sekali-baca (`transfer get`) peringatkan keras, bila metode nyata gagal **jatuh ke stdout** agar rahasia tak lenyap. Dijaga `copy_flag_test.go`.
- **Rahasia JANGAN lewat argumen** (bocor via `ps`/history — CVE-2023-43621 croc). Baca via `secretin.Read()`: **env var → stdin → prompt → argumen (peringatan)**. Berlaku token/kode klaim/password (`ENVMAN_TOKEN`, `ENVMAN_CODE`).
- **Perintah dipindah** wajib masuk `movedCommands`. Perintah **tanpa login** (`health`, `sys`, `install`, `env sync`) sebut di baris pertama `Long`. Tambah/pindah perintah → **wajib** test registrasi.

### Jalur TEXT vs FILE (auto-deteksi di CLI)

`ChooseMode` memilih **tanpa campur tangan user**: byte `NUL` di 8000 byte pertama (heuristik biner Git) **atau** ukuran > batas teks → **FILE**; selain itu **TEXT**. Override `--text`/`--file`. Pipe selalu TEXT. Mode diumumkan ke stderr.

- **TEXT** → `content` terenkripsi. JSON+hex di DB ≈ **2x disk, 2.7x memori** → batas kecil (`transfer_max_text_kb`, 1024).
- **FILE** → presign → **CLI PUT langsung ke MinIO** → confirm (byte tak menyentuh server → `transfer_max_file_mb`, 100). Key `transfers/{id}/{filename}` (`buildTransferKey`), namespace terpisah.
- **Urutan MUTLAK**: row dibuat **saat presign** (`uploaded=false`) = satu-satunya catatan object. Confirm **verifikasi ukuran nyata** via `.stat()` + **re-derive key dari row**, tak pernah terima `minioKey` klien. Inbox sembunyikan `FILE && uploaded=false`; klaimnya → 409.
- Sweep: `minioDelete` key **dulu**, baru `deleteMany` baris. `GRACE` 2j > TTL presigned GET (3600s). `safeFilename()` buang komponen direktori.
- **CLI `recv`**: cek `-o` sudah-ada **SEBELUM** klaim (klaim membakar; gagal setelahnya=secret hilang). Tanpa `-o`, bentrok → `nama-2.ext`, **jangan abort**. Reuse `storage.PutPresigned`, **jangan salin** `putToMinio`.

## API Reference

### Admin API (SUPER_ADMIN)

- `GET /api/admin/users` · `PUT .../users/:id/role` · `PUT .../users/:id/block` (delete sessions + disable tokens)
- `GET .../presence|logs/app|logs/audit` · `DELETE .../logs/app|audit`
- `GET .../tokens` · `PATCH .../tokens/:id` (`{action, reason?, expiresAt?}`) · `DELETE .../tokens/:id` (audit `TOKEN_REVOKED_BY_ADMIN`)
- `GET .../schema` (Prisma schema → JSON, dipakai Dev > Database)
- `PUT /api/envman/admin/users/:userId/permissions` — set capability array (`isValidCapability`→400).

### Envman API

Auth: session cookie atau `Authorization: Bearer <token>` (`requireEnvAuth()`).

- **Projects:** `GET|POST /api/envman/projects` · `PATCH|GET .../projects/:slug`. POST isi `createdById`; GET list additif `createdById`+`createdBy`. PATCH (OWNER) terima `icon`/`color`/`cardColor` (null=reset).
- **Vars:** `GET .../environments/:env/vars` (search,limit,offset) · `GET .../vars/export` (EDITOR+) · `POST|PUT|DELETE .../vars/:key`. Field additive env import — lihat Env Import.
- **Environments:** `POST|DELETE|PATCH .../projects/:slug/environments[/:env]`
- **Members:** `PUT|DELETE .../projects/:slug/members/:userId/role|member`
- **Env Members (OWNER):** `GET .../environments/:envName/members` (list + envRole `inherit`/`denied`/role + `effectiveRole`) · `PUT .../members/:userId {role}` · `DELETE .../members/:userId` (reset inherit). Last-owner-of-env protection.
- **Section Members (OWNER):** `GET .../sections/:section/members` (section invalid→400; bawa `scopeTags`) · `PUT .../sections/:section/members/:userId {role, scopeTags?}` (`inherit|denied|OWNER|EDITOR|VIEWER`; target wajib project member→400; tanpa last-owner-protection) · `DELETE .../sections/:section/members/:userId` · `GET .../section-matrix` cache 60s.
- **Env Imports (OWNER target):** `GET .../environments/:envName/imports` · `POST .../imports {sourceProject, sourceEnv, keys?}` (403/400/404/409/cycle) · `PATCH .../imports/:id {keys}` · `DELETE .../imports/:id`.
- **Access Matrix (OWNER):** `GET .../projects/:slug/access-matrix` → `{project, environments[], members[]}`. Cache 60s. Bulk = fan-out `Promise.allSettled`.
- **Portainer:** `GET|POST .../portainer/connections` · `PUT|DELETE .../connections/:id` · `POST .../connections/:id/probe` · per-env `GET|PUT|DELETE|POST .../portainer[/sync]`
- **Portainer env-scoped (CLI+FE):** `GET .../portainer/status|containers` · `GET .../inspect/:containerId` · `GET .../logs/:containerId` (snapshot) · `GET .../logs/:containerId/stream` (**SSE** `event: stdout|stderr`) · `POST .../restart` (**stop→start tanpa pull**, `stack:power`; 409 saat sudah stop) · `POST .../recreate|repull|sync-repull` (`stack:deploy`) · `POST .../prune/images` (`stack:prune`).
- **Files:** `GET|POST .../projects/:slug/files` · `GET .../files/resolve?prefix=&filename=` · `PUT|DELETE .../files/:id`
- **Aliases:** `GET|POST .../projects/:slug/aliases` · `PATCH|DELETE .../aliases/:name` · `GET .../aliases/resolve/:ref`
- **Tokens:** `GET|POST .../tokens` · `PATCH|DELETE .../tokens/:id` · `PATCH .../toggle` · `GET .../reveal` · `POST .../rotate` · `GET /api/envman/whoami`
- **Gists:** session cookie **atau** `Bearer <token>`. `GET .../gists` (sendiri + public; `?limit&cursor&search&tags&sort`) · `POST .../gists` (cap `gist:create`; judul duplikat per-user → 409) · `PUT|DELETE .../gists/:id` (owner/SUPER_ADMIN; 409 rename bentrok) · `GET .../gists/:id/raw/:filename`. Mutasi di-gate `canWrite` → RO token 403. Judul **unik per user** (`@@unique([userId,title])`)=natural key CLI. Sidebar cap `menu:gists`. **Public (no auth):** `GET /api/public/gists` · `GET /api/public/gists/:id` (403 jika private) · `.../:id/raw/:filename`.
- **Clipboard:** `GET /api/envman/clip` (decrypt; expired→404+auto-delete) · `PUT .../clip {content, ttlSeconds?}` (encrypt upsert; size>`clipboard_max_kb`→413; TTL clamp `clipboard_max_ttl_hours`) · `DELETE .../clip`. User-level, **tidak** di-gate `canWrite`.
- **Storage:** `GET .../storage` (VIEWER+, `?prefix=`) · `POST .../storage/upload` (EDITOR+, ≤50MB) · `POST .../storage/presign-upload` (EDITOR+, `{path,size,mimeType,noClobber?}`; noClobber+exist→409) · `GET .../storage/download?path=` (`{url,size,updatedAt}`) · `PATCH .../storage/meta` (`isPublic` OWNER-only) · `PATCH .../storage/rename|move` (EDITOR+, move=batch) · `DELETE .../storage?path=` (OWNER). **Public:** `GET /api/public/storage/:slug/:path` (302). **Chunked (>50MB):** `POST .../storage/multipart/init|part|complete` · `DELETE .../multipart/abort`. Validasi minioKey prefix per-project.
- **Settings:** `GET /api/envman/settings` (public map) · `PUT` (SUPER_ADMIN, `[{key,value}]`) — key valid: `user_token_creation`, `user_token_max_days`, `storage_max_file_mb` (50), `storage_default_quota_mb` (500), `clipboard_max_kb` (1024), `clipboard_max_ttl_hours` (168).

**Conditional caching**: read-resource kirim `ETag`+`Cache-Control` & support `If-None-Match`/`If-Modified-Since` → `304`. Di-cover: `gists/:id/raw`, `public/gists/:id`, `files/resolve`, `aliases/resolve/:ref` (**userId masuk hash**), `/api/docs.md`. **Tidak:** vars, session, list, binary download.

### Portainer Capabilities

Operasi di-gate per-capability, bukan role. Assign via `PUT .../admin/users/:userId/permissions`. SUPER_ADMIN bypass. Guard `portainer-auth.ts` (`requireCap`, `editorOrCap`, `envAccessOrCap`).

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

- Connection-scoped (`/portainer/connections/...`) — murni capability via `requireCap`. Env-scoped (`/projects/:slug/.../portainer/...`) — role ATAU capability via `editorOrCap`; exec env-level → `stack:exec`. Probe via slug+envName wajib akses env. Migration `20260702000000_portainer_caps_backfill` grant `stack:power`+`stack:deploy` ke pemilik `stack:mutate` (idempotent).

### Auth Endpoints

`POST /api/auth/login` · `GET /api/auth/google` → `/api/auth/callback/google` · `GET /api/auth/session` · `POST /api/auth/logout` · `GET /api/dev-auth/login-as/:email` (dev).

### WebSocket

`WS /ws/presence` — real-time presence (session cookie auth).

## Frontend

React 19 + Vite 8 (middleware mode dev). File-based routing TanStack Router (`src/frontend/routes/`). `App.tsx` = MantineProvider, ModalsProvider, QueryClientProvider, RouterProvider. Route penting: `envmanager` (AppShell) · `.$slug.index` (environments/notes/aliases) · `.$slug.$env` (vars; Portainer+History via Drawer `?integrations=true`).

**Hooks:** `useAuth.ts` (`useSession/useLogin/useLogout/getDefaultRoute`) · `usePresence.ts` (WebSocket, `onlineUserIds`). **UI:** Sidebar collapsible 260↔60px · Dark/Light auto device pref · Tag colors deterministik `tagColor(tag)`. `MonacoCodeEditor.tsx` lazy ~1MB, mobile→Textarea.

## CLI (Go)

Module `github.com/bipprojectbali/envman/cli`. Entry `cli-go/cmd/envman/main.go` (cobra); packages di `cli-go/internal/`. Build `bun run build:cli` → `dist/cli/envman-{platform}`+`.gz`. Test `cd cli-go && go test ./...`. Dep eksternal: `github.com/shirou/gopsutil/v4` (BSD, tanpa cgo) untuk `envman sys`.

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

envman env push <project>:<env> [file]  ·  env pull <project>:<env> [-o file]  ·  env keys <file|project:env>
envman env sync <source> [target=.env]    # LOKAL tanpa login

envman projects ls [--me] [-q]  ·  projects [envs] <slug> [-q]
envman health [dir]  ·  sys  ·  clip set [file] · get [-o file] · clear   # health/sys tanpa login; clip --ttl default 24h

envman transfer send [file] --to <email|nama> | --once   # --keep · --mode text|file
envman transfer ls [--sent] [--json]  ·  get <id|KODE> [-o file] [--force]  ·  rm <id>   # KODE: tanpa login (ENVMAN_CODE)

envman gists ls [--public]  ·  find <query>  ·  get <judul|id>   # alias: gist
envman gists push <judul> <file>... [--force] [--clean] [--public] [--tags a,b]
envman gists pull <judul|id>[:file] [-o dir|file]  ·  rm <judul|id>[:file]

envman storage ls <project>[:prefix]  ·  download <project>:<path> [-o file]  ·  upload <project> <file|dir> [-f]
envman storage exec [--offline|--no-cache] <project>:<path> [-- args...]  ·  rm <project>:<folder>/   # rm OWNER only

envman portainer status|ps|inspect <project>:<env> [container]         # alias: pt
envman portainer logs <project>:<env> <container> [-f] [--tail N]   # -f = live SSE
envman portainer restart-soft <project>:<env>   # stop→start (stack:power)
envman portainer restart-recreate|restart-repull|sync-repull|prune <project>:<env>   # stack:deploy
```

**Catatan behavior per-command:**

- `portainer`/`pt` = thin client atas endpoint env-scoped (lihat Portainer API); `logs -f` = SSE, Ctrl+C → server auto-abort.
- `storage exec` binary (stdio inherit, args setelah `--`, propagasi exit). **Cache** `~/.cache/envman/exec` (0700, reuse bila `size`+`updatedAt` cocok, prune LRU >500MB). `--offline`/`--no-cache`.
- `env push/pull/keys` = sinkron `.env`, **CLI-only** (reuse `PUT vars` + `GET vars/export`).
  - **push**: upsert per-key (key server absent di file **tak dihapus**); env belum ada → auto-create. **Auto-deteksi secret** (`DetectSecret`): regex `SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|CREDENTIAL|DATABASE_URL|_DSN|TOKEN` / suffix `_KEY`, **kecuali** `PUBLIC_KEY`. Prioritas `--plain` > `--secret` > **secret server (server-wins)** > auto.
  - **pull**: `KEY=value` (quote bila perlu). Secret mask `***` (VIEWER) dilewati + warn. `-o` atomic 0600, tolak overwrite tanpa `--force`. **keys**: nama key saja (value tak pernah keluar → aman AI).
- `env sync` = samakan key `.env` lokal vs file lain (mis. `.env.example`). **LOKAL murni** — tak panggil server. Append-only: key existing **tak disentuh** (banding by nama); key yatim **dilaporkan, tak dihapus**. **Invarian MUTLAK**: `NewContent` selalu berawalan `ExistingBytes` (uji `TestPlanPreservesTargetBytes`); nilai **verbatim** (`RawValue`), jangan lewat `FormatEnv`/`quoteIfNeeded`. Default dry-run; `--write`/`--no-backup`/`--keys-only`. ⚠️ `internal/envparser` tak strip `export ` (key `"export KEY"`); bug lama — **jangan diperbaiki** (ubah perilaku `env push`/`run`).
- `gists`/`gist` = snippet multi-file. Rujuk by **judul** / **UUID**. `push` upsert per-file (timpa butuh `--force`, conflict→abort; `--clean`=ganti set). `pull` 1 file tanpa `-o`→stdout; multi wajib `--file`/`-o`.
- `health` = scan file terlalu besar utk konteks AI, **lokal tanpa login**. Status max(baris%,char%): `ok`<80 / `warning`80-99 / `critical`≥100 (default 500 baris/20k char). Skip dir dependency/build/hidden/biner.
- `sys` = snapshot mesin lokal (gopsutil v4), **tanpa login**. Status usage ok<80/warn≥80/crit≥90; load per-core ≥1.0 warn/≥1.5 crit. Best-effort (gagal→`Warnings[]` stderr). `--json` · `--du <dir>` · `--public-ip` (satu-satunya egress, `api.ipify.org`).

> **Catatan:** `envman mcp` sudah dihapus (MCP deprecated).

### CLI Docs (`envman docs`)

Sumber tunggal `src/lib/cli-docs/*.ts` → `buildCliDocsMd()`; serve `GET /api/cli-docs.md` (ETag). `envman docs` fetch server dulu; offline → fallback embed `DOCS.md` (`//go:embed`, `{{SERVER}}`→URL), notice stderr. **DOCS.md di-generate, JANGAN edit tangan** — regenerate `bun run scripts/gen-cli-docs.ts` (auto `build:cli`). Drift-guard `cli-docs-embed.test.ts`.

### Download

`GET /download/cli/:platform` — `Accept-Encoding: gzip` → `.gz` (~60% lebih kecil).

### File Execution

Script `ProjectFile` execute langsung tanpa write disk — content pipe ke stdin. **Canonical syntax (WAJIB):** `slug:prefix/file.ext` (mis. `envman -e myapp:prod -- bash myapp:scripts/deploy.sh`).

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

`FetchJSON(cfg,path,useCache)` conditional cache **opt-in**: `If-None-Match` → 304 dari disk / 200+ETag tulis. Disk `~/.config/envman/cache/` (`sha256(server+path)`, 0600, ≤200 entri LRU). Aktif HANYA di `files/resolve` + `aliases/resolve`.

## Infrastructure

- **Redis** (`redis.ts` → `REDIS_URL`) — App logs = Redis ring `app:logs` (max 500 LTRIM, via `onAfterResponse`, `applog.ts`).
- **Audit Logs** (DB `AuditLog`, persistent): `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `LOGIN_BLOCKED`, `ROLE_CHANGED`, `BLOCKED`, `UNBLOCKED`. Auto-cleanup > `AUDIT_LOG_RETENTION_DAYS` (90).
- **Local MCP (dev)** — `.mcp.json` register `app-mcp` + `playwright`. `MCP_SECRET` readonly, `MCP_SECRET_ADMIN` write.

## File Health (MUTLAK)

Batas per-tipe (baris/char, di atas global Rule 8): Route 150/6k · Service 300/12k · Repository 250/10k · Schema 200/8k · Types 300/10k · Utility 200/8k · Config 100/4k · Test 400/16k. **Hard limit global: 500 baris / 20k char** (kecuali generated/migration/seed/fixtures/mocks). Enforcement = global Rule 8.

## Scaling & Performance

- **Auth/query:** centralize `requireAuth()`/`unauthorized()`/`forbidden()` · `$transaction` multi-step · `parsePagination()` semua `findMany` (no `take`=bug); limit list 50, audit 100, search 20.
- **Cache:** Redis `withCache(key,ttl,fetcher)`/`invalidateCache(...)` TTL project list 60s, access/role 120s, token 30s (**jangan cache** vars+session) · soft delete (`deletedAt`) Project/User.
- **FE:** manualChunks + lazy routes + `defaultPreload:'intent'` · staleTime stable 5min/realtime 30s/static Infinity · optimistic + rollback `onError` · `useSession` `refetchInterval:60_000` → `UnauthorizedError` di `QueryCache.onError` → session null. **Docker:** deps→builder→runner (binary only), ~300-370MB.

## AI Contract (Wajib)

**Prinsip** (detail = global Rule 1-21): minimal diff · fix akar bukan gejala · satu masalah=satu perubahan · reversible. Baca simbol dulu, file utuh hanya jika <300 baris. Setelah fix: typecheck + test relevan.

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

Helpers: `createTestApp()`, `seedTestUser()`, `createTestSession()`, `cleanupTestData()`, `assertTestDb()`. Pola: `app.handle(new Request(url, {headers:{cookie:`session=${token}`}}))` → assert `res.status`.
