export function buildInjectSection(): string {
  return `
## Inject Vars ke Command

### Sintaks dasar

\`\`\`bash
envman [flag...] -- <command> [args...]
\`\`\`

### Flag inject

| Flag | Format | Keterangan |
|------|--------|-----------|
| \`-e project:env\` | \`project:environment\` | Fetch vars dari server |
| \`-e file\` | path tanpa titik dua | Load dari file lokal |
| \`--server-wins\` | — | System env menang atas vars yang di-fetch (default: fetch menang) |

---

### Pola inject — dari yang paling sederhana ke kompleks

\`\`\`bash
# 1. Single environment
envman -e myapp:production -- bun start

# 2. Fallback layering: base di-override oleh production
envman -e myapp:base -e myapp:production -- bun dev

# 3. Mix server + file lokal (file lokal menang — posisi terakhir)
envman -e myapp:production -e .env.local -- bun dev

# 4. Dua project berbeda sekaligus
envman -e backend:production -e frontend:production -- bun start

# 5. Base project A + override dari project B
envman -e shared:secrets -e myapp:production -- bun start

# 6. System env menang (kocok urutan prioritas)
envman -e myapp:production --server-wins -- bun start

# 7. Tanpa login — auth via env var
ENVMAN_SERVER=https://envman.example.com \\
ENVMAN_TOKEN=em_xxx \\
  envman -e myapp:production -- bun start

# 8. Credentials dari file lokal
envman -e .env.secrets -e myapp:production -- bun dev
# (di .env.secrets: ENVMAN_SERVER=... ENVMAN_TOKEN=...)
\`\`\`

---

### Berbagai runtime

\`\`\`bash
# Node.js / Bun
envman -e myapp:production -- bun start
envman -e myapp:production -- node dist/index.js
envman -e myapp:production -- bun run build

# Docker
envman -e myapp:production -- docker run --env-file <(cat) myimage
# (Catatan: gunakan envman -- env untuk print ke env file)

# Print vars (debug)
envman -e myapp:production -- env | grep -E "^(API|DB|REDIS)"
envman -e myapp:production -- printenv DATABASE_URL

# Python
envman -e myapp:production -- python3 src/main.py
envman -e myapp:production -- uvicorn app.main:app --host 0.0.0.0

# Go binary
envman -e myapp:production -- ./server

# Make target
envman -e myapp:production -- make migrate

# pnpm / npm / yarn
envman -e myapp:production -- pnpm start
envman -e myapp:production -- npm run migrate
\`\`\`

---

### Aturan merge (urutan prioritas)

\`\`\`
System env (terendah)
  ↓
-e flag pertama
  ↓
-e flag berikutnya (menang atas sebelumnya)
  ↓ (default)
Hasil akhir (tertinggi)
\`\`\`

Dengan \`--server-wins\`:
\`\`\`
-e vars (terendah)
  ↓
System env (tertinggi, menang)
\`\`\`

---
`
}
