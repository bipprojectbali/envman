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
envman login <server-url> --token <token>   # Simpan ke ~/.config/envman/config.json
envman logout                                # Hapus config tersimpan
envman whoami                                # Tampilkan user + server aktif
envman [options] -- <command>               # Inject vars & jalankan command
envman --version                             # Tampilkan versi CLI
envman --help                                # Bantuan
\`\`\`

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

# Auth dari file lokal (bisa simpan ENVMAN_SERVER + TOKEN di sini)
envman -e .env.creds -e myapp:production -- bun dev

# CI/CD — auth via env vars, tanpa login
ENVMAN_SERVER=${origin} \\
ENVMAN_TOKEN=<TOKEN> \\
  envman -e myapp:production -- bun start

# GitHub Actions
# env:
#   ENVMAN_SERVER: ${origin}
#   ENVMAN_TOKEN: $\{{ secrets.ENVMAN_TOKEN }}
# run: envman -e myapp:production -- bun start

# System env menang (PORT=8080 system beats server PORT=3000)
PORT=8080 envman -e myapp:production -- bun start

# Server menang (PORT dari server beats system)
PORT=8080 envman --server-wins -e myapp:production -- bun start
\`\`\`

---

### Auth Resolution (prioritas tertinggi → terendah)

1. \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` dari vars di file \`-e\` (lokal)
2. \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` dari \`process.env\` / system env
3. \`~/.config/envman/config.json\` (disimpan oleh \`envman login\`)

---
`
}
