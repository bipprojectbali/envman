/// <reference types="bun-types" />
/**
 * Production-only server entry point.
 * Used by `bun build --compile` to create a self-contained server binary.
 *
 * Omits Vite dev middleware entirely so the bundle doesn't pull in
 * Babel/esbuild/react-refresh (~200MB of devDependencies).
 *
 * Dev workflow is unchanged — use `src/serve.ts` → `src/index.tsx` as before.
 */

import fs from 'node:fs'
import path from 'node:path'
import { env } from './lib/env'
import { runMigrations } from './lib/migrate'

// ─── Route Classification ──────────────────────────────
const API_PREFIXES = ['/api/', '/webhook/', '/ws/', '/health', '/download/', '/install']

function isApiRoute(pathname: string): boolean {
  return API_PREFIXES.some(p => pathname.startsWith(p)) || pathname === '/health' || pathname === '/install'
}

// ─── Frontend Serving (production only — static files from dist/) ──────────
async function serveFrontend(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname

  const filePath = path.join('dist', pathname === '/' ? 'index.html' : pathname)

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath)
    const contentType: Record<string, string> = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.html': 'text/html; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    }
    const isHashed = pathname.startsWith('/assets/')
    return new Response(Bun.file(filePath), {
      headers: {
        'Content-Type': contentType[ext] ?? 'application/octet-stream',
        'Cache-Control': isHashed
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=0, must-revalidate',
      },
    })
  }

  // SPA fallback
  const indexHtml = path.join('dist', 'index.html')
  if (fs.existsSync(indexHtml)) {
    return new Response(Bun.file(indexHtml), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    })
  }

  return new Response('Not Found', { status: 404 })
}

// ─── Database Migration ────────────────────────────────
if (process.env.MIGRATE_ON_STARTUP !== 'false') {
  await runMigrations()
}

// ─── Portainer Backup Crons ───────────────────────────
import { syncBackupCrons } from './lib/portainer-cron'
syncBackupCrons().catch(console.error)

// ─── Audit Log Rotation ───────────────────────────────
import { prisma } from './lib/db'

async function cleanupAuditLogs() {
  const cutoff = new Date(Date.now() - env.AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
  if (count > 0) console.log(`[Audit] Cleaned up ${count} logs older than ${env.AUDIT_LOG_RETENTION_DAYS} days`)
}

cleanupAuditLogs().catch(console.error)
setInterval(() => cleanupAuditLogs().catch(console.error), 24 * 60 * 60 * 1000)

// ─── Elysia App ────────────────────────────────────────
import { createApp } from './app'

const app = createApp()

  .onRequest(async ({ request }) => {
    const pathname = new URL(request.url).pathname
    if (!isApiRoute(pathname)) {
      return serveFrontend(request)
    }
  })

  .listen(env.PORT)

console.log(`Server running at http://localhost:${app.server!.port}`)
