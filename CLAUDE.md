# envman — CLAUDE.md

## Runtime

Gunakan Bun di seluruh stack. `bun <file>` / `bun test` / `bun install` / `bunx <pkg>`. Bun auto-load `.env` — jangan pakai dotenv. Sebelum install npm package, cek apakah ada Bun native API.

Bun APIs yang dipakai: `Bun.password.hash/verify` (bcrypt), `Bun.RedisClient` (native), `Bun.file()` (zero-copy), `crypto.randomUUID()` (session token).

---

## Server

- `src/app.ts` — semua API routes (`createApp()`)
- `src/index.tsx` — server entry + Vite middleware (dev)
- `src/serve.ts` — dev entry: `bun --watch src/serve.ts`
- `src/server.prod.ts` — production entry (tanpa Vite/Babel). **Jangan compile `src/index.tsx`** — pull `@babel/core`.

**Binary compile:** `bun build src/server.prod.ts --compile --target=bun-linux-x64 --outfile server`

**Migration module:** `src/lib/migrate.ts` — zero npm dep, compatible `_prisma_migrations`. Jalan otomatis di startup (`MIGRATE_ON_STARTUP=true` default) sebelum `app.listen()`. `scripts/migrate.ts` = thin CLI wrapper.

ENV vars migration: `MIGRATE_ON_STARTUP` (default true), `MIGRATE_DATABASE_URL` (default `DIRECT_URL ?? DATABASE_URL`), `MIGRATIONS_DIR` (default `./prisma/migrations`), `MIGRATE_DB_RETRIES` (default 5, 2s delay).

---

## Database

PostgreSQL via Prisma v6. Client singleton: `src/lib/db.ts` (import `{ prisma }`). Schema: `prisma/schema.prisma`. Client di-generate ke `./generated/prisma`.

### Schema Models

- `User` (id, name, email, password, role, blocked, timestamps)
- `Session` (id, token, userId, expiresAt, createdAt)
- `AuditLog` (id, userId, action, detail, ip, createdAt)
- `Ticket` (id, title, description, status, priority, route, reporterId, assigneeId, timestamps, closedAt)
- `TicketComment` (id, ticketId, authorId, authorTag, body, createdAt)
- `TicketEvidence` (id, ticketId, kind, url, note, createdAt)
- `Project` (id, slug, name, description, tags[], timestamps)
- `Environment` (id, name, tags[], projectId, createdAt) — unique(projectId, name)
- `EnvVar` (id, key, value, isSecret, environmentId, timestamps) — unique(environmentId, key)
- `ProjectMember` (id, userId, projectId, role, createdAt) — unique(userId, projectId)
- `EnvironmentMember` (id, userId, environmentId, role?, createdAt) — unique(userId, environmentId). `role=null` = explicit DENY, role=OWNER/EDITOR/VIEWER = override, no record = inherit project role
- `ApiToken` (id, userId, name, token, scopes[], tags[], canWrite, isDisabled, lastUsedAt?, expiresAt?, createdAt, useCount, lastIp?, disabledBy?, disabledAt?, disabledReason?)
- `ProjectAlias` (id, projectId, name, args, description?, tags[], createdBy, timestamps) — unique(projectId, name)
- `ProjectFile` (id, projectId, authorId, title, description, prefix?, files Json, tags[], timestamps) — unique(projectId, prefix)
- `PortainerConnection` (id, name, portainerUrl, apiToken, createdById, timestamps) — global
- `PortainerConfig` (id, projectId, envName, connectionId?, portainerUrl?, apiToken?, stackId, stackName, endpointId, lastSyncAt?, lastSyncOk?, timestamps)
- `AppSetting` (key PK, value, updatedAt, updatedById?) — konfigurasi global runtime, diubah via Dev > Settings
- `Gist` (id, userId, title, description, files Json `[{filename, content, language}]`, isPublic, tags[], timestamps) — snippet multi-file. `isPublic=false` (default) = private milik owner; `isPublic=true` = terlihat user lain. Edit/delete: owner atau SUPER_ADMIN.

### Enums

- `Role` = `USER | QC | ADMIN | SUPER_ADMIN`
- `ProjectMemberRole` = `OWNER | EDITOR | VIEWER`
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

### Aturan Migrasi Database (KETETAPAN MUTLAK)

**Setiap perubahan `prisma/schema.prisma` WAJIB diikuti langkah berikut — tanpa terkecuali:**

#### 1. Buat migration SQL manual

Buat folder baru di `prisma/migrations/` dengan format `YYYYMMDDHHMMSS_deskripsi_singkat/migration.sql`.

**Aturan penulisan SQL:**
- Nama tabel pakai **lowercase** — semua tabel di project ini lowercase (contoh: `"environment"`, bukan `"Environment"`)
- Selalu pakai `IF NOT EXISTS` / `IF EXISTS` agar idempotent (aman di-rerun di env yang sudah `db push` manual)
- Kolom NOT NULL di tabel berisi data: wajib kasih `DEFAULT` atau `UPDATE` backfill dulu
- Sertakan comment singkat: *kenapa* ditambah, bukan *apa*

