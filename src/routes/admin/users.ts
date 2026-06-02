import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { audit } from '../../lib/audit'
import { forbidden, requireSuperAdmin, unauthorized } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { getIp } from '../../lib/request'

export const adminUsersRouter = new Elysia()

  .get('/api/admin/users', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return caller === null ? forbidden(set) : unauthorized(set)
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true, image: true },
      orderBy: { createdAt: 'asc' },
    })
    return { users }
  })

  .put('/api/admin/users/:id/role', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)
    if (caller.userId === params.id) {
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
      select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true, image: true },
    })
    audit(params.id, 'ROLE_CHANGED', `${target?.role} → ${role} by ${caller.userId}`, getIp(request))
    appLog('info', `Role changed: ${user.email} ${target?.role} → ${role}`)
    return { user }
  })

  .put('/api/admin/users/:id/block', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)
    if (caller.userId === params.id) {
      set.status = 400
      return { error: 'Tidak bisa memblokir diri sendiri' }
    }

    const { blocked } = (await request.json()) as { blocked: boolean }
    const user = await prisma.user.update({
      where: { id: params.id },
      data: { blocked },
      select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true, image: true },
    })
    // Atomic: block user + hapus semua sessions sekaligus
    if (blocked) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: params.id }, data: { blocked: true } }),
        prisma.session.deleteMany({ where: { userId: params.id } }),
      ])
    }
    const action = blocked ? 'BLOCKED' : 'UNBLOCKED'
    audit(params.id, action, `by ${caller.userId}`, getIp(request))
    appLog('info', `User ${action.toLowerCase()}: ${user.email}`)
    return { user }
  })
