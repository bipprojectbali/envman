export function buildApiGistsTicketsSection(origin: string): string {
  return `
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