```sql
-- Contoh kolom baru
ALTER TABLE "environment" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';

-- Contoh index baru
CREATE INDEX IF NOT EXISTS "idx_environment_tags" ON "environment" USING GIN ("tags");

-- Contoh hapus kolom
ALTER TABLE "environment" DROP COLUMN IF EXISTS "deprecated_field";
```

#### 2. Jalankan migrasi di local dev — WAJIB sebelum commit

```bash
bun run db:migrate    # bunx prisma migrate dev — terapkan migration + regenerate client
```

Jangan commit schema change tanpa menjalankan `bun run db:migrate` terlebih dahulu. Migration yang belum dijalankan di local = migration yang belum terbukti valid.

#### 3. Regenerate Prisma client

`bun run db:migrate` sudah include generate. Jika hanya perlu generate tanpa migrate:
```bash
bun run db:generate   # bunx prisma generate
```

#### 4. Verifikasi

Setelah migrasi berhasil, pastikan:
- Tidak ada error di `bun run typecheck`
- Server dev bisa start tanpa error
- Migration file ada di `prisma/migrations/` dan sudah di-commit

**Kenapa wajib:** Server production menjalankan migrasi otomatis saat startup (`MIGRATE_ON_STARTUP=true`). Jika migration file tidak ada atau SQL-nya salah, server crash saat deploy. Migration yang sudah diuji di local = deploy yang aman.

**❌ Larangan:**
- Schema change tanpa migration file
- Commit migration file tanpa menjalankan `bun run db:migrate` di local
- Pakai `bun run db:push` sebagai pengganti migration (db push tidak buat migration file)
- Nama tabel PascalCase di SQL (harus lowercase sesuai konvensi project ini)

---

### Secret Encryption

Vars dengan `isSecret=true` dienkripsi AES-256-GCM. `MASTER_KEY` = 64-char hex. Format: `enc:<iv>:<cipher>:<tag>`. Impl: `src/lib/crypto.ts`. VIEWER lihat `***`; EDITOR/OWNER bisa reveal.

### Seed Users (dev only)

| Email | Password | Role |
|-------|----------|------|
| `superadmin@example.com` | `superadmin123` | SUPER_ADMIN |
| `admin@example.com` | `admin123` | ADMIN |
| `user@example.com` | `user123` | USER |

`prisma/seed-dev.ts` — gitignored, guard `NODE_ENV !== 'development'` → exit 1.

---

## Auth

Session-based (HttpOnly cookie + DB). `POST /api/auth/login` → bcrypt verify → Session record. Google OAuth: `/api/auth/google`. Blocked → 403, sessions dihapus. Dev: `GET /api/dev-auth/login-as/:email`.

---

## Routing Rules (Ketetapan Mutlak)

**Static routes wajib** untuk semua navigasi yang merepresentasikan lokasi dalam hierarki data.

- Static route `/path/:param` untuk: navigasi antar resource, URL yang bisa bookmark/share/reload
- Search params `?key=value` **hanya** untuk view state satu halaman (tab aktif, filter, sort)

**Larangan keras:**
- ❌ `useState` untuk navigasi antar halaman/resource
- ❌ Search params sebagai pengganti path params untuk resource hierarchy
- ❌ "Temporary routes" yang hilang saat reload

### Route Structure

