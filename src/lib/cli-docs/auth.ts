export function buildAuthSection(origin: string): string {
  return `
## Instalasi

\`\`\`bash
# Auto-detect platform (Linux & macOS)
curl -fsSL ${origin}/install | bash

# Manual per platform
curl -sL ${origin}/download/cli/linux-x64   -o envman && chmod +x envman && sudo mv envman /usr/local/bin/
curl -sL ${origin}/download/cli/linux-arm64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/
curl -sL ${origin}/download/cli/darwin-arm64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/
curl -sL ${origin}/download/cli/darwin-x64  -o envman && chmod +x envman && sudo mv envman /usr/local/bin/

# Windows (PowerShell)
Invoke-WebRequest -Uri "${origin}/download/cli/windows-x64" -OutFile "envman.exe"

# Verifikasi
envman --version
envman update   # update ke versi terbaru
\`\`\`

Binary standalone — tidak butuh Node.js, npm, atau runtime lain.

---

## Autentikasi

### Login interaktif (sekali per mesin)

\`\`\`bash
envman login ${origin} --token <api-token>
envman whoami   # verifikasi login berhasil
envman logout   # hapus credentials tersimpan
\`\`\`

Credentials disimpan di \`~/.config/envman/config.json\`.

### Prioritas auth (tertinggi → terendah)

\`\`\`
1. ENVMAN_SERVER + ENVMAN_TOKEN di dalam file -e (e.g. .env.deploy)
2. ENVMAN_SERVER + ENVMAN_TOKEN sebagai system env / shell export
3. ~/.config/envman/config.json (dari envman login)
\`\`\`

### Auth via env var (tanpa login — untuk CI/CD)

\`\`\`bash
ENVMAN_SERVER=${origin} ENVMAN_TOKEN=em_xxx envman -e myapp:production -- bun start
\`\`\`

### Auth via file lokal (credentials per-project)

\`\`\`bash
# .env.deploy berisi:
# ENVMAN_SERVER=${origin}
# ENVMAN_TOKEN=em_xxx

envman -e .env.deploy -e myapp:production -- bun start
\`\`\`

> **Catatan:** \`ENVMAN_SERVER\` dan \`ENVMAN_TOKEN\` selalu di-strip dari child process — tidak bocor ke aplikasi.

---

## Buat API Token

Buka browser → Profile → API Tokens → New Token. Centang scope yang dibutuhkan, set expiry jika perlu.

Token value hanya ditampilkan **sekali** saat pembuatan — simpan segera.

---
`
}
