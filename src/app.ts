import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Elysia } from 'elysia'
import { createMcpServer, type McpScope } from '../scripts/mcp/server'
import { appLog } from './lib/applog'
import { auth } from './lib/auth'
import { audit } from './lib/audit'
import { prisma } from './lib/db'
import { env } from './lib/env'
import { requireAuth } from './lib/auth-middleware'
import { addConnection, broadcastToAdmins, removeConnection } from './lib/presence'
import { getIp, getPublicOrigin } from './lib/request'
import { adminRouter } from './routes/admin/index'
import { ticketsRouter } from './routes/tickets'
import { envmanRouter } from './routes/envman/index'
import { v1Router } from './routes/v1/index'
import pkg from '../package.json'


// Inject `env_file: - stack.env` into every Docker Compose service that lacks it.
// Portainer writes Env[] to stack.env for variable substitution; without env_file in
// the service definition those vars never reach the container environment.
function injectEnvFileIntoCompose(content: string): string {
  const lines = content.split('\n')
  // Two-pass: first collect where to insert, then build result
  const insertAfter = new Map<number, string[]>() // line index → lines to insert after it

  let inServices = false
  let serviceIndent = -1   // indent of service names (e.g. 2)
  let propIndent = -1       // indent of service properties (e.g. 4)
  let serviceHasEnvFile = false
  let lastPropLine = -1     // last content line inside current service

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
        if (inServices) { flushService(); inServices = false }
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

        const baBody = await baRes.json() as { user: Record<string, unknown> }
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
          select: { id: true, name: true, email: true, role: true, blocked: true },
        })
        if (!dbUser || dbUser.blocked) {
          set.status = 401
          return { user: null }
        }
        return { user: dbUser }
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
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true, email: true },
        })
        appLog('info', `Login (Google): ${dbUser?.email} (${dbUser?.role})`, getIp(request))
        const defaultRoute = dbUser?.role === 'SUPER_ADMIN' ? '/dev' : dbUser?.role === 'ADMIN' ? '/dashboard' : '/profile'
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
      .use(v1Router)       // Versioned API — /api/v1/*

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

echo "Downloading envman for $PLATFORM..."
curl -fsSL "$URL" -o /tmp/envman-download
chmod +x /tmp/envman-download

if [ -w "$(dirname $DEST)" ]; then
  mv /tmp/envman-download "$DEST"
else
  sudo mv /tmp/envman-download "$DEST"
fi

echo "Installed envman to $DEST"
echo "Run: envman login ${origin} --token <your-token>"
`
        return new Response(script, { headers: { 'Content-Type': 'text/plain' } })
      })

      .get('/download/cli/:platform', async ({ params, set }) => {
        const platforms: Record<string, string> = {
          'linux-x64':    'envman-linux-x64',
          'linux-arm64':  'envman-linux-arm64',
          'darwin-x64':   'envman-darwin-x64',
          'darwin-arm64': 'envman-darwin-arm64',
          'windows-x64':  'envman-windows-x64.exe',
        }
        const filename = platforms[params.platform]
        if (!filename) { set.status = 404; return new Response('Unknown platform', { status: 404 }) }
        const filePath = `${process.cwd()}/dist/cli/${filename}`
        const file = Bun.file(filePath)
        if (!(await file.exists())) {
          set.status = 404
          return new Response('Binary not built yet. Run: bun run build:cli', { status: 404 })
        }
        return new Response(file, { headers: { 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Type': 'application/octet-stream' } })
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
