export function buildConceptsSection(): string {
  return `
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
`
}
