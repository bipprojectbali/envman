export function buildIntroSection(origin: string): string {
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
`
}
