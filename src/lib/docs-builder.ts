// Shared docs markdown for /api/docs.md endpoint and /docs frontend page
export function buildDocsMd(origin: string): string {
  return `# Env Manager — Dokumentasi Lengkap

> **Self-hosted environment variables manager** dengan enkripsi AES-256-GCM, CLI injection, Portainer sync, dan role-based access control.

- **Base URL**: \`${origin}\`
- **Raw docs**: \`${origin}/api/docs.md\`
- **Web docs**: \`${origin}/docs\`

---

## Konsep Dasar

Env Manager mengelola environment variables dalam hierarki tiga level:

\`\`\`
Project (slug unik, e.g. "myapp")
└── Environment (e.g. "production", "staging", "development")
    └── EnvVar (KEY=value, bisa plain atau secret/encrypted)
\`\`\`

Auth dua metode: **Session** (browser, cookie HttpOnly) dan **API Token** (\`Authorization: Bearer <token>\`).

---

## Role & Permission

### Role Global

| Role | Akses |
|------|-------|
| \`SUPER_ADMIN\` | Semua fitur + Dev Console + User management |
| \`ADMIN\` | Dashboard + Env Manager (buat project) |
| \`QC\` | Dashboard (tiket QC scope saja) |
| \`USER\` | Profile saja |

### Role Project

| Role | Hak Akses |
|------|-----------|
| \`OWNER\` | Kontrol penuh — kelola member, hapus env |
| \`EDITOR\` | Tambah / edit / hapus vars, reveal secrets, export decrypted |
| \`VIEWER\` | Lihat vars saja (secrets tampil sebagai \`***\`) |

---

## CLI

### Instalasi

\`\`\`bash
# Auto-detect platform
curl -fsSL ${origin}/install | bash

# Linux x64
curl -sL --compressed ${origin}/download/cli/linux-x64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/

# Linux ARM64
curl -sL --compressed ${origin}/download/cli/linux-arm64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/

# macOS Apple Silicon
curl -sL --compressed ${origin}/download/cli/darwin-arm64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/

# macOS Intel
curl -sL --compressed ${origin}/download/cli/darwin-x64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/

# Windows (PowerShell)
Invoke-WebRequest -Uri "${origin}/download/cli/windows-x64" -OutFile "envman.exe"
\`\`\`

### Commands

\`\`\`bash
envman login <server-url> --token <token>   # Simpan credentials
envman logout                                # Hapus credentials
envman whoami                                # Cek status login
envman [options] -- <command>               # Inject vars & run
\`\`\`

### Flag Inject

| Flag | Keterangan |
|------|-----------|
| \`-e project:env\` | Fetch vars dari server |
| \`-e ./file\` | Load vars dari file lokal |
| \`--server-wins\` | Server vars menang atas system env (default: system wins) |

### Auth Resolution (tertinggi → terendah)

1. \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` dari file \`-e\`
2. \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` dari process.env / system env
3. \`~/.config/envman/config.json\` (dari \`envman login\`)

### Contoh

\`\`\`bash
# Single environment
envman -e myapp:production -- bun start

# Multiple (later overrides earlier)
envman -e myapp:base -e myapp:production -- bun dev

# Mix server + local
envman -e myapp:production -e .env.local -- bun dev

# CI/CD (tanpa login)
ENVMAN_SERVER=${origin} ENVMAN_TOKEN=<TOKEN> envman -e myapp:production -- bun start

# GitHub Actions
# env:
#   ENVMAN_SERVER: ${origin}
#   ENVMAN_TOKEN: $\{{ secrets.ENVMAN_TOKEN }}
# run: envman -e myapp:production -- bun start
\`\`\`

---

## API Reference

### Auth

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`POST\` | \`/api/auth/login\` | Public | \`{email, password}\` → set session cookie |
| \`GET\` | \`/api/auth/google\` | Public | Redirect Google OAuth |
| \`GET\` | \`/api/auth/session\` | Optional | Return \`{user}\` atau \`401\` |
| \`POST\` | \`/api/auth/logout\` | Session | Hapus session |

### Projects

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/projects\` | ADMIN+ | List accessible projects |
| \`POST\` | \`/api/envman/projects\` | ADMIN+ | Buat project (body: \`{slug, name, description?}\`) |
| \`GET\` | \`/api/envman/projects/:slug\` | Member | Detail + members + environments |
| \`DELETE\` | \`/api/envman/projects/:slug\` | OWNER | Soft delete project |

### Variables

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/projects/:slug/environments/:env/vars\` | VIEWER+ | List vars (secrets → \`***\` untuk VIEWER) |
| \`GET\` | \`/api/envman/projects/:slug/environments/:env/vars/export\` | EDITOR+ | Export decrypted |
| \`POST\` | \`/api/envman/projects/:slug/environments/:env/vars\` | EDITOR+ | Upsert var \`{key, value, isSecret}\` |
| \`PUT\` | \`/api/envman/projects/:slug/environments/:env/vars\` | EDITOR+ | Bulk import \`{vars: {K:V}, secrets: [K]}\` |
| \`DELETE\` | \`/api/envman/projects/:slug/environments/:env/vars/:key\` | EDITOR+ | Hapus var |
| \`PATCH\` | \`/api/envman/projects/:slug/environments/:env/vars/:key/toggle\` | EDITOR+ | Toggle isDisabled |

### Environments

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`POST\` | \`/api/envman/projects/:slug/environments\` | EDITOR+ | Buat environment \`{name}\` |
| \`DELETE\` | \`/api/envman/projects/:slug/environments/:env\` | OWNER | Hapus environment + vars |

### Members

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`POST\` | \`/api/envman/projects/:slug/members\` | OWNER | Undang member \`{email, role}\` |
| \`PUT\` | \`/api/envman/projects/:slug/members/:userId/role\` | OWNER | Ubah role \`{role}\` |
| \`DELETE\` | \`/api/envman/projects/:slug/members/:userId\` | OWNER | Hapus member |

### Tokens

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/tokens\` | Session/Token | List token milik user |
| \`POST\` | \`/api/envman/tokens\` | Session | Buat token \`{name, canWrite, expiresAt?, scopes[]}\` |
| \`PATCH\` | \`/api/envman/tokens/:id\` | Session | Edit token |
| \`PATCH\` | \`/api/envman/tokens/:id/toggle\` | Session | Toggle aktif/nonaktif |
| \`DELETE\` | \`/api/envman/tokens/:id\` | Session | Revoke token |
| \`GET\` | \`/api/envman/whoami\` | Token | Verifikasi token → return user |

> Token value hanya ditampilkan **sekali** saat pembuatan.

### Portainer

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/portainer/connections\` | ADMIN+ | List global connections |
| \`POST\` | \`/api/envman/portainer/connections\` | ADMIN+ | Buat connection \`{name, portainerUrl, apiToken}\` |
| \`PUT\` | \`/api/envman/portainer/connections/:id\` | ADMIN+ | Update connection |
| \`DELETE\` | \`/api/envman/portainer/connections/:id\` | ADMIN+ | Hapus connection |
| \`POST\` | \`/api/envman/portainer/connections/:id/probe\` | ADMIN+ | Test + fetch stacks |
| \`GET\` | \`/api/envman/projects/:slug/environments/:env/portainer\` | VIEWER+ | Get config |
| \`PUT\` | \`/api/envman/projects/:slug/environments/:env/portainer\` | EDITOR+ | Save config \`{connectionId, stackId, stackName, endpointId}\` |
| \`DELETE\` | \`/api/envman/projects/:slug/environments/:env/portainer\` | EDITOR+ | Hapus config |
| \`POST\` | \`/api/envman/projects/:slug/environments/:env/portainer/sync\` | EDITOR+ | Push vars ke stack |

### Gists

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/gists\` | Session | List (\`?limit&cursor&search&filter\`) |
| \`POST\` | \`/api/envman/gists\` | Session | Buat \`{title, description, files[], isPublic, tags[]}\` |
| \`PUT\` | \`/api/envman/gists/:id\` | Owner | Update |
| \`DELETE\` | \`/api/envman/gists/:id\` | Owner | Hapus |

### Tickets

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/tickets\` | Session | List (QC: hanya scope QC) |
| \`POST\` | \`/api/tickets\` | ADMIN+ | Buat \`{title, description, priority, route?}\` |
| \`GET\` | \`/api/tickets/:id\` | Session | Detail + comments + evidence |
| \`PATCH\` | \`/api/tickets/:id\` | Role-gated | Update \`{status?, priority?, assigneeId?}\` |
| \`POST\` | \`/api/tickets/:id/comments\` | Session | Komentar \`{body}\` |
| \`POST\` | \`/api/tickets/:id/evidence\` | Session | Evidence \`{kind, url, note?}\` |

Status machine: \`OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED\` + \`REOPENED\`

### Admin (SUPER_ADMIN only)

| Method | Path | Keterangan |
|--------|------|-----------|
| \`GET\` | \`/api/admin/users\` | List semua users |
| \`PUT\` | \`/api/admin/users/:id/role\` | Ubah role \`{role}\` |
| \`PUT\` | \`/api/admin/users/:id/block\` | Block/unblock \`{blocked}\` |
| \`GET\` | \`/api/admin/logs/app\` | App logs (\`?level&limit&afterId\`) |
| \`GET\` | \`/api/admin/logs/audit\` | Audit trail (\`?userId&action&limit\`) |
| \`DELETE\` | \`/api/admin/logs/app\` | Clear app logs |
| \`DELETE\` | \`/api/admin/logs/audit\` | Clear audit logs |
| \`GET\` | \`/api/admin/sessions\` | Semua sessions aktif |
| \`GET\` | \`/api/admin/presence\` | Online user IDs |
| \`GET\` | \`/api/admin/schema\` | Prisma schema sebagai JSON |
| \`GET\` | \`/api/admin/routes\` | Semua routes + metadata |

### WebSocket

| Path | Auth | Keterangan |
|------|------|-----------|
| \`WS /ws/presence\` | Cookie | Real-time online presence, broadcast ke admin |

---

## Enkripsi Secret Vars

- Algoritma: **AES-256-GCM**
- Config: set \`MASTER_KEY\` (64 hex chars) di server env
- Generate: \`openssl rand -hex 32\`
- Format DB: \`enc:<iv_hex>:<ciphertext_hex>:<auth_tag_hex>\`
- Tanpa MASTER_KEY: stored plaintext (backward compatible)
- VIEWER → melihat \`***\`; EDITOR/OWNER → bisa reveal; CLI/sync → selalu decrypt

---

## Self-Hosting — Environment Variables

\`\`\`bash
DATABASE_URL=postgresql://<user>:<pass>@host:5432/envman
MASTER_KEY=<64-hex>          # openssl rand -hex 32
PORT=3000
NODE_ENV=production
REDIS_URL=redis://localhost:6379
GOOGLE_CLIENT_ID=...         # opsional, Google OAuth
GOOGLE_CLIENT_SECRET=...
AUDIT_LOG_RETENTION_DAYS=90
\`\`\`

---

## Database Enums

\`\`\`
Role:              USER | QC | ADMIN | SUPER_ADMIN
ProjectMemberRole: OWNER | EDITOR | VIEWER
TicketStatus:      OPEN | IN_PROGRESS | READY_FOR_QC | REOPENED | CLOSED
TicketPriority:    LOW | MEDIUM | HIGH | CRITICAL
\`\`\`

---

*Untuk dokumentasi lengkap dengan contoh kode dan detail tambahan, kunjungi [${origin}/docs](${origin}/docs)*
`
}
