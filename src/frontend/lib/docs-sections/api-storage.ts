export function buildApiStorageSection(origin: string): string {
  return `
## Project Storage

File storage berbasis MinIO — setiap project punya direktori virtual sendiri.

### Prerequisites

Empat env var wajib ada di server agar storage aktif:

\`\`\`bash
MINIO_ENDPOINT=https://minio.example.com   # atau http://localhost:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=envman
\`\`\`

Endpoint yang butuh MinIO return **503** jika tidak dikonfigurasi. List metadata dan PATCH meta tetap jalan (query DB saja).

---

### Permission per Operasi

| Operasi | Role Minimum |
|---------|-------------|
| List files + folder tree | VIEWER |
| Download file (presigned URL) | VIEWER |
| Upload / replace file | EDITOR |
| Update metadata (tags, description) | EDITOR |
| Move / rename file | EDITOR |
| Set \`isPublic\` | OWNER |
| Hapus file | OWNER |
| Public download (tanpa auth) | \`isPublic = true\` |

---

### Storage Limits

- **Max per file**: dikontrol via \`AppSetting\` key \`storage_max_file_mb\` (default 50 MB)
- **Kuota per project**: \`AppSetting\` key \`storage_default_quota_mb\` (default 500 MB)
- **Override per project**: field \`Project.storageQuotaMb\` (SUPER_ADMIN saja; \`null\` = pakai default)

---

### Endpoint

Semua di bawah prefix: \`/api/envman/projects/:slug/storage\`

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/projects/:slug/storage\` | VIEWER | List files + folder tree (paginasi 50/halaman) |
| \`POST\` | \`/api/envman/projects/:slug/storage/upload\` | EDITOR | Upload file |
| \`GET\` | \`/api/envman/projects/:slug/storage/download\` | VIEWER | Dapatkan presigned URL download |
| \`PATCH\` | \`/api/envman/projects/:slug/storage/meta\` | EDITOR | Update metadata (tags, description, isPublic) |
| \`PATCH\` | \`/api/envman/projects/:slug/storage/rename\` | EDITOR | Rename file |
| \`PATCH\` | \`/api/envman/projects/:slug/storage/move\` | EDITOR | Pindah satu atau banyak file ke folder lain |
| \`DELETE\` | \`/api/envman/projects/:slug/storage\` | OWNER | Hapus file |
| \`GET\` | \`/api/public/storage/:slug/:path\` | — | Download publik (redirect 302, tidak butuh auth) |

---

### GET /storage — List

\`\`\`
GET /api/envman/projects/myapp/storage?prefix=assets&page=1
\`\`\`

Response:

\`\`\`json
{
  "prefix": "assets",
  "page": 1,
  "pageSize": 50,
  "totalFiles": 3,
  "folders": ["images", "fonts"],
  "files": [
    {
      "id": "...",
      "path": "assets/logo.png",
      "size": 24576,
      "mimeType": "image/png",
      "isPublic": true,
      "tags": ["brand"],
      "description": "Logo utama",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "usage": {
    "usedBytes": 1048576,
    "quotaBytes": 524288000
  }
}
\`\`\`

---

### POST /storage/upload — Upload

\`\`\`bash
curl -X POST ${origin}/api/envman/projects/myapp/storage/upload \\
  -H "Authorization: Bearer <token>" \\
  -F "file=@logo.png" \\
  -F "path=assets/logo.png" \\
  -F "description=Logo utama" \\
  -F "tags=brand,public"
\`\`\`

- **path**: path relatif dalam project (contoh: \`assets/images/logo.png\`)
- **tags**: CSV string (opsional)
- **description**: string (opsional)
- Upload ke path yang sudah ada = **replace** (upsert)
- Jika ada konflik nama di UI, server otomatis saran suffix \`_2\`, \`_3\`

Response \`201\`:

\`\`\`json
{
  "ok": true,
  "object": { "id": "...", "path": "assets/logo.png", "size": 24576, "mimeType": "image/png", "isPublic": false }
}
\`\`\`

Errors: \`413\` (file terlalu besar / kuota penuh), \`503\` (MinIO tidak dikonfigurasi)

---

### GET /storage/download — Presigned URL

\`\`\`
GET /api/envman/projects/myapp/storage/download?path=assets/logo.png
\`\`\`

Response:

\`\`\`json
{ "url": "https://minio.example.com/envman/...?X-Amz-Signature=..." }
\`\`\`

URL private TTL **5 menit** dengan \`Content-Disposition: attachment\`.

---

### PATCH /storage/move — Batch Move

\`\`\`json
{ "paths": ["assets/old.png", "assets/temp.txt"], "targetFolder": "assets/archive" }
\`\`\`

- \`targetFolder\` kosong = pindah ke root
- Response: \`{ "ok": true, "moved": 2, "errors": [] }\`
- Partial failure: file yang gagal masuk \`errors[]\`, yang berhasil tetap dipindah

---

### PATCH /storage/rename — Rename

\`\`\`json
{ "oldPath": "assets/logo-v1.png", "newName": "logo.png" }
\`\`\`

Hanya nama file — folder tetap sama. Conflict = 409.

---

### Public Access

File dengan \`isPublic: true\` bisa diakses tanpa auth:

\`\`\`
GET /api/public/storage/myapp/assets/logo.png
→ 302 redirect ke presigned URL (TTL 1 jam)
\`\`\`

---
`
}