```
/envmanager                    → project list
/envmanager/tokens             → tokens page
/envmanager/connections        → global Portainer connections
/envmanager/:slug              → project detail (?tab=environments|notes|aliases OK)
/envmanager/:slug/:env         → vars page (?integrations=true, ?compare=true OK)
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

Akses ke resource project diatur dua lapis. Default: env, notes, aliases, dan files **inherit** dari `ProjectMember.role`. OWNER bisa **override** role per env atau set **DENY** explicit per env per user.

### Secure-by-Default Member Onboarding

Saat member ditambah dengan role **EDITOR/VIEWER** (POST `/api/envman/projects/:slug/members`), server otomatis insert `EnvironmentMember` dengan `role=null` (DENY explicit) untuk **semua env existing** di project. Konsekuensi: member baru **tidak punya akses apapun** sampai OWNER eksplisit grant per-env via matrix view atau env-members endpoint. Tujuannya mencegah kekeliruan tidak sengaja memberi akses penuh ke env produksi.

Aturan:
- Role **OWNER** baru → tidak default-deny (OWNER otomatis dapat akses semua env, sesuai semantik OWNER).
- Update role member existing (re-POST dengan userId sama) → tidak touch env override; preserve override yang sudah ada.
- Saat env baru dibuat (POST `/api/envman/projects/:slug/environments`), semua project member non-OWNER otomatis di-deny di env baru tsb. OWNER member tidak terpengaruh.
- Response `POST /members` carry `defaultDenied: boolean` agar UI bisa konfirmasi behavior.

### Resolver

`getEnvironmentAccess(userId, role, slug, envName)` di `src/lib/access.ts`:

1. SUPER_ADMIN → `OWNER` (selalu).
2. Cek `EnvironmentMember` (userId, environmentId):
   - `role = null` → `null` (DENIED — block all access ke env ini)
   - `role = OWNER|EDITOR|VIEWER` → override
   - tidak ada record → lanjut ke step 3
3. Inherit `ProjectMember.role`. Tidak ada record → `null` (no access).

### Defense-in-Depth

Files & aliases tetap accessible di project level (bukan filtered out), tapi yang **reference env via `-e project:env`** akan tetap di-block di env layer:

- **Vars endpoint** — semua handler vars panggil `getEnvironmentAccess()`. DENIED env → 403.
- **Alias resolve** — `GET /api/envman/aliases/resolve/:ref` extract `-e project:env` refs dari `args` lewat `extractEnvRefs()` (`src/lib/alias-parser.ts`), cek akses caller di setiap env. Kalau ada yang denied → 403 dengan `{error, deniedEnvs: [{project, env}]}`. Alias list endpoint juga compute `requiresEnvs` + `deniedEnvs` per-alias per-user (di luar Redis cache, karena per-caller).
- **Project detail** — `GET /api/envman/projects/:slug` filter env DENIED untuk non-OWNER; setiap env carry `accessRole` (effective role caller di env tsb).

### CLI Behavior

`apiFetch()` di `src/cli.ts` detect 403 dengan `deniedEnvs` array → cetak `[envman] Akses ditolak untuk env: <project:env>, ...` lalu exit 1. User di-arahkan kontak OWNER project.

### UI

- Project detail (`envmanager.$slug.index.lazy.tsx`): env card render badge `DENIED` (red filled) atau badge override `<role>` (grape, kalau berbeda dari project role caller).
- MembersPanel: setiap member punya chevron expand → `MemberEnvOverrides` (`src/frontend/components/slug/MemberEnvOverrides.tsx`) render select per-env dengan opsi `inherit | OWNER | EDITOR | VIEWER | denied`, hanya OWNER yang bisa mutate.
- AliasesPanel: alias yang punya `deniedEnvs.length > 0` render Badge merah "needs <env>" dan sembunyikan CopyButton (alias tidak bisa dipakai user ini).
- Users Management (`envmanager.users.lazy.tsx` → `AccessMatrixTab`): tampilan **collapsible row** per project (`ProjectAccessRow`) — default tertutup, render badge counts (OWNER/EDITOR/VIEWER/denied/override) di header. Stats global di atas (`AccessStatsHeader`). Default filter `with-access`, sort by name/role/overrides, section "no access" collapsed default.

### Admin Endpoint Parity

`PUT /api/envman/admin/users/:userId/projects/:slug/envs/:envName` (SUPER_ADMIN) tunduk pada **kontrol yang sama** dengan OWNER endpoint:
- Validasi target user harus project member (400 kalau belum).
- Last-owner-of-env protection: tolak demote/deny OWNER terakhir efektif di env (400).
- Emit audit event yang sama (`ENV_MEMBER_SET` / `ENV_MEMBER_CLEARED`) dengan suffix detail `(admin)`.
- Invalidate `projectAccess`, `projectDetail`, dan `invalidateProjectCaches(slug, [userId])`.

### Audit Events

- `ENV_MEMBER_SET` — detail OWNER: `<slug>/<envName> user=<userId> role=<role>`, detail SUPER_ADMIN: `... role=<role> (admin)`
- `ENV_MEMBER_CLEARED` — detail OWNER: `<slug>/<envName> user=<userId>`, detail SUPER_ADMIN: `... (admin)`

### Cache Invalidation

PUT/DELETE env-member invalidate `cacheKeys.projectAccess(userId, slug)` + `cacheKeys.projectDetail(slug)`, dan call `invalidateProjectCaches(slug, [userId])`.

---

## API Reference

### Admin API (SUPER_ADMIN only)

- `GET /api/admin/users` — list users
- `PUT /api/admin/users/:id/role` — change role
- `PUT /api/admin/users/:id/block` — block/unblock (delete sessions + disable tokens on block)
- `GET /api/admin/presence` — online user IDs
- `GET /api/admin/logs/app` — app logs (filter: level, limit, afterId)
- `GET /api/admin/logs/audit` — audit logs (filter: userId, action, limit)
- `DELETE /api/admin/logs/app|audit` — clear logs
- `GET /api/admin/tokens` — list semua token lintas user (filter: userId, status, canWrite, limit)
- `PATCH /api/admin/tokens/:id` — admin action: disable/enable/set-expiry (body: `{action, reason?, expiresAt?}`)
- `DELETE /api/admin/tokens/:id` — force revoke token (audit TOKEN_REVOKED_BY_ADMIN)
- `GET /api/admin/file-health` — health check ukuran file source
- `GET /api/admin/routes|project-structure|env-map|test-coverage|dependencies|migrations|sessions|schema`

### Tickets API

Status: `OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED` (+ `REOPENED`).
- `GET|POST /api/tickets` — list/create
- `GET|PATCH /api/tickets/:id` — detail/update
- `POST /api/tickets/:id/comments|evidence`

Frontend: `src/frontend/components/TicketsPanel.tsx`

### Envman API

Auth: session cookie atau `Authorization: Bearer <token>`. `requireEnvAuth()` di `src/app.ts`.

**Projects:** `GET|POST /api/envman/projects`, `PATCH|GET /api/envman/projects/:slug`

**Vars:** `GET /api/envman/projects/:slug/environments/:env/vars` (search, limit, offset) · `GET .../vars/export` (EDITOR+) · `POST|PUT|DELETE .../vars/:key`

**Environments:** `POST|DELETE|PATCH /api/envman/projects/:slug/environments[/:env]`

**Members:** `PUT|DELETE /api/envman/projects/:slug/members/:userId/role|member`

**Env Members (OWNER only):** `GET /api/envman/projects/:slug/environments/:envName/members` — list project members + env override (envRole: `inherit`/`denied`/role) + `effectiveRole` · `PUT .../members/:userId` body `{role: 'inherit'|'denied'|'OWNER'|'EDITOR'|'VIEWER'}` · `DELETE .../members/:userId` reset to inherit. Last-owner-of-env protection: tidak bisa demote/deny OWNER terakhir.

**Access Matrix (OWNER only):** `GET /api/envman/projects/:slug/access-matrix` — single fetch berisi `{project, environments[], members[{userId, user, projectRole, envAccess: {[envName]: {envRole, effectiveRole}}}]}`. Cached 60s (`cacheKeys.projectAccessMatrix`), auto-invalidate via `invalidateProjectCaches()`. Bulk action di FE pakai fan-out `Promise.allSettled` atas endpoint PATCH/PUT existing — last-owner protection berlaku per-item, partial failure di-aggregate ke notification (`src/frontend/lib/bulk.ts`).

**Portainer:** `GET|POST /api/envman/portainer/connections` · `PUT|DELETE .../connections/:id` · `POST .../connections/:id/probe` · per-env: `GET|PUT|DELETE|POST .../portainer[/sync]`

**Files:** `GET|POST /api/envman/projects/:slug/files` · `GET .../files/resolve?prefix=<p>[&filename=<f>]` · `PUT|DELETE .../files/:id`

**Aliases:** `GET|POST /api/envman/projects/:slug/aliases` · `PATCH|DELETE .../aliases/:name` · `GET /api/envman/aliases/resolve/:ref`

**Tokens:** `GET|POST /api/envman/tokens` · `PATCH|DELETE /api/envman/tokens/:id` · `PATCH .../toggle` · `GET .../reveal` · `POST .../rotate` · `GET /api/envman/whoami`

**Gists:** `GET /api/envman/gists` (session — list milik sendiri + public milik user lain; `?limit&cursor&search&filter`) · `POST /api/envman/gists` (butuh capability `gist:create`; body `{title, description, files[], isPublic, tags[]}`) · `PUT|DELETE /api/envman/gists/:id` (owner atau SUPER_ADMIN) · `GET /api/envman/gists/:id/raw/:filename` (raw plaintext, owner/public). Menu di sidebar gated capability `menu:gists`.

**Public Gists (no auth):** `GET /api/public/gists` (list semua public; `?limit&cursor&search&tags&sort`) · `GET /api/public/gists/:id` (single, 403 jika private) · `GET /api/public/gists/:id/raw/:filename` (raw plaintext).

**Conditional caching (read-resource):** endpoint baca-resource mengirim `ETag` + `Cache-Control` (+ `Last-Modified` bila resource punya timestamp) dan mendukung `If-None-Match` / `If-Modified-Since` → `304 Not Modified` (If-None-Match diutamakan, RFC 9110). Helper reusable: `src/lib/http-cache.ts` (`strongEtag`, `weakEtag`, `conditional`, `notModifiedResponse`). `conditional(req, {etag, lastModified?, cacheControl?})` — `lastModified` opsional (resource statis-deterministik divalidasi via ETag saja), `cacheControl` default `private, no-cache`.

Endpoint yang di-cover:
- `GET .../gists/:id/raw/:filename` (auth & public) — strong ETag (hash konten file), Last-Modified `gist.updatedAt`.
- `GET /api/public/gists/:id` — weak ETag (`W/"<hash id:updatedAt>"`).
- `GET .../files/resolve?prefix=&filename=` — weak ETag (`hash entry.id:updatedAt:filename`), Last-Modified `entry.updatedAt`. Log `logTokenActivity` tetap jalan sebelum cek conditional (304 tetap dihitung akses). Bentuk JSON body tidak berubah.
- `GET .../aliases/resolve/:ref` — weak ETag (`hash alias.id:updatedAt:userId`). **userId masuk hash** karena response per-caller (`deniedEnvs`/`requiresEnvs`) — cegah kebocoran cache cross-user. Cek akses + denied env dijalankan sebelum conditional.
- `GET /api/docs.md` — strong ETag (hash markdown), `Cache-Control: public, max-age=300`, tanpa Last-Modified.

**Tidak di-cover (sengaja):** endpoint vars (jangan cache env vars), session, list endpoint, dan binary download `/download/cli/:platform` (sudah version-gated via `/download/cli/version`).

**Settings:** `GET /api/envman/settings` (public, semua setting sebagai key-value map) · `PUT /api/envman/settings` (SUPER_ADMIN, body: `[{key, value}]`) — key yang valid: `user_token_creation` (boolean string), `user_token_max_days` (number string)

### Auth Endpoints

- `POST /api/auth/login` — email/password
- `GET /api/auth/google` → `GET /api/auth/callback/google`
- `GET /api/auth/session` — current user or 401
- `POST /api/auth/logout`
- `GET /api/dev-auth/login-as/:email` — dev only

### WebSocket

- `WS /ws/presence` — real-time presence (session cookie auth)

---

## Frontend

React 19 + Vite 8 (middleware mode dev). File-based routing: TanStack Router.

- `src/frontend.tsx` — renders App, removes splash, DevInspector in dev
- `src/frontend/App.tsx` — MantineProvider, ModalsProvider, QueryClientProvider, RouterProvider

### Routes (`src/frontend/routes/`)

- `__root.tsx` — root layout
- `index.tsx` — landing page
- `login.tsx` — email/password + Google OAuth
- `dev.tsx` — dev console (SUPER_ADMIN)
- `dashboard.tsx` — admin dashboard (ADMIN+)
- `envmanager.tsx` — AppShell sidebar layout (ADMIN+)
- `envmanager.index.tsx` — `/envmanager` project list; search+tag filter persist `localStorage`
- `envmanager.tokens.lazy.tsx` — `/envmanager/tokens`
- `envmanager.connections.tsx` — `/envmanager/connections`
- `envmanager.$slug.tsx` — pure `<Outlet />`
- `envmanager.$slug.index.tsx` — project detail (environments + notes + aliases tabs)
- `envmanager.$slug.$env.tsx` — vars page; Portainer+History via Drawer (`?integrations=true`)
- `profile.tsx` — all authenticated users
- `blocked.tsx`

### Components (`src/frontend/components/`)

- `CodeEditor.tsx` + `MonacoCodeEditor.tsx` — Monaco lazy-load (~1MB gzipped), Suspense, mobile fallback ke Textarea
- `ThemeToggle.tsx` — dark/light toggle
- `TicketsPanel.tsx` — shared `/dev` + `/dashboard`
- `PortainerSync.tsx`
- `slug/AliasesPanel.tsx` — aliases tab
- `slug/FilesPanel.tsx` — files tab (multi-file, Markdown preview, search, tag filter, pagination)
- `env/CompareModal.tsx` — bandingkan .env local vs envman vars

### Hooks

- `src/frontend/hooks/useAuth.ts` — `useSession()`, `useLogin()`, `useLogout()`, `getDefaultRoute(role)`
- `src/frontend/hooks/usePresence.ts` — WebSocket, `onlineUserIds`

### UI Patterns

- Sidebar: collapsible 260px → 60px, state `localStorage`
- Dark/Light: auto device pref, flash-free via inline script di `<head>`
- Tag colors: deterministik via hash (`tagColor(tag)` di `envmanager.index.tsx`), `variant="light"`

---

## CLI

Standalone binary. Entry: `src/cli.ts`. Build: `bun run build:cli` → `dist/cli/envman-{platform}` + `.gz`.

### Auth Resolution (priority: high → low)

1. `ENVMAN_SERVER` + `ENVMAN_TOKEN` dari file `-e`
2. `ENVMAN_SERVER` + `ENVMAN_TOKEN` sebagai system env
3. `~/.config/envman/config.json` (dari `envman login`)

`ENVMAN_SERVER` dan `ENVMAN_TOKEN` selalu di-strip dari child process env.

### Commands

```bash
envman login <server-url> --token <token>
envman logout
envman whoami
envman run [-e <source>]... <project>:<alias>
envman [options] -- <command>
envman pm daemon <start|stop|status>
envman pm <subcommand>
envman mcp [--write] [--debug]
```

### Download

`GET /download/cli/:platform` — content negotiation: `Accept-Encoding: gzip` → return `.gz` (~60% lebih kecil).

### File Execution

Script di `ProjectFile` bisa di-execute langsung tanpa write ke disk — content di-pipe ke stdin.

**Canonical syntax (WAJIB):**
```bash
envman -- bash myapp:scripts/deploy.sh       # slug:prefix/file.ext
envman -- bun myapp:utils/seed.ts
envman -e myapp:prod -- bash myapp:scripts/deploy.sh
```

**Disambiguasi:** Setelah colon: ada `/` ATAU ada extension → **file reference**. Sisanya → **environment name**.

**Legacy syntax (`files:`) — JANGAN dipakai di code baru.** Server + CLI tetap support untuk backward compat.

Interpreter stdin (zero disk write): `bash`, `sh`, `zsh`, `bun`, `node`, `python3`, `python`, `deno`. Lainnya → temp file 0600.

Bun scripts bisa langsung import npm tanpa `node_modules` — CLI auto-pass `--install=fallback`. Pin versi inline: `import { z } from "zod@^3.22"`.

**❌ Jangan tulis `files:X`** di MCP tool descriptions, alias args baru, atau docs baru.

### Alias Expansion

`envman run myapp:deploy` → fetch args via `GET /api/envman/aliases/resolve/myapp:deploy`, re-parse. Extra `-e` di-merge sebelum stored sources (stored wins).

### Options

```
-e <project>:<env>   Fetch vars dari server
-e <file>            Load vars dari file lokal
--server-wins        System env override merged vars (default: merged wins)
```

### Response Caching

`apiFetch(cfg, path, opts?)` di `src/cli.ts` punya conditional cache **opt-in** (`opts.cache=true`, default `false`). Saat aktif: baca cache `(server, path)` → kirim `If-None-Match: <etag>` → kalau server balas `304` sajikan body dari disk; kalau `200 + ETag` tulis cache. Implementasi disk cache: `src/cli/response-cache.ts`.

- Cache dir: `~/.config/envman/cache/`, nama file `sha256(server+path).base64url.json`, ditulis atomik (tmp+rename) **mode 0600** (body bisa berisi konten file project).
- `pruneIfNeeded()` batasi ≤200 entri (hapus tertua by mtime).
- Diaktifkan HANYA di hot-path konten aman: `files/resolve` dan `aliases/resolve`. **`whoami`, vars, dan call lain tetap non-cache** (jaga env vars tidak ter-cache di disk).
- Fallback: kalau `304` tapi cache hilang (race), re-fetch tanpa conditional.

Efek: `envman -- bash myapp:scripts/x.sh` / `envman run myapp:deploy` berulang hanya transfer `304` saat konten tak berubah.

---

## Process Manager (`envman pm`)

Native Bun process manager. File: `src/pm/{shared,daemon,cli}/`. Daemon socket: `~/.config/envman/run/daemon.sock` (chmod 0600 + header token auth).

```bash
envman pm daemon start|stop|status
envman pm start --name X [-s project:env]... -- <cmd>
envman pm ls|describe|stop|restart|delete|reset|save|sync|logs <name>
```

Supervisor: auto-restart, exponential backoff 1s→60s, quarantine setelah 5 restarts/60s. Log rotation 10MB×5. State: atomic tmp+rename + .bak.

Audit events → `POST /api/envman/pm/audit`: `PM_DAEMON_*`, `PM_PROCESS_*`, `PM_SYNC_TRIGGERED`.

---

## MCP Server (`envman mcp`)

Stdio MCP built into CLI binary. Auth: `ENVMAN_SERVER`/`ENVMAN_TOKEN` atau `~/.config/envman/config.json`.

Setup `.mcp.json`:
```json
{ "mcpServers": { "envman": { "command": "envman", "args": ["mcp"] } } }
```

**Readonly (15 tools):** `whoami`, `server_info`, `projects_list`, `project_get`, `vars_list`, `vars_export`, `vars_diff`, `aliases_list`, `alias_resolve`, `files_list`, `file_resolve`, `pm_daemon_status`, `pm_list`, `pm_describe`, `pm_logs`

**Write (13 tools, requires `--write` + token canWrite=true):** `var_set/delete`, `alias_create/update/delete`, `file_create`, `pm_start/stop/restart/reset/delete/sync`, `pm_daemon_start/stop`

All write calls emit `MCP_*` audit events.

---

## Infrastructure

### Redis

Client singleton: `src/lib/redis.ts` → `REDIS_URL`. App logs: Redis List `app:logs` (max 500 via LTRIM). Module: `src/lib/applog.ts`.

### Logging

**App Logs** — Redis ring buffer 500 entries. Logs API requests, errors, auth events via `onAfterResponse`.

**Audit Logs** (DB `AuditLog`) — persistent. Actions: `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `LOGIN_BLOCKED`, `ROLE_CHANGED`, `BLOCKED`, `UNBLOCKED`. Auto-cleanup > `AUDIT_LOG_RETENTION_DAYS` (default 90).

