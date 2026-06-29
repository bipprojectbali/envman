import { Elysia } from 'elysia'
import type { ProjectRole } from '../../lib/access'
import { audit } from '../../lib/audit'
import { requireSuperAdmin } from '../../lib/auth-middleware'
import { cacheKeys, invalidateCache, invalidateProjectCaches } from '../../lib/cache'
import { prisma } from '../../lib/db'
import { isValidCapability } from '../../lib/permissions'

function getIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
}

type ProjectRoleInput = ProjectRole | null

function isValidProjectRole(value: unknown): value is ProjectRoleInput {
  return value === null || value === 'OWNER' || value === 'EDITOR' || value === 'VIEWER'
}

type EnvRoleInput = 'inherit' | 'denied' | ProjectRole

function isValidEnvRole(value: unknown): value is EnvRoleInput {
  return value === 'inherit' || value === 'denied' || value === 'OWNER' || value === 'EDITOR' || value === 'VIEWER'
}

export const adminUsersRouter = new Elysia()

  // ─── Set project-level role (or remove membership) ───────────────────────────
  .put('/api/envman/admin/users/:userId/projects/:slug', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) {
      set.status = 403
      return { error: 'SUPER_ADMIN required' }
    }
    const body = (await request.json().catch(() => null)) as { role?: unknown } | null
    if (!body || !isValidProjectRole(body.role)) {
      set.status = 400
      return { error: 'role must be OWNER, EDITOR, VIEWER, or null' }
    }

    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }

    const targetMember = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: params.userId, projectId: project.id } },
    })

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

    await invalidateProjectCaches(params.slug, [params.userId])
    return { ok: true, role: body.role }
  })

  // ─── Set env-level override (inherit / denied / role) ────────────────────────
  .put('/api/envman/admin/users/:userId/projects/:slug/envs/:envName', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) {
      set.status = 403
      return { error: 'SUPER_ADMIN required' }
    }
    const body = (await request.json().catch(() => null)) as { role?: unknown } | null
    if (!body || !isValidEnvRole(body.role)) {
      set.status = 400
      return { error: "role must be 'inherit', 'denied', 'OWNER', 'EDITOR', or 'VIEWER'" }
    }

    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const env = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!env) {
      set.status = 404
      return { error: 'Environment not found' }
    }

    const targetMember = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: params.userId, projectId: project.id } },
    })
    if (!targetMember) {
      set.status = 400
      return { error: 'User belum jadi member project. Tambah ke project dulu sebelum atur akses env.' }
    }

    if (body.role !== 'OWNER' && body.role !== 'inherit') {
      const projectOwners = await prisma.projectMember.findMany({
        where: { projectId: project.id, role: 'OWNER' },
        select: { userId: true },
      })
      const envOverrides = await prisma.environmentMember.findMany({
        where: { environmentId: env.id },
      })
      const overrideByUser = new Map(envOverrides.map((m) => [m.userId, m.role]))
      const effectiveOwners = projectOwners.filter((po) => {
        const override = overrideByUser.get(po.userId)
        if (override === undefined) return true
        return override === 'OWNER'
      })
      const isLastOwner =
        effectiveOwners.length === 1 && effectiveOwners[0]!.userId === params.userId && targetMember.role === 'OWNER'
      if (isLastOwner) {
        set.status = 400
        return { error: 'Tidak bisa menurunkan/menolak OWNER terakhir di env ini. Angkat OWNER lain dulu.' }
      }
    }

    const existing = await prisma.environmentMember.findUnique({
      where: { userId_environmentId: { userId: params.userId, environmentId: env.id } },
    })

    if (body.role === 'inherit') {
      if (existing) await prisma.environmentMember.delete({ where: { id: existing.id } })
    } else if (body.role === 'denied') {
      await prisma.environmentMember.upsert({
        where: { userId_environmentId: { userId: params.userId, environmentId: env.id } },
        update: { role: null },
        create: { userId: params.userId, environmentId: env.id, role: null },
      })
    } else {
      await prisma.environmentMember.upsert({
        where: { userId_environmentId: { userId: params.userId, environmentId: env.id } },
        update: { role: body.role },
        create: { userId: params.userId, environmentId: env.id, role: body.role },
      })
    }

    const auditAction = body.role === 'inherit' ? 'ENV_MEMBER_CLEARED' : 'ENV_MEMBER_SET'
    const detail =
      body.role === 'inherit'
        ? `${params.slug}/${params.envName} user=${params.userId} (admin)`
        : `${params.slug}/${params.envName} user=${params.userId} role=${body.role} (admin)`
    audit(caller.userId, auditAction, detail, getIp(request))

    await invalidateCache(cacheKeys.projectAccess(params.userId, params.slug), cacheKeys.projectDetail(params.slug))
    await invalidateProjectCaches(params.slug, [params.userId])
    return { ok: true, role: body.role }
  })

  // ─── Set user capability list (SUPER_ADMIN grants) ───────────────────────────
  .put('/api/envman/admin/users/:userId/permissions', async ({ request, params, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) {
      set.status = 403
      return { error: 'SUPER_ADMIN required' }
    }
    const body = (await request.json().catch(() => null)) as { permissions?: unknown } | null
    if (!body || !Array.isArray(body.permissions)) {
      set.status = 400
      return { error: 'permissions array required' }
    }
    const invalid = body.permissions.filter((p) => !isValidCapability(p))
    if (invalid.length > 0) {
      set.status = 400
      return { error: `Invalid capability: ${invalid.join(', ')}` }
    }
    const permissions = [...new Set(body.permissions as string[])]
    const user = await prisma.user.update({
      where: { id: params.userId },
      data: { permissions },
      select: { id: true, permissions: true },
    })
    return { ok: true, permissions: user.permissions }
  })
