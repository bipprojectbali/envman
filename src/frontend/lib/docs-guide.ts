// Static content for the /envmanager/docs guide page — exempt from file health limits
export const buildDocs = (origin: string) => `
# Panduan Env Manager

Env Manager adalah platform terpusat untuk menyimpan dan mendistribusikan environment variables ke seluruh aplikasi dan tim — terenkripsi, terkontrol aksesnya, dan siap digunakan langsung dari terminal.

---

## Hak Akses

Setiap member project memiliki satu dari tiga role:

| Role | Yang Bisa Dilakukan |
|------|-------------------|
| **Owner** | Kelola member, environment, semua vars dan secrets, aliases, files |
| **Editor** | Tambah, ubah, hapus vars; lihat dan salin nilai secret |
| **Viewer** | Baca vars saja — nilai secret ditampilkan sebagai \`***\` |

Kamu bisa melihat role-mu di halaman detail project.

---

## Project

Project adalah wadah utama untuk satu aplikasi atau layanan. Setiap project memiliki:

- **Environments** — representasi tiap stage: \`production\`, \`staging\`, \`development\`, dll
- **Members** — siapa saja yang punya akses dan dengan role apa
- **Aliases** — pintasan untuk menjalankan perintah dengan env tertentu
- **Files** — script atau konfigurasi yang bisa dijalankan langsung dari CLI

### Membuat Project

1. Klik **New Project** di halaman utama
2. Isi slug (pengenal unik, huruf kecil + tanda hubung), nama, dan deskripsi
3. Kamu otomatis menjadi **Owner** project yang kamu buat

### Menambah Member

1. Buka project → tab **Members**
2. Cari user berdasarkan nama atau email
3. Pilih role yang sesuai → klik **Tambah**

---

## Environment Variables

Vars disimpan per environment dalam sebuah project.

### Menambah Var

1. Buka project → pilih environment
2. Klik **Add Var** — isi key (huruf kapital + underscore, contoh: \`DATABASE_URL\`) dan value
3. Centang **Secret** jika nilai ini sensitif (password, API key, token)

### Tentang Secret

Var yang ditandai secret:
- Nilainya **dienkripsi** sebelum disimpan
- Viewer hanya melihat \`***\` dan tidak bisa membuka nilainya
- Editor dan Owner bisa klik **Reveal** untuk melihat nilai asli
- CLI selalu mendapat nilai asli secara otomatis saat inject

### Tips

- Gunakan environment **base** atau **shared** untuk vars yang sama di semua stage, lalu **overlay** dengan environment spesifik
- Gunakan fitur **Compare** untuk melihat perbedaan vars antar environment
- Vars bisa di-export dalam format \`.env\` untuk keperluan backup atau sharing terbatas

---

## CLI

CLI adalah cara utama menggunakan Env Manager di terminal — inject vars ke runtime tanpa menyimpan file \`.env\` di disk.

### Instalasi

\`\`\`bash
# Linux x64
curl -sL ${origin}/download/cli/linux-x64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# Linux ARM64
curl -sL ${origin}/download/cli/linux-arm64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# macOS Apple Silicon
curl -sL ${origin}/download/cli/darwin-arm64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# macOS Intel
curl -sL ${origin}/download/cli/darwin-x64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/
\`\`\`

### Login

Buat token API terlebih dahulu di halaman **Tokens** atau **Profile**, lalu:

\`\`\`bash
envman login ${origin} --token em_TOKENMU
\`\`\`

Cek status:

\`\`\`bash
envman whoami
envman logout
\`\`\`

### Inject Vars ke Aplikasi

\`\`\`bash
# Jalankan aplikasi dengan vars dari server
envman -e myproject:production -- bun start
envman -e myproject:production -- node index.js
envman -e myproject:production -- python app.py

# Gabung beberapa environment (env kedua override yang pertama)
envman -e myproject:base -e myproject:production -- bun dev

# Mix server + file lokal (lokal override server)
envman -e myproject:production -e .env.local -- bun dev
\`\`\`

Vars yang sudah ada di sistem tidak akan tertimpa (merged wins). Gunakan \`--server-wins\` jika ingin vars server yang menang.

### Untuk CI/CD

Gunakan environment variable tanpa perlu login:

\`\`\`bash
ENVMAN_SERVER="${origin}" ENVMAN_TOKEN="em_TOKENMU" \\
  envman -e myproject:production -- bun start
\`\`\`

### Update CLI

\`\`\`bash
envman update
\`\`\`

CLI juga mengecek update otomatis di background dan akan memberi tahu jika ada versi baru.

---

## API Tokens

Token digunakan untuk mengakses server tanpa password — cocok untuk CLI, CI/CD, dan otomasi.

Buat token di halaman **Tokens** atau tab **API Tokens** di Profile.

### Scope Token

| Scope | Artinya |
|-------|---------|
| Kosong | Akses ke **semua project** yang kamu adalah member-nya |
| \`project:*\` | Semua environment di satu project |
| \`project:production\` | Hanya satu environment tertentu |

Scope hanya bisa membatasi — tidak bisa memperluas akses melampaui membership-mu.

### Read-Only vs Read-Write

- **Read-only** (default) — cukup untuk inject vars, export, dan membaca data. Gunakan ini untuk hampir semua kebutuhan.
- **Read-write** — diperlukan hanya jika token digunakan untuk mengubah vars di server (misal: otomasi pipeline yang push config).

### Tips

- Beri nama yang deskriptif: \`laptop-kerja\`, \`github-actions\`, \`deploy-server\`
- Set expiry untuk token CI/CD — lebih aman daripada token permanent
- Gunakan **Rotate** jika token sudah terlalu lama dipakai atau kemungkinan bocor
- Nonaktifkan token sementara dengan **Disable** tanpa harus menghapusnya

---

## Aliases

Alias adalah pintasan untuk menjalankan perintah yang sudah dikonfigurasi sebelumnya — lengkap dengan env source dan command-nya.

### Contoh Use Case

Daripada selalu mengetik:

\`\`\`bash
envman -e myproject:production -- bash deploy.sh --env prod --notify
\`\`\`

Simpan sebagai alias \`deploy\`, lalu cukup:

\`\`\`bash
envman run myproject:deploy
\`\`\`

### Membuat Alias

Buka project → tab **Aliases** → klik **New Alias**. Isi:
- **Name** — pengenal alias (huruf kecil, tanda hubung)
- **Args** — perintah CLI lengkap yang akan di-expand
- **Description** — penjelasan singkat untuk anggota tim

### Jalankan Alias

\`\`\`bash
# Jalankan langsung
envman run myproject:deploy

# Dengan env tambahan (prepend sebelum env alias)
envman run -e .env.local myproject:deploy

# Passthrough argumen ke command
envman run myproject:test -- --watch
\`\`\`

---

## Files

Project Files adalah tempat menyimpan script dan konfigurasi yang bisa dijalankan langsung dari CLI tanpa download manual.

### Contoh Use Case

- Script deploy yang dipakai seluruh tim
- Database seed untuk development
- Script migrasi atau maintenance
- Template konfigurasi

### Menjalankan File

\`\`\`bash
# Format: envman -- interpreter project:prefix/nama-file.ext
envman -- bash myproject:scripts/deploy.sh
envman -- bun myproject:utils/seed.ts
envman -- python3 myproject:scripts/migrate.py

# Dengan env injection sekaligus
envman -e myproject:production -- bash myproject:scripts/deploy.sh
\`\`\`

File dijalankan langsung dari server ke interpreter — tidak disimpan ke disk.

---

## Portainer Integration

Jika kamu menggunakan Docker dengan Portainer, Env Manager bisa push vars langsung ke stack tanpa copy-paste manual.

### Setup

1. Buka halaman **Connections** — tambah Portainer instance (URL + API token Portainer)
2. Buka project → pilih environment → scroll ke bagian **Portainer**
3. Klik **Connect** → pilih connection dan stack yang ingin di-sync
4. Klik **Sync** untuk push semua vars ke stack tersebut

Sync bisa dijalankan ulang kapan saja saat ada perubahan vars.

> **Catatan:** Nilai secret dikirim dalam bentuk terdekripsi ke Portainer — ini diperlukan agar container bisa menggunakan nilainya. Pastikan akses Portainer kamu juga terlindungi.
`

