export function buildApiEnvImportsSection(origin: string): string {
  return `
## Env Import (Live-Link)

Env target bisa **meminjam vars dari env lain** secara referensi live — bukan salinan. Base ditulis sekali, semua importer ikut otomatis. Cocok untuk menghindari drift key+value yang terduplikasi antar env/project.

### Semantik Resolusi

- **Layered merge**: \`imports (order asc) → local\`. **Var lokal selalu menang per-key.**
- Import dengan \`order\` lebih besar menang atas import dengan \`order\` lebih kecil.
- **Akses dicek saat resolve**, bukan saat setup link. Tiap baca: source env yang denied → var-nya di-skip + dicatat di \`deniedImports[]\` (tidak silent).
- **Secret**: reveal/mask mengikuti akses caller di **source env** (OWNER/EDITOR bisa reveal, VIEWER → \`***\`).

### Batasan MVP

- Tidak ada per-key filter (import semua key dari source)
- Tidak ada transitive import (multi-level)
- Tidak ada per-import override value

---

### Permission

| Operasi | Syarat |
|---------|--------|
| Buat link (POST) | OWNER env **target** + akses ≥VIEWER di env **source** |
| Hapus link (DELETE) | OWNER env target |
| List links (GET) | OWNER env target |

Self-import (target = source) → 400. Duplikat (target+source sama) → 409. Cycle (A→B→A) → 400.

---

### Endpoint

Prefix: \`/api/envman/projects/:slug/environments/:envName/imports\`

| Method | Path | Keterangan |
|--------|------|-----------|
| \`GET\` | \`.../imports\` | List semua live-link env ini |
| \`POST\` | \`.../imports\` | Buat link baru (OWNER target + akses source) |
| \`DELETE\` | \`.../imports/:id\` | Hapus link |

---

### GET — List Links

\`\`\`
GET /api/envman/projects/myapp/environments/staging/imports
\`\`\`

Response:

\`\`\`json
{
  "imports": [
    {
      "id": "...",
      "order": 1,
      "sourceProject": "infra",
      "sourceProjectName": "Infrastructure",
      "sourceEnv": "base",
      "createdAt": "..."
    }
  ]
}
\`\`\`

---

### POST — Buat Link

\`\`\`json
{ "sourceProject": "infra", "sourceEnv": "base" }
\`\`\`

Response \`201\`:

\`\`\`json
{ "ok": true, "id": "...", "order": 1 }
\`\`\`

- \`order\` = max order existing + 1 (import terakhir menang)
- Caller wajib punya akses ≥VIEWER ke source env — jika denied → 403

---

### Efek di vars endpoint

**\`GET vars\` (UI)** — response tambah field additive:

\`\`\`json
{
  "vars": [...],
  "imported": [
    { "key": "DB_HOST", "value": "db.infra.internal", "isSecret": false, "sourceProject": "infra", "sourceEnv": "base" }
  ],
  "importedKeys": ["DB_HOST", "REDIS_URL"],
  "deniedImports": []
}
\`\`\`

- \`imported[]\` — var dari import yang **tidak ada lokal** (key tidak override)
- \`importedKeys[]\` — semua key dari import termasuk yang ter-override lokal
- \`deniedImports[]\` — source env yang denied caller

**\`GET vars/export\` (CLI/daemon)** — merge imported sebagai base layer, lokal overwrite per-key. \`deniedImports\` hanya muncul jika non-kosong.

---
`
}