### Local MCP Server (dev tools)

`.mcp.json` registers `app-mcp` (`scripts/mcp/server.ts`) + `playwright`. Tools: `scripts/mcp/tools/`. `MCP_SECRET` = readonly, `MCP_SECRET_ADMIN` = write + dev automation.

### Dev Tools

Click-to-source: `Ctrl+Shift+Cmd+C`. `REACT_EDITOR` env var. HMR: Vite 8 + `@vitejs/plugin-react` v6.

---

## File Health (Ketetapan Mutlak)

| Tipe | Maks Baris | Maks Char |
|------|-----------|-----------|
| Route handler | 150 | 6k |
| Service/use-case | 300 | 12k |
| Repository/query | 250 | 10k |
| Schema/validation | 200 | 8k |
| Types/interfaces | 300 | 10k |
| Utility/helper | 200 | 8k |
| Config | 100 | 4k |
| Test file | 400 | 16k |

**Hard limit global: 500 baris / 20k char** (kecuali generated files).

**AI wajib:**
1. Tolak tambah kode ke file yang mendekati/melebihi batas (kecuali < 10 baris)
2. Proaktif sarankan refactor sebelum tambah fitur ke file tidak sehat
3. Jangan "helper dump" — setiap helper punya file sendiri yang spesifik
4. Buat file baru jika implementasi baru tidak alami masuk ke file yang ada
5. Periksa ukuran file sebelum edit — jika > 80% batas, sarankan pecah

