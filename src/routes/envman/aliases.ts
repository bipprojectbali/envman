import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireEnvAuth, unauthorized, forbidden } from '../../lib/auth-middleware'
import { getProjectAccess } from '../../lib/access'
import { withCache, invalidateCache, cacheKeys } from '../../lib/cache'
import { notDeleted } from '../../lib/db-helpers'

const ALIAS_NAME_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/

const aliasSelect = {
  id: true,
  name: true,
  args: true,
  description: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: { id: true, name: true } },
} as const

export const aliasesRouter = new Elysia()

  // GET /api/envman/projects/:slug/aliases — list aliases (VIEWER+)
  .get('/api/envman/projects/:slug/aliases', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access) return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const aliases = await withCache(cacheKeys.projectAliases(params.slug), 60, () =>
      prisma.projectAlias.findMany({
        where: { projectId: project.id },
        orderBy: { name: 'asc' },
        select: aliasSelect,
      }),
    )
    return { aliases }
  })

  // POST /api/envman/projects/:slug/aliases — create alias (OWNER only)
  .post('/api/envman/projects/:slug/aliases', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const body = await request.json().catch(() => null) as { name?: string; args?: string; description?: string; tags?: string[] } | null
    if (!body?.name?.trim()) { set.status = 400; return { error: 'name wajib diisi' } }
    if (!body?.args?.trim()) { set.status = 400; return { error: 'args wajib diisi' } }
    const name = body.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || ''
    if (!ALIAS_NAME_RE.test(name)) { set.status = 400; return { error: 'name hanya boleh huruf kecil, angka, dan tanda hubung' } }
    const existing = await prisma.projectAlias.findUnique({ where: { projectId_name: { projectId: project.id, name } } })
    if (existing) { set.status = 400; return { error: 'Alias sudah ada' } }
    const alias = await prisma.projectAlias.create({
      data: { projectId: project.id, name, args: body.args.trim(), description: body.description?.trim() || null, tags: body.tags ?? [], createdBy: authResult.userId },
      select: aliasSelect,
    })
    await invalidateCache(cacheKeys.projectAliases(params.slug))
    return { alias }
  })

  // PATCH /api/envman/projects/:slug/aliases/:name — update args/description (OWNER only)
  .patch('/api/envman/projects/:slug/aliases/:name', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const existing = await prisma.projectAlias.findUnique({ where: { projectId_name: { projectId: project.id, name: params.name } } })
    if (!existing) { set.status = 404; return { error: 'Alias tidak ditemukan' } }
    const body = await request.json().catch(() => null) as { args?: string; description?: string; tags?: string[] } | null
    if (body?.args !== undefined && !body.args.trim()) { set.status = 400; return { error: 'args tidak boleh kosong' } }
    const updated = await prisma.projectAlias.update({
      where: { id: existing.id },
      data: {
        ...(body?.args !== undefined ? { args: body.args.trim() } : {}),
        ...(body?.description !== undefined ? { description: body.description?.trim() || null } : {}),
        ...(body?.tags !== undefined ? { tags: body.tags } : {}),
      },
      select: aliasSelect,
    })
    await invalidateCache(cacheKeys.projectAliases(params.slug))
    return { alias: updated }
  })

  // DELETE /api/envman/projects/:slug/aliases/:name — delete alias (OWNER only)
  .delete('/api/envman/projects/:slug/aliases/:name', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const existing = await prisma.projectAlias.findUnique({ where: { projectId_name: { projectId: project.id, name: params.name } } })
    if (!existing) { set.status = 404; return { error: 'Alias tidak ditemukan' } }
    await prisma.projectAlias.delete({ where: { id: existing.id } })
    await invalidateCache(cacheKeys.projectAliases(params.slug))
    return { ok: true }
  })

  // GET /api/envman/aliases/resolve/:ref — resolve project:alias for CLI (any member)
  .get('/api/envman/aliases/resolve/:ref', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const ref = params.ref
    const colonIdx = ref.indexOf(':')
    if (colonIdx === -1) { set.status = 400; return { error: 'Format ref harus project:alias' } }
    const projectSlug = ref.slice(0, colonIdx)
    const aliasName = ref.slice(colonIdx + 1)
    if (!projectSlug || !aliasName) { set.status = 400; return { error: 'project dan alias tidak boleh kosong' } }
    const access = await getProjectAccess(authResult.userId, authResult.role, projectSlug)
    if (!access) return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: projectSlug, ...notDeleted } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const alias = await prisma.projectAlias.findUnique({ where: { projectId_name: { projectId: project.id, name: aliasName } } })
    if (!alias) { set.status = 404; return { error: 'Alias tidak ditemukan' } }
    return { args: alias.args, project: projectSlug, alias: aliasName }
  })
