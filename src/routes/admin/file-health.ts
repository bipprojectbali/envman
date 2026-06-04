import { Elysia } from 'elysia'
import { forbidden, requireSuperAdmin } from '../../lib/auth-middleware'

const LIMITS: Record<string, { maxLines: number; maxChars: number }> = {
  route: { maxLines: 150, maxChars: 6_000 },
  component: { maxLines: 300, maxChars: 12_000 },
  hook: { maxLines: 200, maxChars: 8_000 },
  service: { maxLines: 300, maxChars: 12_000 },
  utility: { maxLines: 200, maxChars: 8_000 },
  config: { maxLines: 100, maxChars: 4_000 },
  test: { maxLines: 400, maxChars: 16_000 },
  default: { maxLines: 500, maxChars: 20_000 },
}

function categorize(p: string): string {
  if (/\.(test|spec)\./.test(p) || p.includes('/tests/')) return 'test'
  if (p.includes('/routes/')) return 'route'
  if (p.includes('/hooks/')) return 'hook'
  if (p.includes('/components/')) return 'component'
  if (p.includes('/lib/')) return 'service'
  if (/config/i.test(p)) return 'config'
  return 'default'
}

type FileEntry = {
  path: string
  category: string
  lines: number
  chars: number
  maxLines: number
  maxChars: number
  linePercent: number
  charPercent: number
  status: 'ok' | 'warning' | 'critical'
}

export const adminFileHealthRouter = new Elysia().get('/api/admin/file-health', async ({ request, set }) => {
  const caller = await requireSuperAdmin(request)
  if (!caller) return forbidden(set)

  const fs = await import('node:fs')
  const path = await import('node:path')
  const root = process.cwd()
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'generated', '.git'])
  const SKIP_PAT = [/\.generated\./, /routeTree\.gen/, /\.d\.ts$/]
  const results: FileEntry[] = []

  function scan(dir: string) {
    const abs = path.join(root, dir)
    if (!fs.existsSync(abs)) return
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue
      const rel = path.join(dir, entry.name).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        scan(rel)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue
      if (SKIP_PAT.some((p) => p.test(rel))) continue
      const content = fs.readFileSync(path.join(root, rel), 'utf-8')
      const lines = content.split('\n').length
      const chars = content.length
      const category = categorize(rel)
      const limit = LIMITS[category] ?? LIMITS.default
      const linePercent = Math.round((lines / limit.maxLines) * 100)
      const charPercent = Math.round((chars / limit.maxChars) * 100)
      const maxPct = Math.max(linePercent, charPercent)
      const status: FileEntry['status'] = maxPct >= 100 ? 'critical' : maxPct >= 80 ? 'warning' : 'ok'
      results.push({
        path: rel,
        category,
        lines,
        chars,
        maxLines: limit.maxLines,
        maxChars: limit.maxChars,
        linePercent,
        charPercent,
        status,
      })
    }
  }

  for (const dir of ['src', 'tests', 'scripts', 'prisma']) scan(dir)
  results.sort((a, b) => Math.max(b.linePercent, b.charPercent) - Math.max(a.linePercent, a.charPercent))

  const ok = results.filter((f) => f.status === 'ok').length
  const warning = results.filter((f) => f.status === 'warning').length
  const critical = results.filter((f) => f.status === 'critical').length

  return { files: results, summary: { total: results.length, ok, warning, critical } }
})
