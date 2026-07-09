export function buildPortainerSection(): string {
  return `
## Portainer — Kontrol Stack per Environment

Operasikan stack Portainer yang terikat ke sebuah environment project. Server
menyimpan detail connection, stack, dan endpoint per-env, jadi kamu cukup
mereferensikan environment sebagai \`project:env\` — tidak perlu tahu ID stack.

Alias perintah: \`envman pt ...\` = \`envman portainer ...\`.

### Status & container

\`\`\`bash
envman portainer status myapp:prod      # status stack + jumlah container
envman portainer ps myapp:prod          # daftar container (id · state · nama · image)
\`\`\`

### Logs — snapshot & live

\`\`\`bash
envman portainer logs myapp:prod web              # snapshot: 200 baris terakhir
envman portainer logs myapp:prod web --tail 500   # snapshot: 500 baris terakhir (maks 1000)
envman portainer logs myapp:prod web -f           # live: stream sampai Ctrl+C
envman portainer logs myapp:prod web -f --tail 50 # 50 baris awal lalu ikut live
\`\`\`

Tanpa \`-f\` → cetak N baris terakhir lalu keluar. Dengan \`-f\` (follow) → stream
baris baru secara real-time (SSE) sampai diinterupsi. \`<container>\` = ID/short-ID
dari \`ps\`.

### Restart — tiga tingkatan

\`\`\`bash
envman portainer restart-soft myapp:prod      # stop→start stack, TANPA pull image
envman portainer restart-recreate myapp:prod  # recreate stack (redeploy compose)
envman portainer restart-repull myapp:prod    # pull image terbaru lalu recreate
\`\`\`

- \`restart-soft\` — restart paling ringan (butuh capability \`stack:power\` atau role EDITOR/OWNER).
- \`restart-recreate\` / \`restart-repull\` — redeploy (butuh \`stack:deploy\` atau EDITOR/OWNER).

### Maintenance

\`\`\`bash
envman portainer sync-repull myapp:prod   # push env vars project ke stack lalu repull
envman portainer prune myapp:prod         # prune dangling image di endpoint stack
\`\`\`

### Izin

Perintah baca (\`status\`, \`ps\`, \`logs\`) butuh akses environment (VIEWER+ / capability
\`stack:operate\`). Perintah tulis di-gate per-capability atau role env — lihat tabel
Portainer Capabilities di referensi API server. Env yang aksesnya ditolak →
\`[envman] Akses ditolak untuk env ...\` + exit 1.

---
`
}
