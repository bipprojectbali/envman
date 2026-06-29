import { Elysia } from 'elysia'
import { forbidden, requireAuth, requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'

// /api/v1/ — versioned API gateway
// Saat ini identik dengan /api/envman/ dan /api/tickets/
// Gunakan versi ini untuk integrasi baru. /api/envman/ tetap berjalan (legacy).
// Breaking changes HANYA masuk di /api/v2/, tidak di /api/envman/ atau /api/v1/.

export const v1Router = new Elysia({ prefix: '/api/v1' })

  // Health check versioned
  .get('/health', () => ({ ok: true, version: 'v1' }))

  // Proxy ke envman routes — re-export metadata only (actual logic di envman router)
  // Client bisa pakai /api/v1/envman/projects atau /api/envman/projects, keduanya identik
  // Untuk membuat v2 yang breaking, copy handler di sini dan ubah response format

  // Example: versioned project list dengan pagination metadata eksplisit
  .get('/envman/projects', async ({ request, set, query }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const isSuperAdmin = caller.role === 'SUPER_ADMIN'
    const limit = Math.min(Number(query.limit) || 50, 200)
    const offset = Number(query.offset) || 0
    const where = isSuperAdmin ? { deletedAt: null } : { deletedAt: null, members: { some: { userId: caller.userId } } }
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
          environments: { select: { name: true }, orderBy: { name: 'asc' as const } },
          _count: { select: { environments: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.project.count({ where }),
    ])
    return {
      projects: projects.map((p: any) => ({
        ...p,
        myRole: isSuperAdmin ? 'OWNER' : (p.members.find((m: any) => m.userId === caller.userId)?.role ?? 'VIEWER'),
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    }
  })

  // Versioned ticket list dengan pagination
  .get('/tickets', async ({ request, set, query }) => {
    const caller = await requireAuth(request)
    if (!caller) return unauthorized(set)
    if (caller.role === 'USER') return forbidden(set)
    const limit = Math.min(Number(query.limit) || 50, 500)
    const offset = Number(query.offset) || 0
    const where: Record<string, unknown> = {}
    if (query.status) where.status = String(query.status)
    if (query.priority) where.priority = String(query.priority)
    if (query.mine === '1') where.assigneeId = caller.userId
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true, email: true, role: true } },
          assignee: { select: { id: true, name: true, email: true, role: true } },
          _count: { select: { comments: true, evidence: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.ticket.count({ where }),
    ])
    return { tickets, total, limit, offset, hasMore: offset + limit < total }
  })
