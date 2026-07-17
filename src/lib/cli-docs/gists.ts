export function buildGistsSection(): string {
  return `
## Gists — Kelola Snippet dari CLI

Gist adalah kumpulan file (snippet) yang menempel di **akun**. Kelola dari CLI:
list, cari, ambil, push, pull, dan hapus. Satu gist bisa berisi **banyak file**.

Gist dirujuk lewat **judul** (unik per akun) atau **UUID**-nya. Judul jadi kunci
stabil sehingga \`push <judul>\` bisa membuat lalu memperbarui gist yang sama.

### List

\`\`\`bash
envman gists ls                     # sampai 100 gist (milik sendiri + public)
envman gists ls --limit 50
envman gists ls --public            # hanya gist public
envman gists ls -q | fzf            # judul polos, pipe-friendly
envman gists ls --cursor <id>       # halaman berikutnya
\`\`\`

Tabel: judul, jumlah file, visibility, kapan terakhir diubah, pemilik. Bila ada
halaman berikutnya, cursor dicetak ke **stderr** (\`--cursor <id>\`).

### Find

\`\`\`bash
envman gists find docker            # cocokkan judul/deskripsi (case-insensitive)
envman gists find deploy --tags ci,devops
\`\`\`

Mencari lintas gist milik sendiri **dan** public.

### Get

\`\`\`bash
envman gists get 'Docker setup'     # detail + daftar file (nama, bahasa, ukuran)
envman gists get 'Docker setup' --json
envman gists get <uuid>             # by UUID
\`\`\`

### Push (buat / perbarui)

\`\`\`bash
envman gists push mycfg ./a.ts ./b.json           # 1 gist, 2 file
envman gists push mycfg ./a.ts --force            # perbarui gist yang sudah ada
envman gists push notes ./README.md --public --tags docs --desc "catatan"
\`\`\`

Menggabungkan beberapa file lokal jadi **satu** gist berjudul \`<judul>\`. Bahasa
tiap file dideteksi otomatis dari ekstensi. Jika judul sudah ada, gist hanya
diperbarui bila \`--force\` diberikan — jika tidak, error (mencegah timpa tak
sengaja). Membuat gist butuh capability \`gist:create\`. Token **read-only**
(\`canWrite=false\`) tidak bisa push atau hapus gist — hanya membaca (ls/find/get/pull).

### Pull

\`\`\`bash
envman gists pull mycfg             # 1 file → stdout
envman gists pull mycfg -o ./out/   # semua file → folder ./out/
envman gists pull mycfg -o ./out/ --force   # timpa file yang sudah ada
\`\`\`

Tanpa \`-o\` dan gist berisi **satu** file, isinya dicetak ke stdout. Untuk gist
multi-file, wajib \`-o <dir>\` — tiap file ditulis atomik ke folder itu.

### Remove

\`\`\`bash
envman gists rm mycfg               # by judul
envman gists rm <uuid>              # by UUID
\`\`\`

Hanya pemilik (atau SUPER_ADMIN) yang bisa menghapus.
`
}
