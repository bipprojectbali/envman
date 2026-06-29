import { Elysia } from 'elysia'
import type { ProjectRole } from '../../lib/access'
import { requireSuperAdmin } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'

type EnvRoleInput = 'inherit' | 'denied' | ProjectRole

export const adminUsersQueryRouter = new Elysia()

  // ─── List all users with access summary ──────────────────────────────────────
  .get('/api/envman/admin/users', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) {
      set.status = 403
      return { error: 'SUPER_ADMIN required' }
    }
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        blocked: true,
        permissions: true,
        createdAt: true,
        image: true,
        _count: { select: { projectMembers: true, envMemberships: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        blocked: u.blocked,
        permissions: u.permissions,
        createdAt: u.createdAt,
        image: u.image,
        projectCount: u._count.projectMembers,
        envOverrideCount: u._count.envMemberships,
      })),
    }
  })

  // ─── User access detail: full project × env matrix ───────────────────────────
  .get('/api/envman/admin/users/:userId/access', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) {
      set.status = 403
      return { error: 'SUPER_ADMIN required' }
    }
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, name: true, email: true, role: true, blocked: true, permissions: true, image: true },
    })
    if (!user) {
      set.status = 404
      return { error: 'User not found' }
    }

    const projects = await prisma.project.findMany({
      where: { deletedAt: null },
      select: {
        slug: true,
        name: true,
        members: { where: { userId: params.userId }, select: { role: true } },
        environments: {
          select: {
            name: true,
            members: { where: { userId: params.userId }, select: { role: true } },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    const matrix = projects.map((p) => {
      const projectRole = (p.members[0]?.role ?? null) as ProjectRole | null
      return {
        slug: p.slug,
        name: p.name,
        projectRole,
        environments: p.environments.map((e) => {
          const envMember = e.members[0]
          let envRole: EnvRoleInput = 'inherit'
          let effectiveRole: ProjectRole | null = projectRole
          if (envMember) {
            if (envMember.role === null) {
              envRole = 'denied'
              effectiveRole = null
            } else {
              envRole = envMember.role as ProjectRole
              effectiveRole = envMember.role as ProjectRole
            }
          }
          return { name: e.name, envRole, effectiveRole }
        }),
      }
    })

    return { user, projects: matrix }
  })
