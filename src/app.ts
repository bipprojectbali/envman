import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Elysia } from 'elysia'
import pkg from '../package.json'
import { createMcpServer, type McpScope } from '../scripts/mcp/server'
import { appLog } from './lib/applog'
import { audit } from './lib/audit'
import { auth } from './lib/auth'
import { requireAuth } from './lib/auth-middleware'
import { prisma } from './lib/db'
import { env } from './lib/env'
import { conditional, notModifiedResponse, strongEtag } from './lib/http-cache'
import { addConnection, broadcastToAdmins, removeConnection } from './lib/presence'
import { redis } from './lib/redis'
import { getIp, getPublicOrigin } from './lib/request'
import { adminRouter } from './routes/admin/index'
import { envmanRouter } from './routes/envman/index'
import { ticketsRouter } from './routes/tickets'
import { v1Router } from './routes/v1/index'

// Inject `env_file: - stack.env` into every Docker Compose service that lacks it.
// Portainer writes Env[] to stack.env for variable substitution; without env_file in
// the service definition those vars never reach the container environment.
function _injectEnvFileIntoCompose(content: string): string {
  const lines = content.split('\n')
  // Two-pass: first collect where to insert, then build result
  const insertAfter = new Map<number, string[]>() // line index → lines to insert after it

  let inServices = false
  let serviceIndent = -1 // indent of service names (e.g. 2)
  let propIndent = -1 // indent of service properties (e.g. 4)
  let serviceHasEnvFile = false
  let lastPropLine = -1 // last content line inside current service

  const flushService = () => {
    if (lastPropLine >= 0 && !serviceHasEnvFile && propIndent >= 0) {
      const pad = ' '.repeat(propIndent)
      insertAfter.set(lastPropLine, [`${pad}env_file:`, `${pad}  - stack.env`])
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const indent = line.length - trimmed.length

    if (!trimmed || trimmed.startsWith('#')) continue

    // Top-level key — detect entering/leaving services block
    if (indent === 0) {
      if (trimmed.startsWith('services:')) {
        inServices = true
        serviceIndent = -1
        propIndent = -1
      } else {
        if (inServices) {
          flushService()
          inServices = false
        }
      }
      continue
    }

    if (!inServices) continue

    // First service name seen → establish service indent
    if (serviceIndent === -1) serviceIndent = indent

    if (indent === serviceIndent && trimmed.endsWith(':')) {
      // New service starts — flush previous
      flushService()
      serviceHasEnvFile = false
      propIndent = -1
      lastPropLine = i
    } else if (indent > serviceIndent) {
      // Service property line
      if (propIndent === -1) propIndent = indent
      if (trimmed.startsWith('env_file:') || trimmed === 'env_file:') serviceHasEnvFile = true
      lastPropLine = i
    }
  }

  // Flush last service
  if (inServices) flushService()

  // Build output
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i])
    const extra = insertAfter.get(i)
    if (extra) result.push(...extra)
  }
  return result.join('\n')
}

const devCookieOpts = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=86400'
const prodCookieOpts = 'Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400'
const cookieOpts = env.NODE_ENV === 'production' ? prodCookieOpts : devCookieOpts

