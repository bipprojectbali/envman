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

Dashboard adalah pusat kontrol untuk tim Admin dan QC. Semua fitur manajemen tiket, analitik, dan monitoring tersedia di sini.

---

## Role & Akses

| Role | Melihat |
|------|---------|
| \`SUPER_ADMIN\` | Semua tab + akses penuh |
| \`ADMIN\` | Semua tab — manajemen tiket & tim |
| \`QC\` | Hanya tab **Tickets** (tiket dengan scope QC) |

---

## Tab & Fitur

### Dashboard
Overview statistik sistem — ringkasan tiket, user online, aktivitas terbaru.

### Tickets
Sistem pelacakan bug dan task. Status machine:

\`\`\`
OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED
         ↑                  ↓
         └──── REOPENED ←───┘
\`\`\`

- **ADMIN** — buka tiket, assign ke member, update status (OPEN → IN_PROGRESS)
- **QC** — review tiket READY_FOR_QC, close atau reopen
- **SUPER_ADMIN** — semua operasi termasuk delete

### Analytics
Ringkasan performa dan metrik — data visual untuk monitoring tim.

### Orders, Messages, Calendar, Settings
Tools pendukung untuk manajemen tim — pesan internal, kalender, dan pengaturan akun.

---

## Alur Tiket

1. User melaporkan bug atau request fitur → tiket **OPEN**
2. Admin meng-assign dan mulai pengerjaan → **IN_PROGRESS**
3. Pengerjaan selesai, siap dicek → **READY_FOR_QC**
4. QC review — jika lolos → **CLOSED**, jika bermasalah → **REOPENED**

---

## Navigasi

\`\`\`
/dashboard                    → Dashboard utama
/dashboard?tab=tickets        → Tiket
/dashboard?tab=analytics      → Analitik
/dashboard?tab=settings       → Pengaturan
/envmanager                   → Env Manager
/envmanager/docs              → Docs Env Manager
\`\`\`

> 💡 **Admin + QC** bisa menggunakan halaman **Tickets** untuk melacak semua tiket aktif. QC hanya melihat tiket dalam scope pemeriksaannya.
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
