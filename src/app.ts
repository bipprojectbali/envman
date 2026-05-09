import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Elysia } from 'elysia'
import { createMcpServer, type McpScope } from '../scripts/mcp/server'
import { appLog, clearAppLogs, getAppLogs } from './lib/applog'
import { auth } from './lib/auth'
import { decryptSecret, encryptSecret, hasMasterKey } from './lib/crypto'
import { prisma } from './lib/db'
import { env } from './lib/env'
import { addConnection, broadcastToAdmins, getOnlineUserIds, removeConnection } from './lib/presence'
import { parseSchema } from './lib/schema-parser'
import pkg from '../package.json'

function getIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
}

function getPublicOrigin(request: Request): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, '')
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return `${proto ?? url.protocol.replace(':', '')}://${host}`
}

function audit(userId: string | null, action: string, detail: string | null, ip: string) {
  prisma.auditLog.create({ data: { userId, action, detail, ip } }).catch(() => {})
}

async function requireAuth(request: Request): Promise<{ userId: string; role: string; email: string } | null> {
  // Try better-auth first (handles signed tokens from browser login)
  try {
    const sessionData = await auth.api.getSession({ headers: request.headers })
    if (sessionData?.user) {
      const user = sessionData.user as { id: string; role: string; email: string; blocked?: boolean }
      if (user.blocked) return null
      // Fetch fresh role from DB (better-auth user object may not have custom fields)
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, blocked: true, email: true } })
      if (!dbUser || dbUser.blocked) return null
      return { userId: user.id, role: dbUser.role, email: dbUser.email }
    }
  } catch {
    // fall through to UUID fallback
  }

  // Fallback: direct DB lookup for UUID tokens (dev-auth endpoint, test sessions)
  const cookie = request.headers.get('cookie') ?? ''
  const token = cookie.match(/(?:^|;\s*)session=([^;]+)/)?.[1]
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, role: true, email: true, blocked: true } } },
  })
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  if (session.user.blocked) return null
  return { userId: session.user.id, role: session.user.role, email: session.user.email }
}

// Check if a token's scopes allow access to a specific project:env.
// Empty scopes = access to all projects the user is member of.
function tokenScopeAllows(scopes: string[], projectSlug: string, envName: string): boolean {
  if (scopes.length === 0) return true
  return scopes.some(s => {
    const [p, e] = s.split(':')
    return p === projectSlug && (e === '*' || e === envName)
  })
}

async function requireEnvAuth(request: Request): Promise<{ userId: string; role: string; tokenName?: string; canWrite: boolean; scopes: string[] } | null> {
  const auth = request.headers.get('authorization') ?? ''
  const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (bearerToken) {
    const apiToken = await prisma.apiToken.findUnique({
      where: { token: bearerToken },
      include: { user: { select: { id: true, role: true, blocked: true } } },
    })
    if (!apiToken || apiToken.user.blocked) return null
    if (apiToken.isDisabled) return null
    if (apiToken.expiresAt && apiToken.expiresAt < new Date()) return null
    prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

    // canWrite capped by user's current membership (checked per-request in each endpoint)
    return { userId: apiToken.userId, role: apiToken.user.role, tokenName: apiToken.name, canWrite: apiToken.canWrite, scopes: apiToken.scopes }
  }
  const session = await requireAuth(request)
  if (!session) return null
  return { userId: session.userId, role: session.role, canWrite: true, scopes: [] }
}

async function getProjectAccess(userId: string, role: string, projectSlug: string): Promise<'OWNER' | 'EDITOR' | 'VIEWER' | null> {
  if (role === 'SUPER_ADMIN') return 'OWNER'
  const project = await prisma.project.findUnique({ where: { slug: projectSlug }, include: { members: { where: { userId } } } })
  if (!project) return null
  const member = project.members[0]
  if (!member) return null
  return member.role as 'OWNER' | 'EDITOR' | 'VIEWER'
}

