export function buildTransferSection(): string {
  return `
## Transfer — Kirim Secret Antar User

Kirim \`.env\`, kunci SSH, atau sertifikat **langsung ke user lain** lewat server
envman-mu sendiri — supaya secret berhenti lewat WhatsApp/Slack saat menyiapkan
mesin baru.

Beda dengan [Clip](#clip--clipboard-akun-lintas-device) yang menempel ke akunmu
sendiri, transfer punya **penerima**: user terdaftar, atau siapa pun lewat kode
sekali-pakai.

> ⚠️ **Batas keamanannya, supaya jelas.** Konten dienkripsi at-rest dengan
> \`MASTER_KEY\` **milik server**. Ini aman dari pihak ketiga dan dari kebocoran
> database — tapi **bukan end-to-end**: siapa pun yang memegang \`MASTER_KEY\`
> (yaitu admin servermu) tetap bisa membacanya. Fitur ini menggantikan kebiasaan
> mengirim secret lewat pihak ketiga, bukan kebutuhan memercayai servermu sendiri.

### Kirim ke user terdaftar

\`\`\`bash
envman transfer send .env.prod --to budi@example.com
envman transfer send .env.prod --to Budi                 # nama persis, kalau unik
cat notes.txt | envman transfer send --to budi@example.com
envman transfer send id_rsa --to budi@example.com -m "kunci deploy" --ttl 2h
envman transfer send dump.sql --to budi@example.com      # otomatis lewat storage
\`\`\`

**Jalurnya dipilih otomatis** — kamu tak perlu memikirkannya:

| Isi | Jalur | Kenapa |
|---|---|---|
| Teks di bawah batas (\`.env\`, kunci SSH, cert) | Database, terenkripsi | Kecil, aman disimpan terenkripsi at-rest |
| Ada byte \`NUL\` (gambar, video, arsip, biner) | Storage (MinIO) | Biner tak muat di jalur teks |
| Teks melebihi batas teks | Storage (MinIO) | Melindungi memori server |

CLI mengumumkan pilihannya supaya tak ada kejutan:

\`\`\`
[envman] mode: teks (2.1 KB) — tersimpan terenkripsi di server
[envman] mode: file (412 MB) — upload langsung ke storage
\`\`\`

Paksa dengan \`--mode text\` atau \`--mode file\` bila perlu. Input dari pipe (\`cat x | envman transfer send\`)
selalu lewat jalur teks karena ukurannya tak diketahui di muka.

Dua batasnya sengaja berbeda jauh: **teks** melewati memori server dan disimpan
hex di database (≈2x ukuran asli), sedangkan **file** diupload langsung dari CLI
ke storage tanpa menyentuh server. Keduanya diatur terpisah di
\`/dev > Storage\`.

Penerima dicocokkan **persis** (email atau nama) — sengaja tidak fuzzy, supaya
satu typo tak mengirim \`.env\` produksi ke orang yang salah. Nama yang cocok ke
lebih dari satu user ditolak; pakai email.

### Kirim ke orang tanpa akun (kode sekali-pakai)

\`\`\`bash
envman transfer send .env --once --ttl 1h
# [envman] kode sekali-pakai: EM-3F7K-9QW2-M4XZ-7T1B
# [envman] kedaluwarsa 59m — kode ini hanya ditampilkan SEKALI
#   envman transfer get --server https://envman.example.com
\`\`\`

Baris perintah itu **aman dikirim lewat chat** — yang rahasia ada di server, bukan
di pesannya. Penerima tak perlu akun, tak perlu \`envman login\`:

\`\`\`bash
ENVMAN_CODE=EM-3F7K-9QW2-M4XZ-7T1B envman transfer get --server https://envman.example.com -o .env
\`\`\`

> \u26a0\ufe0f **Jangan berikan kode sebagai argumen di mesin bersama.** Argumen terlihat
> oleh siapa pun yang menjalankan \`ps aux\` dan tersimpan di history shell. Pakai
> \`ENVMAN_CODE=…\` seperti contoh di atas, atau pipe lewat stdin; tanpa keduanya
> envman akan menanyakannya. Hal yang sama berlaku untuk \`envman login --token\`
> (pakai \`ENVMAN_TOKEN\`).

Kode boleh diketik huruf kecil atau tanpa tanda hubung. Alfabetnya sengaja tak
memuat \`I\`, \`L\`, \`O\`, \`U\` supaya \`0/O\` dan \`1/I/L\` tak tertukar.
Kode **hanya ditampilkan sekali** — server hanya menyimpan hash-nya. Kalau hilang,
cabut dengan \`envman transfer rm <id>\` lalu kirim ulang.

### Ambil kiriman

\`\`\`bash
envman transfer ls                          # apa saja yang menunggu
envman transfer ls --json                   # untuk script
envman transfer get <id> -o .env              # ambil ke file (mode 0600)
envman transfer get <id> > .env               # atau lewat pipe
envman transfer get <id>                      # file: tersimpan dengan nama aslinya
envman transfer ls --sent                   # yang kamu kirim: sudah diambil belum?
envman transfer rm <id>                   # cabut / tolak
\`\`\`

Kiriman berupa **file** langsung diunduh ke disk dengan nama aslinya (bukan
ditumpahkan ke terminal). Kalau namanya sudah dipakai, file disimpan sebagai
\`nama-2.ext\` dan diberitahukan — kiriman sudah terlanjur hangus saat diklaim,
jadi membatalkan justru akan menghilangkan isinya.

### Yang perlu diketahui

- **Hangus setelah dibaca.** Sekali diambil, kiriman hilang — tak ada yang bisa
  membacanya lagi. Pakai \`--keep\` bila perlu diambil dari beberapa mesin.
- **Selalu ada kedaluwarsa.** Default 3 hari, atur dengan \`--ttl 30m|2h|7d\`.
  Kiriman yang tak diambil terhapus otomatis.
- **Tidak ada notifikasi.** Penerima baru tahu saat menjalankan \`envman transfer ls\`,
  jadi kabari dia lewat chat — pesannya sendiri tak memuat rahasia apa pun.
- **Token read-only boleh mengambil**, tapi tak boleh mengirim. Jadi token CI
  bisa menarik sertifikat dari inbox-nya tanpa diberi izin tulis.
- **Rotasi \`MASTER_KEY\` mematikan kiriman yang masih menggantung** — kuras inbox
  sebelum merotasi.
- **Pengiriman file butuh storage (MinIO) aktif di server.** Tanpa itu, kiriman
  biner/besar ditolak dengan pesan jelas; jalur teks tetap jalan.
- Batas ukuran, TTL, dan jumlah kiriman tertunda diatur SUPER_ADMIN di
  **\`/dev > Storage\`** — maks teks (KB), maks file (MB), TTL default & maksimum,
  serta maks kiriman tertunda per pengirim.
`
}
