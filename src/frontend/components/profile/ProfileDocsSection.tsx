import { Box } from '@mantine/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import 'github-markdown-css/github-markdown.css'

const buildDocs = (origin: string) => `
# Panduan Pengguna

Cara menggunakan Env Manager dari sisi pengguna — install CLI, gunakan token API, dan pahami hak akses di setiap project.

---

## Install CLI

Download binary sekali, langsung bisa dipakai tanpa Node.js atau runtime lain:

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

Verifikasi:

\`\`\`bash
envman --version
\`\`\`

---

## Login

### Cara 1 — Simpan ke config file (rekomendasi untuk laptop/workstation)

Buat token di tab **API Tokens** di halaman ini, lalu:

\`\`\`bash
envman login ${origin} --token em_TOKENMU
\`\`\`

Cek siapa yang login:

\`\`\`bash
envman whoami
# → user@example.com (USER)
# → Token: nama-token-ku
# → Server: ${origin}
\`\`\`

### Cara 2 — Via environment variable (rekomendasi untuk CI/CD)

\`\`\`bash
export ENVMAN_SERVER="${origin}"
export ENVMAN_TOKEN="em_TOKENMU"
envman -e myproject:production -- bun start
\`\`\`

### Cara 3 — Auth dari file lokal (rekomendasi untuk tim/shared server)

Simpan credentials di file \`.env.creds\`:

\`\`\`bash
ENVMAN_SERVER=${origin}
ENVMAN_TOKEN=em_TOKENMU
\`\`\`

Gunakan dengan flag \`-e\`:

\`\`\`bash
envman -e .env.creds -e myproject:production -- bun start
\`\`\`

> Credentials tidak pernah bocor ke proses yang dijalankan — ENVMAN_SERVER dan ENVMAN_TOKEN selalu di-strip otomatis.

---

## Gunakan Token

Token dibuat di tab **API Tokens** di halaman ini.

### Inject vars ke runtime

\`\`\`bash
# Satu environment
envman -e myproject:production -- bun start

# Gabung beberapa env (env kedua override yang pertama)
envman -e myproject:base -e myproject:production -- bun dev

# Mix server + local (local override server)
envman -e myproject:production -e .env.local -- bun dev
\`\`\`

### Scope token

| Scope | Artinya |
|-------|---------|
| Kosong \`[]\` | Akses ke **semua project** yang kamu jadi member |
| \`project:*\` | Semua environment di satu project |
| \`project:production\` | Hanya satu environment tertentu |

> Token hanya bisa mengakses project yang kamu sudah menjadi member. Kalau kamu belum di-assign ke project, token juga tidak bisa akses project itu.

---

## Hak Akses di Project

Setiap project punya role tersendiri untuk setiap member:

| Role | Yang Bisa Dilakukan |
|------|-------------------|
| **OWNER** | Kontrol penuh — tambah/hapus member, kelola env, vars, aliases, files |
| **EDITOR** | Tambah, edit, hapus vars; bisa lihat dan reveal secret values |
| **VIEWER** | Hanya baca vars — secret tampil sebagai \`***\`, tidak bisa reveal |

Lihat project dan role kamu di tab **Projects** di halaman ini.

### Catatan untuk token

- Token dengan scope kosong (\`[]\`) akan mengikuti role kamu di setiap project
- Token dengan \`canWrite=false\` (default) — read-only, tidak bisa push vars ke server
- Token dengan \`canWrite=true\` — bisa write, tapi tetap dibatasi oleh role kamu (VIEWER tidak bisa write walaupun token-nya read-write)

---

## Update CLI

\`\`\`bash
envman update
\`\`\`

CLI juga cek update otomatis di background setiap 15 menit dan replace binary jika ada versi baru.

---

## Logout

\`\`\`bash
envman logout
\`\`\`

Ini hanya menghapus \`~/.config/envman/config.json\` — token di server tidak ikut dihapus. Hapus token dari tab **API Tokens** jika ingin merevoke akses sepenuhnya.
`

const darkModeCSS = `
  .markdown-body { color-scheme: light dark; }
  html[data-mantine-color-scheme="dark"] .markdown-body {
    --color-canvas-default: transparent;
    --color-canvas-subtle: #161b22;
    --color-border-default: #30363d;
    --color-border-muted: #21262d;
    --color-neutral-muted: rgba(110,118,129,0.4);
    --color-accent-fg: #58a6ff;
    --color-fg-default: #e6edf3;
    --color-fg-muted: #8b949e;
    --color-prettylights-syntax-keyword: #ff7b72;
    --color-prettylights-syntax-string: #a5d6ff;
    --color-prettylights-syntax-constant: #79c0ff;
    --color-prettylights-syntax-entity-tag: #7ee787;
    --color-prettylights-syntax-comment: #8b949e;
    --color-prettylights-syntax-variable: #ffa657;
    --color-prettylights-syntax-markup-heading: #1f6feb;
    --color-prettylights-syntax-markup-inserted-text: #aff5b4;
    --color-prettylights-syntax-markup-inserted-bg: #033a16;
  }
`

export function ProfileDocsSection() {
  const origin = window.location.origin
  return (
    <Box
      className="markdown-body"
      style={{ maxWidth: 760, backgroundColor: 'transparent', color: 'inherit', paddingBottom: 48 }}
    >
      <style>{darkModeCSS}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{buildDocs(origin)}</ReactMarkdown>
    </Box>
  )
}
