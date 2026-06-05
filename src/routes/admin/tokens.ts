import { Elysia } from 'elysia'
import { audit } from '../../lib/audit'
import { forbidden, requireSuperAdmin } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'

function getIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
}

export const adminTokensRouter = new Elysia()

  // ─── List semua token lintas user ────────────────────────
  .get('/api/admin/tokens', async ({ request, set, query }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const q = query as Record<string, string | undefined>
    const userId = q.userId
    const status = q.status ?? 'all'
    const canWriteFilter = q.canWrite
    const limit = Math.min(Number(q.limit ?? '100'), 500)

    const now = new Date()

    const where: Record<string, unknown> = {}
    if (userId) where.userId = userId
    if (canWriteFilter === 'true') where.canWrite = true
    if (canWriteFilter === 'false') where.canWrite = false
    if (status === 'disabled') where.isDisabled = true
    if (status === 'active') {
      where.isDisabled = false
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }]
    }
    if (status === 'expired') {
      where.expiresAt = { lte: now }
      where.isDisabled = false
    }

    const tokens = await prisma.apiToken.findMany({
      where,
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        scopes: true,
        tags: true,
        canWrite: true,
        isDisabled: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        useCount: true,
        lastIp: true,
        disabledBy: true,
        disabledAt: true,
        disabledReason: true,
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    })

    const all = await prisma.apiToken.count({ where: userId ? { userId } : {} })
    const active = await prisma.apiToken.count({
      where: {
        ...(userId ? { userId } : {}),
        isDisabled: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    })
    const disabled = await prisma.apiToken.count({ where: { ...(userId ? { userId } : {}), isDisabled: true } })
    const expired = await prisma.apiToken.count({
      where: { ...(userId ? { userId } : {}), isDisabled: false, expiresAt: { lte: now } },
    })

    return { tokens, summary: { total: all, active, disabled, expired } }
  })

  // ─── Admin action: disable / enable / set-expiry ─────────
  .patch('/api/admin/tokens/:id', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const token = await prisma.apiToken.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, userId: true, isDisabled: true },
    })
    if (!token) {
      set.status = 404
      return { error: 'Token tidak ditemukan' }
    }

    const body = (await request.json().catch(() => null)) as {
      action: 'disable' | 'enable' | 'set-expiry'
      reason?: string
      expiresAt?: string | null
    } | null
    if (!body?.action) {
      set.status = 400
      return { error: 'action required' }
    }

    const ip = getIp(request)

    if (body.action === 'disable') {
      await prisma.apiToken.update({
        where: { id: params.id },
        data: {
          isDisabled: true,
          disabledBy: caller.userId,
          disabledAt: new Date(),
          disabledReason: body.reason ?? null,
        },
      })
      audit(
        token.userId,
        'TOKEN_DISABLED_BY_ADMIN',
        `token=${token.name} by=${caller.userId} reason=${body.reason ?? '-'}`,
        ip,
      )
      return { ok: true }
    }

    if (body.action === 'enable') {
      await prisma.apiToken.update({
        where: { id: params.id },
        data: { isDisabled: false, disabledBy: null, disabledAt: null, disabledReason: null },
      })
      audit(token.userId, 'TOKEN_ENABLED_BY_ADMIN', `token=${token.name} by=${caller.userId}`, ip)
      return { ok: true }
    }

    if (body.action === 'set-expiry') {
      await prisma.apiToken.update({
        where: { id: params.id },
        data: { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null },
      })
      audit(
        token.userId,
        'TOKEN_EXPIRY_SET_BY_ADMIN',
        `token=${token.name} by=${caller.userId} expiresAt=${body.expiresAt ?? 'null'}`,
        ip,
      )
      return { ok: true }
    }

    set.status = 400
    return { error: `Unknown action: ${body.action}` }
  })

  // ─── Force revoke token ───────────────────────────────────
  .delete('/api/admin/tokens/:id', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const token = await prisma.apiToken.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, userId: true },
    })
    if (!token) {
      set.status = 404
      return { error: 'Token tidak ditemukan' }
    }

    const ip = getIp(request)
    audit(token.userId, 'TOKEN_REVOKED_BY_ADMIN', `token=${token.name} by=${caller.userId}`, ip)
    await prisma.apiToken.delete({ where: { id: params.id } })
    return { ok: true }
  })

  // ─── Activity log per token ───────────────────────────
  .get('/api/admin/tokens/:id/activity', async ({ request, params, set, query }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const q = query as Record<string, string | undefined>
    const limit = Math.min(Number(q.limit ?? '50'), 200)
    const offset = Number(q.offset ?? '0')
    const action = q.action

    const where: Record<string, unknown> = { tokenId: params.id }
    if (action) where.action = action

    const [logs, total] = await Promise.all([
      prisma.tokenActivityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.tokenActivityLog.count({ where }),
    ])

    return { logs, total, limit, offset }
  })