// ─── Docs markdown builder (shared with /api/docs.md endpoint) ───────────────
// Keep in sync with src/frontend/routes/docs.tsx buildDocsMarkdown()
function buildDocsMd(origin: string): string {
  return `# Env Manager — Dokumentasi Lengkap

> **Self-hosted environment variables manager** dengan enkripsi AES-256-GCM, CLI injection, Portainer sync, dan role-based access control.

- **Base URL**: \`${origin}\`
- **Raw docs**: \`${origin}/api/docs.md\`
- **Web docs**: \`${origin}/docs\`

---

## Konsep Dasar

Env Manager mengelola environment variables dalam hierarki tiga level:

\`\`\`
Project (slug unik, e.g. "myapp")
└── Environment (e.g. "production", "staging", "development")
    └── EnvVar (KEY=value, bisa plain atau secret/encrypted)
\`\`\`

Auth dua metode: **Session** (browser, cookie HttpOnly) dan **API Token** (\`Authorization: Bearer <token>\`).

---

## Role & Permission

### Role Global

| Role | Akses |
|------|-------|
| \`SUPER_ADMIN\` | Semua fitur + Dev Console + User management |
| \`ADMIN\` | Dashboard + Env Manager (buat project) |
| \`QC\` | Dashboard (tiket QC scope saja) |
| \`USER\` | Profile saja |

### Role Project

| Role | Hak Akses |
|------|-----------|
| \`OWNER\` | Kontrol penuh — kelola member, hapus env |
| \`EDITOR\` | Tambah / edit / hapus vars, reveal secrets, export decrypted |
| \`VIEWER\` | Lihat vars saja (secrets tampil sebagai \`***\`) |

---

## CLI

### Instalasi

\`\`\`bash
# Auto-detect platform
curl -fsSL ${origin}/install | bash

# Linux x64
curl -sL --compressed ${origin}/download/cli/linux-x64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/

# Linux ARM64
curl -sL --compressed ${origin}/download/cli/linux-arm64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/

# macOS Apple Silicon
curl -sL --compressed ${origin}/download/cli/darwin-arm64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/

# macOS Intel
curl -sL --compressed ${origin}/download/cli/darwin-x64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/

# Windows (PowerShell)
Invoke-WebRequest -Uri "${origin}/download/cli/windows-x64" -OutFile "envman.exe"
\`\`\`

### Commands

\`\`\`bash
envman login <server-url> --token <token>   # Simpan credentials
envman logout                                # Hapus credentials
envman whoami                                # Cek status login
envman [options] -- <command>               # Inject vars & run
\`\`\`

### Flag Inject

| Flag | Keterangan |
|------|-----------|
| \`-e project:env\` | Fetch vars dari server |
| \`-e ./file\` | Load vars dari file lokal |
| \`--server-wins\` | Server vars menang atas system env (default: system wins) |

### Auth Resolution (tertinggi → terendah)

1. \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` dari file \`-e\`
2. \`ENVMAN_SERVER\` + \`ENVMAN_TOKEN\` dari process.env / system env
3. \`~/.config/envman/config.json\` (dari \`envman login\`)

### Contoh

\`\`\`bash
# Single environment
envman -e myapp:production -- bun start

# Multiple (later overrides earlier)
envman -e myapp:base -e myapp:production -- bun dev

# Mix server + local
envman -e myapp:production -e .env.local -- bun dev

# CI/CD (tanpa login)
ENVMAN_SERVER=${origin} ENVMAN_TOKEN=<TOKEN> envman -e myapp:production -- bun start

# GitHub Actions
# env:
#   ENVMAN_SERVER: ${origin}
#   ENVMAN_TOKEN: $\{{ secrets.ENVMAN_TOKEN }}
# run: envman -e myapp:production -- bun start
\`\`\`

---

## API Reference

### Auth

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`POST\` | \`/api/auth/login\` | Public | \`{email, password}\` → set session cookie |
| \`GET\` | \`/api/auth/google\` | Public | Redirect Google OAuth |
| \`GET\` | \`/api/auth/session\` | Optional | Return \`{user}\` atau \`401\` |
| \`POST\` | \`/api/auth/logout\` | Session | Hapus session |

### Projects

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/projects\` | ADMIN+ | List accessible projects |
| \`POST\` | \`/api/envman/projects\` | ADMIN+ | Buat project (body: \`{slug, name, description?}\`) |
| \`GET\` | \`/api/envman/projects/:slug\` | Member | Detail + members + environments |
| \`DELETE\` | \`/api/envman/projects/:slug\` | OWNER | Soft delete project |

### Variables

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/projects/:slug/environments/:env/vars\` | VIEWER+ | List vars (secrets → \`***\` untuk VIEWER) |
| \`GET\` | \`/api/envman/projects/:slug/environments/:env/vars/export\` | EDITOR+ | Export decrypted |
| \`POST\` | \`/api/envman/projects/:slug/environments/:env/vars\` | EDITOR+ | Upsert var \`{key, value, isSecret}\` |
| \`PUT\` | \`/api/envman/projects/:slug/environments/:env/vars\` | EDITOR+ | Bulk import \`{vars: {K:V}, secrets: [K]}\` |
| \`DELETE\` | \`/api/envman/projects/:slug/environments/:env/vars/:key\` | EDITOR+ | Hapus var |
| \`PATCH\` | \`/api/envman/projects/:slug/environments/:env/vars/:key/toggle\` | EDITOR+ | Toggle isDisabled |

### Environments

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`POST\` | \`/api/envman/projects/:slug/environments\` | EDITOR+ | Buat environment \`{name}\` |
| \`DELETE\` | \`/api/envman/projects/:slug/environments/:env\` | OWNER | Hapus environment + vars |

### Members

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`POST\` | \`/api/envman/projects/:slug/members\` | OWNER | Undang member \`{email, role}\` |
| \`PUT\` | \`/api/envman/projects/:slug/members/:userId/role\` | OWNER | Ubah role \`{role}\` |
| \`DELETE\` | \`/api/envman/projects/:slug/members/:userId\` | OWNER | Hapus member |

### Tokens

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/tokens\` | Session/Token | List token milik user |
| \`POST\` | \`/api/envman/tokens\` | Session | Buat token \`{name, canWrite, expiresAt?, scopes[]}\` |
| \`PATCH\` | \`/api/envman/tokens/:id\` | Session | Edit token |
| \`PATCH\` | \`/api/envman/tokens/:id/toggle\` | Session | Toggle aktif/nonaktif |
| \`DELETE\` | \`/api/envman/tokens/:id\` | Session | Revoke token |
| \`GET\` | \`/api/envman/whoami\` | Token | Verifikasi token → return user |

> Token value hanya ditampilkan **sekali** saat pembuatan.

### Portainer

| Method | Path | Role | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/portainer/connections\` | ADMIN+ | List global connections |
| \`POST\` | \`/api/envman/portainer/connections\` | ADMIN+ | Buat connection \`{name, portainerUrl, apiToken}\` |
| \`PUT\` | \`/api/envman/portainer/connections/:id\` | ADMIN+ | Update connection |
| \`DELETE\` | \`/api/envman/portainer/connections/:id\` | ADMIN+ | Hapus connection |
| \`POST\` | \`/api/envman/portainer/connections/:id/probe\` | ADMIN+ | Test + fetch stacks |
| \`GET\` | \`/api/envman/projects/:slug/environments/:env/portainer\` | VIEWER+ | Get config |
| \`PUT\` | \`/api/envman/projects/:slug/environments/:env/portainer\` | EDITOR+ | Save config \`{connectionId, stackId, stackName, endpointId}\` |
| \`DELETE\` | \`/api/envman/projects/:slug/environments/:env/portainer\` | EDITOR+ | Hapus config |
| \`POST\` | \`/api/envman/projects/:slug/environments/:env/portainer/sync\` | EDITOR+ | Push vars ke stack |

### Gists

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/envman/gists\` | Session | List (\`?limit&cursor&search&filter\`) |
| \`POST\` | \`/api/envman/gists\` | Session | Buat \`{title, description, files[], isPublic, tags[]}\` |
| \`PUT\` | \`/api/envman/gists/:id\` | Owner | Update |
| \`DELETE\` | \`/api/envman/gists/:id\` | Owner | Hapus |

### Tickets

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| \`GET\` | \`/api/tickets\` | Session | List (QC: hanya scope QC) |
| \`POST\` | \`/api/tickets\` | ADMIN+ | Buat \`{title, description, priority, route?}\` |
| \`GET\` | \`/api/tickets/:id\` | Session | Detail + comments + evidence |
| \`PATCH\` | \`/api/tickets/:id\` | Role-gated | Update \`{status?, priority?, assigneeId?}\` |
| \`POST\` | \`/api/tickets/:id/comments\` | Session | Komentar \`{body}\` |
| \`POST\` | \`/api/tickets/:id/evidence\` | Session | Evidence \`{kind, url, note?}\` |

Status machine: \`OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED\` + \`REOPENED\`

### Admin (SUPER_ADMIN only)

| Method | Path | Keterangan |
|--------|------|-----------|
| \`GET\` | \`/api/admin/users\` | List semua users |
| \`PUT\` | \`/api/admin/users/:id/role\` | Ubah role \`{role}\` |
| \`PUT\` | \`/api/admin/users/:id/block\` | Block/unblock \`{blocked}\` |
| \`GET\` | \`/api/admin/logs/app\` | App logs (\`?level&limit&afterId\`) |
| \`GET\` | \`/api/admin/logs/audit\` | Audit trail (\`?userId&action&limit\`) |
| \`DELETE\` | \`/api/admin/logs/app\` | Clear app logs |
| \`DELETE\` | \`/api/admin/logs/audit\` | Clear audit logs |
| \`GET\` | \`/api/admin/sessions\` | Semua sessions aktif |
| \`GET\` | \`/api/admin/presence\` | Online user IDs |
| \`GET\` | \`/api/admin/schema\` | Prisma schema sebagai JSON |
| \`GET\` | \`/api/admin/routes\` | Semua routes + metadata |

### WebSocket

| Path | Auth | Keterangan |
|------|------|-----------|
| \`WS /ws/presence\` | Cookie | Real-time online presence, broadcast ke admin |

---

## Enkripsi Secret Vars

- Algoritma: **AES-256-GCM**
- Config: set \`MASTER_KEY\` (64 hex chars) di server env
- Generate: \`openssl rand -hex 32\`
- Format DB: \`enc:<iv_hex>:<ciphertext_hex>:<auth_tag_hex>\`
- Tanpa MASTER_KEY: stored plaintext (backward compatible)
- VIEWER → melihat \`***\`; EDITOR/OWNER → bisa reveal; CLI/sync → selalu decrypt

---

## Self-Hosting — Environment Variables

\`\`\`bash
DATABASE_URL=postgresql://user:pass@host:5432/envman
MASTER_KEY=<64-hex>          # openssl rand -hex 32
PORT=3000
NODE_ENV=production
REDIS_URL=redis://localhost:6379
GOOGLE_CLIENT_ID=...         # opsional, Google OAuth
GOOGLE_CLIENT_SECRET=...
AUDIT_LOG_RETENTION_DAYS=90
\`\`\`

---

## Database Enums

\`\`\`
Role:              USER | QC | ADMIN | SUPER_ADMIN
ProjectMemberRole: OWNER | EDITOR | VIEWER
TicketStatus:      OPEN | IN_PROGRESS | READY_FOR_QC | REOPENED | CLOSED
TicketPriority:    LOW | MEDIUM | HIGH | CRITICAL
\`\`\`

---

*Untuk dokumentasi lengkap dengan contoh kode dan detail tambahan, kunjungi [${origin}/docs](${origin}/docs)*
`
}

