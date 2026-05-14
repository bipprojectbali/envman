import { auth } from './auth'
import { prisma } from './db'

export type AuthCaller = { userId: string; role: string; email: string; permissions: string[] }
export type EnvAuthCaller = { userId: string; role: string; tokenName?: string; canWrite: boolean; scopes: string[]; permissions: string[] }

export async function requireAuth(request: Request): Promise<AuthCaller | null> {
  try {
    const sessionData = await auth.api.getSession({ headers: request.headers })
    if (sessionData?.user) {
      const user = sessionData.user as { id: string; role: string; email: string; blocked?: boolean }
      if (user.blocked) return null
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, blocked: true, email: true, permissions: true },
      })
      if (!dbUser || dbUser.blocked) return null
      return { userId: user.id, role: dbUser.role, email: dbUser.email, permissions: dbUser.permissions }
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
    include: { user: { select: { id: true, role: true, email: true, blocked: true, permissions: true } } },
  })
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  if (session.user.blocked) return null
  return { userId: session.user.id, role: session.user.role, email: session.user.email, permissions: session.user.permissions }
}

export async function requireSuperAdmin(request: Request): Promise<AuthCaller | null> {
  const caller = await requireAuth(request)
  if (!caller || caller.role !== 'SUPER_ADMIN') return null
  return caller
}

export async function requireEnvAuth(request: Request): Promise<EnvAuthCaller | null> {
  const authHeader = request.headers.get('authorization') ?? ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (bearerToken) {
    const apiToken = await prisma.apiToken.findUnique({
      where: { token: bearerToken },
      include: { user: { select: { id: true, role: true, blocked: true, permissions: true } } },
    })
    if (!apiToken || apiToken.user.blocked) return null
    if (apiToken.isDisabled) return null
    if (apiToken.expiresAt && apiToken.expiresAt < new Date()) return null
    prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
    return {
      userId: apiToken.userId,
      role: apiToken.user.role,
      tokenName: apiToken.name,
      canWrite: apiToken.canWrite,
      scopes: apiToken.scopes,
      permissions: apiToken.user.permissions,
    }
  }
  const session = await requireAuth(request)
  if (!session) return null
  return {
    userId: session.userId,
    role: session.role,
    canWrite: true,
    scopes: [],
    permissions: session.permissions,
  }
}

// Consistent HTTP response helpers
export function unauthorized(set: { status?: number | string }) {
  set.status = 401
  return { error: 'Unauthorized' }
}

export function forbidden(set: { status?: number | string }) {
  set.status = 403
  return { error: 'Forbidden' }
}
