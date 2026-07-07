import { Elysia } from 'elysia'
import { getProjectAccess } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { cacheKeys, invalidateProjectCaches, withCache } from '../../lib/cache'
import { prisma } from '../../lib/db'
import { notDeleted, softDelete } from '../../lib/db-helpers'
import { hasCapability } from '../../lib/permissions'
import { isValidProjectColor, isValidProjectIcon } from '../../lib/project-avatar'
import { minioDeleteProject } from '../../lib/storage-service'

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
      createdBy: { select: { id: true, name: true, email: true, image: true } },
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
        createdById: auth.userId,
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
        sectionMembers: { where: { userId: caller.userId }, select: { section: true, role: true } },
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

    // Resolusi akses per-section (Notes/Aliases/Files/Storage) untuk caller:
    // override section jika ada (null = denied), else inherit role project.
    const SECTIONS = ['NOTES', 'ALIASES', 'FILES', 'STORAGE'] as const
    const sectionOverride = new Map((project as any).sectionMembers.map((sm: any) => [sm.section, sm.role]))
    const sectionAccess: Record<string, 'OWNER' | 'EDITOR' | 'VIEWER' | null> = {}
    for (const section of SECTIONS) {
      if (isSuperAdmin) {
        sectionAccess[section] = 'OWNER'
      } else if (sectionOverride.has(section)) {
        sectionAccess[section] = sectionOverride.get(section) as 'OWNER' | 'EDITOR' | 'VIEWER' | null
      } else {
        sectionAccess[section] = access
      }
    }
    const { sectionMembers: _sm, ...projectRest } = project as any
    return {
      project: {
        ...projectRest,
        environments: environmentsWithAccess,
        myRole: access,
        sectionAccess,
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
        // Avatar & card: hanya terima nilai dari registry/palet; null = reset ke default.
        ...(isValidProjectIcon(body?.icon) ? { icon: body.icon } : body?.icon === null ? { icon: null } : {}),
        ...(isValidProjectColor(body?.color) ? { color: body.color } : body?.color === null ? { color: null } : {}),
        ...(isValidProjectColor(body?.cardColor)
          ? { cardColor: body.cardColor }
          : body?.cardColor === null
            ? { cardColor: null }
            : {}),
        // Storage limits: hanya SUPER_ADMIN yang boleh ubah; null = reset ke global default.
        ...(auth.role === 'SUPER_ADMIN' && 'storageMaxFileMb' in (body ?? {})
          ? { storageMaxFileMb: body.storageMaxFileMb === null ? null : Number(body.storageMaxFileMb) || null }
          : {}),
        ...(auth.role === 'SUPER_ADMIN' && 'storageQuotaMb' in (body ?? {})
          ? { storageQuotaMb: body.storageQuotaMb === null ? null : Number(body.storageQuotaMb) || null }
          : {}),
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
    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    // Hapus semua storage objects dari MinIO sebelum soft delete project
    await minioDeleteProject(project.id)

    await invalidateProjectCaches(params.slug)
    await prisma.project.update({ where: { slug: params.slug }, data: softDelete() })
    return { ok: true }
  })
