export function buildProjectsSection(): string {
  return `
## Projects — Daftar Project & Environment

Lihat project yang bisa kamu akses dan environment di dalamnya, langsung dari
terminal (tanpa buka UI).

### Daftar project

\`\`\`bash
envman projects ls                # semua project: slug, nama, jumlah env, role, pembuat
envman projects ls --me           # hanya project yang kamu buat
envman projects ls -q             # slug polos saja (pipe-friendly, mis. | fzf)
\`\`\`

### Environment sebuah project

\`\`\`bash
envman projects envs myapp        # env: nama, role akses, jumlah var
envman projects myapp             # shortcut, sama dengan "projects envs myapp"
envman projects envs myapp -q     # nama env polos saja (pipe-friendly)
\`\`\`

Alias: \`envman project ...\` = \`envman projects ...\`. Semua perintah CLI-only
(memakai endpoint \`GET /projects\` yang sudah ada); menampilkan hanya yang boleh
kamu akses.
`
}
