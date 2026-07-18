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
envman gists push mycfg ./a.ts --force            # timpa a.ts saja — file lain aman
envman gists push mycfg ./a.ts ./b.json --clean   # gist jadi PERSIS file ini
envman gists push notes ./README.md --public --tags docs --desc "catatan"
\`\`\`

Menggabungkan file lokal ke dalam **satu** gist berjudul \`<judul>\`. Bahasa tiap
file dideteksi otomatis dari ekstensi.

**Push = upsert per-file** — hanya menyentuh file yang kamu sebut:
- Judul belum ada → gist baru dibuat.
- Nama file baru → **ditambahkan** ke gist.
- Nama file yang **sudah ada** → dibiarkan kecuali kamu beri \`--force\` (menimpa
  hanya file itu). **File lain tak pernah dihapus.**

Untuk mengganti seluruh isi gist (membuang file yang tak kamu sebut) → \`--clean\`.
Untuk menghapus satu file → \`envman gists rm <judul>:<file>\`.

\`--public\`/\`--desc\`/\`--tags\` hanya mengubah field itu **bila kamu menyebutkannya** —
update tak pernah diam-diam mereset metadata. Membuat gist butuh capability
\`gist:create\`. Token **read-only** (\`canWrite=false\`) tak bisa push/hapus — hanya
membaca (ls/find/get/pull).

### Pull

\`\`\`bash
envman gists pull mycfg             # 1 file → stdout
envman gists pull mycfg -o ./out/   # semua file → folder ./out/
envman gists pull mycfg -o ./out/ --force   # timpa file yang sudah ada
\`\`\`

Tanpa \`-o\` dan gist berisi **satu** file, isinya dicetak ke stdout. Untuk gist
multi-file, wajib \`-o <dir>\` — tiap file ditulis atomik ke folder itu.

**Ambil satu file** dari gist multi-file (pipe-friendly) — pakai \`--file <name>\`
atau ref \`judul:namafile\`:

\`\`\`bash
envman gists pull mycfg --file a.ts        # isi a.ts → stdout
envman gists pull mycfg:a.ts               # sama, via ref judul:namafile
envman gists pull mycfg:a.ts | grep KEY    # langsung di-pipe
envman gists pull mycfg --file a.ts -o a.ts   # tulis 1 file ke path
\`\`\`

\`--file\` menang atas ref (berguna bila judul mengandung \`:\`). File tak ditemukan →
error yang menampilkan daftar file tersedia.

### Remove

\`\`\`bash
envman gists rm mycfg               # hapus seluruh gist (by judul)
envman gists rm <uuid>              # by UUID
envman gists rm mycfg:b.json        # hapus SATU file, sisanya tetap
envman gists rm mycfg --file b.json # sama, via --file
\`\`\`

Menghapus satu file via ref \`judul:namafile\` atau \`--file\` — file lain di gist
dipertahankan. File **terakhir** tak bisa dihapus dengan cara ini (akan menyisakan
gist kosong) — hapus seluruh gist saja. Hanya pemilik (atau SUPER_ADMIN) yang bisa
menghapus.
`
}
