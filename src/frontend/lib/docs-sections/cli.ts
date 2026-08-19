export function buildCliSection(origin: string): string {
  return `
## CLI

### Instalasi

**One-liner (Linux & macOS, auto-detect platform):**

\`\`\`bash
curl -fsSL ${origin}/install | bash
\`\`\`

**Manual per platform:**

\`\`\`bash
# Linux x64
curl -sL ${origin}/download/cli/linux-x64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# Linux ARM64
curl -sL ${origin}/download/cli/linux-arm64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# macOS Apple Silicon (ARM64)
curl -sL ${origin}/download/cli/darwin-arm64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# macOS Intel (x64)
curl -sL ${origin}/download/cli/darwin-x64 -o envman
chmod +x envman && sudo mv envman /usr/local/bin/

# Windows x64 (PowerShell)
Invoke-WebRequest -Uri "${origin}/download/cli/windows-x64" -OutFile "envman.exe"
\`\`\`

Binary standalone — tidak butuh Node.js, npm, atau runtime lain.

---

### Commands

\`\`\`bash
envman login <server-url> --token <token>          # Simpan ke ~/.config/envman/config.json
envman logout                                       # Hapus config tersimpan
envman whoami                                       # Tampilkan user + server aktif
envman update                                       # Update CLI ke versi terbaru
envman docs                                        # Print docs + referensi lengkap ke stdout
envman run [-e <source>]... <project>:<alias> [args...]  # Ekspansi alias + inject vars
envman [options] -- <command>                      # Inject vars & jalankan command
envman -- <interpreter> <project>:<path/file.ext>  # Execute project file (tanpa tulis ke disk)
envman --version                                   # Tampilkan versi CLI
envman --help                                      # Bantuan
\`\`\`

Semua fitur dikelompokkan di bawah satu kata benda (\`env\`, \`clip\`, \`gists\`, \`storage\`, \`projects\`, \`portainer\`, \`transfer\`). Perintah \`health\`, \`sys\`, \`install\`, dan \`env sync\` berjalan **tanpa login**.

---

### Sinkronisasi \`.env\` (\`envman env\`)

\`\`\`bash
envman env push web:prod .env        # Upsert per-key ke server (auto-deteksi secret)
envman env pull web:prod -o .env     # Tarik vars jadi file .env (atomic 0600)
envman env keys web:prod             # Cetak NAMA key saja (value tak pernah keluar → aman untuk AI)
envman env sync .env.example .env    # LOKAL tanpa login — tambah key yang hilang, append-only
\`\`\`

- **push**: key server yang tak ada di file **tidak dihapus**; env belum ada → auto-create. Secret dideteksi via pola (\`SECRET\`, \`PASSWORD\`, \`API_KEY\`, \`TOKEN\`, suffix \`_KEY\`, dll., kecuali \`PUBLIC_KEY\`). Prioritas: \`--plain\` > \`--secret\` > secret-server-wins > auto.
- **pull**: secret yang ter-mask \`***\` (VIEWER) dilewati + warn. \`-o\` menolak overwrite tanpa \`--force\`.
- **sync**: murni lokal, append-only — key existing tak disentuh, key yatim dilaporkan (tak dihapus). Default dry-run; \`--write\` untuk terapkan.

---

### Clipboard Akun (\`envman clip\`)

\`\`\`bash
cat .env | envman clip set          # Set clipboard dari stdin (atau: envman clip set file)
envman clip get -o .env             # Ambil clipboard (stdout tanpa -o)
envman clip clear                   # Kosongkan
\`\`\`

Slot tunggal per akun, **terenkripsi at-rest**, auto-expire (TTL default 24 jam, \`--ttl\`). Copy di server, paste di laptop — lintas device dengan akun sama.

---

### Transfer Secret User-ke-User (\`envman transfer\`)

\`\`\`bash
envman transfer send .env --to alice@example.com   # Kirim ke user terdaftar
envman transfer send key.pem --once                # Kode sekali-pakai (4 kata)
envman transfer send .env --to bob --keep          # Boleh diambil berkali-kali sampai TTL
envman transfer ls                                 # Inbox (--sent untuk kiriman keluar)
envman transfer get <id|KODE> -o .env              # Ambil (KODE tanpa login via ENVMAN_CODE)
envman transfer rm <id>                            # Batalkan/hapus
\`\`\`

- **Kode klaim = 4 kata** (mis. \`viking.pudding.alaska.sunny\`) — mudah didikte lewat telepon. \`--code\` untuk pilih sendiri (min 12 char, TTL dipaksa ≤15 menit).
- **Burn-after-read** default (sekali ambil lalu hangus); \`--keep\` mematikannya.
- Teks kecil dienkripsi di DB; file besar/biner dialirkan langsung ke storage (auto-deteksi mode, override \`--text\`/\`--file\`).
- ⚠️ **Bukan E2E** — enkripsi at-rest dengan kunci server; admin pemegang \`MASTER_KEY\` secara teknis bisa membaca.

---

### Gists / Snippet (\`envman gists\`, alias \`gist\`)

\`\`\`bash
envman gists ls                              # Gist milik sendiri (--public untuk yang publik)
envman gists find "docker compose"           # Cari
envman gists get <judul|id>                  # Tampilkan
envman gists push "Deploy Script" deploy.sh --tags ops --public
envman gists pull <judul|id>[:file] -o dir   # Ambil ke disk (1 file → stdout)
envman gists rm <judul|id>[:file]            # Hapus gist atau satu file
\`\`\`

Snippet multi-file, dirujuk by **judul** (unik per user) atau UUID. \`push\` upsert per-file (timpa butuh \`--force\`; \`--clean\` ganti seluruh set, sebut file yang hilang).

---

### Project Storage (\`envman storage\`)

\`\`\`bash
envman storage ls web:assets/               # List file di project
envman storage upload web ./dist            # Upload file/folder (>50MB auto chunked)
envman storage download web:dump.sql | psql # Stream langsung dari MinIO
envman storage exec web:bin/migrate -- --up # Jalankan binary ter-cache
envman storage rm web:tmp/                   # Hapus folder (OWNER only, pratinjau dulu)
\`\`\`

Detail lengkap ada di bagian **Project Storage**.

---

### Portainer (\`envman portainer\`, alias \`pt\`)

\`\`\`bash
envman portainer status web:prod            # Status stack
envman portainer ps web:prod                # Daftar container
envman pt logs web:prod api -f              # Live logs (SSE, Ctrl+C untuk stop)
envman pt restart-soft web:prod             # stop→start tanpa pull (stack:power)
envman pt sync-repull web:prod              # Push vars lalu repull image (stack:deploy)
envman pt prune web:prod                     # Prune image
\`\`\`

Thin client atas endpoint Portainer env-scoped; operasi di-gate per-capability.

---

### Diagnostik Lokal — Tanpa Login

\`\`\`bash
envman health [dir]     # Scan file yang terlalu besar untuk konteks AI (lokal)
envman sys              # Snapshot mesin: CPU, RAM, disk, load (gopsutil)
envman sys --du ./dir   # Ukuran direktori
envman sys --public-ip  # Cek IP publik (satu-satunya egress)
\`\`\`

---

### Rahasia & Clipboard (aturan keamanan)

- **\`--copy\`** (banyak perintah): kirim rahasia ke clipboard mesin **lokal**, bukan ke stdout/scrollback (pbcopy → wl-copy → xsel/xclip → OSC 52 lewat SSH). Eksklusif dengan \`-o\`.
- **Rahasia jangan lewat argumen** (bocor via \`ps\`/history). CLI membaca token/kode/password via: env var → stdin → prompt → argumen (dengan peringatan). Env: \`ENVMAN_TOKEN\`, \`ENVMAN_CODE\`.
- **\`--json\`** (tanpa shorthand) → stdout hanya data, status ke stderr.

---

### Flag Inject

| Flag | Format | Keterangan |
|------|--------|-----------|
| \`-e project:env\` | \`project:environment\` | Fetch vars dari server |
| \`-e file\` | path (tanpa titik dua sebagai separator project) | Load dari file lokal |
| \`--server-wins\` | — | System env menang vs merged vars (default: merged wins) |

**Aturan merge** — ketika multiple \`-e\` dipakai:
- Flag terakhir menang atas flag sebelumnya
- System env (process.env) menang atas hasil merge (kecuali pakai \`--server-wins\`)
- \`ENVMAN_SERVER\` dan \`ENVMAN_TOKEN\` selalu di-strip sebelum diteruskan ke child process

---

### Alias Expansion (\`envman run\`)

\`\`\`bash
envman run myapp:deploy            # Ekspansi alias "deploy" di project myapp
envman run -e myapp:prod myapp:deploy  # Extra -e di-merge sebelum stored sources (stored wins)
envman run myapp:seed -- --dry-run # Argumen setelah -- diteruskan ke command alias
\`\`\`

Alias menyimpan args + sources di server. \`envman run\` fetch via \`GET /api/envman/aliases/resolve/<ref>\`, parse ulang, lalu inject vars.

---

### File Execution (execute project file tanpa tulis ke disk)

\`\`\`bash
# Canonical syntax: slug:prefix/file.ext atau slug:file.ext
envman -- bash myapp:scripts/deploy.sh
envman -- bun myapp:utils/seed.ts
envman -- python3 myapp:jobs/ingest.py

# Dengan inject vars
envman -e myapp:production -- bash myapp:scripts/deploy.sh
\`\`\`

**Disambiguasi path**: setelah colon, ada \`/\` **atau** ada ekstensi file yang dikenal (\`sh\`, \`ts\`, \`js\`, \`py\`, \`go\`, \`yaml\`, \`sql\`, \`md\`, dll.) → file reference. Sisanya → nama environment (termasuk nama seperti \`staging.v2\` atau \`env.local\`).

**Interpreter stdin (zero disk write):** \`bash\`, \`sh\`, \`zsh\`, \`bun\`, \`node\`, \`python3\`, \`python\`, \`deno\`. Interpreter lain → temp file 0600.

Bun scripts bisa langsung import npm tanpa \`node_modules\` — CLI auto-pass \`--install=fallback\`. Pin versi inline: \`import { z } from "zod@^3.22"\`.

---

### \`envman docs\`

\`\`\`bash
envman docs              # Print docs lengkap ke stdout (markdown)
envman docs | pbcopy     # Salin ke clipboard
envman docs > context.md # Simpan ke file, lalu attach ke context AI agent
\`\`\`

Butuh auth (\`envman login\` atau env var). Fetch dari \`${origin}/api/docs.md\`.

---

### Auth Resolution (prioritas tertinggi → terendah)

1. \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` dari vars di file \`-e\` (lokal)
2. \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` dari \`process.env\` / system env
3. \`~/.config/envman/config.json\` (disimpan oleh \`envman login\`)

---

### Contoh Penggunaan

\`\`\`bash
# Single environment
envman -e myapp:production -- bun start

# Multiple — production override base
envman -e myapp:base -e myapp:production -- bun dev

# Mix server + local (local override server)
envman -e myapp:production -e .env.local -- bun dev

# Dua project berbeda sekaligus
envman -e project-a:production -e project-b:staging -- bun start

# CI/CD — auth via env vars, tanpa login
ENVMAN_SERVER=${origin} \\
ENVMAN_TOKEN=<TOKEN> \\
  envman -e myapp:production -- bun start

# GitHub Actions
# env:
#   ENVMAN_SERVER: ${origin}
#   ENVMAN_TOKEN: $\{{ secrets.ENVMAN_TOKEN }}
# run: envman -e myapp:production -- bun start

# Print docs untuk context AI agent
envman docs > /tmp/envman-context.md
\`\`\`

---
`
}