**Larangan:** God file (>1 route group/file), mix bisnis logik + transport, mix type + impl dalam file panjang.

**Pengecualian:** `*.generated.ts`, `*.migration.ts`, `*.seed.ts`, `__fixtures__/`, `__mocks__/`.

---

## Scaling & Performance

### Phase 1 — Fondasi

- Pecah `app.ts` saat > 300 baris ke `src/routes/`
- Centralize auth: `requireAuth()`, `unauthorized()`, `forbidden()` di `src/lib/auth-middleware.ts`
- `prisma.$transaction([...])` untuk operasi multi-step
- `parsePagination()` di semua `findMany` — tidak boleh ada `findMany` tanpa `take`
- Limit: list 50, audit log 100, search 20

### Phase 2 — Reliability

- Setiap endpoint: minimal 3 test (happy path + unauthorized + invalid/not found)
- Redis cache: `withCache(key, ttl, fetcher)`, `invalidateCache(...keys)`. TTL: project list 60s, access/role 120s, token 30s. **Jangan cache** env vars + session.
- Soft delete (`deletedAt DateTime?`) untuk Project, User penting
- `/api/v1/` untuk breaking changes; additive tidak perlu bump

### Phase 3 — Performance (hanya jika ada data bottleneck)

- Cache-Control: hashed assets → `max-age=31536000, immutable`; `index.html` → `must-revalidate`
- TanStack Query staleTime per tipe: stable=5min, realtime=30s, static=Infinity
- Optimistic updates dengan rollback di `onError`
- Cursor-based pagination untuk list panjang

