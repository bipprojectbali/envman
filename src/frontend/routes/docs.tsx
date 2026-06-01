import { Anchor, Box, Button, Container, Group, Text, ThemeIcon } from '@mantine/core'
import { createFileRoute, Link } from '@tanstack/react-router'
import { TbBook, TbLayoutDashboard, TbLogin, TbVariable } from 'react-icons/tb'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'
import 'github-markdown-css/github-markdown.css'

export const Route = createFileRoute('/docs')({
  component: DocsPage,
})

// ─── Markdown konten docs ─────────────────────────────────────────────────────
// Dipisah dari komponen agar bisa di-export juga via API endpoint /api/docs.md

export function buildDocsMarkdown(origin: string): string {
  return `# Env Manager — Dokumentasi Lengkap

> **Self-hosted environment variables manager** dengan enkripsi AES-256-GCM, CLI injection, Portainer sync, dan role-based access control.

- **Versi**: lihat [/api/hello](${origin}/api/hello)
- **Base URL**: \`${origin}\`
- **Raw docs**: \`${origin}/api/docs.md\`
- **OpenAPI**: belum tersedia — gunakan referensi endpoint di bawah

---

## Daftar Isi

1. [Konsep Dasar](#konsep-dasar)
2. [Role & Permission](#role--permission)
3. [CLI](#cli)
4. [API Reference](#api-reference)
   - [Auth](#auth)
   - [Env Manager — Projects](#env-manager--projects)
   - [Env Manager — Variables](#env-manager--variables)
   - [Env Manager — Environments](#env-manager--environments)
   - [Env Manager — Members](#env-manager--members)
   - [Env Manager — Tokens](#env-manager--tokens)
   - [Env Manager — Portainer](#env-manager--portainer)
   - [Env Manager — Gists](#env-manager--gists)
   - [Tickets](#tickets)
   - [Admin (SUPER_ADMIN)](#admin-super_admin)
   - [WebSocket](#websocket)
5. [Enkripsi Secret Vars](#enkripsi-secret-vars)
6. [Portainer Integration](#portainer-integration)
7. [Gists](#gists)
8. [Tickets](#tickets-1)
9. [Database Schema](#database-schema)
10. [Self-Hosting](#self-hosting)

---

## Konsep Dasar

Env Manager mengelola environment variables dalam hierarki tiga level:

\`\`\`
Project (slug unik, e.g. "myapp")
└── Environment (e.g. "production", "staging", "development")
    └── EnvVar (KEY=value, bisa plain atau secret/encrypted)
\`\`\`

**Project** diidentifikasi via \`slug\` — lowercase, alphanumeric, strip (\`my-app\`).
**Environment** bebas nama — bisa \`production\`, \`dev\`, \`docker\`, dll.
**Variable** unik per environment — satu KEY hanya bisa satu nilai per env.

### Auth Dua Layer

1. **Session** (browser) — cookie HttpOnly setelah login email/password atau Google OAuth
2. **API Token** (CLI/CI) — \`Authorization: Bearer <token>\` header

Semua endpoint \`/api/envman/*\` menerima keduanya via \`requireEnvAuth()\`.

---

## Role & Permission

### Role Global (akses ke aplikasi)

| Role | Default Route | Akses |
|------|--------------|-------|
| \`SUPER_ADMIN\` | \`/dev\` | Semua fitur + Dev Console + User management |
| \`ADMIN\` | \`/dashboard\` | Dashboard + Env Manager (buat project) |
| \`QC\` | \`/dashboard\` | Dashboard (tiket QC scope saja) |
| \`USER\` | \`/profile\` | Profile saja |

### Role Project (akses ke data vars)

| Role | Hak Akses |
|------|-----------|
| \`OWNER\` | Kontrol penuh — kelola member, hapus env, semua EDITOR permission |
| \`EDITOR\` | Tambah / edit / hapus vars, reveal secrets, export decrypted, config Portainer |
| \`VIEWER\` | Lihat vars (secrets tampil sebagai \`***\`), tidak bisa edit atau reveal |

### Transisi Status Tiket (role-gated)

| Dari → Ke | Aktor |
|-----------|-------|
| \`OPEN → IN_PROGRESS\` | ADMIN, SUPER_ADMIN |
| \`IN_PROGRESS → READY_FOR_QC\` | ADMIN, SUPER_ADMIN |
| \`READY_FOR_QC → CLOSED\` | QC, SUPER_ADMIN |
| \`CLOSED / READY_FOR_QC → REOPENED\` | QC, SUPER_ADMIN |

---

## CLI

### Instalasi

**One-liner (Linux & macOS, auto-detect platform):**

\`\`\`bash
curl -fsSL ${origin}/install | bash
\`\`\`

**Manual per platform:**

\`\`\`bash
# Linux x64
curl -sL ${origin}/download/cli/linux-x64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# Linux ARM64
curl -sL ${origin}/download/cli/linux-arm64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# macOS Apple Silicon (ARM64)
curl -sL ${origin}/download/cli/darwin-arm64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# macOS Intel (x64)
curl -sL ${origin}/download/cli/darwin-x64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# Windows x64 (PowerShell)
Invoke-WebRequest -Uri "${origin}/download/cli/windows-x64" -OutFile "envman.exe"
\`\`\`

Binary standalone — tidak butuh Node.js, npm, atau runtime lain.

---

### Commands

\`\`\`bash
envman login <server-url> --token <token>   # Simpan ke ~/.config/envman/config.json
envman logout                                # Hapus config tersimpan
envman whoami                                # Tampilkan user + server aktif
envman [options] -- <command>               # Inject vars & jalankan command
envman --version                             # Tampilkan versi CLI
envman --help                                # Bantuan
\`\`\`

---

### Flag Inject

| Flag | Format | Keterangan |
|------|--------|-----------|
| \`-e project:env\` | \`project:environment\` | Fetch vars dari server |
| \`-e file\` | path (tanpa titik dua sebagai separator project) | Load dari file lokal |
| \`--server-wins\` | — | System env menang vs merged vars (default: merged wins) |

**Aturan merge** — ketika multiple \`-e\` dipakai:
- Flag terakhir menang atas flag sebelumnya
- System env (process.env) menang atas hasil merge (kecuali pakai \`--server-wins\`)
- \`ENVMAN_SERVER\` dan \`ENVMAN_TOKEN\` selalu di-strip sebelum diteruskan ke child process

---

### Contoh Penggunaan

\`\`\`bash
# Single environment
envman -e myapp:production -- bun start

# Multiple — production override base
envman -e myapp:base -e myapp:production -- bun dev

# Mix server + local (local override server)
envman -e myapp:production -e .env.local -- bun dev

# Dua project berbeda sekaligus
envman -e project-a:production -e project-b:staging -- bun start

# Auth dari file lokal (bisa simpan ENVMAN_SERVER + TOKEN di sini)
envman -e .env.creds -e myapp:production -- bun dev

# CI/CD — auth via env vars, tanpa login
ENVMAN_SERVER=${origin} \\
ENVMAN_TOKEN=<TOKEN> \\
  envman -e myapp:production -- bun start

# GitHub Actions
# env:
#   ENVMAN_SERVER: ${origin}
#   ENVMAN_TOKEN: $\{{ secrets.ENVMAN_TOKEN }}
# run: envman -e myapp:production -- bun start

# System env menang (PORT=8080 system beats server PORT=3000)
PORT=8080 envman -e myapp:production -- bun start

# Server menang (PORT dari server beats system)
PORT=8080 envman --server-wins -e myapp:production -- bun start
\`\`\`

---

### Auth Resolution (prioritas tertinggi → terendah)

1. \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` dari vars di file \`-e\` (lokal)
2. \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` dari \`process.env\` / system env
3. \`~/.config/envman/config.json\` (disimpan oleh \`envman login\`)

---

## API Reference

### Autentikasi Request

Semua endpoint \`/api/envman/*\` dan \`/api/tickets/*\` memerlukan autentikasi via:

- **Cookie** \`session\`: dari login browser (set otomatis)
- **Header** \`Authorization: Bearer <token>\`: API token dari halaman Tokens

\`\`\`bash
# Contoh dengan curl menggunakan API token
curl -H "Authorization: Bearer ptr_abc123" \\
  ${origin}/api/envman/projects
\`\`\`

---

### Auth

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`POST\` | \`/api/auth/login\` | Public | Login email + password. Body: \`{email, password}\` |
| \`GET\` | \`/api/auth/google\` | Public | Redirect ke Google OAuth |
| \`GET\` | \`/api/auth/callback/google\` | Public | Callback OAuth (otomatis oleh Google) |
| \`GET\` | \`/api/auth/session\` | Optional | Return \`{user}\` atau \`401\` |
| \`POST\` | \`/api/auth/logout\` | Session | Hapus session aktif |
| \`GET\` | \`/api/dev-auth/login-as/:email\` | Dev only | Login instan via email (development saja) |

**Login response:**

\`\`\`json
{
  "user": {
    "id": "abc123",
    "name": "Alice",
    "email": "alice@example.com",
    "role": "ADMIN"
  }
}
\`\`\`

---

### Env Manager — Projects

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/projects\` | ADMIN+ | List semua project yang bisa diakses |
| \`POST\` | \`/api/envman/projects\` | ADMIN+ | Buat project baru |
| \`GET\` | \`/api/envman/projects/:slug\` | Member | Detail project + members + environments |
| \`DELETE\` | \`/api/envman/projects/:slug\` | OWNER | Hapus project (soft delete) |

**POST /api/envman/projects** body:

\`\`\`json
{
  "slug": "my-app",
  "name": "My App",
  "description": "Opsional"
}
\`\`\`

**GET /api/envman/projects response:**

\`\`\`json
{
  "projects": [
    {
      "id": "...",
      "slug": "my-app",
      "name": "My App",
      "description": null,
      "myRole": "OWNER",
      "_count": { "environments": 2, "vars": 15, "secrets": 3, "notes": 1 },
      "environments": [
        { "name": "production", "_count": { "vars": 10 } },
        { "name": "staging", "_count": { "vars": 5 } }
      ],
      "members": [{ "id": "..." }]
    }
  ]
}
\`\`\`

---

### Env Manager — Variables

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/projects/:slug/environments/:env/vars\` | VIEWER+ | List vars (secrets masked \`***\` untuk VIEWER) |
| \`GET\` | \`/api/envman/projects/:slug/environments/:env/vars/export\` | EDITOR+ | Export semua vars ter-decrypt |
| \`POST\` | \`/api/envman/projects/:slug/environments/:env/vars\` | EDITOR+ | Create atau update var (upsert by key) |
| \`PUT\` | \`/api/envman/projects/:slug/environments/:env/vars\` | EDITOR+ | Bulk import (replace semua) |
| \`PUT /api/envman/projects/:slug/environments/:env/vars/:key\` | EDITOR+ | Update satu var by key |
| \`DELETE\` | \`/api/envman/projects/:slug/environments/:env/vars/:key\` | EDITOR+ | Hapus satu var |
| \`PATCH\` | \`/api/envman/projects/:slug/environments/:env/vars/:key/toggle\` | EDITOR+ | Toggle isDisabled |

**GET vars response:**

\`\`\`json
{
  "vars": [
    {
      "id": "...",
      "key": "DATABASE_URL",
      "value": "postgres://...",
      "isSecret": false,
      "isDisabled": false,
      "updatedAt": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": "...",
      "key": "SECRET_KEY",
      "value": "***",
      "isSecret": true,
      "isDisabled": false,
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
\`\`\`

**POST /vars** — create atau update satu var:

\`\`\`json
{
  "key": "DATABASE_URL",
  "value": "postgres://user:pass@host:5432/db",
  "isSecret": false
}
\`\`\`

**PUT /vars** — bulk import (replace all):

\`\`\`json
{
  "vars": {
    "DATABASE_URL": "postgres://...",
    "REDIS_URL": "redis://...",
    "API_KEY": "secret-value"
  },
  "secrets": ["API_KEY"]
}
\`\`\`

Response: \`{ "count": 3 }\`

**PATCH /vars/:key/toggle** response:

\`\`\`json
{ "isDisabled": true }
\`\`\`

---

### Env Manager — Environments

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`POST\` | \`/api/envman/projects/:slug/environments\` | EDITOR+ | Buat environment baru |
| \`DELETE\` | \`/api/envman/projects/:slug/environments/:env\` | OWNER | Hapus environment + semua vars-nya |

**POST body:**

\`\`\`json
{ "name": "staging" }
\`\`\`

---

### Env Manager — Members

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`POST\` | \`/api/envman/projects/:slug/members\` | OWNER | Undang member baru |
| \`PUT\` | \`/api/envman/projects/:slug/members/:userId/role\` | OWNER | Ubah role member |
| \`DELETE\` | \`/api/envman/projects/:slug/members/:userId\` | OWNER | Hapus member dari project |

**POST /members body:**

\`\`\`json
{
  "email": "bob@example.com",
  "role": "EDITOR"
}
\`\`\`

**PUT /members/:userId/role body:**

\`\`\`json
{ "role": "VIEWER" }
\`\`\`

Valid roles: \`OWNER\`, \`EDITOR\`, \`VIEWER\`

---

### Env Manager — Tokens

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/tokens\` | Session/Token | List token milik user saat ini |
| \`POST\` | \`/api/envman/tokens\` | Session | Buat token baru |
| \`PATCH\` | \`/api/envman/tokens/:id\` | Session | Edit token |
| \`PATCH\` | \`/api/envman/tokens/:id/toggle\` | Session | Toggle aktif/nonaktif |
| \`DELETE\` | \`/api/envman/tokens/:id\` | Session | Hapus (revoke) token |
| \`GET\` | \`/api/envman/whoami\` | Token | Verifikasi token, return user info |

**POST /tokens body:**

\`\`\`json
{
  "name": "CI Production Deploy",
  "canWrite": false,
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "scopes": ["myapp:production", "myapp:staging"]
}
\`\`\`

- \`scopes\`: array string \`"project:env"\`. Kosong = akses ke semua project member.
- \`canWrite\`: false = read-only (fetch vars), true = bisa push vars ke server.
- \`expiresAt\`: ISO 8601, null = tidak expired.

**POST response:**

\`\`\`json
{
  "token": {
    "id": "...",
    "name": "CI Production Deploy",
    "token": "ptr_abc123...",
    "canWrite": false,
    "scopes": ["myapp:production"],
    "expiresAt": null,
    "createdAt": "..."
  }
}
\`\`\`

> ⚠️ Nilai \`token\` hanya ditampilkan **sekali** saat pembuatan. Simpan segera.

**GET /whoami response:**

\`\`\`json
{
  "user": {
    "id": "...",
    "name": "Alice",
    "email": "alice@example.com",
    "role": "ADMIN"
  },
  "token": {
    "name": "CI Production Deploy",
    "scopes": ["myapp:production"],
    "canWrite": false
  }
}
\`\`\`

---

### Env Manager — Portainer

#### Global Connections

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/portainer/connections\` | ADMIN+ | List semua Portainer connections |
| \`POST\` | \`/api/envman/portainer/connections\` | ADMIN+ | Buat connection baru |
| \`PUT\` | \`/api/envman/portainer/connections/:id\` | ADMIN+ | Update connection |
| \`DELETE\` | \`/api/envman/portainer/connections/:id\` | ADMIN+ | Hapus connection |
| \`POST\` | \`/api/envman/portainer/connections/:id/probe\` | ADMIN+ | Test koneksi + fetch daftar stacks |

**POST /connections body:**

\`\`\`json
{
  "name": "Production Portainer",
  "portainerUrl": "https://portainer.example.com",
  "apiToken": "ptr_xxx"
}
\`\`\`

**POST /connections/:id/probe response:**

\`\`\`json
{
  "ok": true,
  "stacks": [
    { "Id": 1, "Name": "myapp", "EndpointId": 1 }
  ]
}
\`\`\`

#### Per-Environment Config

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/projects/:slug/environments/:env/portainer\` | VIEWER+ | Get konfigurasi Portainer env ini |
| \`PUT\` | \`/api/envman/projects/:slug/environments/:env/portainer\` | EDITOR+ | Simpan konfigurasi |
| \`DELETE\` | \`/api/envman/projects/:slug/environments/:env/portainer\` | EDITOR+ | Hapus konfigurasi |
| \`POST\` | \`/api/envman/projects/:slug/environments/:env/portainer/sync\` | EDITOR+ | Push vars ke Portainer stack |

**PUT /portainer body:**

\`\`\`json
{
  "connectionId": "conn_abc",
  "stackId": 1,
  "stackName": "myapp",
  "endpointId": 1
}
\`\`\`

**POST /portainer/sync response:**

\`\`\`json
{
  "ok": true,
  "synced": 12
}
\`\`\`

---

### Env Manager — Gists

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/gists\` | Session | List gists (infinite, \`?limit=20&cursor=\`) |
| \`POST\` | \`/api/envman/gists\` | Session | Buat gist baru |
| \`PUT\` | \`/api/envman/gists/:id\` | Session (owner) | Update gist |
| \`DELETE\` | \`/api/envman/gists/:id\` | Session (owner) | Hapus gist |

**GET /gists query params:**

| Param | Default | Keterangan |
|-------|---------|-----------|
| \`limit\` | 20 | Jumlah per page |
| \`cursor\` | — | ID dari item terakhir (cursor pagination) |
| \`search\` | — | Search di title, description, content, tags |
| \`filter\` | \`all\` | \`all\`, \`mine\`, \`public\`, \`private\` |

**POST /gists body:**

\`\`\`json
{
  "title": "Docker Compose Template",
  "description": "Template untuk services standar",
  "isPublic": true,
  "tags": ["docker", "template"],
  "files": [
    {
      "filename": "docker-compose.yml",
      "language": "yaml",
      "content": "version: '3.8'\\nservices:..."
    },
    {
      "filename": "README.md",
      "language": "markdown",
      "content": "# Docker Compose Template\\n..."
    }
  ]
}
\`\`\`

---

### Tickets

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/tickets\` | Session | List tiket (QC role: hanya tiket scope QC) |
| \`POST\` | \`/api/tickets\` | Session (ADMIN+) | Buat tiket baru |
| \`GET\` | \`/api/tickets/:id\` | Session | Detail + comments + evidence |
| \`PATCH\` | \`/api/tickets/:id\` | Session (role-gated) | Update status / priority / assignee |
| \`POST\` | \`/api/tickets/:id/comments\` | Session | Tambah komentar |
| \`POST\` | \`/api/tickets/:id/evidence\` | Session | Lampirkan evidence |

**Status machine:**

\`\`\`
OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED
                  ↗                  ↘
              REOPENED ←──────────────
\`\`\`

**POST /tickets body:**

\`\`\`json
{
  "title": "Login button tidak responsif di mobile",
  "description": "## Repro\\n1. Buka /login di mobile\\n2. Tap Login\\n\\n## Expected\\nLogin berhasil\\n\\n## Actual\\nTidak ada response",
  "priority": "HIGH",
  "route": "/login"
}
\`\`\`

**PATCH /tickets/:id body:**

\`\`\`json
{
  "status": "IN_PROGRESS",
  "assigneeId": "user_abc",
  "priority": "CRITICAL"
}
\`\`\`

**POST /tickets/:id/evidence body:**

\`\`\`json
{
  "kind": "screenshot",
  "url": "/screenshots/login-bug.png",
  "note": "Screenshot dari iPhone 14"
}
\`\`\`

Valid \`kind\`: \`screenshot\`, \`commit\`, \`test_log\`, \`trace\`, \`other\`

---

### Admin (SUPER_ADMIN)

Semua endpoint di bawah memerlukan role \`SUPER_ADMIN\`.

**Users:**

| Method | Path | Keterangan |
|--------|------|-----------|
| \`GET\` | \`/api/admin/users\` | List semua user dengan role dan status |
| \`PUT\` | \`/api/admin/users/:id/role\` | Ubah role (body: \`{role: "ADMIN"}\`) |
| \`PUT\` | \`/api/admin/users/:id/block\` | Block/unblock (body: \`{blocked: true}\`) |

**Logs:**

| Method | Path | Query Params | Keterangan |
|--------|------|-------------|-----------|
| \`GET\` | \`/api/admin/logs/app\` | \`level, limit, afterId\` | App logs dari Redis (max 500) |
| \`GET\` | \`/api/admin/logs/audit\` | \`userId, action, limit\` | Audit trail dari DB |
| \`DELETE\` | \`/api/admin/logs/app\` | — | Clear app logs |
| \`DELETE\` | \`/api/admin/logs/audit\` | — | Clear audit logs |

**Audit log actions:** \`LOGIN\`, \`LOGOUT\`, \`LOGIN_FAILED\`, \`LOGIN_BLOCKED\`, \`ROLE_CHANGED\`, \`BLOCKED\`, \`UNBLOCKED\`

**Inspeksi (read-only):**

| Method | Path | Keterangan |
|--------|------|-----------|
| \`GET\` | \`/api/admin/routes\` | Semua routes dengan method, auth level, kategori |
| \`GET\` | \`/api/admin/schema\` | Prisma schema → JSON (models, fields, relations, enums) |
| \`GET\` | \`/api/admin/sessions\` | Semua session aktif + user info + online status |
| \`GET\` | \`/api/admin/presence\` | List user ID yang online saat ini |
| \`GET\` | \`/api/admin/project-structure\` | File scan \`src/\`, \`prisma/\`, \`tests/\` |
| \`GET\` | \`/api/admin/env-map\` | Env vars yang digunakan (set/unset status) |
| \`GET\` | \`/api/admin/dependencies\` | NPM packages + versi + files yang import |
| \`GET\` | \`/api/admin/migrations\` | Timeline migrasi Prisma + SQL preview |
| \`GET\` | \`/api/admin/test-coverage\` | Source files + test files mapping |

---

### WebSocket

| Path | Auth | Keterangan |
|------|------|-----------|
| \`WS /ws/presence\` | Cookie session | Real-time presence. Broadcast online user list ke admin subscribers |

**Protocol:**
- Connect → server kirim \`{type: "presence", userIds: [...]}\`
- Setiap user connect/disconnect → broadcast ke semua admin subscriber
- SUPER_ADMIN menerima semua update; user biasa hanya untuk kehadiran sendiri

---

## Enkripsi Secret Vars

### Mekanisme

Var dengan \`isSecret: true\` dienkripsi menggunakan **AES-256-GCM** sebelum disimpan:

\`\`\`
Plaintext → encrypt(MASTER_KEY, random IV) → ciphertext + auth tag
\`\`\`

**Format penyimpanan** di database:

\`\`\`
enc:<iv_hex>:<ciphertext_hex>:<auth_tag_hex>
\`\`\`

Contoh: \`enc:a1b2c3...:deadbeef...:f0e1d2...\`

### Setup

\`\`\`bash
# Generate MASTER_KEY (64 hex chars = 32 bytes)
openssl rand -hex 32

# Set di environment server
MASTER_KEY=a1b2c3d4...64chars...f0e1d2
\`\`\`

### Akses Control

| Aktor | Akses ke secret |
|-------|----------------|
| VIEWER (browser) | Melihat \`***\` saja |
| EDITOR/OWNER (browser) | Bisa reveal (server decrypt on-demand) |
| CLI / API token | Selalu dapat nilai ter-decrypt |
| Portainer sync | Selalu decrypt sebelum push ke stack |

### Backward Compatibility

Jika \`MASTER_KEY\` tidak diset, secret disimpan sebagai plaintext (tidak ada enkripsi). Sistem tetap berjalan normal — enkripsi opsional tapi sangat dianjurkan untuk production.

---

## Portainer Integration

### Flow Setup

\`\`\`
1. ADMIN buka /envmanager/connections
   → Buat PortainerConnection (nama, URL, API token)

2. EDITOR buka /envmanager/:slug/:env
   → Scroll ke bagian Portainer
   → Klik Connect

3. Wizard 2 langkah:
   Step 1: Pilih connection (atau lihat stacks langsung)
   Step 2: Pilih stack target dari daftar stacks Portainer

4. Klik Sync
   → Server decrypt semua vars
   → Build env_file format
   → Push ke Portainer API
   → Portainer update stack.env
   → Container restart dengan vars baru
\`\`\`

### Catatan Keamanan

> ⚠️ Saat sync, secret vars di-decrypt dan dikirim sebagai plaintext ke Portainer.
> Nilai tersimpan di \`stack.env\` di Portainer — tidak terenkripsi di sisi Portainer.
> Pastikan akses ke Portainer instance dibatasi dan API token-nya aman.

---

## Gists

Gists adalah snippet/konfigurasi yang bisa di-share antar anggota tim.

### Fitur

- **Multi-file**: satu gist bisa punya banyak file dengan nama dan bahasa berbeda
- **Public/Private**: public bisa dilihat semua member; private hanya pemilik
- **Tags**: kategorisasi custom, auto-lowercase dan normalized
- **31 bahasa**: javascript, typescript, python, go, rust, bash, sql, json, yaml, html, css, markdown, dockerfile, prisma, graphql, dan lainnya
- **Search**: di title, description, filename, content, dan tags
- **Infinite scroll**: pagination cursor-based

### Struktur File

\`\`\`json
{
  "filename": "nginx.conf",
  "language": "nginx",
  "content": "server {\\n  listen 80;\\n  ...\\n}"
}
\`\`\`

---

## Tickets

Sistem tiket untuk melacak bug, feature request, dan QC workflow.

### Status Machine

\`\`\`
OPEN
  ↓ (ADMIN assign ke diri sendiri)
IN_PROGRESS
  ↓ (ADMIN: selesai, butuh review QC)
READY_FOR_QC
  ↓ (QC: approved)      ↓ (QC: butuh perbaikan)
CLOSED               REOPENED → IN_PROGRESS → READY_FOR_QC → ...
\`\`\`

### Priority

| Level | Warna | Use Case |
|-------|-------|---------|
| \`LOW\` | Gray | Nice-to-have, tidak urgent |
| \`MEDIUM\` | Blue | Bug normal, bisa ditunda |
| \`HIGH\` | Orange | Mengganggu user, perlu segera |
| \`CRITICAL\` | Red | Production down, security issue |

---

## Database Schema

### Core Models

\`\`\`
User
├── id, name, email, password (bcrypt), role, blocked
├── createdAt, updatedAt
└── relations: sessions, apiTokens, projectMembers, gists, notes

Session
├── id, token (unique), userId, expiresAt
└── ipAddress, userAgent, createdAt

AuditLog
├── id, userId?, action, detail?, ip?
└── createdAt

Project
├── id, slug (unique), name, description?
├── deletedAt? (soft delete)
├── createdAt, updatedAt
└── relations: environments, members, portainerConfigs, notes

Environment
├── id, name, projectId
├── unique(projectId, name)
└── relations: vars[]

EnvVar
├── id, key, value, isSecret, isDisabled
├── environmentId, createdAt, updatedAt
└── unique(environmentId, key)

ProjectMember
├── id, userId, projectId, role
├── unique(userId, projectId)
└── createdAt

ApiToken
├── id, name, token (unique), userId
├── scopes[], canWrite, isDisabled
├── lastUsedAt?, expiresAt?
└── createdAt

PortainerConnection
├── id, name, portainerUrl, apiToken
├── createdById
└── createdAt, updatedAt

PortainerConfig
├── id, projectId, envName
├── connectionId? (FK ke PortainerConnection)
├── stackId, stackName, endpointId
├── lastSyncAt?, lastSyncOk?
└── unique(projectId, envName)

Ticket
├── id, title, description, status, priority
├── route?, reporterId, assigneeId?
├── createdAt, updatedAt, closedAt?
└── relations: comments[], evidence[]

Gist
├── id, userId, title, description
├── files (JSON), isPublic, tags[]
└── createdAt, updatedAt

ProjectNote
├── id, projectId, authorId
├── title, body, pinned, tags[]
└── createdAt, updatedAt
\`\`\`

### Enums

\`\`\`typescript
Role = "USER" | "QC" | "ADMIN" | "SUPER_ADMIN"
ProjectMemberRole = "OWNER" | "EDITOR" | "VIEWER"
TicketStatus = "OPEN" | "IN_PROGRESS" | "READY_FOR_QC" | "REOPENED" | "CLOSED"
TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
\`\`\`

---

## Self-Hosting

### Environment Variables Server

\`\`\`bash
# ─── Database (wajib)
DATABASE_URL=postgresql://user:password@localhost:5432/envman

# ─── Enkripsi secret vars (sangat dianjurkan)
MASTER_KEY=<64-char-hex>  # openssl rand -hex 32

# ─── Server
PORT=3000
NODE_ENV=production

# ─── Google OAuth (opsional)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# ─── Redis (untuk app logs + presence)
REDIS_URL=redis://localhost:6379

# ─── MCP server (opsional, untuk Claude integration)
MCP_SECRET=<hex>
MCP_SECRET_ADMIN=<hex>

# ─── Audit log retention
AUDIT_LOG_RETENTION_DAYS=90
\`\`\`

### Scripts

\`\`\`bash
# Development
bun run dev           # dev server (watch mode)

# Database
bun run db:migrate    # jalankan migrasi
bun run db:seed       # seed demo users (superadmin/admin/user)
bun run db:studio     # buka Prisma Studio di browser
bun run db:generate   # regenerate Prisma client

# Production
bun run build         # build frontend (Vite)
bun run start         # production server

# CLI binary
bun run build:cli     # build untuk semua platform

# Quality
bun run typecheck     # tsc --noEmit
bun run lint          # biome check
bun run lint:fix      # biome check --write
bun run test          # semua tests
bun run test:unit     # unit tests saja
bun run test:integration  # integration tests saja
\`\`\`

### Seed Users (development)

| Email | Password | Role |
|-------|----------|------|
| \`superadmin@example.com\` | \`superadmin123\` | SUPER_ADMIN |
| \`admin@example.com\` | \`admin123\` | ADMIN |
| \`user@example.com\` | \`user123\` | USER |

### Stack

| Layer | Teknologi |
|-------|-----------|
| Runtime | Bun |
| Backend | Elysia.js |
| Database | PostgreSQL via Prisma v6 |
| Cache/Logs | Redis (Bun native) |
| Frontend | React 19 + Vite 8 |
| UI | Mantine v8 |
| Routing | TanStack Router |
| State | TanStack Query |
| Auth | Session-based (HttpOnly cookie) + Better Auth |
| CLI | Bun compile (standalone binary) |

---

*Dokumentasi ini di-generate dari source code. Untuk raw markdown: [${origin}/api/docs.md](${origin}/api/docs.md)*
`
}

