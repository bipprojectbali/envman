import { Box } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import 'github-markdown-css/github-markdown.css'

export const Route = createFileRoute('/envmanager/docs')({
  component: DocsPage,
})

const buildDocs = (origin: string) => `
# Docs

Panduan penggunaan Env Manager — tool self-hosted untuk mengelola environment variables secara terpusat, terenkripsi, dan mudah diinjeksi ke runtime tanpa mengubah kode aplikasi.

---

## Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🔐 **Enkripsi Secret** | Vars yang ditandai secret dienkripsi AES-256-GCM sebelum disimpan di database |
| 👥 **Role-Based Access** | Owner, Editor, Viewer per project — akses terpisah antar tim |
| 🖥️ **CLI Injection** | Inject vars ke runtime tanpa perubahan kode aplikasi |
| 🐳 **Portainer Sync** | Push semua vars ke Docker stack dalam satu klik |
| 🔑 **API Tokens** | Token dengan scope dan expiry untuk CLI dan CI/CD |
| 🏠 **Self-Hosted** | Data sepenuhnya di server sendiri |

---

## Struktur Akses

### Role Global (akses ke aplikasi)

| Role | Akses |
|------|-------|
| \`SUPER_ADMIN\` | Semua fitur + dev console |
| \`ADMIN\` | Dashboard + Env Manager |
| \`QC\` | Dashboard (tiket QC scope) |
| \`USER\` | Profile saja |

### Role Project (akses ke data)

| Role | Hak Akses |
|------|-----------|
| \`OWNER\` | Kontrol penuh — kelola member, env, vars |
| \`EDITOR\` | Tambah / edit / hapus vars, lihat secrets |
| \`VIEWER\` | Lihat vars saja — secrets tampil sebagai \`***\` |

---

## CLI

### Instalasi

Download binary untuk platform kamu dan tambahkan ke PATH:

\`\`\`bash
# Linux x64
curl -L ${origin}/download/cli/linux-x64 -o envman
chmod +x envman && mv envman /usr/local/bin/

# macOS ARM (Apple Silicon)
curl -L ${origin}/download/cli/darwin-arm64 -o envman
chmod +x envman && mv envman /usr/local/bin/

# Windows x64 — download envman-windows-x64.exe, tambahkan ke PATH
\`\`\`

Binary standalone — tidak butuh Node.js, npm, atau runtime apapun.

---

### Login

\`\`\`bash
envman login ${origin} --token em_abc123
# → Logged in as user@example.com (ADMIN)
# → Credentials saved to ~/.config/envman/config.json
\`\`\`

\`\`\`bash
envman whoami     # tampilkan user & server aktif
envman logout     # hapus credentials
\`\`\`

---

### Inject Vars ke Runtime

Flag \`-e\` menerima dua format:

| Format | Keterangan |
|--------|-----------|
| \`-e project:env\` | Fetch vars dari server |
| \`-e .env.local\` | Load vars dari file lokal |

\`\`\`bash
# Satu environment dari server
envman -e myapp:production -- bun start

# Gabung beberapa env (later overrides earlier)
envman -e myapp:base -e myapp:production -- bun dev

# Mix server + local (local override server)
envman -e myapp:production -e .env.local -- bun dev

# Dua project sekaligus
envman -e project-a:production -e project-b:production -- bun start
\`\`\`

---

### Autentikasi CLI

Prioritas auth (tertinggi ke terendah):

1. **Vars di file lokal** — \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` di file \`-e\`
2. **System env vars** — \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` di environment
3. **Config file** — \`~/.config/envman/config.json\` (dari \`envman login\`)

\`\`\`bash
# Auth dari env vars — ideal untuk CI/CD, container, Portainer
ENVMAN_SERVER=${origin} \\
ENVMAN_TOKEN=em_xxx \\
  envman -e myapp:production -- bun start

# Auth dari file lokal — ideal untuk setup tim (Portainer, shared server)
# File .env.creds berisi: ENVMAN_SERVER=... ENVMAN_TOKEN=...
envman -e .env.creds -e myapp:production -- bun start
\`\`\`

---

### Flag Tambahan

\`\`\`bash
# --server-wins: system env override merged vars (default: merged wins)
envman -e myapp:production --server-wins -- bun start

# --version
envman --version

# --help
envman --help
\`\`\`

---

## API Tokens

Buat token di halaman **Tokens** untuk digunakan CLI tanpa password.

### Scope Token

| Scope | Artinya |
|-------|---------|
| Kosong | Akses ke semua project yang kamu miliki |
| \`project:*\` | Semua environment di project tersebut |
| \`project:production\` | Hanya environment production |
| \`project-a:* + project-b:staging\` | Kombinasi multi-project |

### Contoh Penggunaan Token

\`\`\`bash
# Login dengan token
envman login ${origin} --token em_abc123

# Atau langsung via env var (tanpa login)
ENVMAN_TOKEN=em_abc123 ENVMAN_SERVER=${origin} \\
  envman -e myapp:production -- bun start
\`\`\`

Token **read-only** cukup untuk hampir semua kebutuhan (inject vars).
Token **read-write** hanya diperlukan jika automation perlu push vars ke server.

---

## Portainer Integration

Env Manager bisa sync vars langsung ke Docker stack di Portainer.

### Setup

1. Buka **Connections** — tambah Portainer instance (URL + API token)
2. Buka project → environment → scroll ke bawah bagian **Portainer**
3. Klik **Connect** → pilih connection → pilih stack
4. Klik **Sync** untuk push semua vars ke stack

### Cara Kerjanya

Vars dikirim ke Portainer dan disimpan di \`stack.env\`. Compose file otomatis mendapat \`env_file: - stack.env\` di setiap service agar vars masuk ke container.

> ⚠️ **Perhatian:** Secret vars di-decrypt saat sync. Nilai dikirim sebagai plaintext ke Portainer dan tersimpan di \`stack.env\` — tidak terenkripsi di sisi Portainer.

---

## Secret Vars

Vars yang ditandai sebagai **secret** dienkripsi dengan AES-256-GCM sebelum disimpan.

- Set \`MASTER_KEY\` (64 hex chars) di environment server untuk mengaktifkan enkripsi
- Generate: \`openssl rand -hex 32\`
- Tanpa \`MASTER_KEY\`: secret tersimpan plaintext (backward compatible)
- **VIEWER** hanya melihat \`***\` — tidak bisa reveal
- **EDITOR / OWNER** bisa reveal nilai asli
- CLI dan Portainer sync selalu decrypt otomatis

---

## Manage di \`/envmanager\`

\`\`\`
/envmanager                  → daftar semua project
/envmanager/tokens           → kelola API tokens
/envmanager/connections      → kelola Portainer connections
/envmanager/:slug            → detail project (environments + members)
/envmanager/:slug/:env       → vars page
\`\`\`
`

