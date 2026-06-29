export function buildApiTokensPortainerSection(origin: string): string {
  return `
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
`
}
