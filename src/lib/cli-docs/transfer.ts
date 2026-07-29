export function buildTransferSection(): string {
  return `
## Send / Inbox / Recv — Kirim Secret Antar User

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
envman send .env.prod --to budi@example.com
envman send .env.prod --to Budi                 # nama persis, kalau unik
cat notes.txt | envman send --to budi@example.com
envman send id_rsa --to budi@example.com -m "kunci deploy" --ttl 2h
\`\`\`

Penerima dicocokkan **persis** (email atau nama) — sengaja tidak fuzzy, supaya
satu typo tak mengirim \`.env\` produksi ke orang yang salah. Nama yang cocok ke
lebih dari satu user ditolak; pakai email.

### Kirim ke orang tanpa akun (kode sekali-pakai)

\`\`\`bash
envman send .env --once --ttl 1h
# [envman] kode sekali-pakai: EM-3F7K-9QW2-M4XZ-7T1B
# [envman] kedaluwarsa 59m — kode ini hanya ditampilkan SEKALI
#   envman recv EM-3F7K-9QW2-M4XZ-7T1B --server https://envman.example.com
\`\`\`

Baris perintah itu **aman dikirim lewat chat** — yang rahasia ada di server, bukan
di pesannya. Penerima tak perlu akun, tak perlu \`envman login\`:

\`\`\`bash
envman recv EM-3F7K-9QW2-M4XZ-7T1B --server https://envman.example.com -o .env
\`\`\`

Kode boleh diketik huruf kecil atau tanpa tanda hubung. Alfabetnya sengaja tak
memuat \`I\`, \`L\`, \`O\`, \`U\` supaya \`0/O\` dan \`1/I/L\` tak tertukar.
Kode **hanya ditampilkan sekali** — server hanya menyimpan hash-nya. Kalau hilang,
cabut dengan \`envman send rm <id>\` lalu kirim ulang.

### Ambil kiriman

\`\`\`bash
envman inbox                          # apa saja yang menunggu
envman recv <id> -o .env              # ambil ke file (mode 0600)
envman recv <id> > .env               # atau lewat pipe
envman inbox --sent                   # yang kamu kirim: sudah diambil belum?
envman send rm <id>                   # cabut / tolak
\`\`\`

### Yang perlu diketahui

- **Hangus setelah dibaca.** Sekali diambil, kiriman hilang — tak ada yang bisa
  membacanya lagi. Pakai \`--keep\` bila perlu diambil dari beberapa mesin.
- **Selalu ada kedaluwarsa.** Default 3 hari, atur dengan \`--ttl 30m|2h|7d\`.
  Kiriman yang tak diambil terhapus otomatis.
- **Tidak ada notifikasi.** Penerima baru tahu saat menjalankan \`envman inbox\`,
  jadi kabari dia lewat chat — pesannya sendiri tak memuat rahasia apa pun.
- **Token read-only boleh mengambil**, tapi tak boleh mengirim. Jadi token CI
  bisa menarik sertifikat dari inbox-nya tanpa diberi izin tulis.
- **Rotasi \`MASTER_KEY\` mematikan kiriman yang masih menggantung** — kuras inbox
  sebelum merotasi.
- Batas ukuran, TTL maksimum, dan jumlah kiriman tertunda diatur SUPER_ADMIN di
  \`/dev > Settings\` (\`transfer_max_text_kb\`, \`transfer_max_ttl_hours\`,
  \`transfer_default_ttl_hours\`, \`transfer_max_pending_per_user\`).
`
}