// ─── Komponen halaman ─────────────────────────────────────────────────────────

function DocsPage() {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const content = buildDocsMarkdown(origin)
  const { data: sessionData } = useSession()
  const user = sessionData?.user

  // Warna GitHub markdown — seluruh halaman mengikuti ini
  // light: bg #ffffff  text #1f2328  border #d0d7de
  // dark:  bg #0d1117  text #f0f6fc  border #30363d
  const ghDark = '#0d1117'
  const ghLight = '#ffffff'
  const ghBorderDark = '#30363d'
  const ghBorderLight = '#d0d7de'

  return (
    <Box
      style={{
        minHeight: '100vh',
        // background ikut warna GitHub markdown per color scheme
      }}
    >
      <style>{`
        html[data-mantine-color-scheme="light"] body { background-color: ${ghLight} !important; }
        html[data-mantine-color-scheme="dark"]  body { background-color: ${ghDark}  !important; }
      `}</style>

      {/* Navbar — background solid sesuai GitHub markdown */}
      <Box
        component="header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <style>{`
          html[data-mantine-color-scheme="light"] .docs-navbar {
            background-color: ${ghLight};
            border-bottom: 1px solid ${ghBorderLight};
          }
          html[data-mantine-color-scheme="dark"] .docs-navbar {
            background-color: ${ghDark};
            border-bottom: 1px solid ${ghBorderDark};
          }
        `}</style>
        <Box className="docs-navbar">
          <Container size="lg">
            <Group h={52} justify="space-between">
              <Group gap="xs">
                <ThemeIcon size={28} variant="gradient" radius="md">
                  <TbVariable size={14} />
                </ThemeIcon>
                <Anchor component={Link} to="/" underline="never">
                  <Text fw={700} size="sm">
                    Env Manager
                  </Text>
                </Anchor>
                <Text c="dimmed" size="sm">
                  /
                </Text>
                <Group gap={4}>
                  <TbBook size={14} />
                  <Text size="sm" fw={500}>
                    Docs
                  </Text>
                </Group>
              </Group>
              <Group gap="xs">
                <ThemeToggle />
                {user ? (
                  <Button
                    component={Link}
                    to={getDefaultRoute(user.role)}
                    size="xs"
                    variant="gradient"
                    leftSection={<TbLayoutDashboard size={13} />}
                  >
                    Dashboard
                  </Button>
                ) : (
                  <Button component={Link} to="/login" size="xs" variant="gradient" leftSection={<TbLogin size={13} />}>
                    Login
                  </Button>
                )}
              </Group>
            </Group>
          </Container>
        </Box>
      </Box>

      {/* Content */}
      <Container size="md" py={{ base: 'lg', sm: 48 }} px={{ base: 'sm', sm: 'md' }}>
        <MarkdownRenderer>{content}</MarkdownRenderer>
      </Container>

      {/* Footer */}
      <style>{`
        html[data-mantine-color-scheme="light"] .docs-footer { border-top: 1px solid ${ghBorderLight}; }
        html[data-mantine-color-scheme="dark"]  .docs-footer { border-top: 1px solid ${ghBorderDark}; }
      `}</style>
      <Box className="docs-footer" py="sm">
        <Container size="lg">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <ThemeIcon size={20} variant="gradient" radius="sm">
                <TbVariable size={10} />
              </ThemeIcon>
              <Text size="xs" fw={600}>
                Env Manager
              </Text>
            </Group>
            <Group gap="md">
              <Anchor href="/api/docs.md" size="xs" c="dimmed" target="_blank">
                Raw Markdown
              </Anchor>
              <Anchor component={Link} to="/" size="xs" c="dimmed">
                Landing Page
              </Anchor>
              <Text size="xs" c="dimmed">
                Self-hosted. Data tetap milikmu.
              </Text>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  )
}
