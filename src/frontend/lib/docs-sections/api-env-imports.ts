export function buildApiEnvImportsSection(origin: string): string {
  return `
## Env Import (Live-Link)

Env target bisa **meminjam vars dari env lain** secara referensi live — bukan salinan. Base ditulis sekali, semua importer ikut otomatis. Cocok untuk menghindari drift key+value yang terduplikasi antar env/project.

### Semantik Resolusi

- **Layered merge**: \`imports (order asc) → local\`. **Var lokal selalu menang per-key.**
- Import dengan \`order\` lebih besar menang atas import dengan \`order\` lebih kecil.
- **Akses dicek saat resolve**, bukan saat setup link. Tiap baca: source env yang denied → var-nya di-skip + dicatat di \`deniedImports[]\` (tidak silent).
- **Secret**: reveal/mask mengikuti akses caller di **source env** (OWNER/EDITOR bisa reveal, VIEWER → \`***\`).
- **Per-key whitelist** (\`keys[]\`): kosong = semua key source ikut; ada isi = hanya key itu. Whitelist **ketat** — key baru di source tidak ikut otomatis sampai ditambah ke \`keys\`.

### Batasan MVP

- Tidak ada transitive import (multi-level)
- Tidak ada per-import override value

---

### Permission

| Operasi | Syarat |
|---------|--------|
| Buat link (POST) | OWNER env **target** + akses ≥VIEWER di env **source** |
| Ubah whitelist key (PATCH) | OWNER env target |
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
| \`PATCH\` | \`.../imports/:id\` | Ubah whitelist \`keys\` link |
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
      "keys": ["DB_HOST", "REDIS_URL"],
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
{ "sourceProject": "infra", "sourceEnv": "base", "keys": ["DB_HOST"] }
\`\`\`

Response \`201\`:

\`\`\`json
{ "ok": true, "id": "...", "order": 1 }
\`\`\`

- \`order\` = max order existing + 1 (import terakhir menang)
- Caller wajib punya akses ≥VIEWER ke source env — jika denied → 403
- \`keys\` opsional: array key yang mau di-import. Kosong/absen = **semua** key source. Whitelist ketat (key baru tidak ikut otomatis).

---

### PATCH — Ubah Whitelist Key

\`\`\`json
{ "keys": ["DB_HOST", "REDIS_URL"] }
\`\`\`

Response \`200\`: \`{ "ok": true, "keys": ["DB_HOST", "REDIS_URL"] }\`

- \`keys: []\` → kembali import **semua** key source.
- Non-array / elemen bukan string → 400.

---

### Efek di vars endpoint

**\`GET vars\` (UI)** — response tambah field additive:

\`\`\`json
{
  "vars": [...],
  "imported": [
    { "key": "DB_HOST", "value": "db.infra.internal", "isSecret": false, "sourceProject": "infra", "sourceEnv": "base" }
  ],
  "importedKeys": ["DB_HOST"],
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
