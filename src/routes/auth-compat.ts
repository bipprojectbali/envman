import { Elysia } from 'elysia'
import { audit } from '../lib/audit'
import { auth } from '../lib/auth'
import { requireAuth } from '../lib/auth-middleware'
import { prisma } from '../lib/db'
import { env } from '../lib/env'
import { appLog } from '../lib/applog'
import { redis } from '../lib/redis'
import { getIp, getPublicOrigin } from '../lib/request'

const devCookieOpts = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=86400'
const prodCookieOpts = 'Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400'
const cookieOpts = env.NODE_ENV === 'production' ? prodCookieOpts : devCookieOpts

// Backward-compat auth routes: bridge between frontend expectations and better-auth internals.
// Frontend uses /api/auth/login, /api/auth/session, /api/auth/logout, /api/auth/google.
// Better-auth uses /api/auth/sign-in/email, /api/auth/sign-out, etc.
export const authCompatRouter = new Elysia()

  // POST /api/auth/login — frontend wrapper around better-auth signInEmail
  .post('/api/auth/login', async ({ request, set }) => {
    const ip = getIp(request)
    const { email, password } = (await request.json()) as { email: string; password: string }

    const dbUser = await prisma.user.findUnique({ where: { email }, select: { id: true, blocked: true } })
    if (dbUser?.blocked) {
      audit(dbUser.id, 'LOGIN_BLOCKED', null, ip)
      appLog('warn', `Login blocked: ${email}`, ip)
      set.status = 403
      return { error: 'Akun Anda telah diblokir. Hubungi administrator.' }
    }

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

  // GET /api/auth/session — return {user} format frontend expects
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

  // GET /api/user/avatar/:userId — proxy Google avatar to avoid CORS + cache in Redis
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
      redis.set(cacheKey, `${ct}|${b64}`, 'EX', 3600).catch(() => {})
      return new Response(bytes, {
        headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' },
      })
    } catch {
      set.status = 404
      return null
    }
  })

  // POST /api/auth/logout — also cleans up UUID sessions (dev-auth / test sessions)
  .post('/api/auth/logout', async ({ request, set }) => {
    const ip = getIp(request)
    const baRes = await auth.api.signOut({ headers: request.headers, asResponse: true })
    const setCookie = baRes?.headers.get('set-cookie')
    if (setCookie) set.headers['set-cookie'] = setCookie

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

  // GET /api/auth/google — initiate Google OAuth, forward all set-cookie headers (state cookie needed for callback)
  .get('/api/auth/google', async ({ request }) => {
    const baRes = await auth.api.signInSocial({
      body: { provider: 'google', callbackURL: `${getPublicOrigin(request)}/api/auth/google-callback` },
      headers: request.headers,
      asResponse: true,
    })
    const location = baRes.headers.get('location')
    if (!location) return new Response(JSON.stringify({ error: 'OAuth redirect failed' }), { status: 500 })

    const headers = new Headers({ location })
    for (const [key, val] of baRes.headers.entries()) {
      if (key.toLowerCase() === 'set-cookie') headers.append('set-cookie', val)
    }
    return new Response(null, { status: 302, headers })
  })

  // GET /api/auth/google-callback — post-OAuth redirect to role-based page
  .get('/api/auth/google-callback', async ({ request, set }) => {
    const sessionData = await auth.api.getSession({ headers: request.headers })
    if (!sessionData?.user) {
      set.status = 302
      set.headers.location = '/login?error=google_failed'
      return
    }
    const userId = (sessionData.user as { id: string }).id
    const googleImage = (sessionData.user as { image?: string | null }).image
    const dbUser = await prisma.user.update({
      where: { id: userId },
      data: { ...(googleImage ? { image: googleImage } : {}) },
      select: { role: true, email: true },
    })
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

  // GET /api/dev-auth/login-as/:email — dev-only shortcut for session impersonation
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