### Frontend Bundle

```typescript
// vite.config.ts manualChunks
if (id.includes('node_modules/react')) return 'react'
if (id.includes('node_modules/@mantine')) return 'mantine'
if (id.includes('node_modules/@tanstack')) return 'tanstack'
if (id.includes('node_modules/react-icons')) return 'icons'
if (id.includes('node_modules/')) return 'vendor'
```

Lazy routes (`createLazyFileRoute`) untuk halaman non-kritikal. `defaultPreload: 'intent'`.

### Docker Multi-Stage

3 stages: deps → builder (Prisma generate + Vite build + binary compile) → runner (binary only, no node_modules). Server ~300-370MB vs ~600-700MB.

### Session & 401

- `refetchInterval: 60_000` untuk `useSession`, redirect saat `user: null`
- `UnauthorizedError` di `QueryCache.onError` → set session ke null

### Anti-patterns

| ❌ Jangan | ✅ Gantinya |
|---|---|
| `findMany` tanpa `take` | `parsePagination()` |
| Auth copy-paste | `requireAuth()` |
| Multi-step DB tanpa transaction | `prisma.$transaction` |
| Hard delete data penting | soft delete `deletedAt` |
| Catch error tanpa feedback | `notifyErr(e)` |
| Optimistic update tanpa rollback | `onError` + context rollback |

