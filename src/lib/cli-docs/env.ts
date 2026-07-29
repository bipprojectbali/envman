export function buildEnvSection(): string {
  return `
## Env — Sinkron .env dengan Environment

Push sebuah file \`.env\` lokal ke environment project (upsert per key), atau pull
vars sebuah environment menjadi \`.env\`. Referensikan environment sebagai
\`project:env\`.

### Push (.env → server)

\`\`\`bash
envman env push myapp:prod .env          # dari file
envman env push myapp:prod < .env        # dari stdin
cat .env | envman env push myapp:prod    # pipe
envman env push myapp:prod .env --dry-run    # pratinjau tanpa mengubah apa pun
\`\`\`

Perilaku **upsert**: key yang sudah ada diperbarui nilainya, key baru dibuat.
Key yang ada di server tapi **tidak** ada di file **dibiarkan** (tidak dihapus).
Environment yang belum ada akan dibuat otomatis.

**Auto-deteksi secret** dari nama key (case-insensitive): key yang mengandung
\`SECRET\`, \`TOKEN\`, \`PASSWORD\`, \`PRIVATE_KEY\`, \`API_KEY\`, \`CREDENTIAL\`,
\`DATABASE_URL\`, \`_DSN\`, atau berakhiran \`_KEY\` akan ditandai secret (dienkripsi
di server). Pengecualian: \`PUBLIC_KEY\` tetap plaintext.

Key yang **sudah** secret di server tetap secret walau heuristik meleset
(server menang). Override per key:

\`\`\`bash
envman env push myapp:prod .env --plain PUBLIC_URL,BUILD_KEY   # paksa plaintext
envman env push myapp:prod .env --secret LICENSE               # paksa secret
envman env push myapp:prod .env --no-detect                    # matikan auto-deteksi
\`\`\`

Gunakan \`--dry-run\` untuk melihat mana yang akan \`create\`/\`update\` dan mana yang
jadi \`[secret]\` sebelum benar-benar push — disarankan sebelum push ke produksi.

### Pull (server → .env)

\`\`\`bash
envman env pull myapp:prod                # cetak ke stdout
envman env pull myapp:prod > .env         # redirect ke file
envman env pull myapp:prod -o .env        # tulis ke file (atomic)
envman env pull myapp:prod -o .env --force    # timpa file yang sudah ada
\`\`\`

Nilai yang mengandung spasi, \`=\`, \`#\`, atau newline otomatis dikutip
(\`KEY="..."\`). Dengan \`-o\`, penulisan bersifat atomik dan **menolak menimpa**
file yang sudah ada kecuali \`--force\`.

Secret yang **tidak bisa kamu reveal** (akses VIEWER menerima \`***\`) akan
**dilewati** dan dilaporkan ke stderr — sehingga \`.env\` yang dihasilkan tetap
valid. Untuk mengambil nilai secret asli, kamu butuh akses EDITOR/OWNER.

### Keys (nama key saja, tanpa value)

Cetak **hanya nama key** dari sebuah \`.env\` lokal atau environment server —
tanpa value sama sekali. Berguna untuk memberi tahu AI agent *bentuk* sebuah env
tanpa membocorkan rahasia: tinggal paste daftar key-nya.

\`\`\`bash
envman env keys .env                      # dari file lokal → KEY=
envman env keys myapp:prod                # dari server → KEY=
envman env keys myapp:prod --names        # nama saja: DATABASE_URL (tanpa =)
envman env keys .env | pbcopy             # ke clipboard OS
envman env keys myapp:prod | envman clip set   # ke clipboard akun (lintas device)
\`\`\`

Sumber dideteksi otomatis: argumen dengan pola \`project:env\` diambil dari server,
selain itu dianggap path file. Output default adalah template \`KEY=\` (siap diisi,
sama dengan tombol "Copy keys" di UI); \`--names\` mencetak nama key polos. Value
**tidak pernah** dikeluarkan — aman dibagikan ke agent atau sebagai dokumentasi.
Karena hanya nama key, akses VIEWER pun cukup.

### Sync (\`.env.example\` → \`.env\`, lokal)

Tambahkan key yang **ada di file sumber tapi belum ada** di \`.env\` kamu. Kasus
khasnya: AI agent memperbarui \`.env.example\`, sementara \`.env\` milikmu
tertinggal — dan mencocokkan puluhan key secara manual itu menyakitkan.

Berjalan **sepenuhnya lokal**: tanpa login, tanpa memanggil server.

\`\`\`bash
envman env sync .env.example              # dry-run: laporkan apa yang akan ditambah
envman env sync .env.example .env         # target eksplisit (default: .env)
envman env sync .env.example --write      # terapkan (backup ke .env.bak)
envman env sync .env.example --keys-only  # cetak nama key yang hilang saja
envman env sync .env.example --keys-only | pbcopy
envman env sync .env.example --write --no-backup
\`\`\`

**Hanya menambah — tak pernah mengubah atau menghapus.** Key yang sudah ada di
target **tidak disentuh sama sekali**, berapa pun bedanya nilainya (\`DB_HOST\`
lokalmu tetap \`127.0.0.1\` walau sumber menulis \`localhost\`). Key yang ada di
\`.env\` tapi tak ada di sumber (kemungkinan config usang) hanya **dilaporkan**,
tidak dihapus.

Key baru di-**append** dalam satu blok di akhir file, membawa serta **heading
grup** dan **komentar per-key** dari sumber sehingga tak kehilangan konteks:

\`\`\`
# ────────────────────────────────────────
# Ditambahkan oleh: envman env sync
# Sumber: .env.example · 2026-07-29
# ────────────────────────────────────────

# === Database ===
# koneksi utama
DB_HOST=localhost

# === App ===
APP_NAME=envman
\`\`\`

Isi \`.env\` yang lama **tak pernah ditulis ulang** — urutan, komentar, kutipan,
dan baris kosongnya utuh byte-per-byte. Nilai disalin dari sumber apa adanya
(\`APP_NAME=envman\` ikut tersalin; \`SUPER_ADMIN=\` tetap kosong).

**Default-nya dry-run** — tak ada yang berubah sampai kamu menambahkan
\`--write\`. Saat menerapkan, isi lama disalin dulu ke \`<target>.bak\`
(matikan dengan \`--no-backup\`); ingat file backup ini berisi nilai asli, jadi
pastikan ter-\`.gitignore\`.

Menjalankan ulang setelah sumber bertambah key akan menambahkan **blok kedua
bertanggal** di bawahnya — ini disengaja, agar riwayat penambahan terbaca.
`
}