function getAllowedStatusTransitions(current: string, role: 'QC' | 'ADMIN' | 'SUPER_ADMIN'): string[] {
  const isQc = role === 'QC' || role === 'SUPER_ADMIN'
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN'
  const matrix: Record<string, { qc: string[]; admin: string[] }> = {
    OPEN: { qc: ['CLOSED'], admin: ['IN_PROGRESS'] },
    IN_PROGRESS: { qc: ['CLOSED'], admin: ['READY_FOR_QC'] },
    READY_FOR_QC: { qc: ['CLOSED', 'REOPENED'], admin: [] },
    REOPENED: { qc: ['CLOSED'], admin: ['IN_PROGRESS'] },
    CLOSED: { qc: ['REOPENED'], admin: [] },
  }
  const entry = matrix[current]
  if (!entry) return []
  const out = new Set<string>()
  if (isQc) for (const s of entry.qc) out.add(s)
  if (isAdmin) for (const s of entry.admin) out.add(s)
  return [...out]
}

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
      // Better-auth menyediakan /api/auth/sign-in/social?provider=google.
      // Redirect dari /api/auth/google ke endpoint better-auth.
      .get('/api/auth/google', ({ set }) => {
        set.status = 302
        set.headers.location = '/api/auth/sign-in/social?provider=google&callbackURL=/api/auth/google-callback'
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

      // ─── Admin API (SUPER_ADMIN only) ───────────────────
      .get('/api/admin/users', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const users = await prisma.user.findMany({
          select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
        return { users }
      })

      .put('/api/admin/users/:id/role', async ({ request, params, set }) => {
        const ip = getIp(request)
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { id: true, role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        if (session.user.id === params.id) {
          set.status = 400
          return { error: 'Tidak bisa mengubah role sendiri' }
        }
        const { role } = (await request.json()) as { role: string }
        if (!['USER', 'QC', 'ADMIN'].includes(role)) {
          set.status = 400
          return { error: 'Role tidak valid (USER, QC, atau ADMIN)' }
        }
        const target = await prisma.user.findUnique({ where: { id: params.id }, select: { email: true, role: true } })
        if (target?.role === 'SUPER_ADMIN') {
          set.status = 400
          return { error: 'Tidak bisa mengubah role SUPER_ADMIN' }
        }
        const user = await prisma.user.update({
          where: { id: params.id },
          data: { role: role as 'USER' | 'QC' | 'ADMIN' },
          select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
        })
        audit(params.id, 'ROLE_CHANGED', `${target?.role} → ${role} by ${session.user.id}`, ip)
        appLog('info', `Role changed: ${user.email} ${target?.role} → ${role}`)
        return { user }
      })

      .put('/api/admin/users/:id/block', async ({ request, params, set }) => {
        const ip = getIp(request)
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { id: true, role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        if (session.user.id === params.id) {
          set.status = 400
          return { error: 'Tidak bisa memblokir diri sendiri' }
        }
        const { blocked } = (await request.json()) as { blocked: boolean }
        const user = await prisma.user.update({
          where: { id: params.id },
          data: { blocked },
          select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
        })
        // Delete all sessions if blocked
        if (blocked) {
          await prisma.session.deleteMany({ where: { userId: params.id } })
        }
        const action = blocked ? 'BLOCKED' : 'UNBLOCKED'
        audit(params.id, action, `by ${session.user.id}`, ip)
        appLog('info', `User ${action.toLowerCase()}: ${user.email}`)
        return { user }
      })

      // ─── WebSocket Presence ──────────────────────────────
      .ws('/ws/presence', {
        async open(ws) {
          // Authenticate via cookie
          const cookie = ws.data.headers?.cookie ?? ''
          const token = (cookie as string).match(/session=([^;]+)/)?.[1]
          if (!token) {
            ws.close(4001, 'Unauthorized')
            return
          }
          const session = await prisma.session.findUnique({
            where: { token },
            include: { user: { select: { id: true, role: true } } },
          })
          if (!session || session.expiresAt < new Date()) {
            ws.close(4001, 'Unauthorized')
            return
          }

          const isAdmin = session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN'
          ;(ws.data as unknown as { userId: string }).userId = session.user.id
          addConnection(ws as any, session.user.id, isAdmin)
        },
        close(ws) {
          removeConnection(ws as any)
        },
        message() {
          // No client messages expected
        },
      })

      // ─── Presence REST (for initial load) ──────────────
      .get('/api/admin/presence', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        return { online: getOnlineUserIds() }
      })

      // ─── Log API (SUPER_ADMIN only) ────────────────────
      .get('/api/admin/logs/app', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const url = new URL(request.url)
        const level = url.searchParams.get('level') as any
        const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
        const afterId = parseInt(url.searchParams.get('afterId') ?? '0', 10)
        return { logs: await getAppLogs({ level: level || undefined, limit, afterId: afterId || undefined }) }
      })

      .get('/api/admin/logs/audit', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const url = new URL(request.url)
        const userId = url.searchParams.get('userId')
        const action = url.searchParams.get('action')
        const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500)

        const where: Record<string, any> = {}
        if (userId) where.userId = userId
        if (action) where.action = action

        const logs = await prisma.auditLog.findMany({
          where,
          include: { user: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          take: limit,
        })
        return { logs }
      })

      .delete('/api/admin/logs/app', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        await clearAppLogs()
        appLog('info', 'App logs cleared manually')
        return { ok: true }
      })

      .delete('/api/admin/logs/audit', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { id: true, role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const { count } = await prisma.auditLog.deleteMany()
        appLog('info', `Audit logs cleared manually (${count} entries)`)
        return { ok: true, deleted: count }
      })

      // ─── Schema API (SUPER_ADMIN only) ──────────────────
      .get('/api/admin/schema', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const fs = await import('node:fs')
        const schemaPath = `${process.cwd()}/prisma/schema.prisma`
        if (!fs.existsSync(schemaPath)) {
          set.status = 404
          return { error: 'Schema not found' }
        }
        const raw = fs.readFileSync(schemaPath, 'utf-8')
        return { schema: parseSchema(raw) }
      })

      // ─── Routes Metadata API (SUPER_ADMIN only) ─────────
      .get('/api/admin/routes', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const routes: { method: string; path: string; auth: string; category: string; description: string }[] = [
          // Frontend routes
          { method: 'PAGE', path: '/', auth: 'public', category: 'frontend', description: 'Landing page' },
          {
            method: 'PAGE',
            path: '/login',
            auth: 'public',
            category: 'frontend',
            description: 'Login page (email/password + Google OAuth)',
          },
          {
            method: 'PAGE',
            path: '/dev',
            auth: 'superAdmin',
            category: 'frontend',
            description: 'Dev console (SUPER_ADMIN only)',
          },
          {
            method: 'PAGE',
            path: '/dashboard',
            auth: 'admin',
            category: 'frontend',
            description: 'Admin dashboard (ADMIN+)',
          },
          {
            method: 'PAGE',
            path: '/profile',
            auth: 'authenticated',
            category: 'frontend',
            description: 'User profile (all authenticated)',
          },
          {
            method: 'PAGE',
            path: '/blocked',
            auth: 'authenticated',
            category: 'frontend',
            description: 'Blocked user info page',
          },
          // Auth
          {
            method: 'POST',
            path: '/api/auth/login',
            auth: 'public',
            category: 'auth',
            description: 'Email/password login',
          },
          {
            method: 'POST',
            path: '/api/auth/logout',
            auth: 'authenticated',
            category: 'auth',
            description: 'Logout (delete session)',
          },
          {
            method: 'GET',
            path: '/api/auth/session',
            auth: 'public',
            category: 'auth',
            description: 'Check current session',
          },
          {
            method: 'GET',
            path: '/api/auth/google',
            auth: 'public',
            category: 'auth',
            description: 'Google OAuth redirect',
          },
          {
            method: 'GET',
            path: '/api/auth/callback/google',
            auth: 'public',
            category: 'auth',
            description: 'Google OAuth callback',
          },
          // Dev Auth
          {
            method: 'GET',
            path: '/api/dev-auth/login-as/:email',
            auth: 'public',
            category: 'auth',
            description: 'Dev-only: login as any user by email (development only)',
          },
          // Admin
          {
            method: 'GET',
            path: '/api/admin/users',
            auth: 'superAdmin',
            category: 'admin',
            description: 'List all users',
          },
          {
            method: 'PUT',
            path: '/api/admin/users/:id/role',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Change user role',
          },
          {
            method: 'PUT',
            path: '/api/admin/users/:id/block',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Block/unblock user',
          },
          {
            method: 'GET',
            path: '/api/admin/presence',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Online user IDs',
          },
          {
            method: 'GET',
            path: '/api/admin/logs/app',
            auth: 'superAdmin',
            category: 'admin',
            description: 'App logs (Redis)',
          },
          {
            method: 'GET',
            path: '/api/admin/logs/audit',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Audit logs (DB)',
          },
          {
            method: 'DELETE',
            path: '/api/admin/logs/app',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Clear app logs',
          },
          {
            method: 'DELETE',
            path: '/api/admin/logs/audit',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Clear audit logs',
          },
          {
            method: 'GET',
            path: '/api/admin/schema',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Database schema (Prisma)',
          },
          {
            method: 'GET',
            path: '/api/admin/routes',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Routes metadata',
          },
          {
            method: 'GET',
            path: '/api/admin/project-structure',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Project file structure',
          },
          {
            method: 'GET',
            path: '/api/admin/env-map',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Environment variables map',
          },
          {
            method: 'GET',
            path: '/api/admin/test-coverage',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Test coverage mapping',
          },
          {
            method: 'GET',
            path: '/api/admin/dependencies',
            auth: 'superAdmin',
            category: 'admin',
            description: 'NPM dependencies graph',
          },
          {
            method: 'GET',
            path: '/api/admin/migrations',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Migration timeline',
          },
          {
            method: 'GET',
            path: '/api/admin/sessions',
            auth: 'superAdmin',
            category: 'admin',
            description: 'Active sessions (live)',
          },
          // Tickets
          {
            method: 'GET',
            path: '/api/tickets',
            auth: 'qcOrAdmin',
            category: 'tickets',
            description: 'List tickets (filter: status, priority, assigneeId)',
          },
          {
            method: 'POST',
            path: '/api/tickets',
            auth: 'qcOrAdmin',
            category: 'tickets',
            description: 'Create ticket (QC/ADMIN/SUPER_ADMIN)',
          },
          {
            method: 'GET',
            path: '/api/tickets/:id',
            auth: 'qcOrAdmin',
            category: 'tickets',
            description: 'Get ticket detail with comments and evidence',
          },
          {
            method: 'PATCH',
            path: '/api/tickets/:id',
            auth: 'qcOrAdmin',
            category: 'tickets',
            description: 'Update ticket fields (role-based status transitions)',
          },
          {
            method: 'POST',
            path: '/api/tickets/:id/comments',
            auth: 'qcOrAdmin',
            category: 'tickets',
            description: 'Add comment to ticket',
          },
          {
            method: 'POST',
            path: '/api/tickets/:id/evidence',
            auth: 'qcOrAdmin',
            category: 'tickets',
            description: 'Attach evidence (screenshot, commit, test log)',
          },
          // Utility
          { method: 'GET', path: '/health', auth: 'public', category: 'utility', description: 'Health check' },
          { method: 'GET', path: '/api/version', auth: 'public', category: 'utility', description: 'App name and version from package.json' },
          { method: 'GET', path: '/api/hello', auth: 'public', category: 'utility', description: 'Hello world (GET)' },
          { method: 'PUT', path: '/api/hello', auth: 'public', category: 'utility', description: 'Hello world (PUT)' },
          {
            method: 'GET',
            path: '/api/hello/:name',
            auth: 'public',
            category: 'utility',
            description: 'Hello with name param',
          },
          // WebSocket
          {
            method: 'WS',
            path: '/ws/presence',
            auth: 'authenticated',
            category: 'realtime',
            description: 'Real-time presence tracking',
          },
        ]

        const byMethod: Record<string, number> = {}
        const byAuth: Record<string, number> = {}
        const byCategory: Record<string, number> = {}
        for (const r of routes) {
          byMethod[r.method] = (byMethod[r.method] || 0) + 1
          byAuth[r.auth] = (byAuth[r.auth] || 0) + 1
          byCategory[r.category] = (byCategory[r.category] || 0) + 1
        }

        return {
          routes,
          summary: { total: routes.length, byMethod, byAuth, byCategory },
        }
      })

      // ─── Project Structure API (SUPER_ADMIN only) ──────
      .get('/api/admin/project-structure', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const fs = await import('node:fs')
        const path = await import('node:path')
        const root = process.cwd()
        const scanDirs = ['src', 'prisma', 'tests']
        const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git', '.next'])
        const exts = new Set(['.ts', '.tsx'])

        interface FileInfo {
          path: string
          category: string
          lines: number
          exports: string[]
          imports: { from: string; names: string[] }[]
        }

        interface DirInfo {
          path: string
          category: string
          fileCount: number
        }

        const files: FileInfo[] = []
        const dirs: DirInfo[] = []

        function categorize(filePath: string): string {
          if (filePath.startsWith('src/frontend/routes/')) return 'route'
          if (filePath.startsWith('src/frontend/hooks/')) return 'hook'
          if (filePath.startsWith('src/frontend/components/')) return 'component'
          if (filePath.startsWith('src/frontend')) return 'frontend'
          if (filePath.startsWith('src/lib/')) return 'lib'
          if (filePath.startsWith('prisma/')) return 'prisma'
          if (filePath.startsWith('tests/unit/')) return 'test-unit'
          if (filePath.startsWith('tests/integration/')) return 'test-integration'
          if (filePath.startsWith('tests/')) return 'test'
          if (filePath.startsWith('src/')) return 'backend'
          return 'config'
        }

        function parseFile(filePath: string, content: string): FileInfo {
          const lines = content.split('\n').length
          const exports: string[] = []
          const imports: { from: string; names: string[] }[] = []

          // Parse exports
          for (const m of content.matchAll(
            /export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g,
          )) {
            exports.push(m[1])
          }
          if (
            /export\s+default\s+/.test(content) &&
            !exports.some(
              (e) => content.includes(`export default function ${e}`) || content.includes(`export default class ${e}`),
            )
          ) {
            exports.push('default')
          }

          // Parse imports
          for (const m of content.matchAll(
            /import\s+(?:\{([^}]+)\}|(\w+))(?:\s*,\s*\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"]/g,
          )) {
            const names: string[] = []
            if (m[1])
              names.push(
                ...m[1]
                  .split(',')
                  .map((s) => s.trim().split(' as ')[0].trim())
                  .filter(Boolean),
              )
            if (m[2]) names.push(m[2])
            if (m[3])
              names.push(
                ...m[3]
                  .split(',')
                  .map((s) => s.trim().split(' as ')[0].trim())
                  .filter(Boolean),
              )
            let from = m[4]
            // Resolve relative imports to project-relative paths
            if (from.startsWith('.')) {
              const dir = path.dirname(filePath)
              from = path.normalize(path.join(dir, from)).replace(/\\/g, '/')
              // Try resolve extension
              for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
                if (fs.existsSync(path.join(root, from + ext))) {
                  from = from + ext
                  break
                }
                if (fs.existsSync(path.join(root, from))) break
              }
            }
            imports.push({ from, names })
          }

          return { path: filePath, category: categorize(filePath), lines, exports, imports }
        }

        function scan(dir: string) {
          const absDir = path.join(root, dir)
          if (!fs.existsSync(absDir)) return
          const entries = fs.readdirSync(absDir, { withFileTypes: true })
          let fileCount = 0

          for (const entry of entries) {
            if (skipDirs.has(entry.name)) continue
            const rel = path.join(dir, entry.name).replace(/\\/g, '/')
            if (entry.isDirectory()) {
              scan(rel)
            } else if (exts.has(path.extname(entry.name))) {
              const content = fs.readFileSync(path.join(root, rel), 'utf-8')
              files.push(parseFile(rel, content))
              fileCount++
            }
          }

          dirs.push({ path: dir, category: categorize(`${dir}/`), fileCount })
        }

        for (const d of scanDirs) scan(d)

        // Sort
        files.sort((a, b) => a.path.localeCompare(b.path))
        dirs.sort((a, b) => a.path.localeCompare(b.path))

        const totalLines = files.reduce((s, f) => s + f.lines, 0)
        const totalExports = files.reduce((s, f) => s + f.exports.length, 0)
        const totalImports = files.reduce((s, f) => s + f.imports.length, 0)
        const byCategory: Record<string, number> = {}
        for (const f of files) {
          byCategory[f.category] = (byCategory[f.category] || 0) + 1
        }

        return {
          files,
          directories: dirs,
          summary: { totalFiles: files.length, totalLines, totalExports, totalImports, byCategory },
        }
      })

      // ─── Environment Map API (SUPER_ADMIN only) ─────────
      .get('/api/admin/env-map', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const fs = await import('node:fs')
        const path = await import('node:path')
        const root = process.cwd()

        // Define all env variables used in the project
        const envDefs: {
          name: string
          envKey: string
          required: boolean
          default: string | null
          category: string
          description: string
        }[] = [
          {
            name: 'DATABASE_URL',
            envKey: 'DATABASE_URL',
            required: true,
            default: null,
            category: 'database',
            description: 'PostgreSQL connection string',
          },
          {
            name: 'REDIS_URL',
            envKey: 'REDIS_URL',
            required: true,
            default: null,
            category: 'cache',
            description: 'Redis connection string',
          },
          {
            name: 'GOOGLE_CLIENT_ID',
            envKey: 'GOOGLE_CLIENT_ID',
            required: true,
            default: null,
            category: 'auth',
            description: 'Google OAuth client ID',
          },
          {
            name: 'GOOGLE_CLIENT_SECRET',
            envKey: 'GOOGLE_CLIENT_SECRET',
            required: true,
            default: null,
            category: 'auth',
            description: 'Google OAuth client secret',
          },
          {
            name: 'SUPER_ADMIN_EMAIL',
            envKey: 'SUPER_ADMIN_EMAIL',
            required: false,
            default: '(empty)',
            category: 'auth',
            description: 'Comma-separated emails to auto-promote to SUPER_ADMIN',
          },
          {
            name: 'PORT',
            envKey: 'PORT',
            required: false,
            default: '3000',
            category: 'app',
            description: 'Server port',
          },
          {
            name: 'NODE_ENV',
            envKey: 'NODE_ENV',
            required: false,
            default: 'development',
            category: 'app',
            description: 'Environment mode',
          },
          {
            name: 'REACT_EDITOR',
            envKey: 'REACT_EDITOR',
            required: false,
            default: 'code',
            category: 'app',
            description: 'Editor for click-to-source',
          },
          {
            name: 'AUDIT_LOG_RETENTION_DAYS',
            envKey: 'AUDIT_LOG_RETENTION_DAYS',
            required: false,
            default: '90',
            category: 'app',
            description: 'Days to keep audit logs',
          },
        ]

        // Scan files for env usage
        const srcFiles = [
          'src/lib/env.ts',
          'src/lib/db.ts',
          'src/lib/redis.ts',
          'src/lib/applog.ts',
          'src/app.ts',
          'src/index.tsx',
          'src/vite.ts',
        ]
        const fileContents: Record<string, string> = {}
        for (const f of srcFiles) {
          const absPath = path.join(root, f)
          if (fs.existsSync(absPath)) fileContents[f] = fs.readFileSync(absPath, 'utf-8')
        }

        const variables = envDefs.map((def) => {
          const usedBy: string[] = []
          for (const [file, content] of Object.entries(fileContents)) {
            if (content.includes(def.envKey) || content.includes(`env.${def.name}`)) {
              usedBy.push(file)
            }
          }
          return {
            name: def.name,
            required: def.required,
            isSet: !!process.env[def.envKey],
            default: def.default,
            category: def.category,
            description: def.description,
            usedBy,
          }
        })

        const byCategory: Record<string, number> = {}
        let setCount = 0
        let requiredCount = 0
        for (const v of variables) {
          byCategory[v.category] = (byCategory[v.category] || 0) + 1
          if (v.isSet) setCount++
          if (v.required) requiredCount++
        }

        return {
          variables,
          summary: {
            total: variables.length,
            set: setCount,
            unset: variables.length - setCount,
            required: requiredCount,
            byCategory,
          },
        }
      })

      // ─── Test Coverage Map API (SUPER_ADMIN only) ──────
      .get('/api/admin/test-coverage', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const fs = await import('node:fs')
        const pathMod = await import('node:path')
        const root = process.cwd()
        const exts = new Set(['.ts', '.tsx'])
        const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git'])

        interface SrcFile {
          path: string
          lines: number
          exports: string[]
          testedBy: string[]
          coverage: string
        }
        interface TestFile {
          path: string
          lines: number
          type: string
          targets: string[]
        }

        function scanDir(dir: string, collect: string[]) {
          const abs = pathMod.join(root, dir)
          if (!fs.existsSync(abs)) return
          for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            if (skipDirs.has(entry.name)) continue
            const rel = pathMod.join(dir, entry.name).replace(/\\/g, '/')
            if (entry.isDirectory()) scanDir(rel, collect)
            else if (exts.has(pathMod.extname(entry.name))) collect.push(rel)
          }
        }

        const srcPaths: string[] = []
        scanDir('src', srcPaths)
        const srcFiltered = srcPaths.filter((f) => !f.includes('routeTree.gen'))

        const testPaths: string[] = []
        scanDir('tests', testPaths)
        const testFiltered = testPaths.filter((f) => f.includes('.test.'))

        // Parse test files
        const testFiles: TestFile[] = testFiltered.map((tp) => {
          const content = fs.readFileSync(pathMod.join(root, tp), 'utf-8')
          const lines = content.split('\n').length
          const type = tp.includes('/unit/') ? 'unit' : tp.includes('/integration/') ? 'integration' : 'other'
          const targets: string[] = []
          // Direct imports
          for (const m of content.matchAll(/from\s+['"]([^'"]*(?:src|lib)[^'"]*)['"]/g)) {
            let resolved = m[1].replace(/^.*?src\//, 'src/')
            if (resolved.startsWith('.')) {
              resolved = pathMod.normalize(pathMod.join(pathMod.dirname(tp), resolved)).replace(/\\/g, '/')
            }
            // Try resolve
            for (const ext of ['', '.ts', '.tsx']) {
              const full = resolved + ext
              if (srcFiltered.includes(full)) {
                targets.push(full)
                break
              }
            }
          }
          // API fetch patterns → app.ts
          if (/fetch\(['"`]\/api\//.test(content) || /createApp|createTestApp/.test(content)) {
            if (!targets.includes('src/app.ts')) targets.push('src/app.ts')
          }
          return { path: tp, lines, type, targets: [...new Set(targets)] }
        })

        // Build source file info
        const testedByMap: Record<string, string[]> = {}
        for (const t of testFiles) {
          for (const target of t.targets) {
            if (!testedByMap[target]) testedByMap[target] = []
            testedByMap[target].push(t.path)
          }
        }

        const sourceFiles: SrcFile[] = srcFiltered.map((sp) => {
          const content = fs.readFileSync(pathMod.join(root, sp), 'utf-8')
          const lines = content.split('\n').length
          const exports: string[] = []
          for (const m of content.matchAll(
            /export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g,
          )) {
            exports.push(m[1])
          }
          const tb = testedByMap[sp] || []
          const coverage = tb.length === 0 ? 'uncovered' : tb.some((t) => t.includes('/unit/')) ? 'covered' : 'partial'
          return { path: sp, lines, exports, testedBy: tb, coverage }
        })

        const covered = sourceFiles.filter((f) => f.coverage === 'covered').length
        const partial = sourceFiles.filter((f) => f.coverage === 'partial').length
        const uncovered = sourceFiles.filter((f) => f.coverage === 'uncovered').length

        return {
          sourceFiles,
          testFiles,
          summary: {
            totalSource: sourceFiles.length,
            totalTests: testFiles.length,
            covered,
            partial,
            uncovered,
            coveragePercent: Math.round(((covered + partial * 0.5) / sourceFiles.length) * 100),
          },
        }
      })

      // ─── Dependencies Graph API (SUPER_ADMIN only) ─────
      .get('/api/admin/dependencies', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const fs = await import('node:fs')
        const pathMod = await import('node:path')
        const root = process.cwd()
        const pkgPath = pathMod.join(root, 'package.json')
        if (!fs.existsSync(pkgPath)) {
          set.status = 404
          return { error: 'package.json not found' }
        }

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        const deps: Record<string, string> = pkg.dependencies || {}
        const devDeps: Record<string, string> = pkg.devDependencies || {}

        // Categorize packages
        const catMap: Record<string, string> = {
          elysia: 'server',
          '@elysiajs/cors': 'server',
          '@elysiajs/html': 'server',
          react: 'ui',
          'react-dom': 'ui',
          '@mantine/core': 'ui',
          '@mantine/hooks': 'ui',
          '@tanstack/react-router': 'ui',
          '@tanstack/react-query': 'ui',
          '@xyflow/react': 'ui',
          'react-icons': 'ui',
          '@prisma/client': 'database',
          prisma: 'database',
          vite: 'build',
          typescript: 'build',
          '@biomejs/biome': 'build',
          '@vitejs/plugin-react': 'build',
          '@tanstack/router-plugin': 'build',
        }

        // Scan source for package imports
        const srcFiles: string[] = []
        function scanSrc(dir: string) {
          const abs = pathMod.join(root, dir)
          if (!fs.existsSync(abs)) return
          for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
            if (['node_modules', 'dist', 'generated', '.git'].includes(e.name)) continue
            const rel = pathMod.join(dir, e.name).replace(/\\/g, '/')
            if (e.isDirectory()) scanSrc(rel)
            else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push(rel)
          }
        }
        scanSrc('src')

        const fileContents: Record<string, string> = {}
        for (const f of srcFiles) {
          fileContents[f] = fs.readFileSync(pathMod.join(root, f), 'utf-8')
        }

        const allPkgs: { name: string; version: string; type: string; category: string; usedBy: string[] }[] = []

        for (const [name, version] of Object.entries(deps)) {
          const usedBy: string[] = []
          const importPattern = new RegExp(`from\\s+['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
          for (const [file, content] of Object.entries(fileContents)) {
            if (importPattern.test(content)) usedBy.push(file)
          }
          allPkgs.push({ name, version, type: 'runtime', category: catMap[name] || 'other', usedBy })
        }

        for (const [name, version] of Object.entries(devDeps)) {
          allPkgs.push({ name, version, type: 'dev', category: catMap[name] || 'build', usedBy: [] })
        }

        const byCategory: Record<string, number> = {}
        let runtime = 0,
          dev = 0
        for (const p of allPkgs) {
          byCategory[p.category] = (byCategory[p.category] || 0) + 1
          if (p.type === 'runtime') runtime++
          else dev++
        }

        return {
          packages: allPkgs,
          summary: { total: allPkgs.length, runtime, dev, byCategory },
        }
      })

      // ─── Migrations Timeline API (SUPER_ADMIN only) ────
      .get('/api/admin/migrations', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const fs = await import('node:fs')
        const pathMod = await import('node:path')
        const root = process.cwd()
        const migrationsDir = pathMod.join(root, 'prisma/migrations')

        if (!fs.existsSync(migrationsDir)) {
          return {
            migrations: [],
            summary: { totalMigrations: 0, firstMigration: null, lastMigration: null, totalChanges: 0 },
          }
        }

        const entries = fs
          .readdirSync(migrationsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
          .sort((a, b) => a.name.localeCompare(b.name))

        const migrations = entries.map((entry) => {
          const sqlPath = pathMod.join(migrationsDir, entry.name, 'migration.sql')
          let sql = ''
          const changes: string[] = []

          if (fs.existsSync(sqlPath)) {
            sql = fs.readFileSync(sqlPath, 'utf-8')
            // Extract change summaries
            for (const m of sql.matchAll(
              /^(CREATE TABLE|ALTER TABLE|CREATE INDEX|CREATE UNIQUE INDEX|DROP TABLE|DROP INDEX|CREATE TYPE|ALTER TYPE)\s+["']?(\w+)["']?/gim,
            )) {
              changes.push(`${m[1]} ${m[2]}`)
            }
            // Also catch Prisma enum creation pattern
            for (const m of sql.matchAll(/CREATE TYPE\s+"(\w+)"/g)) {
              if (!changes.some((c) => c.includes(m[1]))) changes.push(`CREATE TYPE ${m[1]}`)
            }
          }

          // Parse date from folder name: YYYYMMDDHHMMSS_name
          const dateStr = entry.name.substring(0, 14)
          const createdAt = new Date(
            `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${dateStr.slice(8, 10)}:${dateStr.slice(10, 12)}:${dateStr.slice(12, 14)}.000Z`,
          ).toISOString()

          const name = entry.name.substring(15) // Remove timestamp prefix + underscore

          return { name, folder: entry.name, createdAt, changes, sql: sql.substring(0, 800) }
        })

        const totalChanges = migrations.reduce((s, m) => s + m.changes.length, 0)

        return {
          migrations,
          summary: {
            totalMigrations: migrations.length,
            firstMigration: migrations[0]?.createdAt || null,
            lastMigration: migrations[migrations.length - 1]?.createdAt || null,
            totalChanges,
          },
        }
      })

      // ─── Sessions Live API (SUPER_ADMIN only) ──────────
      .get('/api/admin/sessions', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = cookie.match(/session=([^;]+)/)?.[1]
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const onlineIds = new Set(getOnlineUserIds())
        const sessions = await prisma.session.findMany({
          include: { user: { select: { id: true, name: true, email: true, role: true, blocked: true } } },
          orderBy: { createdAt: 'desc' },
        })

        const now = new Date()
        const result = sessions.map((s) => ({
          id: s.id,
          userId: s.user.id,
          userName: s.user.name,
          userEmail: s.user.email,
          userRole: s.user.role,
          userBlocked: s.user.blocked,
          isOnline: onlineIds.has(s.user.id),
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          isExpired: s.expiresAt < now,
        }))

        const byRole: Record<string, number> = {}
        const uniqueUsers = new Set<string>()
        let active = 0,
          expired = 0
        for (const s of result) {
          uniqueUsers.add(s.userId)
          byRole[s.userRole] = (byRole[s.userRole] || 0) + 1
          if (s.isExpired) expired++
          else active++
        }

        return {
          sessions: result,
          summary: {
            totalSessions: result.length,
            activeSessions: active,
            expiredSessions: expired,
            onlineUsers: onlineIds.size,
            byRole,
          },
        }
      })

      // ─── Tickets API ──────────────────────────────────
      .get('/api/tickets', async ({ request, query, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (auth.role === 'USER') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const where: Record<string, unknown> = {}
        if (query.status) where.status = String(query.status)
        if (query.priority) where.priority = String(query.priority)
        if (query.assigneeId) where.assigneeId = String(query.assigneeId)
        if (query.reporterId) where.reporterId = String(query.reporterId)
        if (query.mine === '1') where.assigneeId = auth.userId

        const tickets = await prisma.ticket.findMany({
          where,
          include: {
            reporter: { select: { id: true, name: true, email: true, role: true } },
            assignee: { select: { id: true, name: true, email: true, role: true } },
            _count: { select: { comments: true, evidence: true } },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: Math.min(Number(query.limit) || 100, 500),
        })
        return { tickets }
      })

      .get('/api/tickets/:id', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (auth.role === 'USER') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const ticket = await prisma.ticket.findUnique({
          where: { id: params.id },
          include: {
            reporter: { select: { id: true, name: true, email: true, role: true } },
            assignee: { select: { id: true, name: true, email: true, role: true } },
            comments: {
              include: { author: { select: { id: true, name: true, email: true, role: true } } },
              orderBy: { createdAt: 'asc' },
            },
            evidence: { orderBy: { createdAt: 'asc' } },
          },
        })
        if (!ticket) {
          set.status = 404
          return { error: 'Ticket not found' }
        }
        return { ticket }
      })

      .post('/api/tickets', async ({ request, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (!['QC', 'ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
          set.status = 403
          return { error: 'Hanya QC/ADMIN yang bisa membuat tiket' }
        }
        const body = (await request.json()) as {
          title?: string
          description?: string
          priority?: string
          route?: string
          assigneeId?: string
        }
        if (!body.title || !body.description) {
          set.status = 400
          return { error: 'title dan description wajib diisi' }
        }
        const ticket = await prisma.ticket.create({
          data: {
            title: body.title,
            description: body.description,
            priority: (body.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
            route: body.route ?? null,
            reporterId: auth.userId,
            assigneeId: body.assigneeId ?? null,
          },
        })
        audit(auth.userId, 'TICKET_CREATED', `#${ticket.id} ${ticket.title}`, getIp(request))
        appLog('info', `Ticket created: ${ticket.title} by ${auth.email}`)
        return { ticket }
      })

      .patch('/api/tickets/:id', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (auth.role === 'USER') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const current = await prisma.ticket.findUnique({ where: { id: params.id } })
        if (!current) {
          set.status = 404
          return { error: 'Ticket not found' }
        }

        const body = (await request.json()) as {
          title?: string
          description?: string
          priority?: string
          route?: string | null
          status?: string
          assigneeId?: string | null
        }

        const data: Record<string, unknown> = {}

        if (body.title !== undefined) data.title = body.title
        if (body.description !== undefined) data.description = body.description
        if (body.priority !== undefined) data.priority = body.priority
        if (body.route !== undefined) data.route = body.route
        if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId

        if (body.status !== undefined) {
          const allowed = getAllowedStatusTransitions(current.status, auth.role as 'QC' | 'ADMIN' | 'SUPER_ADMIN')
          if (!allowed.includes(body.status)) {
            set.status = 400
            return {
              error: `Transisi status tidak diizinkan untuk role ${auth.role}: ${current.status} → ${body.status}`,
            }
          }
          data.status = body.status
          if (body.status === 'CLOSED') data.closedAt = new Date()
          if (body.status === 'REOPENED') data.closedAt = null
        }

        const ticket = await prisma.ticket.update({ where: { id: params.id }, data })
        audit(auth.userId, 'TICKET_UPDATED', `#${ticket.id} ${Object.keys(data).join(',')}`, getIp(request))
        return { ticket }
      })

      .post('/api/tickets/:id/comments', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (auth.role === 'USER') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, select: { id: true } })
        if (!ticket) {
          set.status = 404
          return { error: 'Ticket not found' }
        }

        const { body } = (await request.json()) as { body?: string }
        if (!body?.trim()) {
          set.status = 400
          return { error: 'body wajib diisi' }
        }

        const comment = await prisma.ticketComment.create({
          data: {
            ticketId: params.id,
            authorId: auth.userId,
            authorTag: auth.role === 'QC' ? 'QC' : auth.role === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN',
            body,
          },
          include: { author: { select: { id: true, name: true, email: true, role: true } } },
        })
        return { comment }
      })

      .post('/api/tickets/:id/evidence', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (auth.role === 'USER') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, select: { id: true } })
        if (!ticket) {
          set.status = 404
          return { error: 'Ticket not found' }
        }

        const body = (await request.json()) as { kind?: string; url?: string; note?: string }
        if (!body.kind || !body.url) {
          set.status = 400
          return { error: 'kind dan url wajib diisi' }
        }

        const evidence = await prisma.ticketEvidence.create({
          data: { ticketId: params.id, kind: body.kind, url: body.url, note: body.note ?? null },
        })
        return { evidence }
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

      // ══════════════════════════════════════════════════════
      // ─── ENV MANAGER ──────────────────────────────────────
      // ══════════════════════════════════════════════════════

      // ─── Token Auth (CLI) ─────────────────────────────────
      .get('/api/envman/status', async ({ request, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        return { encryptionEnabled: hasMasterKey() }
      })

      .get('/api/envman/whoami', async ({ request, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const user = await prisma.user.findUnique({ where: { id: caller.userId }, select: { id: true, name: true, email: true, role: true } })
        return { user, tokenName: caller.tokenName }
      })

      // ─── User lookup (for invite) ─────────────────────────
      .get('/api/envman/users', async ({ request, set }) => {
        const auth = await requireAuth(request)
        if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
        const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
        const users = await prisma.user.findMany({
          where: {
            blocked: false,
            id: { not: auth.userId },
            role: { in: ['ADMIN', 'SUPER_ADMIN'] },
            ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
          },
          select: { id: true, name: true, email: true },
          orderBy: { name: 'asc' },
          take: 30,
        })
        return { users }
      })

      // ─── API Tokens ───────────────────────────────────────
      .get('/api/envman/tokens', async ({ request, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const tokens = await prisma.apiToken.findMany({
          where: { userId: caller.userId },
          select: { id: true, name: true, scopes: true, canWrite: true, isDisabled: true, lastUsedAt: true, expiresAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
        return { tokens }
      })

      .post('/api/envman/tokens', async ({ request, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const body = await request.json().catch(() => null)
        if (!body?.name) { set.status = 400; return { error: 'name required' } }
        const { name, scopes = [], canWrite = false, expiresAt } = body
        // Validate each scope — user must have access to every project in scopes
        for (const scope of scopes as string[]) {
          const projectSlug = scope.split(':')[0]
          const access = await getProjectAccess(caller.userId, caller.role, projectSlug)
          if (!access) { set.status = 403; return { error: `No access to project: ${projectSlug}` } }
          if (canWrite && access === 'VIEWER') { set.status = 403; return { error: `VIEWER cannot create write tokens for: ${projectSlug}` } }
        }
        const token = `em_${crypto.randomUUID().replace(/-/g, '')}`
        const created = await prisma.apiToken.create({
          data: { userId: caller.userId, name, token, scopes, canWrite, expiresAt: expiresAt ? new Date(expiresAt) : null },
        })
        return { id: created.id, name: created.name, token, canWrite, expiresAt: created.expiresAt }
      })

      .patch('/api/envman/tokens/:id', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const existing = await prisma.apiToken.findUnique({ where: { id: params.id } })
        if (!existing || existing.userId !== caller.userId) { set.status = 404; return { error: 'Not found' } }
        const body = await request.json().catch(() => null)
        const { name, scopes, canWrite, expiresAt } = body ?? {}
        // Validate scopes if provided
        if (scopes) {
          for (const scope of scopes as string[]) {
            const projectSlug = scope.split(':')[0]
            const access = await getProjectAccess(caller.userId, caller.role, projectSlug)
            if (!access) { set.status = 403; return { error: `No access to project: ${projectSlug}` } }
            const effectiveWrite = canWrite ?? existing.canWrite
            if (effectiveWrite && access === 'VIEWER') { set.status = 403; return { error: `VIEWER cannot have write access to: ${projectSlug}` } }
          }
        }
        const updated = await prisma.apiToken.update({
          where: { id: params.id },
          data: {
            ...(name !== undefined && { name }),
            ...(scopes !== undefined && { scopes }),
            ...(canWrite !== undefined && { canWrite }),
            ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
          },
        })
        return { id: updated.id, name: updated.name, scopes: updated.scopes, canWrite: updated.canWrite, expiresAt: updated.expiresAt }
      })

      .patch('/api/envman/tokens/:id/toggle', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const existing = await prisma.apiToken.findUnique({ where: { id: params.id } })
        if (!existing || existing.userId !== caller.userId) { set.status = 404; return { error: 'Not found' } }
        const updated = await prisma.apiToken.update({
          where: { id: params.id },
          data: { isDisabled: !existing.isDisabled },
        })
        return { id: updated.id, isDisabled: updated.isDisabled }
      })

      .delete('/api/envman/tokens/:id', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const existing = await prisma.apiToken.findUnique({ where: { id: params.id } })
        if (!existing || existing.userId !== caller.userId) { set.status = 404; return { error: 'Not found' } }
        await prisma.apiToken.delete({ where: { id: params.id } })
        return { ok: true }
      })

      // ─── Projects ─────────────────────────────────────────
      .get('/api/envman/projects', async ({ request, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const isSuperAdmin = caller.role === 'SUPER_ADMIN'
        const include = {
          members: { include: { user: { select: { id: true, name: true, email: true } } } },
          environments: { select: { name: true }, orderBy: { name: 'asc' as const } },
          _count: { select: { environments: true } },
        }
        const projects = isSuperAdmin
          ? await prisma.project.findMany({ include, orderBy: { createdAt: 'desc' } })
          : await prisma.project.findMany({ where: { members: { some: { userId: caller.userId } } }, include, orderBy: { createdAt: 'desc' } })
        return { projects: projects.map(p => ({ ...p, myRole: isSuperAdmin ? 'OWNER' : p.members.find(m => m.userId === caller.userId)?.role ?? 'VIEWER' })) }
      })

      .post('/api/envman/projects', async ({ request, set }) => {
        const auth = await requireAuth(request)
        if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
        const body = await request.json().catch(() => null)
        if (!body?.slug || !body?.name) { set.status = 400; return { error: 'slug and name required' } }
        const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        const existing = await prisma.project.findUnique({ where: { slug } })
        if (existing) { set.status = 409; return { error: 'Slug already taken' } }
        const project = await prisma.project.create({
          data: { slug, name: body.name, description: body.description ?? null, members: { create: { userId: auth.userId, role: 'OWNER' } } },
        })
        return { project }
      })

      .get('/api/envman/projects/:slug', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug }, include: { members: { include: { user: { select: { id: true, name: true, email: true } } } }, environments: { include: { _count: { select: { vars: true } } } } } })
        if (!project) { set.status = 404; return { error: 'Not found' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access) { set.status = 403; return { error: 'No access' } }
        return { project: { ...project, myRole: access } }
      })

      .patch('/api/envman/projects/:slug', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(auth.userId, auth.role, params.slug)
        if (!access || access === 'VIEWER' || access === 'EDITOR') { set.status = 403; return { error: 'Owner required' } }
        const body = await request.json().catch(() => null)
        const project = await prisma.project.update({ where: { slug: params.slug }, data: { name: body?.name, description: body?.description } })
        return { project }
      })

      .delete('/api/envman/projects/:slug', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(auth.userId, auth.role, params.slug)
        if (!access || access !== 'OWNER') { set.status = 403; return { error: 'Owner required' } }
        await prisma.project.delete({ where: { slug: params.slug } })
        return { ok: true }
      })

      // ─── Project Members ──────────────────────────────────
      .post('/api/envman/projects/:slug/members', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(auth.userId, auth.role, params.slug)
        if (!access || access === 'VIEWER' || access === 'EDITOR') { set.status = 403; return { error: 'Owner required' } }
        const body = await request.json().catch(() => null)
        if ((!body?.email && !body?.userId) || !body?.role) { set.status = 400; return { error: 'userId (or email) and role required' } }
        if (!['OWNER', 'EDITOR', 'VIEWER'].includes(body.role)) { set.status = 400; return { error: 'Invalid role' } }
        const user = body.userId
          ? await prisma.user.findUnique({ where: { id: body.userId } })
          : await prisma.user.findUnique({ where: { email: body.email } })
        if (!user) { set.status = 404; return { error: 'User not found' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        const member = await prisma.projectMember.upsert({ where: { userId_projectId: { userId: user.id, projectId: project.id } }, update: { role: body.role }, create: { userId: user.id, projectId: project.id, role: body.role } })
        return { member }
      })

      .patch('/api/envman/projects/:slug/members/:userId', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(auth.userId, auth.role, params.slug)
        if (!access || access !== 'OWNER') { set.status = 403; return { error: 'Owner required' } }
        const body = await request.json().catch(() => null)
        if (!body?.role || !['OWNER', 'EDITOR', 'VIEWER'].includes(body.role)) { set.status = 400; return { error: 'Invalid role' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        // Protect last owner — cannot demote if this is the only OWNER
        if (body.role !== 'OWNER') {
          const ownerCount = await prisma.projectMember.count({ where: { projectId: project.id, role: 'OWNER' } })
          const targetMember = await prisma.projectMember.findUnique({ where: { userId_projectId: { userId: params.userId, projectId: project.id } } })
          if (ownerCount === 1 && targetMember?.role === 'OWNER') {
            set.status = 400; return { error: 'Tidak bisa menurunkan owner terakhir. Angkat owner lain terlebih dahulu.' }
          }
        }
        const member = await prisma.projectMember.update({ where: { userId_projectId: { userId: params.userId, projectId: project.id } }, data: { role: body.role } })
        return { member }
      })

      .delete('/api/envman/projects/:slug/members/:userId', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(auth.userId, auth.role, params.slug)
        if (!access || access !== 'OWNER') { set.status = 403; return { error: 'Owner required' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        // Protect last owner
        const targetMember = await prisma.projectMember.findUnique({ where: { userId_projectId: { userId: params.userId, projectId: project.id } } })
        if (targetMember?.role === 'OWNER') {
          const ownerCount = await prisma.projectMember.count({ where: { projectId: project.id, role: 'OWNER' } })
          if (ownerCount === 1) { set.status = 400; return { error: 'Tidak bisa menghapus owner terakhir.' } }
        }
        await prisma.projectMember.delete({ where: { userId_projectId: { userId: params.userId, projectId: project.id } } })
        return { ok: true }
      })

      // ─── Environments ─────────────────────────────────────
      .post('/api/envman/projects/:slug/environments', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(auth.userId, auth.role, params.slug)
        if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
        const body = await request.json().catch(() => null)
        if (!body?.name) { set.status = 400; return { error: 'name required' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        const envName = body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        const environment = await prisma.environment.create({ data: { name: envName, projectId: project.id } })
        return { environment }
      })

      .delete('/api/envman/projects/:slug/environments/:envName', async ({ request, params, set }) => {
        const auth = await requireAuth(request)
        if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(auth.userId, auth.role, params.slug)
        if (!access || access !== 'OWNER') { set.status = 403; return { error: 'Owner required' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        await prisma.environment.delete({ where: { projectId_name: { projectId: project.id, name: params.envName } } })
        return { ok: true }
      })

      // ─── Env Vars ─────────────────────────────────────────
      .get('/api/envman/projects/:slug/environments/:envName/vars', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access) { set.status = 403; return { error: 'No access' } }
        if (caller.scopes.length > 0 && !tokenScopeAllows(caller.scopes, params.slug, params.envName)) { set.status = 403; return { error: 'Token tidak memiliki akses ke project/env ini' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        const environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } }, include: { vars: { orderBy: { key: 'asc' } } } })
        if (!environment) { set.status = 404; return { error: 'Environment not found' } }
        const canReadSecrets = access === 'OWNER' || access === 'EDITOR'
        const vars = environment.vars.map(v => ({
          id: v.id, key: v.key, isSecret: v.isSecret, isDisabled: v.isDisabled, updatedAt: v.updatedAt,
          value: v.isSecret
            ? (canReadSecrets ? decryptSecret(v.value) : '***')
            : v.value,
        }))
        return { vars }
      })

      .get('/api/envman/projects/:slug/environments/:envName/vars/export', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access) { set.status = 403; return { error: 'No access' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        if (caller.scopes.length > 0 && !tokenScopeAllows(caller.scopes, params.slug, params.envName)) { set.status = 403; return { error: 'Token tidak memiliki akses ke project/env ini' } }
        const environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } }, include: { vars: { orderBy: { key: 'asc' } } } })
        if (!environment) { set.status = 404; return { error: 'Environment not found' } }
        const vars = Object.fromEntries(
          environment.vars.filter(v => !v.isDisabled).map(v => [v.key, v.isSecret ? decryptSecret(v.value) : v.value])
        )
        return { vars }
      })

      .put('/api/envman/projects/:slug/environments/:envName/vars', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
        if (!caller.canWrite) { set.status = 403; return { error: 'Token is read-only' } }
        const body = await request.json().catch(() => null)
        if (!body?.vars || typeof body.vars !== 'object') { set.status = 400; return { error: 'vars object required' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        if (caller.scopes.length > 0 && !tokenScopeAllows(caller.scopes, params.slug, params.envName)) { set.status = 403; return { error: 'Token tidak memiliki akses ke project/env ini' } }
        let environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } } })
        if (!environment) { environment = await prisma.environment.create({ data: { name: params.envName, projectId: project.id } }) }
        const secretKeys: string[] = body.secrets ?? []
        await Promise.all(
          Object.entries(body.vars as Record<string, string>).map(([key, value]) => {
            const secret = secretKeys.includes(key)
            const stored = secret ? encryptSecret(value) : value
            return prisma.envVar.upsert({
              where: { environmentId_key: { environmentId: environment!.id, key } },
              update: { value: stored, isSecret: secret },
              create: { key, value: stored, isSecret: secret, environmentId: environment!.id },
            })
          })
        )
        return { ok: true, count: Object.keys(body.vars).length }
      })

      .post('/api/envman/projects/:slug/environments/:envName/vars', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
        if (!caller.canWrite) { set.status = 403; return { error: 'Token is read-only' } }
        const body = await request.json().catch(() => null)
        if (!body?.key || body.value === undefined) { set.status = 400; return { error: 'key and value required' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        let environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } } })
        if (!environment) { environment = await prisma.environment.create({ data: { name: params.envName, projectId: project.id } }) }
        const envVar = await prisma.envVar.upsert({
          where: { environmentId_key: { environmentId: environment.id, key: body.key } },
          update: { value: body.isSecret ? encryptSecret(body.value) : body.value, isSecret: body.isSecret ?? false },
          create: { key: body.key, value: body.isSecret ? encryptSecret(body.value) : body.value, isSecret: body.isSecret ?? false, environmentId: environment.id },
        })
        return { envVar: { id: envVar.id, key: envVar.key, isSecret: envVar.isSecret } }
      })

      .delete('/api/envman/projects/:slug/environments/:envName/vars/:key', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
        if (!caller.canWrite) { set.status = 403; return { error: 'Token is read-only' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        const environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } } })
        if (!environment) { set.status = 404; return { error: 'Environment not found' } }
        await prisma.envVar.delete({ where: { environmentId_key: { environmentId: environment.id, key: params.key } } }).catch(() => {})
        return { ok: true }
      })

      .patch('/api/envman/projects/:slug/environments/:envName/vars/:key/toggle', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
        if (!caller.canWrite) { set.status = 403; return { error: 'Token is read-only' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        const environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } } })
        if (!environment) { set.status = 404; return { error: 'Environment not found' } }
        const existing = await prisma.envVar.findUnique({ where: { environmentId_key: { environmentId: environment.id, key: params.key } } })
        if (!existing) { set.status = 404; return { error: 'Var not found' } }
        const updated = await prisma.envVar.update({
          where: { environmentId_key: { environmentId: environment.id, key: params.key } },
          data: { isDisabled: !existing.isDisabled },
        })
        return { key: updated.key, isDisabled: updated.isDisabled }
      })

      .get('/api/envman/projects/:slug/diff/:env1/:env2', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access) { set.status = 403; return { error: 'No access' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        const [e1, e2] = await Promise.all([
          prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.env1 } }, include: { vars: true } }),
          prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.env2 } }, include: { vars: true } }),
        ])
        if (!e1) { set.status = 404; return { error: `Environment '${params.env1}' not found` } }
        if (!e2) { set.status = 404; return { error: `Environment '${params.env2}' not found` } }
        const map1 = Object.fromEntries(e1.vars.map(v => [v.key, v]))
        const map2 = Object.fromEntries(e2.vars.map(v => [v.key, v]))
        const allKeys = new Set([...Object.keys(map1), ...Object.keys(map2)])
        const diff = [...allKeys].sort().map(key => {
          if (!map1[key]) return { key, status: 'added' }
          if (!map2[key]) return { key, status: 'removed' }
          if (map1[key].value !== map2[key].value) return { key, status: 'changed' }
          return { key, status: 'same' }
        })
        return { env1: params.env1, env2: params.env2, diff }
      })

      // ─── Portainer Connections (global) ──────────────────
      .get('/api/envman/portainer/connections', async ({ request, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const connections = await prisma.portainerConnection.findMany({
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, portainerUrl: true, createdById: true, createdAt: true, _count: { select: { configs: true } } },
        })
        return { connections }
      })

      .post('/api/envman/portainer/connections', async ({ request, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const body = await request.json().catch(() => null)
        if (!body?.name || !body?.portainerUrl || !body?.apiToken) { set.status = 400; return { error: 'name, portainerUrl, apiToken required' } }
        const conn = await prisma.portainerConnection.create({
          data: { name: body.name, portainerUrl: body.portainerUrl, apiToken: body.apiToken, createdById: caller.userId },
        })
        return { connection: { id: conn.id, name: conn.name, portainerUrl: conn.portainerUrl } }
      })

      .patch('/api/envman/portainer/connections/:id', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
        if (!conn) { set.status = 404; return { error: 'Not found' } }
        if (conn.createdById !== caller.userId && caller.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Forbidden' } }
        const body = await request.json().catch(() => null)
        const updated = await prisma.portainerConnection.update({
          where: { id: params.id },
          data: {
            name: body?.name ?? conn.name,
            portainerUrl: body?.portainerUrl ?? conn.portainerUrl,
            ...(body?.apiToken ? { apiToken: body.apiToken } : {}),
          },
        })
        return { connection: { id: updated.id, name: updated.name, portainerUrl: updated.portainerUrl } }
      })

      .delete('/api/envman/portainer/connections/:id', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
        if (!conn) { set.status = 404; return { error: 'Not found' } }
        if (conn.createdById !== caller.userId && caller.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Forbidden' } }
        await prisma.portainerConnection.delete({ where: { id: params.id } })
        return { ok: true }
      })

      // Probe stacks via connection ID (or legacy URL+token)
      .post('/api/envman/portainer/connections/:id/probe', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
        if (!conn) { set.status = 404; return { error: 'Connection not found' } }
        const url = conn.portainerUrl.replace(/\/$/, '')
        try {
          const res = await fetch(`${url}/api/stacks`, { headers: { 'X-API-Key': conn.apiToken } })
          if (!res.ok) { set.status = 400; return { error: `Portainer returned ${res.status}: ${await res.text()}` } }
          const stacks = await res.json() as any[]
          return { stacks: stacks.map(s => ({ id: s.Id, name: s.Name, endpointId: s.EndpointId })) }
        } catch (e) {
          set.status = 400
          return { error: `Cannot reach Portainer: ${e instanceof Error ? e.message : String(e)}` }
        }
      })

      // ─── Portainer Integration ────────────────────────────
      .get('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access) { set.status = 403; return { error: 'No access' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        const cfg = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } })
        if (!cfg) return { config: null }
        // Resolve connection details for response
        const conn = cfg.connectionId ? await prisma.portainerConnection.findUnique({ where: { id: cfg.connectionId }, select: { id: true, name: true, portainerUrl: true } }) : null
        return {
          config: {
            id: cfg.id, stackId: cfg.stackId, stackName: cfg.stackName, endpointId: cfg.endpointId,
            lastSyncAt: cfg.lastSyncAt, lastSyncOk: cfg.lastSyncOk,
            // New: connection ref
            connectionId: cfg.connectionId, connectionName: conn?.name, portainerUrl: conn?.portainerUrl ?? cfg.portainerUrl,
            // Legacy fallback
            apiToken: '***',
          }
        }
      })

      .put('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
        const body = await request.json().catch(() => null)
        if (!body?.stackId || !body?.stackName) { set.status = 400; return { error: 'stackId and stackName required' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        const existing = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } })

        if (body.connectionId) {
          // New flow: use global connection
          const conn = await prisma.portainerConnection.findUnique({ where: { id: body.connectionId } })
          if (!conn) { set.status = 404; return { error: 'Connection not found' } }
          const cfg = await prisma.portainerConfig.upsert({
            where: { projectId_envName: { projectId: project.id, envName: params.envName } },
            update: { connectionId: body.connectionId, stackId: body.stackId, stackName: body.stackName, endpointId: body.endpointId ?? 1, portainerUrl: null, apiToken: null },
            create: { projectId: project.id, envName: params.envName, connectionId: body.connectionId, stackId: body.stackId, stackName: body.stackName, endpointId: body.endpointId ?? 1 },
          })
          return { config: { id: cfg.id, connectionId: conn.id, connectionName: conn.name, portainerUrl: conn.portainerUrl, stackId: cfg.stackId, stackName: cfg.stackName, endpointId: cfg.endpointId } }
        }

        // Legacy flow: direct URL + token
        if (!body.portainerUrl) { set.status = 400; return { error: 'connectionId or portainerUrl required' } }
        const apiToken = body.apiToken || existing?.apiToken
        if (!apiToken) { set.status = 400; return { error: 'apiToken required for new configuration' } }
        const cfg = await prisma.portainerConfig.upsert({
          where: { projectId_envName: { projectId: project.id, envName: params.envName } },
          update: { portainerUrl: body.portainerUrl, apiToken, stackId: body.stackId, stackName: body.stackName, endpointId: body.endpointId ?? 1, connectionId: null },
          create: { projectId: project.id, envName: params.envName, portainerUrl: body.portainerUrl, apiToken, stackId: body.stackId, stackName: body.stackName, endpointId: body.endpointId ?? 1 },
        })
        return { config: { id: cfg.id, portainerUrl: cfg.portainerUrl, stackId: cfg.stackId, stackName: cfg.stackName, endpointId: cfg.endpointId } }
      })

      .delete('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access || access !== 'OWNER') { set.status = 403; return { error: 'Owner required' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        await prisma.portainerConfig.delete({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } }).catch(() => {})
        return { ok: true }
      })

      // Probe Portainer — list stacks (for setup wizard)
      .post('/api/envman/portainer/probe', async ({ request, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const body = await request.json().catch(() => null)
        if (!body?.portainerUrl) { set.status = 400; return { error: 'portainerUrl required' } }
        // Allow probing with existing stored token (pass slug+envName to look it up)
        let apiToken = body.apiToken
        if (!apiToken && body.slug && body.envName) {
          const proj = await prisma.project.findUnique({ where: { slug: body.slug } })
          if (proj) {
            const stored = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: proj.id, envName: body.envName } } })
            apiToken = stored?.apiToken
          }
        }
        if (!apiToken) { set.status = 400; return { error: 'apiToken required' } }
        const url = body.portainerUrl.replace(/\/$/, '')
        try {
          const res = await fetch(`${url}/api/stacks`, { headers: { 'X-API-Key': apiToken } })
          if (!res.ok) { set.status = 400; return { error: `Portainer returned ${res.status}: ${await res.text()}` } }
          const stacks = await res.json() as any[]
          return { stacks: stacks.map(s => ({ id: s.Id, name: s.Name, endpointId: s.EndpointId })) }
        } catch (e) {
          set.status = 400
          return { error: `Cannot reach Portainer: ${e instanceof Error ? e.message : String(e)}` }
        }
      })

      // Sync env vars to Portainer stack
      .post('/api/envman/projects/:slug/environments/:envName/portainer/sync', async ({ request, params, set }) => {
        const caller = await requireEnvAuth(request)
        if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
        const access = await getProjectAccess(caller.userId, caller.role, params.slug)
        if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
        const project = await prisma.project.findUnique({ where: { slug: params.slug } })
        if (!project) { set.status = 404; return { error: 'Project not found' } }
        const cfg = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } })
        if (!cfg) { set.status = 404; return { error: 'Portainer not configured for this environment' } }
        const environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } }, include: { vars: true } })
        if (!environment) { set.status = 404; return { error: 'Environment not found' } }
        // Resolve URL + token: prefer global connection, fall back to legacy direct fields
        let portainerUrl: string, portainerToken: string
        if (cfg.connectionId) {
          const conn = await prisma.portainerConnection.findUnique({ where: { id: cfg.connectionId } })
          if (!conn) { set.status = 400; return { error: 'Portainer connection not found — reconfigure' } }
          portainerUrl = conn.portainerUrl
          portainerToken = conn.apiToken
        } else {
          if (!cfg.portainerUrl || !cfg.apiToken) { set.status = 400; return { error: 'Portainer not configured' } }
          portainerUrl = cfg.portainerUrl
          portainerToken = cfg.apiToken
        }
        const url = portainerUrl.replace(/\/$/, '')
        try {
          // Get current stack file from Portainer
          const fileRes = await fetch(`${url}/api/stacks/${cfg.stackId}/file`, { headers: { 'X-API-Key': portainerToken } })
          if (!fileRes.ok) { set.status = 400; return { error: `Portainer stack file error: ${fileRes.status}` } }
          const { StackFileContent: rawStackFile } = await fileRes.json() as { StackFileContent: string }
          // Inject env_file: stack.env into each service that doesn't have it,
          // so vars appear in container environment (not just compose substitution)
          const stackFileContent = injectEnvFileIntoCompose(rawStackFile)
          // Escape values for Docker Compose stack.env file format
          const escapeEnvValue = (val: string) => val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
          const portainerEnv = environment.vars.filter(v => !v.isDisabled).map(v => ({
            name: v.key,
            value: escapeEnvValue(v.isSecret ? decryptSecret(v.value) : v.value),
          }))
          const syncRes = await fetch(`${url}/api/stacks/${cfg.stackId}?endpointId=${cfg.endpointId}`, {
            method: 'PUT',
            headers: { 'X-API-Key': portainerToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ StackFileContent: stackFileContent, Env: portainerEnv, Prune: false }),
          })
          if (!syncRes.ok) {
            const errText = await syncRes.text()
            await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: false } })
            set.status = 400
            return { error: `Portainer sync error ${syncRes.status}: ${errText}` }
          }
          await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: true } })
          appLog('info', `Portainer sync: ${params.slug}:${params.envName} → stack ${cfg.stackName} (${environment.vars.length} vars)`)
          return { ok: true, varsCount: environment.vars.length, stackName: cfg.stackName }
        } catch (e) {
          await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: false } }).catch(() => {})
          set.status = 500
          return { error: `Sync failed: ${e instanceof Error ? e.message : String(e)}` }
        }
      })

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
