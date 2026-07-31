export function buildClipSection(): string {
  return `
## Clip — Clipboard Akun Lintas Device

Clipboard slot-tunggal yang menempel di **akun** (bukan device), tersinkron via
server — seperti \`pbcopy\`/\`pbpaste\` tapi bisa diakses dari mesin lain dengan
akun yang sama. Berguna saat kamu berpindah antara server dan lokal.

Konten **dienkripsi at-rest** (AES-256-GCM) dan **kedaluwarsa otomatis** setelah
24 jam (default).

### Copy di satu mesin, paste di mesin lain

\`\`\`bash
# di server (tak ada pbcopy):
cat .env | envman clip set

# di laptop:
envman clip get --copy    # ke clipboard OS mesin ini
envman clip get > .env
\`\`\`

### Set

\`\`\`bash
cat .env | envman clip set              # dari stdin
envman clip set .env                     # dari file
envman clip set --ttl 1h < notes.txt     # TTL kustom (30m, 2h, 7d; default 24h)
echo "catatan cepat" | envman clip set   # teks bebas apa saja
\`\`\`

\`set\` menimpa isi sebelumnya (slot tunggal). Nilai \`--ttl\` menerima durasi
(\`30m\`, \`2h\`, \`7d\`) atau angka detik. Server membatasi TTL maksimum (default
7 hari) dan ukuran konten (default 1 MB) — bisa diubah SUPER_ADMIN di
\`/dev > Settings\`.

### Get

\`\`\`bash
envman clip get                # cetak ke stdout
envman clip get > .env         # redirect ke file
envman clip get -o .env        # tulis ke file (atomic)
envman clip get -o .env --force    # timpa file yang sudah ada
\`\`\`

Jika clipboard kosong atau sudah kedaluwarsa, \`get\` mengembalikan error (exit
code non-nol) — aman dipakai di skrip.

### Clear

\`\`\`bash
envman clip clear              # kosongkan clipboard
\`\`\`
`
}
