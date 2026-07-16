export function buildHealthSection(): string {
  return `
## Health — Cari File yang Terlalu Besar untuk Konteks AI

\`envman health\` memindai sebuah project (lokal, tak perlu login) dan melaporkan
file yang jumlah baris/karakternya mendekati atau melewati batas — persis file
yang membludakkan context window agent AI.

### Scan

\`\`\`bash
envman health                     # scan folder saat ini
envman health ./src               # scan folder tertentu
envman health --status critical   # tampilkan hanya yang kritis
envman health --ext ts,tsx,go     # batasi ke ekstensi tertentu
\`\`\`

Status file: **ok** (<80% batas), **warning** (80–99%), **critical** (≥100%).
Batas default 500 baris / 20.000 karakter — ubah dengan \`--max-lines\` /
\`--max-chars\`. Direktori dependency & build (\`node_modules\`, \`.git\`, \`dist\`,
\`vendor\`, dll) dan file biner otomatis dilewati. Traversal berhenti di kedalaman
20 (\`--depth 0\` = tanpa batas; \`--depth N\` = batas kustom).

### Kirim daftar file bermasalah ke agent

Gunakan \`--copy <status>\` untuk mencetak **hanya path** (satu per baris) supaya
bisa langsung di-pipe — tinggal tempel ke agent AI dan minta di-split:

\`\`\`bash
envman health --copy critical | pbcopy          # ke clipboard OS
envman health --copy all | envman clip set      # ke clipboard akun (lintas device)
envman health --copy warning                    # cukup yang warning
\`\`\`

\`--copy all\` = warning + critical (semua yang perlu ditindak). \`-q\` mencetak
semua path polos (opsional dengan \`--status\`).

### Flag

\`\`\`
--status ok|warning|critical    filter tampilan
--copy critical|warning|all     cetak path saja (pipe-friendly)
--ext ts,tsx,go                 hanya ekstensi ini (default: semua file teks)
--max-lines N                   batas baris (default 500)
--max-chars N                   batas karakter (default 20000)
--depth N                       kedalaman maksimum (0 = tanpa batas; default 20)
--all                           ikutkan folder tersembunyi (diawali titik)
-q, --quiet                     path polos untuk semua file
\`\`\`
`
}
