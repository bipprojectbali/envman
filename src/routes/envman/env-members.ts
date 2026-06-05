import { Elysia } from 'elysia'
import type { ProjectRole } from '../../lib/access'
import { getProjectAccess } from '../../lib/access'
import { audit } from '../../lib/audit'
import { forbidden, requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { cacheKeys, invalidateCache, invalidateProjectCaches, withCache } from '../../lib/cache'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'

type EnvRoleInput = 'inherit' | 'denied' | ProjectRole

function isValidEnvRole(value: unknown): value is EnvRoleInput {
  return value === 'inherit' || value === 'denied' || value === 'OWNER' || value === 'EDITOR' || value === 'VIEWER'
}

function getIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
}

export const envMembersRouter = new Elysia()

  // GET /api/envman/projects/:slug/access-matrix — full user × env access matrix (OWNER)
  .get('/api/envman/projects/:slug/access-matrix', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)

    const data = await withCache(cacheKeys.projectAccessMatrix(params.slug), 60, async () => {
      const project = await prisma.project.findFirst({
        where: { slug: params.slug, ...notDeleted },
        include: {
          environments: {
            select: {
              id: true,
              name: true,
              members: { select: { userId: true, role: true } },
            },
            orderBy: { name: 'asc' },
          },
          members: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!project) return null
      const environments = project.environments.map((e) => ({ name: e.name }))
      const members = project.members.map((pm) => {
        const envAccess: Record<string, { envRole: EnvRoleInput; effectiveRole: ProjectRole | null }> = {}
        for (const env of project.environments) {
          const override = env.members.find((em) => em.userId === pm.userId)
          if (!override) {
            envAccess[env.name] = { envRole: 'inherit', effectiveRole: pm.role as ProjectRole }
          } else if (override.role === null) {
            envAccess[env.name] = { envRole: 'denied', effectiveRole: null }
          } else {
            envAccess[env.name] = { envRole: override.role as ProjectRole, effectiveRole: override.role as ProjectRole }
          }
        }
        return {
          userId: pm.userId,
          user: pm.user,
          projectRole: pm.role as ProjectRole,
          envAccess,
        }
      })
      return {
        project: { slug: project.slug, name: project.name },
        environments,
        members,
      }
    })

    if (!data) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    return data
  })

  // GET /api/envman/projects/:slug/environments/:envName/members — list env-level overrides (OWNER)
  .get('/api/envman/projects/:slug/environments/:envName/members', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)

    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const env = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!env) {
      set.status = 404
      return { error: 'Environment tidak ditemukan' }
    }

    // Project members + their env override (if any)
    const projectMembers = await prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    })
    const envMembers = await prisma.environmentMember.findMany({
      where: { environmentId: env.id },
    })
    const envMemberByUser = new Map(envMembers.map((m) => [m.userId, m]))

    const members = projectMembers.map((pm) => {
      const override = envMemberByUser.get(pm.userId)
      let envRole: EnvRoleInput = 'inherit'
      let effectiveRole: ProjectRole | null = pm.role as ProjectRole
      if (override) {
        if (override.role === null) {
          envRole = 'denied'
          effectiveRole = null
        } else {
          envRole = override.role as ProjectRole
          effectiveRole = override.role as ProjectRole
        }
      }
      return {
        userId: pm.userId,
        user: pm.user,
        projectRole: pm.role as ProjectRole,
        envRole,
        effectiveRole,
      }
    })

    return { members }
  })

  // PUT /api/envman/projects/:slug/environments/:envName/members/:userId — set override (OWNER)
  .put('/api/envman/projects/:slug/environments/:envName/members/:userId', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)

    const body = (await request.json().catch(() => null)) as { role?: unknown } | null
    if (!body || !isValidEnvRole(body.role)) {
      set.status = 400
      return { error: "role harus 'inherit', 'denied', 'OWNER', 'EDITOR', atau 'VIEWER'" }
    }

    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const env = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!env) {
      set.status = 404
      return { error: 'Environment tidak ditemukan' }
    }

    // Target user must be a project member — env override only makes sense untuk member yang sudah ada
    const targetMember = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: params.userId, projectId: project.id } },
    })
    if (!targetMember) {
      set.status = 400
      return { error: 'User belum jadi member project. Tambah ke project dulu sebelum atur akses env.' }
    }

    // Last-owner-of-env protection: kalau target adalah satu-satunya OWNER efektif di env ini,
    // dan owner ini coba diturunkan/deny → tolak. OWNER di project level juga termasuk.
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
        if (override === undefined) return true // inherit OWNER
        return override === 'OWNER'
      })
      const isLastOwner =
        effectiveOwners.length === 1 && effectiveOwners[0]!.userId === params.userId && targetMember.role === 'OWNER'
      if (isLastOwner) {
        set.status = 400
        return {
          error: 'Tidak bisa menurunkan/menolak OWNER terakhir di env ini. Angkat OWNER lain dulu.',
        }
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

    audit(
      caller.userId,
      'ENV_MEMBER_SET',
      `${params.slug}/${params.envName} user=${params.userId} role=${body.role}`,
      getIp(request),
    )
    await invalidateCache(cacheKeys.projectAccess(params.userId, params.slug), cacheKeys.projectDetail(params.slug))
    await invalidateProjectCaches(params.slug, [params.userId])
    return { ok: true, role: body.role }
  })

  // DELETE /api/envman/projects/:slug/environments/:envName/members/:userId — reset to inherit (OWNER)
  .delete('/api/envman/projects/:slug/environments/:envName/members/:userId', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)

    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const env = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!env) {
      set.status = 404
      return { error: 'Environment tidak ditemukan' }
    }

    const existing = await prisma.environmentMember.findUnique({
      where: { userId_environmentId: { userId: params.userId, environmentId: env.id } },
    })
    if (existing) {
      await prisma.environmentMember.delete({ where: { id: existing.id } })
    }
    audit(caller.userId, 'ENV_MEMBER_CLEARED', `${params.slug}/${params.envName} user=${params.userId}`, getIp(request))
    await invalidateCache(cacheKeys.projectAccess(params.userId, params.slug), cacheKeys.projectDetail(params.slug))
    await invalidateProjectCaches(params.slug, [params.userId])
    return { ok: true }
  })