function DocsPage() {
  const origin = window.location.origin
  return (
    <Box
      className="markdown-body"
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '0 0 48px',
        backgroundColor: 'transparent',
        color: 'inherit',
      }}
    >
      <style>{`
        .markdown-body {
          color-scheme: light dark;
        }
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
          --color-header-bg: #161b22;
          --color-prettylights-syntax-comment: #8b949e;
          --color-prettylights-syntax-constant: #79c0ff;
          --color-prettylights-syntax-entity: #d2a8ff;
          --color-prettylights-syntax-storage-modifier-import: #c9d1d9;
          --color-prettylights-syntax-entity-tag: #7ee787;
          --color-prettylights-syntax-keyword: #ff7b72;
          --color-prettylights-syntax-string: #a5d6ff;
          --color-prettylights-syntax-variable: #ffa657;
          --color-prettylights-syntax-brackethighlighter-unmatched: #f85149;
          --color-prettylights-syntax-invalid-illegal-text: #f0f6fc;
          --color-prettylights-syntax-invalid-illegal-bg: #8e1519;
          --color-prettylights-syntax-carriage-return-text: #f0f6fc;
          --color-prettylights-syntax-carriage-return-bg: #b62324;
          --color-prettylights-syntax-string-regexp: #7ee787;
          --color-prettylights-syntax-markup-list: #f2cc60;
          --color-prettylights-syntax-markup-heading: #1f6feb;
          --color-prettylights-syntax-markup-italic: #c9d1d9;
          --color-prettylights-syntax-markup-bold: #c9d1d9;
          --color-prettylights-syntax-markup-deleted-text: #ffdcd7;
          --color-prettylights-syntax-markup-deleted-bg: #67060c;
          --color-prettylights-syntax-markup-inserted-text: #aff5b4;
          --color-prettylights-syntax-markup-inserted-bg: #033a16;
          --color-prettylights-syntax-markup-changed-text: #ffdfb6;
          --color-prettylights-syntax-markup-changed-bg: #5a1e02;
          --color-prettylights-syntax-markup-ignored-text: #c9d1d9;
          --color-prettylights-syntax-markup-ignored-bg: #1158c7;
          --color-prettylights-syntax-meta-diff-range: #d2a8ff;
          --color-prettylights-syntax-brackethighlighter-angle: #8b949e;
          --color-prettylights-syntax-sublimelinter-gutter-mark: #484f58;
          --color-prettylights-syntax-constant-other-reference-link: #a5d6ff;
        }
      `}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{buildDocs(origin)}</ReactMarkdown>
    </Box>
  )
}
