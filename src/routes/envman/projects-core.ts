import { Elysia } from 'elysia'
import { getProjectAccess } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { cacheKeys, invalidateProjectCaches, withCache } from '../../lib/cache'
import { prisma } from '../../lib/db'
import { notDeleted, softDelete } from '../../lib/db-helpers'
import { hasCapability } from '../../lib/permissions'

export const projectsCoreRouter = new Elysia()

  // ─── Projects ─────────────────────────────────────────
  .get('/api/envman/projects', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const isSuperAdmin = caller.role === 'SUPER_ADMIN'
    const include = {
      members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      environments: { select: { name: true }, orderBy: { name: 'asc' as const } },
      _count: { select: { environments: true } },
    }
    const projects = await withCache(cacheKeys.projectList(caller.userId), 60, () =>
      isSuperAdmin
        ? prisma.project.findMany({ where: notDeleted, include, orderBy: { createdAt: 'desc' } })
        : prisma.project.findMany({
            where: { ...notDeleted, members: { some: { userId: caller.userId } } },
            include,
            orderBy: { createdAt: 'desc' },
          }),
    )
    return {
      projects: projects.map((p: any) => ({
        ...p,
        myRole: isSuperAdmin ? 'OWNER' : (p.members.find((m: any) => m.userId === caller.userId)?.role ?? 'VIEWER'),
      })),
    }
  })

  .post('/api/envman/projects', async ({ request, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(auth, 'project:create')) {
      set.status = 403
      return { error: 'Tidak punya izin create project. Hubungi SUPER_ADMIN.' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.slug || !body?.name) {
      set.status = 400
      return { error: 'slug and name required' }
    }
    const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const existing = await prisma.project.findUnique({ where: { slug } })
    if (existing) {
      set.status = 400
      return { error: 'Slug already taken' }
    }
    const project = await prisma.project.create({
      data: {
        slug,
        name: body.name,
        description: body.description ?? null,
        tags: Array.isArray(body.tags) ? body.tags : [],
        members: { create: { userId: auth.userId, role: 'OWNER' } },
      },
    })
    await invalidateProjectCaches(slug)
    return { project }
  })

  .get('/api/envman/projects/:slug', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        environments: {
          include: {
            _count: { select: { vars: true } },
            members: { where: { userId: caller.userId }, select: { role: true } },
          },
        },
      },
    })
    if (!project) {
      set.status = 404
      return { error: 'Not found' }
    }
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access) {
      set.status = 403
      return { error: 'No access' }
    }
    const isSuperAdmin = caller.role === 'SUPER_ADMIN'
    const showAllEnvs = isSuperAdmin || access === 'OWNER'
    const environmentsWithAccess = project.environments
      .map((e: any) => {
        const override = e.members[0]
        let envEffectiveRole: 'OWNER' | 'EDITOR' | 'VIEWER' | null
        if (isSuperAdmin) {
          envEffectiveRole = 'OWNER'
        } else if (override) {
          envEffectiveRole = override.role as 'OWNER' | 'EDITOR' | 'VIEWER' | null
        } else {
          envEffectiveRole = access
        }
        const { members: _m, ...rest } = e
        return { ...rest, accessRole: envEffectiveRole }
      })
      .filter((e: any) => showAllEnvs || e.accessRole !== null)
    return {
      project: {
        ...project,
        environments: environmentsWithAccess,
        myRole: access,
      },
    }
  })

  .patch('/api/envman/projects/:slug', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access === 'VIEWER' || access === 'EDITOR') {
      set.status = 403
      return { error: 'Owner required' }
    }
    const body = await request.json().catch(() => null)
    const project = await prisma.project.update({
      where: { slug: params.slug },
      data: {
        name: body?.name,
        description: body?.description,
        ...(body?.tags !== undefined ? { tags: body.tags } : {}),
        ...(typeof body?.isActive === 'boolean' ? { isActive: body.isActive } : {}),
      },
    })
    await invalidateProjectCaches(params.slug)
    return { project }
  })

  .delete('/api/envman/projects/:slug', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access !== 'OWNER') {
      set.status = 403
      return { error: 'Owner required' }
    }
    await invalidateProjectCaches(params.slug)
    await prisma.project.update({ where: { slug: params.slug }, data: softDelete() })
    return { ok: true }
  })