---

## AI Contract (Wajib Dipatuhi)

### Prinsip Dasar

1. **Minimal diff, maximal pemahaman.** Baca sebelum ubah. Jangan refactor yang tidak diminta.
2. **Fix akar, bukan gejala.** Penyebab di layer B → perbaiki B, bukan tambal di A.
3. **Satu masalah = satu perubahan logis.** Jangan campur fix + refactor + fitur.
4. **Tidak ada asumsi diam-diam.** Tanya atau baca kode — jangan tebak.
5. **Setiap perubahan harus reversible.** Diff kecil, commit jelas.
6. **Context adalah sumber daya.** Baca hemat — minimal token, maximal pemahaman.

### Cara Membaca Kode

1. Simbol dulu (signature, referensi) — bukan file utuh
2. Range baris yang relevan — bukan dari baris 1
3. Baca utuh **hanya jika** file < 300 baris, atau benar-benar perlu

**❌ Larangan:** Baca file utuh refleks, baca ulang file yang sudah di context, telan file > 500 baris tanpa alasan.

### Saat Fix Bug

- Reproduksi di kepala dulu. Temukan akar sebenarnya.
- Perbaiki sekecil mungkin. Jangan try/catch untuk sembunyikan error.
- Jangan tambah fallback spekulatif. Jangan rename/reorder di sekitar fix.
- Setelah fix: typecheck + test relevan.