export const darkModeCSS = `
  .markdown-body { color-scheme: light dark; }
  html[data-mantine-color-scheme="dark"] .markdown-body {
    --color-canvas-default: transparent;
    --color-canvas-subtle: #161b22;
    --color-border-default: #30363d;
    --color-border-muted: #21262d;
    --color-neutral-muted: rgba(110,118,129,0.4);
    --color-accent-fg: #58a6ff;
    --color-accent-emphasis: #1f6feb;
    --color-fg-default: #e6edf3;
    --color-fg-muted: #8b949e;
    --color-fg-subtle: #6e7681;
    --color-prettylights-syntax-comment: #8b949e;
    --color-prettylights-syntax-constant: #79c0ff;
    --color-prettylights-syntax-entity: #d2a8ff;
    --color-prettylights-syntax-entity-tag: #7ee787;
    --color-prettylights-syntax-keyword: #ff7b72;
    --color-prettylights-syntax-string: #a5d6ff;
    --color-prettylights-syntax-variable: #ffa657;
    --color-prettylights-syntax-string-regexp: #7ee787;
    --color-prettylights-syntax-markup-heading: #1f6feb;
    --color-prettylights-syntax-markup-inserted-text: #aff5b4;
    --color-prettylights-syntax-markup-inserted-bg: #033a16;
    --color-prettylights-syntax-markup-deleted-text: #ffdcd7;
    --color-prettylights-syntax-markup-deleted-bg: #67060c;
  }
`