// Bridge antara beforeHandle dan open() pada WS presence — satu Request hanya hidup
// selama handshake, jadi WeakMap aman dan auto-GC.
const presenceAuth = new WeakMap<Request, { userId: string; role: string }>()

export function createApp() {
  appLog('info', 'Server starting')

  return (
    new Elysia()
      .use(cors())
      .use(html())

      // ─── Global Error Handler ────────────────────────
      .onError(({ code, error, request }) => {
        if (code === 'NOT_FOUND') {
          return new Response(JSON.stringify({ error: 'Not Found', status: 404 }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const url = new URL(request.url)
        const message = error instanceof Error ? error.message : String(error)
        appLog('error', `${request.method} ${url.pathname} — ${message}`)
        console.error('[Server Error]', error)
        return new Response(JSON.stringify({ error: 'Internal Server Error', status: 500 }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      // ─── Request timing + logging ─────────────────────
      .onRequest(({ request }) => {
        ;(request as any).__startTime = performance.now()
      })
      .onAfterResponse(({ request, set }) => {
        const url = new URL(request.url)
        if (url.pathname.startsWith('/api/')) {
          const status = typeof set.status === 'number' ? set.status : 200
          const level = status >= 500 ? ('error' as const) : status >= 400 ? ('warn' as const) : ('info' as const)
          appLog(level, `${request.method} ${url.pathname} ${status}`)
          const duration = Math.round(performance.now() - ((request as any).__startTime || 0))
          broadcastToAdmins({
            type: 'request',
            method: request.method,
            path: url.pathname,
            status,
            duration,
            timestamp: new Date().toISOString(),
          })
        }
      })

      // API routes
      .get('/health', () => ({ status: 'ok' }))

      // ─── Better-Auth handler (handles /api/auth/* routes) ─
      .mount(auth.handler)

      // ─── Backward-compat: POST /api/auth/login ──────────
      // Frontend pakai endpoint ini; better-auth menggunakan /api/auth/sign-in/email.
      // Wrapper ini menerima {email, password}, forward ke better-auth, return {user} format lama.
      .post('/api/auth/login', async ({ request, set }) => {
        const ip = getIp(request)
        const { email, password } = (await request.json()) as { email: string; password: string }

        // Cek blocked sebelum login
        const dbUser = await prisma.user.findUnique({ where: { email }, select: { id: true, blocked: true } })
        if (dbUser?.blocked) {
          audit(dbUser.id, 'LOGIN_BLOCKED', null, ip)
          appLog('warn', `Login blocked: ${email}`, ip)
          set.status = 403
          return { error: 'Akun Anda telah diblokir. Hubungi administrator.' }
        }

        // Forward ke better-auth sign-in endpoint
        const baRes = await auth.api.signInEmail({
          body: { email, password },
          headers: request.headers,
          asResponse: true,
        })

        if (!baRes.ok) {
          await baRes.body?.cancel()
          audit(dbUser?.id ?? null, 'LOGIN_FAILED', `email: ${email}`, ip)
          appLog('warn', `Login failed: ${email}`, ip)
          set.status = 401
          return { error: 'Email atau password salah' }
        }

        // Ambil session cookie dari better-auth dan forward ke client
        const setCookie = baRes.headers.get('set-cookie')
        if (setCookie) set.headers['set-cookie'] = setCookie

        const _baBody = (await baRes.json()) as { user: Record<string, unknown> }
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, role: true },
        })
        appLog('info', `Login: ${email} (${user?.role})`, ip)
        return { user }
      })

      // ─── Backward-compat: GET /api/auth/session ──────────
      // Frontend menggunakan endpoint ini — return { user } format yang sama.
      .get('/api/auth/session', async ({ request, set }) => {
        const authResult = await requireAuth(request)
        if (!authResult) {
          set.status = 401
          return { user: null }
        }
        const dbUser = await prisma.user.findUnique({
          where: { id: authResult.userId },
          select: { id: true, name: true, email: true, role: true, blocked: true, permissions: true, image: true },
        })
        if (!dbUser || dbUser.blocked) {
          set.status = 401
          return { user: null }
        }
        return { user: dbUser }
      })

      // ─── Avatar proxy — hindari CORS Google + cache Redis ──
      .get('/api/user/avatar/:userId', async ({ params, set }) => {
        const user = await prisma.user.findUnique({
          where: { id: params.userId },
          select: { image: true },
        })
        if (!user?.image) {
          set.status = 404
          return null
        }

        const cacheKey = `avatar:${params.userId}`
        try {
          const cached = await redis.get(cacheKey)
          if (cached) {
            const sep = (cached as string).indexOf('|')
            const ct = (cached as string).slice(0, sep)
            const bytes = Buffer.from((cached as string).slice(sep + 1), 'base64')
            return new Response(bytes, {
              headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' },
            })
          }
        } catch {
          /* Redis miss — continue to fetch */
        }

        try {
          const res = await fetch(user.image, { signal: AbortSignal.timeout(5000) })
          if (!res.ok) {
            set.status = 404
            return null
          }
          const ct = res.headers.get('content-type') ?? 'image/jpeg'
          const bytes = await res.arrayBuffer()
          const b64 = Buffer.from(bytes).toString('base64')
          // Cache 1 jam — best-effort, jangan block response jika Redis gagal
          redis.set(cacheKey, `${ct}|${b64}`, 'EX', 3600).catch(() => {})
          return new Response(bytes, {
            headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' },
          })
        } catch {
          set.status = 404
          return null
        }
      })

      // ─── Backward-compat: POST /api/auth/logout ──────────
      // Frontend pakai endpoint ini; better-auth pakai /api/auth/sign-out.
      .post('/api/auth/logout', async ({ request, set }) => {
        const ip = getIp(request)
        // Logout via better-auth (menghapus signed session)
        const baRes = await auth.api.signOut({ headers: request.headers, asResponse: true })
        const setCookie = baRes?.headers.get('set-cookie')
        if (setCookie) set.headers['set-cookie'] = setCookie

        // Juga hapus UUID session jika ada (dev-auth / test sessions)
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/(?:^|;\s*)session=([^;]+)/)?.[1]
        if (token) {
          const session = await prisma.session.findUnique({ where: { token }, select: { userId: true } })
          if (session) {
            audit(session.userId, 'LOGOUT', null, ip)
            appLog('info', `Logout: userId=${session.userId}`, ip)
          }
          await prisma.session.deleteMany({ where: { token } })
        }

        if (!setCookie) set.headers['set-cookie'] = 'session=; Path=/; HttpOnly; Max-Age=0'
        return { ok: true }
      })

      // ─── Backward-compat: GET /api/auth/google ──────────
      // signInSocial menghasilkan state cookie + redirect URL ke Google.
      // Kita harus forward SEMUA set-cookie (termasuk state cookie) ke browser,
      // karena state cookie dibutuhkan saat Google callback untuk verifikasi.
      .get('/api/auth/google', async ({ request }) => {
        const baRes = await auth.api.signInSocial({
          body: { provider: 'google', callbackURL: `${getPublicOrigin(request)}/api/auth/google-callback` },
          headers: request.headers,
          asResponse: true,
        })
        const location = baRes.headers.get('location')
        if (!location) return new Response(JSON.stringify({ error: 'OAuth redirect failed' }), { status: 500 })

        // Forward semua headers dari better-auth (termasuk set-cookie state) ke browser
        const headers = new Headers({ location })
        for (const [key, val] of baRes.headers.entries()) {
          if (key.toLowerCase() === 'set-cookie') headers.append('set-cookie', val)
        }
        return new Response(null, { status: 302, headers })
      })

      // ─── Post-Google-OAuth callback redirect ─────────────
      // Setelah better-auth selesai OAuth, redirect ke role-based page.
      .get('/api/auth/google-callback', async ({ request, set }) => {
        const sessionData = await auth.api.getSession({ headers: request.headers })
        if (!sessionData?.user) {
          set.status = 302
          set.headers.location = '/login?error=google_failed'
          return
        }
        const userId = (sessionData.user as { id: string }).id
        // Selalu update image dari Google — better-auth tidak update otomatis saat re-login
        const googleImage = (sessionData.user as { image?: string | null }).image
        const dbUser = await prisma.user.update({
          where: { id: userId },
          data: { ...(googleImage ? { image: googleImage } : {}) },
          select: { role: true, email: true },
        })
        // Invalidate avatar cache agar proxy serve foto terbaru
        redis.del(`avatar:${userId}`).catch(() => {})
        appLog('info', `Login (Google): ${dbUser?.email} (${dbUser?.role})`, getIp(request))
        const defaultRoute =
          dbUser?.role === 'SUPER_ADMIN'
            ? '/dev'
            : dbUser?.role === 'QC'
              ? '/dashboard'
              : dbUser?.role === 'ADMIN'
                ? '/envmanager'
                : '/profile'
        set.status = 302
        set.headers.location = defaultRoute
      })

      // ─── Dev Auth (development only) ─────────────────────
      .get('/api/dev-auth/login-as/:email', async ({ request, params, set, query }) => {
        if (env.NODE_ENV !== 'development') {
          set.status = 404
          return { error: 'Not found' }
        }
        const user = await prisma.user.findUnique({ where: { email: params.email } })
        if (!user) {
          set.status = 404
          return { error: `User not found: ${params.email}` }
        }
        const token = crypto.randomUUID()
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
        await prisma.session.create({ data: { token, userId: user.id, expiresAt, updatedAt: new Date() } })
        set.headers['set-cookie'] = `session=${token}; ${cookieOpts}`
        appLog('info', `Dev-auth login: ${user.email} (${user.role})`, getIp(request))
        const redirect = (query as Record<string, string>).redirect
        if (redirect) {
          set.status = 302
          set.headers.location = redirect
          return
        }
        return { user: { id: user.id, name: user.name, email: user.email, role: user.role } }
      })

      // ─── Domain routers ────────────────────────────────
      .use(adminRouter)
      .use(ticketsRouter)
      .use(envmanRouter)
      .use(v1Router) // Versioned API — /api/v1/*

      // ─── WebSocket: presence ─────────────────────────
      // Auth via session cookie pada handshake. Admin (ADMIN/SUPER_ADMIN) menerima
      // broadcast list online; user biasa tetap diregister supaya muncul di list.
      .ws('/ws/presence', {
        async beforeHandle({ request, set }) {
          const caller = await requireAuth(request)
          if (!caller) {
            set.status = 401
            return 'Unauthorized'
          }
          // Pass caller ke open() lewat WeakMap (di-keyed oleh request)
          presenceAuth.set(request, caller)
        },
        open(ws) {
          const req = (ws.data as { request: Request }).request
          const caller = presenceAuth.get(req)
          presenceAuth.delete(req)
          if (!caller) {
            ws.close()
            return
          }
          const isAdmin = caller.role === 'ADMIN' || caller.role === 'SUPER_ADMIN'
          ;(ws.data as { userId?: string }).userId = caller.userId
          addConnection(ws, caller.userId, isAdmin)
        },
        close(ws) {
          const userId = (ws.data as { userId?: string }).userId
          if (userId) removeConnection(ws, userId)
        },
      })

      // ─── MCP over HTTP ────────────────────────────────
      .all('/mcp', async ({ request }) => {
        if (!env.MCP_SECRET && !env.MCP_SECRET_ADMIN) {
          return new Response(JSON.stringify({ error: 'MCP not configured: set MCP_SECRET and/or MCP_SECRET_ADMIN' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const header = request.headers.get('authorization') ?? ''
        const bearer = header.replace(/^Bearer\s+/i, '').trim()
        const provided = bearer || request.headers.get('x-mcp-secret') || ''
        let scope: McpScope | null = null
        if (env.MCP_SECRET_ADMIN && provided === env.MCP_SECRET_ADMIN) scope = 'admin'
        else if (env.MCP_SECRET && provided === env.MCP_SECRET) scope = 'readonly'
        if (!scope) {
          appLog('warn', `MCP unauthorized from ${getIp(request)}`)
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
          })
        }
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        })
        const mcp = createMcpServer(scope)
        await mcp.connect(transport)
        const response = await transport.handleRequest(request)
        response.headers.set('x-mcp-server', 'app-mcp')
        response.headers.set('x-mcp-scope', scope)
        return response
      })

      // ─── Version ─────────────────────────────────────────
      .get('/api/version', () => ({
        name: pkg.name,
        version: pkg.version,
      }))

      // ─── CLI Download ─────────────────────────────────────
      .get('/install', ({ request }) => {
        const origin = getPublicOrigin(request)
        const script = `#!/bin/sh
set -e

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

case "$OS" in
  linux)  PLATFORM="linux-$ARCH" ;;
  darwin) PLATFORM="darwin-$ARCH" ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

URL="${origin}/download/cli/$PLATFORM"
DEST="\${ENVMAN_DEST:-/usr/local/bin/envman}"
TMP="/tmp/envman-download.$$"

trap 'rm -f "$TMP"' EXIT INT TERM

attempt=1
max_attempts=5
while [ $attempt -le $max_attempts ]; do
  echo "Downloading envman for $PLATFORM... (attempt $attempt/$max_attempts)"
  # -L follows the 302 redirect to GitHub Releases.
  # --compressed declared for compatibility; GitHub serves raw binary regardless.
  # --retry handles transient errors within one curl run, outer loop handles fatal disconnects.
  if curl -fL --compressed --progress-bar --retry 3 --retry-all-errors --retry-delay 2 "$URL" -o "$TMP"; then
    break
  fi
  attempt=$((attempt+1))
  if [ $attempt -le $max_attempts ]; then
    echo "Connection interrupted, retrying in 2s..."
    sleep 2
  fi
done

if [ $attempt -gt $max_attempts ]; then
  echo "Error: Failed to download after $max_attempts attempts"
  exit 1
fi

chmod +x "$TMP"

if [ -w "$(dirname $DEST)" ]; then
  mv "$TMP" "$DEST"
else
  sudo mv "$TMP" "$DEST"
fi

echo "Installed envman to $DEST"
echo "Run: envman login ${origin} --token <your-token>"
`
        return new Response(script, { headers: { 'Content-Type': 'text/plain' } })
      })

      .get('/download/cli/version', () => {
        const pkg = require('../package.json')
        return { version: pkg.version as string }
      })

      .get('/download/cli/:platform', async ({ params, request, set }) => {
        const platforms: Record<string, string> = {
          'linux-x64': 'envman-linux-x64',
          'linux-arm64': 'envman-linux-arm64',
          'darwin-x64': 'envman-darwin-x64',
          'darwin-arm64': 'envman-darwin-arm64',
          'windows-x64': 'envman-windows-x64.exe',
        }
        const filename = platforms[params.platform]
        if (!filename) {
          set.status = 404
          return 'Unknown platform'
        }

        const cliDir = process.env.CLI_DATA_DIR ?? '/data/cli'
        const acceptsGzip = (request.headers.get('accept-encoding') ?? '').toLowerCase().includes('gzip')

        if (acceptsGzip) {
          const gzFile = Bun.file(`${cliDir}/${filename}.gz`)
          if (await gzFile.exists()) {
            set.headers['Content-Type'] = 'application/octet-stream'
            set.headers['Content-Encoding'] = 'gzip'
            set.headers.Vary = 'Accept-Encoding'
            set.headers['Content-Disposition'] = `attachment; filename="${filename}"`
            return gzFile
          }
        }

        const plainFile = Bun.file(`${cliDir}/${filename}`)
        if (await plainFile.exists()) {
          set.headers['Content-Type'] = 'application/octet-stream'
          set.headers.Vary = 'Accept-Encoding'
          set.headers['Content-Disposition'] = `attachment; filename="${filename}"`
          return plainFile
        }

        const repo = process.env.GITHUB_REPO ?? 'bipprojectbali/envman'
        const url = `https://github.com/${repo}/releases/latest/download/${filename}`
        set.status = 302
        set.headers.Location = url
        return null
      })

      // Upload CLI binary dari CI — overwrite latest, tidak perlu SSH ke server
      .post('/api/admin/cli/upload/:platform', async ({ params, request, set }) => {
        const secret = request.headers.get('x-cli-upload-secret')
        if (!secret || secret !== process.env.CLI_UPLOAD_SECRET) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const platforms: Record<string, string> = {
          'linux-x64': 'envman-linux-x64',
          'linux-arm64': 'envman-linux-arm64',
          'darwin-x64': 'envman-darwin-x64',
          'darwin-arm64': 'envman-darwin-arm64',
          'windows-x64': 'envman-windows-x64.exe',
        }
        const filename = platforms[params.platform]
        if (!filename) {
          set.status = 404
          return { error: 'Unknown platform' }
        }
        const body = await request.arrayBuffer()
        if (body.byteLength === 0) {
          set.status = 400
          return { error: 'Empty body' }
        }
        const cliDir = process.env.CLI_DATA_DIR ?? '/data/cli'
        await Bun.write(`${cliDir}/${filename}.gz`, body)
        return { ok: true, platform: params.platform, size: body.byteLength }
      })

      // ─── Public Docs (raw markdown for AI / crawlers) ─────
      .get('/api/docs.md', ({ request }) => {
        const origin = getPublicOrigin(request)
        // Inline the full markdown here (same content as /docs page)
        // Duplicated from frontend to avoid a build-time import — server runs before Vite bundles.
        const md = buildDocsMd(origin)
        const { notModified, headers } = conditional(request, {
          etag: strongEtag(md),
          cacheControl: 'public, max-age=300',
        })
        if (notModified) return notModifiedResponse(headers)
        return new Response(md, {
          headers: {
            ...headers,
            'Content-Type': 'text/markdown; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      })

      // ─── Example API ───────────────────────────────────
      .get('/api/hello', () => ({
        message: 'Hello, world!',
        method: 'GET',
      }))
      .put('/api/hello', () => ({
        message: 'Hello, world!',
        method: 'PUT',
      }))
      .get('/api/hello/:name', ({ params }) => ({
        message: `Hello, ${params.name}!`,
      }))
  )
}