### Yang Dilarang

- ❌ Silent catch (`catch (e) {}`)
- ❌ Comment-out kode sebagai "backup"
- ❌ Copy-paste antar file
- ❌ Duplikasi util/helper/hook yang sudah ada
- ❌ Destructive git (`reset --hard`, `push --force`, `clean -fdx`) tanpa instruksi eksplisit
- ❌ Skip hook (`--no-verify`)
- ❌ Ubah schema tanpa migration file
- ❌ Tambah dependency tanpa izin
- ❌ Hardcode credential/secret/URL prod

### Kontrak Public API

Freeze: nama endpoint/tool, nama+tipe parameter, required fields, enum values, format error response, bentuk output.

Boleh additive: endpoint baru, optional param baru, output field baru, refactor internal.

**❌ Jangan rename/hapus enum/naikkan optional→required/ubah format error** tanpa bump versi.

### Eskalasi

Stop dan tanya user jika: fix butuh > 5 file, ketemu bug lain di tengah jalan, perubahan menyentuh data produksi/session aktif, instruksi user bertentangan dengan docs.

### Aturan Emas

> Lebih baik tidak melakukan apa-apa daripada memperburuk kode.
> Kalau setelah 2x percobaan fix masih muncul bug baru — **STOP**, lapor ke user.

---

## Aturan Penambahan Fitur (Ketetapan Mutlak)

**Setiap fitur baru WAJIB disertai:**

1. **Test** — minimal integration test: happy path + unauthorized + invalid/not found. Di `tests/integration/` atau `tests/unit/`.
2. **MCP tool dev** — tambahkan tool di `scripts/mcp/tools/` untuk inspect/manipulasi data di development.
3. **MCP tool stg** — readonly counterpart di MCP server staging untuk inspeksi data tanpa write access destruktif.

**Skala MCP tool:** CRUD baru → min `list_<entity>` + `get_<entity>`; background job → inspect queue + cancel/retry (dev only mutate).

**❌ Larangan:** Commit fitur tanpa test; MCP stg dengan write access; skip salah satu dari ketiganya.

---

## Aturan Update Dokumentasi (Ketetapan Mutlak)

**Setiap perubahan business logic WAJIB update `CLAUDE.md` dalam commit yang sama.**

Business logic = aturan auth/otorisasi, status machine, validasi domain, kontrak API publik, behavior CLI, enkripsi/keamanan, routing rules, skema DB.

BUKAN business logic (boleh skip) = refactor internal, optimasi performa, logging/observability, styling murni, update dependency tanpa breaking change.

**❌ Larangan:** Merge PR yang ubah business logic tanpa update doc; "update doc nanti di PR terpisah"; update doc tapi skip tabel/section yang ada.

---

## Testing (KETETAPAN MUTLAK — Test DB Safety)

`tests/helpers.ts:cleanupTestData()` memanggil `deleteMany()` di **seluruh tabel**. Wajib dijalankan terhadap DB dengan nama diakhiri `_test`.

Guard runtime di `tests/helpers.ts` (via `assertTestDb()`) — refuse-to-run jika `DATABASE_URL` menunjuk DB non-test. **Jangan disable guard ini.**

```bash
# Setup sekali
createdb envman_test
DATABASE_URL='postgresql://USER:PASS@localhost:5432/envman_test' bunx prisma db push

# Run test
DATABASE_URL='postgresql://USER:PASS@localhost:5432/envman_test' bun run test
DATABASE_URL='postgresql://USER:PASS@localhost:5432/envman_test' bun run test:unit
DATABASE_URL='postgresql://USER:PASS@localhost:5432/envman_test' bun run test:integration
```

**AI notes:**
- Jangan jalankan `bun test` tanpa override DATABASE_URL ke `_test`
- Jika user tidak punya DB test, tawarkan setup — JANGAN reuse DB dev
- `bun run typecheck` aman kapan saja (tidak sentuh DB)

Helpers: `createTestApp()`, `seedTestUser()`, `createTestSession()`, `cleanupTestData()`, `assertTestDb()`.

Test pattern (Elysia tanpa server jalan):
```typescript
const app = createTestApp()
const res = await app.handle(new Request('http://localhost/api/...', {
  method: 'POST',
  headers: { cookie: `session=${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ... }),
}))
expect(res.status).toBe(200)
```
