export function buildApiCoreSection(origin: string): string {
  return `
## API Reference

### Autentikasi Request

Semua endpoint \`/api/envman/*\` memerlukan autentikasi via:

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
      "value": "...",
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
  "value": "...",
  "isSecret": false
}
\`\`\`

**PUT /vars** — bulk import (replace all):

\`\`\`json
{
  "vars": {
    "DATABASE_URL": "...",
    "REDIS_URL": "...",
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
`
}
