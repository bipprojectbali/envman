import { Elysia } from 'elysia'
import { getEnvironmentAccess, getProjectAccess, tokenScopeAllows } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { cacheKeys, invalidateProjectCaches, withCache } from '../../lib/cache'
import { decryptSecret, encryptSecret } from '../../lib/crypto'
import { prisma } from '../../lib/db'
import { notDeleted, softDelete } from '../../lib/db-helpers'
import { parsePagination } from '../../lib/pagination'
import { hasCapability } from '../../lib/permissions'
import { triggerAutoSync } from './portainer'

export const projectsRouter = new Elysia()

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
        environments: { include: { _count: { select: { vars: true } } } },
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
    return { project: { ...project, myRole: access } }
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

  // ─── Project Members ──────────────────────────────────
  .post('/api/envman/projects/:slug/members', async ({ request, params, set }) => {
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
    if ((!body?.email && !body?.userId) || !body?.role) {
      set.status = 400
      return { error: 'userId (or email) and role required' }
    }
    if (!['OWNER', 'EDITOR', 'VIEWER'].includes(body.role)) {
      set.status = 400
      return { error: 'Invalid role' }
    }
    const user = body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId } })
      : await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) {
      set.status = 404
      return { error: 'User not found' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const member = await prisma.projectMember.upsert({
      where: { userId_projectId: { userId: user.id, projectId: project.id } },
      update: { role: body.role },
      create: { userId: user.id, projectId: project.id, role: body.role },
    })
    await invalidateProjectCaches(params.slug)
    return { member }
  })

  .patch('/api/envman/projects/:slug/members/:userId', async ({ request, params, set }) => {
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
    const body = await request.json().catch(() => null)
    if (!body?.role || !['OWNER', 'EDITOR', 'VIEWER'].includes(body.role)) {
      set.status = 400
      return { error: 'Invalid role' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    // Protect last owner — cannot demote if this is the only OWNER
    if (body.role !== 'OWNER') {
      const ownerCount = await prisma.projectMember.count({ where: { projectId: project.id, role: 'OWNER' } })
      const targetMember = await prisma.projectMember.findUnique({
        where: { userId_projectId: { userId: params.userId, projectId: project.id } },
      })
      if (ownerCount === 1 && targetMember?.role === 'OWNER') {
        set.status = 400
        return { error: 'Tidak bisa menurunkan owner terakhir. Angkat owner lain terlebih dahulu.' }
      }
    }
    const member = await prisma.projectMember.update({
      where: { userId_projectId: { userId: params.userId, projectId: project.id } },
      data: { role: body.role },
    })
    await invalidateProjectCaches(params.slug)
    return { member }
  })

  .delete('/api/envman/projects/:slug/members/:userId', async ({ request, params, set }) => {
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
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    // Protect last owner
    const targetMember = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: params.userId, projectId: project.id } },
    })
    if (targetMember?.role === 'OWNER') {
      const ownerCount = await prisma.projectMember.count({ where: { projectId: project.id, role: 'OWNER' } })
      if (ownerCount === 1) {
        set.status = 400
        return { error: 'Tidak bisa menghapus owner terakhir.' }
      }
    }
    await prisma.projectMember.delete({ where: { userId_projectId: { userId: params.userId, projectId: project.id } } })
    // extraUserIds: invalidate the removed user's cache too — they're no longer in members[] after delete
    await invalidateProjectCaches(params.slug, [params.userId])
    return { ok: true }
  })

  // ─── Available users for member add (OWNER only) ──────
  .get('/api/envman/projects/:slug/available-users', async ({ request, params, set, query }) => {
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
    const search = ((query as Record<string, unknown>).search as string | undefined)?.trim() ?? ''
    const project = await prisma.project.findUnique({ where: { slug: params.slug }, select: { id: true } })
    if (!project) {
      set.status = 404
      return { error: 'Not found' }
    }
    const existingIds = (
      await prisma.projectMember.findMany({ where: { projectId: project.id }, select: { userId: true } })
    ).map((m) => m.userId)
    const users = await prisma.user.findMany({
      where: {
        id: { notIn: existingIds },
        blocked: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true, image: true },
      take: 200,
      orderBy: { name: 'asc' },
    })
    return { users }
  })

  // ─── Environments ─────────────────────────────────────
  .post('/api/envman/projects/:slug/environments', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.name) {
      set.status = 400
      return { error: 'name required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const envName = body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const existing = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: envName } },
    })
    if (existing) {
      set.status = 400
      return { error: 'Environment name already exists' }
    }
    const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : []
    const environment = await prisma.environment.create({ data: { name: envName, tags, projectId: project.id } })
    await invalidateProjectCaches(params.slug)
    return { environment }
  })

  .delete('/api/envman/projects/:slug/environments/:envName', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(auth.userId, auth.role, params.slug, params.envName)
    if (!access || access !== 'OWNER') {
      set.status = 403
      return { error: 'Owner required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    await prisma.environment.delete({ where: { projectId_name: { projectId: project.id, name: params.envName } } })
    await invalidateProjectCaches(params.slug)
    return { ok: true }
  })

  .patch('/api/envman/projects/:slug/environments/:envName', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(auth.userId, auth.role, params.slug, params.envName)
    if (!access || !['OWNER', 'EDITOR'].includes(access)) {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    const body = await request.json().catch(() => null)
    if (!body || (body.name === undefined && body.tags === undefined)) {
      set.status = 400
      return { error: 'name atau tags diperlukan' }
    }
    // Rename hanya OWNER
    if (body.name !== undefined && access !== 'OWNER') {
      set.status = 403
      return { error: 'Owner required to rename environment' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const updateData: { name?: string; tags?: string[] } = {}
    if (body.name !== undefined) {
      const newName = body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(newName)) {
        set.status = 400
        return { error: 'Nama hanya boleh huruf kecil, angka, dan strip. Tidak diawali/diakhiri strip.' }
      }
      if (newName !== params.envName) {
        const duplicate = await prisma.environment.findUnique({
          where: { projectId_name: { projectId: project.id, name: newName } },
        })
        if (duplicate) {
          set.status = 400
          return { error: `Environment "${newName}" sudah ada di project ini` }
        }
        updateData.name = newName
      }
    }
    if (body.tags !== undefined) {
      updateData.tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : []
    }
    if (Object.keys(updateData).length === 0) return { environment: null, unchanged: true }
    const environment = await prisma.environment.update({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
      data: updateData,
    })
    await invalidateProjectCaches(params.slug)
    return { environment }
  })

  // ─── Env Vars ─────────────────────────────────────────
  .get('/api/envman/projects/:slug/environments/:envName/vars', async ({ request, params, set, query }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) {
      set.status = 403
      return { error: 'No access' }
    }
    if (caller.scopes.length > 0 && !tokenScopeAllows(caller.scopes, params.slug, params.envName)) {
      set.status = 403
      return { error: 'Token tidak memiliki akses ke project/env ini' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!environment) {
      set.status = 404
      return { error: 'Environment not found' }
    }
    const search = (query.search as string | undefined) ?? ''
    const { limit, offset } = parsePagination(query as Record<string, unknown>, 50, 200)
    const where = {
      environmentId: environment.id,
      ...(search ? { key: { contains: search, mode: 'insensitive' as const } } : {}),
    }
    const [total, rawVars] = await Promise.all([
      prisma.envVar.count({ where }),
      prisma.envVar.findMany({ where, orderBy: { key: 'asc' }, take: limit, skip: offset }),
    ])
    const canReadSecrets = access === 'OWNER' || access === 'EDITOR'
    const vars = rawVars.map((v) => ({
      id: v.id,
      key: v.key,
      isSecret: v.isSecret,
      isDisabled: v.isDisabled,
      updatedAt: v.updatedAt,
      value: v.isSecret ? (canReadSecrets ? decryptSecret(v.value) : '***') : v.value,
    }))
    return { vars, total, limit, offset, hasMore: offset + limit < total }
  })

  .get('/api/envman/projects/:slug/environments/:envName/vars/export', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) {
      set.status = 403
      return { error: 'No access' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    if (caller.scopes.length > 0 && !tokenScopeAllows(caller.scopes, params.slug, params.envName)) {
      set.status = 403
      return { error: 'Token tidak memiliki akses ke project/env ini' }
    }
    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
      include: { vars: { orderBy: { key: 'asc' } } },
    })
    if (!environment) {
      set.status = 404
      return { error: 'Environment not found' }
    }
    // Mask secret untuk VIEWER (konsisten dengan GET vars). Hanya EDITOR/OWNER yang bisa export secret plaintext.
    const canReadSecrets = access === 'OWNER' || access === 'EDITOR'
    const vars = Object.fromEntries(
      environment.vars
        .filter((v) => !v.isDisabled)
        .map((v) => [v.key, v.isSecret ? (canReadSecrets ? decryptSecret(v.value) : '***') : v.value]),
    )
    return { vars }
  })

  .put('/api/envman/projects/:slug/environments/:envName/vars', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    if (!caller.canWrite) {
      set.status = 403
      return { error: 'Token is read-only' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.vars || typeof body.vars !== 'object') {
      set.status = 400
      return { error: 'vars object required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    if (caller.scopes.length > 0 && !tokenScopeAllows(caller.scopes, params.slug, params.envName)) {
      set.status = 403
      return { error: 'Token tidak memiliki akses ke project/env ini' }
    }
    let environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!environment) {
      environment = await prisma.environment.create({ data: { name: params.envName, projectId: project.id } })
    }
    const secretKeys: string[] = body.secrets ?? []
    await Promise.all(
      Object.entries(body.vars as Record<string, string>).map(([key, value]) => {
        const secret = secretKeys.includes(key)
        const stored = secret ? encryptSecret(value) : value
        return prisma.envVar.upsert({
          where: { environmentId_key: { environmentId: environment!.id, key } },
          update: { value: stored, isSecret: secret },
          create: { key, value: stored, isSecret: secret, environmentId: environment!.id },
        })
      }),
    )
    return { ok: true, count: Object.keys(body.vars).length }
  })

  .post('/api/envman/projects/:slug/environments/:envName/vars', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    if (!caller.canWrite) {
      set.status = 403
      return { error: 'Token is read-only' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.key || body.value === undefined) {
      set.status = 400
      return { error: 'key and value required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    let environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!environment) {
      environment = await prisma.environment.create({ data: { name: params.envName, projectId: project.id } })
    }
    const envVar = await prisma.envVar.upsert({
      where: { environmentId_key: { environmentId: environment.id, key: body.key } },
      update: { value: body.isSecret ? encryptSecret(body.value) : body.value, isSecret: body.isSecret ?? false },
      create: {
        key: body.key,
        value: body.isSecret ? encryptSecret(body.value) : body.value,
        isSecret: body.isSecret ?? false,
        environmentId: environment.id,
      },
    })
    // Auto-sync to Portainer if enabled (fire-and-forget)
    triggerAutoSync(params.slug, params.envName, caller.userId).catch(() => {})
    return { var: { id: envVar.id, key: envVar.key, isSecret: envVar.isSecret } }
  })

  .delete('/api/envman/projects/:slug/environments/:envName/vars/:key', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    if (!caller.canWrite) {
      set.status = 403
      return { error: 'Token is read-only' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!environment) {
      set.status = 404
      return { error: 'Environment not found' }
    }
    const envVar = await prisma.envVar.findUnique({
      where: { environmentId_key: { environmentId: environment.id, key: params.key } },
    })
    if (!envVar) {
      set.status = 404
      return { error: 'Variable not found' }
    }
    await prisma.envVar.delete({ where: { id: envVar.id } })
    return { ok: true }
  })

  .patch('/api/envman/projects/:slug/environments/:envName/vars/:key/toggle', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    if (!caller.canWrite) {
      set.status = 403
      return { error: 'Token is read-only' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!environment) {
      set.status = 404
      return { error: 'Environment not found' }
    }
    const existing = await prisma.envVar.findUnique({
      where: { environmentId_key: { environmentId: environment.id, key: params.key } },
    })
    if (!existing) {
      set.status = 404
      return { error: 'Var not found' }
    }
    const updated = await prisma.envVar.update({
      where: { environmentId_key: { environmentId: environment.id, key: params.key } },
      data: { isDisabled: !existing.isDisabled },
    })
    return { key: updated.key, isDisabled: updated.isDisabled }
  })

  .get('/api/envman/projects/:slug/diff/:env1/:env2', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    // Diff butuh akses ke kedua env — kedua-duanya wajib accessible
    const [access1, access2] = await Promise.all([
      getEnvironmentAccess(caller.userId, caller.role, params.slug, params.env1),
      getEnvironmentAccess(caller.userId, caller.role, params.slug, params.env2),
    ])
    if (!access1 || !access2) {
      set.status = 403
      return { error: 'No access' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const [e1, e2] = await Promise.all([
      prisma.environment.findUnique({
        where: { projectId_name: { projectId: project.id, name: params.env1 } },
        include: { vars: true },
      }),
      prisma.environment.findUnique({
        where: { projectId_name: { projectId: project.id, name: params.env2 } },
        include: { vars: true },
      }),
    ])
    if (!e1) {
      set.status = 404
      return { error: `Environment '${params.env1}' not found` }
    }
    if (!e2) {
      set.status = 404
      return { error: `Environment '${params.env2}' not found` }
    }
    const map1 = Object.fromEntries(e1.vars.map((v) => [v.key, v]))
    const map2 = Object.fromEntries(e2.vars.map((v) => [v.key, v]))
    const allKeys = new Set([...Object.keys(map1), ...Object.keys(map2)])
    const diff = [...allKeys].sort().map((key) => {
      if (!map1[key]) return { key, status: 'added' }
      if (!map2[key]) return { key, status: 'removed' }
      if (map1[key].value !== map2[key].value) return { key, status: 'changed' }
      return { key, status: 'same' }
    })
    return { env1: params.env1, env2: params.env2, diff }
  })
