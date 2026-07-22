import { Box } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import 'github-markdown-css/github-markdown.css'

export const Route = createFileRoute('/dev/docs')({
  component: DevDocsPage,
})

const content = `
# Dev Console

Dev Console adalah panel super-admin untuk monitoring, debugging, dan inspeksi sistem secara menyeluruh.

---

## Akses

Hanya \`SUPER_ADMIN\` yang bisa mengakses Dev Console.

---

## Tab & Fitur

### Overview
Ringkasan sistem real-time — user online, request rate, memori, status Redis/DB.

### Users
Manajemen user global:
- Lihat semua user beserta role dan status blocked
- Ubah role (\`USER\` / \`ADMIN\`)
- Block / unblock user — session langsung dihapus saat block

### App Logs
Log aplikasi dari Redis (ring buffer 500 entri):
- Filter berdasarkan level (\`info\`, \`warn\`, \`error\`)
- Client-side pagination 25 per halaman
- Auto-refresh setiap 5 detik
- Clear all logs

### Audit Logs
Jejak aktivitas user dari database:
- Actions: \`LOGIN\`, \`LOGOUT\`, \`LOGIN_FAILED\`, \`LOGIN_BLOCKED\`, \`ROLE_CHANGED\`, \`BLOCKED\`, \`UNBLOCKED\`
- Filter by user / action
- Auto-cleanup setelah 90 hari

### Database
Diagram ER interaktif berbasis React Flow:
- Model Prisma sebagai node dengan field dan relasi
- Enum sebagai node terpisah
- Drag-to-reposition, zoom, auto-save posisi ke localStorage

### Settings
Pengaturan aplikasi global (SUPER_ADMIN only).

---

## Shortcuts

| Shortcut | Fungsi |
|----------|--------|
| \`Ctrl+Shift+Cmd+C\` | Toggle click-to-source inspector |

---

## Admin API

Semua endpoint admin di-prefix \`/api/admin/\` — memerlukan session SUPER_ADMIN.

| Endpoint | Deskripsi |
|----------|-----------|
| \`GET /api/admin/users\` | List semua user |
| \`PUT /api/admin/users/:id/role\` | Ubah role |
| \`PUT /api/admin/users/:id/block\` | Block/unblock user |
| \`GET /api/admin/presence\` | User online |
| \`GET /api/admin/logs/app\` | App logs (Redis) |
| \`GET /api/admin/logs/audit\` | Audit logs (DB) |
| \`DELETE /api/admin/logs/app\` | Clear app logs |
| \`DELETE /api/admin/logs/audit\` | Clear audit logs |
| \`GET /api/admin/schema\` | Parse schema ke JSON |
`

function DevDocsPage() {
  return (
    <Box
      className="markdown-body"
      style={{ maxWidth: 860, margin: '0 auto', padding: '0 0 48px', backgroundColor: 'transparent', color: 'inherit' }}
    >
      <style>{`
        .markdown-body { color-scheme: light dark; }
        html[data-mantine-color-scheme="dark"] .markdown-body {
          --color-canvas-default: transparent;
          --color-canvas-subtle: #161b22;
          --color-border-default: #30363d;
          --color-fg-default: #e6edf3;
          --color-fg-muted: #8b949e;
        }
      `}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </Box>
  )
}
