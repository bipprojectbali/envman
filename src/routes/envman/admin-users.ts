import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireSuperAdmin } from '../../lib/auth-middleware'
import { invalidateCache, cacheKeys } from '../../lib/cache'
import type { ProjectRole } from '../../lib/access'
import { isValidCapability } from '../../lib/permissions'

// Project-level role input: 'OWNER' | 'EDITOR' | 'VIEWER' | null (null = remove member)
type ProjectRoleInput = ProjectRole | null

function isValidProjectRole(value: unknown): value is ProjectRoleInput {
  return value === null || value === 'OWNER' || value === 'EDITOR' || value === 'VIEWER'
}

// Env-level role input: 'inherit' | 'denied' | 'OWNER' | 'EDITOR' | 'VIEWER'
//   'inherit' → delete record (use project default)
//   'denied'  → record with role=null (explicit deny)
//   role      → record with that role (override)
type EnvRoleInput = 'inherit' | 'denied' | ProjectRole

function isValidEnvRole(value: unknown): value is EnvRoleInput {
  return value === 'inherit' || value === 'denied' || value === 'OWNER' || value === 'EDITOR' || value === 'VIEWER'
}

export const adminUsersRouter = new Elysia()

  // ─── List all users with access summary ──────────────────────────────────────
  .get('/api/envman/admin/users', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) { set.status = 403; return { error: 'SUPER_ADMIN required' } }
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, email: true, role: true, blocked: true, permissions: true, createdAt: true,
        _count: { select: { projectMembers: true, envMemberships: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return {
      users: users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        blocked: u.blocked,
        permissions: u.permissions,
        createdAt: u.createdAt,
        projectCount: u._count.projectMembers,
        envOverrideCount: u._count.envMemberships,
      })),
    }
  })

  // ─── User access detail: full project × env matrix ───────────────────────────
  .get('/api/envman/admin/users/:userId/access', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) { set.status = 403; return { error: 'SUPER_ADMIN required' } }
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, name: true, email: true, role: true, blocked: true, permissions: true },
    })
    if (!user) { set.status = 404; return { error: 'User not found' } }

    const projects = await prisma.project.findMany({
      where: { deletedAt: null },
      select: {
        slug: true, name: true,
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

    const matrix = projects.map(p => {
      const projectRole = (p.members[0]?.role ?? null) as ProjectRole | null
      return {
        slug: p.slug,
        name: p.name,
        projectRole,
        environments: p.environments.map(e => {
          const envMember = e.members[0]
          // envRole: 'inherit' (no record) | 'denied' (record, role=null) | role string
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

  // ─── Set project-level role (or remove membership) ───────────────────────────
  .put('/api/envman/admin/users/:userId/projects/:slug', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) { set.status = 403; return { error: 'SUPER_ADMIN required' } }
    const body = await request.json().catch(() => null) as { role?: unknown } | null
    if (!body || !isValidProjectRole(body.role)) { set.status = 400; return { error: 'role must be OWNER, EDITOR, VIEWER, or null' } }

    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }

    const targetMember = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: params.userId, projectId: project.id } },
    })

    // Last-owner protection
    if (targetMember?.role === 'OWNER' && body.role !== 'OWNER') {
      const ownerCount = await prisma.projectMember.count({
        where: { projectId: project.id, role: 'OWNER' },
      })
      if (ownerCount === 1) {
        set.status = 400
        return { error: 'Tidak bisa menurunkan/hapus OWNER terakhir. Angkat OWNER lain terlebih dahulu.' }
      }
    }

    if (body.role === null) {
      if (targetMember) {
        await prisma.projectMember.delete({ where: { id: targetMember.id } })
      }
    } else {
      await prisma.projectMember.upsert({
        where: { userId_projectId: { userId: params.userId, projectId: project.id } },
        update: { role: body.role },
        create: { userId: params.userId, projectId: project.id, role: body.role },
      })
    }

    await invalidateCache(
      cacheKeys.projectAccess(params.userId, params.slug),
      cacheKeys.projectDetail(params.slug),
      cacheKeys.projectList(params.userId),
    )
    return { ok: true, role: body.role }
  })

  // ─── Set env-level override (inherit / denied / role) ────────────────────────
  .put('/api/envman/admin/users/:userId/projects/:slug/envs/:envName', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) { set.status = 403; return { error: 'SUPER_ADMIN required' } }
    const body = await request.json().catch(() => null) as { role?: unknown } | null
    if (!body || !isValidEnvRole(body.role)) {
      set.status = 400
      return { error: "role must be 'inherit', 'denied', 'OWNER', 'EDITOR', or 'VIEWER'" }
    }

    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    const env = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!env) { set.status = 404; return { error: 'Environment not found' } }

    const existing = await prisma.environmentMember.findUnique({
      where: { userId_environmentId: { userId: params.userId, environmentId: env.id } },
    })

    if (body.role === 'inherit') {
      // Delete record → effective role mengikuti projectRole
      if (existing) {
        await prisma.environmentMember.delete({ where: { id: existing.id } })
      }
    } else if (body.role === 'denied') {
      // Upsert dengan role=null → explicit deny
      await prisma.environmentMember.upsert({
        where: { userId_environmentId: { userId: params.userId, environmentId: env.id } },
        update: { role: null },
        create: { userId: params.userId, environmentId: env.id, role: null },
      })
    } else {
      // Upsert dengan role spesifik (OWNER/EDITOR/VIEWER)
      await prisma.environmentMember.upsert({
        where: { userId_environmentId: { userId: params.userId, environmentId: env.id } },
        update: { role: body.role },
        create: { userId: params.userId, environmentId: env.id, role: body.role },
      })
    }

    await invalidateCache(
      cacheKeys.projectAccess(params.userId, params.slug),
      cacheKeys.projectDetail(params.slug),
    )
    return { ok: true, role: body.role }
  })

  // ─── Set user capability list (SUPER_ADMIN grants) ───────────────────────────
  .put('/api/envman/admin/users/:userId/permissions', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) { set.status = 403; return { error: 'SUPER_ADMIN required' } }
    const body = await request.json().catch(() => null) as { permissions?: unknown } | null
    if (!body || !Array.isArray(body.permissions)) { set.status = 400; return { error: 'permissions array required' } }
    const invalid = body.permissions.filter(p => !isValidCapability(p))
    if (invalid.length > 0) { set.status = 400; return { error: `Invalid capability: ${invalid.join(', ')}` } }
    const permissions = [...new Set(body.permissions as string[])]
    const user = await prisma.user.update({
      where: { id: params.userId },
      data: { permissions },
      select: { id: true, permissions: true },
    })
    return { ok: true, permissions: user.permissions }
  })
