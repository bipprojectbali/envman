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
