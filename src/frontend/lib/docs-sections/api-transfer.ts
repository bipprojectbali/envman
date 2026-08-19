export function buildApiTransferSection(origin: string): string {
  return `
## Transfer & Clipboard

### Transfer Secret User-ke-User

Kirim secret (\`.env\`, kunci SSH, sertifikat) langsung ke user lain, atau lewat **kode sekali-pakai**. Berbeda dengan clipboard yang slot-tunggal milik sendiri, transfer punya **penerima**.

> ⚠️ **Bukan end-to-end encryption.** Payload dienkripsi at-rest dengan \`MASTER_KEY\` **server** — aman dari pihak ketiga dan kebocoran DB, tapi pemegang \`MASTER_KEY\` (admin server) secara teknis bisa membacanya.

#### Semantik

- **Penerima**: user terdaftar (\`to\` = email/nama **persis**, sengaja tidak fuzzy) **atau** \`once: true\` → kode sekali-pakai.
- **Kode klaim = 4 kata** dari daftar EFF (mis. \`viking.pudding.alaska.sunny\`, pemisah titik) — mudah didikte lewat telepon. Server hanya menyimpan hash-nya. Kode kustom (\`--code\`) min 12 char dan TTL dipaksa ≤15 menit.
- **Burn-after-read** default: sekali diklaim langsung hangus. \`--keep\` (\`burn: false\`) membolehkan klaim berulang sampai TTL.
- **404 identik** untuk kode tak dikenal, kedaluwarsa, atau sudah diklaim — tidak membocorkan status.
- Teks kecil dienkripsi di DB (batas \`transfer_max_text_kb\`); file besar/biner dialirkan langsung ke MinIO (batas \`transfer_max_file_mb\`).

#### Endpoint

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`POST\` | \`/api/envman/transfers\` | Bearer (\`canWrite\`) | Kirim TEXT (terenkripsi) |
| \`POST\` | \`/api/envman/transfers/presign\` | Bearer (\`canWrite\`) | Minta presigned PUT untuk FILE |
| \`POST\` | \`/api/envman/transfers/:id/confirm\` | Bearer (\`canWrite\`) | Konfirmasi upload FILE selesai |
| \`GET\` | \`/api/envman/transfers/inbox\` | Bearer | Transfer masuk untuk saya |
| \`GET\` | \`/api/envman/transfers/sent\` | Bearer | Transfer yang saya kirim |
| \`POST\` | \`/api/envman/transfers/:id/claim\` | Bearer | Klaim transfer by id |
| \`POST\` | \`/api/envman/transfers/claim\` | — | Klaim by KODE (kode di body, tanpa auth) |
| \`DELETE\` | \`/api/envman/transfers/:id\` | Bearer | Batalkan/hapus |

Audit: \`TRANSFER_SENT\`, \`TRANSFER_CLAIMED\`, \`TRANSFER_REVOKED\`. Setting (UI **Dev › Storage**): \`transfer_max_text_kb\` (1024), \`transfer_max_file_mb\` (100), \`transfer_max_ttl_hours\` (168), \`transfer_default_ttl_hours\` (72), \`transfer_max_pending_per_user\` (20).

**Keamanan (MUTLAK):** kode klaim ada di **body** POST, tidak pernah di path (path dicatat ke log). Rate-limit fail-closed per-IP dan global. Kirim gagal jika \`MASTER_KEY\` hilang (503) — transfer tidak boleh menyimpan plaintext.

---

### Clipboard Akun

Slot tunggal per user untuk menyalin secret lintas device dengan akun yang sama.

| Method | Path | Keterangan |
|--------|------|-----------|
| \`GET\` | \`/api/envman/clip\` | Ambil isi (decrypt; expired → 404 + auto-delete) |
| \`PUT\` | \`/api/envman/clip\` | Set isi (\`{content, ttlSeconds?}\`; encrypt upsert) |
| \`DELETE\` | \`/api/envman/clip\` | Kosongkan |

Content dienkripsi at-rest, TTL default 24 jam (clamp \`clipboard_max_ttl_hours\`), ukuran maksimum \`clipboard_max_kb\` (413 jika lewat). Endpoint user-level — tidak di-gate \`canWrite\`.

CLI: \`envman clip set/get/clear\`. Contoh: \`cat .env | envman clip set\` di server, lalu \`envman clip get > .env\` di laptop.

---
`
}
