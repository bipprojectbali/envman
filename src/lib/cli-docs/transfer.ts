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
# [envman] kode sekali-pakai: viking.pudding.alaska.sunny
# [envman] kedaluwarsa 59m — kode ini hanya ditampilkan SEKALI
#   ENVMAN_CODE='viking.pudding.alaska.sunny' envman transfer get --server https://envman.example.com
\`\`\`

Baris perintah itu **aman dikirim lewat chat** — yang rahasia ada di server, bukan
di pesannya. Penerima tak perlu akun, tak perlu \`envman login\`:

\`\`\`bash
ENVMAN_CODE='viking.pudding.alaska.sunny' envman transfer get --server https://envman.example.com -o .env
\`\`\`

> \u26a0\ufe0f **Jangan berikan kode sebagai argumen di mesin bersama.** Argumen terlihat
> oleh siapa pun yang menjalankan \`ps aux\` dan tersimpan di history shell. Pakai
> \`ENVMAN_CODE=…\` seperti contoh di atas, atau pipe lewat stdin; tanpa keduanya
> envman akan menanyakannya. Hal yang sama berlaku untuk \`envman login --token\`
> (pakai \`ENVMAN_TOKEN\`).

Kodenya **empat kata** dari daftar 1296 kata pilihan EFF — dibuat untuk
didiktekan lewat telepon dan diketik ulang tanpa salah, tak seperti deret acak
yang menggantikannya. Boleh diketik huruf besar, dan spasi boleh menggantikan
titik: \`VIKING PUDDING ALASKA SUNNY\` tetap diterima.

Empat kata memberi ≈41 bit. Terdengar lebih kecil daripada kode acak sebelumnya,
tapi jalur klaim dibatasi 10 percobaan gagal per IP per 10 menit (plus 100 secara
global), jadi menebaknya tetap di luar jangkauan — sementara kodenya kini benar-benar
bisa dibacakan.

Kode **hanya ditampilkan sekali** — server hanya menyimpan hash-nya. Kalau hilang,
cabut dengan \`envman transfer rm <id>\` lalu kirim ulang.

### Memilih kode sendiri

Kalau kamu akan langsung memakainya di mesin sebelah, kode buatan sendiri lebih
praktis daripada menyalin empat kata:

\`\`\`bash
envman transfer send .env --once --code setup-mesin-baru
# [envman] kode pilihan sendiri lebih mudah ditebak daripada kode acak —
#          masa berlakunya dipersingkat jadi 15 menit.
\`\`\`

Syaratnya: **minimal 12 karakter**, hanya huruf/angka/\`.\`/\`_\`/\`-\` (tanpa spasi
atau karakter shell, karena kodenya masuk ke baris perintah siap-tempel).

> ⚠️ **Masa berlakunya dipaksa maksimal 15 menit** dan tak bisa diperpanjang,
> bahkan dengan \`--ttl\`. Kode yang mudah diingat juga lebih mudah ditebak;
> umur pendek itulah yang membuatnya tetap aman. Jangan pakai kode yang sama
> berulang kali.

Sifat "sekali ambil lalu hilang" **bukan** alasan kode boleh lemah: yang berbahaya
justru penyerang yang mengklaim **lebih dulu** dari penerima sah — dan kalau itu
terjadi, penerima hanya melihat pesan "sudah diklaim" tanpa bisa tahu apa yang
sebenarnya terjadi.

### Ambil kiriman

\`\`\`bash
envman transfer ls                          # apa saja yang menunggu
envman transfer ls --json                   # untuk script
envman transfer get <id> --copy               # ke clipboard, tak tampil di layar
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
