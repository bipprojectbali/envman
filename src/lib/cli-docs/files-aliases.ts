export function buildFilesAliasesSection(origin: string): string {
  return `
## Eksekusi File Project (tanpa simpan ke disk)

File yang tersimpan di project (tab Files) bisa langsung dieksekusi — content di-stream ke interpreter via stdin, tidak pernah ditulis ke disk.

### Sintaks

\`\`\`bash
envman [flag...] -- <interpreter> <project>:<path/file.ext>
\`\`\`

### Contoh berbagai interpreter

\`\`\`bash
# Bash script
envman -- bash myapp:scripts/deploy.sh
envman -- bash myapp:scripts/migrate.sh

# Shell script dengan vars inject
envman -e myapp:production -- bash myapp:scripts/deploy.sh

# Bun / TypeScript (npm install otomatis tanpa node_modules)
envman -- bun myapp:scripts/seed.ts
envman -- bun myapp:jobs/process-queue.ts
envman -e myapp:production -- bun myapp:scripts/migrate.ts

# Node.js
envman -- node myapp:scripts/cleanup.js
envman -e myapp:staging -- node myapp:scripts/verify.js

# Python
envman -- python3 myapp:scripts/etl.py
envman -e myapp:production -- python3 myapp:jobs/sync.py

# Deno
envman -- deno myapp:scripts/fetch-data.ts

# Dengan args tambahan
envman -- bash myapp:scripts/deploy.sh --env production --dry-run
envman -e myapp:production -- bun myapp:scripts/seed.ts --count 100
\`\`\`

### Interpreter stdin (zero disk write)

| Interpreter | Metode |
|-------------|--------|
| \`bash\`, \`sh\`, \`zsh\` | pipe via \`-s\` |
| \`bun\` | \`bun run -\` + \`--install=fallback\` |
| \`node\` | \`--input-type=module\` |
| \`python3\`, \`python\` | pipe via \`-\` |
| \`deno\` | \`deno run -\` |
| lainnya | temp file 0600 (auto-delete) |

### Bun scripts — import npm inline

\`\`\`typescript
// myapp:scripts/send-email.ts — tidak butuh node_modules
import { Resend } from "resend@^2.0"
import { z } from "zod@^3.22"
// envman otomatis inject --install=fallback ke bun
\`\`\`

### Disambiguasi path vs env name

Setelah titik dua (\`:\`):
- Ada \`/\` → file reference (misal: \`scripts/deploy.sh\`)
- Ekstensi dikenal (\`sh\`, \`ts\`, \`py\`, \`yaml\`, \`sql\`, dll.) → file reference
- Sisanya → nama environment (termasuk \`staging.v2\`, \`env.local\`)

\`\`\`bash
envman -- bash myapp:scripts/deploy.sh    # file (ada /)
envman -- bun  myapp:seed.ts              # file (ekstensi .ts)
envman -e myapp:staging.v2 -- bun start  # environment (bukan file)
envman -e myapp:env.local -- bun dev     # environment
\`\`\`

---

## Alias Expansion (envman run)

Alias menyimpan command + sources di server. \`envman run\` fetch, parse ulang, lalu execute.

\`\`\`bash
envman run myapp:deploy              # ekspansi alias "deploy"
envman run myapp:migrate             # ekspansi alias "migrate"
envman run myapp:seed                # ekspansi alias "seed"

# Extra -e di-merge (alias sources menang — posisi terakhir)
envman run -e .env.local myapp:deploy

# Args tambahan setelah --
envman run myapp:deploy -- --dry-run
envman run myapp:seed -- --count 50 --reset

# Auth via file
envman run -e .env.secrets myapp:deploy
\`\`\`

### Alias vs langsung

| Situasi | Rekomendasi |
|---------|------------|
| Command yang sering dipakai tim | \`envman run project:alias\` |
| Script sekali pakai / debug | \`envman -- bash project:scripts/x.sh\` |
| Inject vars ke dev server | \`envman -e project:env -- bun dev\` |

---

## Fetch docs ke AI context

\`\`\`bash
envman docs              # print ke stdout
envman docs | pbcopy     # salin ke clipboard (macOS)
envman docs > context.md # simpan ke file, attach ke AI agent

# Fetch dari server langsung (tanpa envman terinstall)
curl -s ${origin}/api/cli-docs.md -H "Authorization: Bearer <token>"
\`\`\`

---
`
}
