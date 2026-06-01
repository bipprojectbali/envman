import { Elysia } from 'elysia'
import { appLog, clearAppLogs, getAppLogs } from '../../lib/applog'
import { forbidden, requireSuperAdmin } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'

export const adminLogsRouter = new Elysia()

  .get('/api/admin/logs/app', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)
    const url = new URL(request.url)
    const level = url.searchParams.get('level') as any
    const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
    const afterId = parseInt(url.searchParams.get('afterId') ?? '0', 10)
    return { logs: await getAppLogs({ level: level || undefined, limit, afterId: afterId || undefined }) }
  })

  .get('/api/admin/logs/audit', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    const action = url.searchParams.get('action')
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 1000)

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
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)
    await clearAppLogs()
    appLog('info', 'App logs cleared manually')
    return { ok: true }
  })

  .delete('/api/admin/logs/audit', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)
    const { count } = await prisma.auditLog.deleteMany()
    appLog('info', `Audit logs cleared manually (${count} entries)`)
    return { ok: true, deleted: count }
  })
