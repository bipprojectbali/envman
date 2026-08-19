export function buildApiGistsTicketsSection(origin: string): string {
  return `
### Env Manager — Gists

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/gists\` | Session / Bearer | List gists sendiri + publik (\`?limit=20&cursor=&search=&tags=&sort=\`) |
| \`POST\` | \`/api/envman/gists\` | Session / Bearer | Buat gist baru (judul unik per user → 409 jika duplikat) |
| \`PUT\` | \`/api/envman/gists/:id\` | Owner / SUPER_ADMIN | Update gist (409 jika rename bentrok) |
| \`DELETE\` | \`/api/envman/gists/:id\` | Owner / SUPER_ADMIN | Hapus gist |
| \`GET\` | \`/api/envman/gists/:id/raw/:filename\` | Session / Bearer | Konten mentah satu file |
| \`GET\` | \`/api/public/gists\` | — | List gist publik (tanpa auth) |
| \`GET\` | \`/api/public/gists/:id\` | — | Detail gist publik (403 jika privat) |
| \`GET\` | \`/api/public/gists/:id/raw/:filename\` | — | Konten mentah publik |

Judul **unik per user** (\`@@unique([userId, title])\`) = natural key yang dipakai CLI \`envman gists\` untuk merujuk gist tanpa UUID. Mutasi di-gate \`canWrite\` — token read-only mendapat 403.

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
| \`GET\` | \`/api/admin/schema\` | Prisma schema → JSON (models, fields, relations, enums) |
| \`GET\` | \`/api/admin/presence\` | List user ID yang online saat ini |

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
`
}
