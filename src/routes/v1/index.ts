import { Elysia } from 'elysia'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'

// /api/v1/ — versioned API gateway
// Saat ini identik dengan /api/envman/.
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
