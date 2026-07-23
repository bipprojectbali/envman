import { Box } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import 'github-markdown-css/github-markdown.css'

export const Route = createFileRoute('/dashboard/docs')({
  component: DashboardDocsPage,
})

const content = `
# Dashboard

Dashboard adalah halaman admin dengan panel overview, analytics, dan tools pendukung.

---

## Role & Akses

| Role | Melihat |
|------|---------|
| \`SUPER_ADMIN\` | Semua tab + akses penuh |
| \`ADMIN\` | Diarahkan ke Env Manager (tidak mengakses Dashboard) |

---

## Tab & Fitur

### Dashboard
Overview statistik sistem — ringkasan aktivitas dan user online.

### Analytics
Ringkasan performa dan metrik — data visual untuk monitoring.

### Orders, Messages, Calendar, Settings
Tools pendukung — pesan internal, kalender, dan pengaturan akun.

---

## Navigasi

\`\`\`
/dashboard                    → Dashboard utama
/dashboard?tab=analytics      → Analitik
/dashboard?tab=settings       → Pengaturan
/envmanager                   → Env Manager
/envmanager/docs              → Docs Env Manager
\`\`\`
`

function DashboardDocsPage() {
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
