import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireEnvAuth, unauthorized, forbidden } from '../../lib/auth-middleware'
import { getProjectAccess } from '../../lib/access'
import { withCache, invalidateCache, cacheKeys } from '../../lib/cache'
import { notDeleted } from '../../lib/db-helpers'

interface FileEntry {
  filename: string
  content: string
  language: string
}

const fileSelect = {
  id: true,
  title: true,
  description: true,
  files: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const

function isValidFiles(files: unknown): files is FileEntry[] {
  return Array.isArray(files) && files.length > 0 &&
    files.every(f => typeof f === 'object' && f !== null &&
      typeof (f as any).filename === 'string' &&
      typeof (f as any).content === 'string')
}

export const filesRouter = new Elysia()

  // GET /api/envman/projects/:slug/files — list files (VIEWER+)
  .get('/api/envman/projects/:slug/files', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access) return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const files = await withCache(cacheKeys.projectFiles(params.slug), 60, () =>
      prisma.projectFile.findMany({
        where: { projectId: project.id },
        orderBy: { updatedAt: 'desc' },
        select: fileSelect,
      }),
    )
    return { files }
  })

  // POST /api/envman/projects/:slug/files — create file (EDITOR+)
  .post('/api/envman/projects/:slug/files', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access || access === 'VIEWER') return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const body = await request.json().catch(() => null) as { title?: string; description?: string; files?: unknown; tags?: string[] } | null
    if (!body?.title?.trim()) { set.status = 400; return { error: 'title wajib diisi' } }
    if (!isValidFiles(body?.files)) { set.status = 400; return { error: 'files harus berisi minimal satu file' } }
    const file = await prisma.projectFile.create({
      data: {
        projectId: project.id,
        authorId: authResult.userId,
        title: body.title.trim(),
        description: body.description?.trim() ?? '',
        files: body.files as any,
        tags: body.tags ?? [],
      },
      select: fileSelect,
    })
    await invalidateCache(cacheKeys.projectFiles(params.slug))
    return { file }
  })

  // PUT /api/envman/projects/:slug/files/:id — update file (EDITOR own / OWNER all)
  .put('/api/envman/projects/:slug/files/:id', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access || access === 'VIEWER') return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const existing = await prisma.projectFile.findUnique({ where: { id: params.id } })
    if (!existing || existing.projectId !== project.id) { set.status = 404; return { error: 'File tidak ditemukan' } }
    if (access === 'EDITOR' && existing.authorId !== authResult.userId) return forbidden(set)
    const body = await request.json().catch(() => null) as { title?: string; description?: string; files?: unknown; tags?: string[] } | null
    if (body?.files !== undefined && !isValidFiles(body.files)) { set.status = 400; return { error: 'files harus berisi minimal satu file' } }
    const updated = await prisma.projectFile.update({
      where: { id: existing.id },
      data: {
        ...(body?.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body?.description !== undefined ? { description: body.description.trim() } : {}),
        ...(body?.files !== undefined ? { files: body.files as any } : {}),
        ...(body?.tags !== undefined ? { tags: body.tags } : {}),
      },
      select: fileSelect,
    })
    await invalidateCache(cacheKeys.projectFiles(params.slug))
    return { file: updated }
  })

  // DELETE /api/envman/projects/:slug/files/:id — delete file (EDITOR own / OWNER all)
  .delete('/api/envman/projects/:slug/files/:id', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access || access === 'VIEWER') return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const existing = await prisma.projectFile.findUnique({ where: { id: params.id } })
    if (!existing || existing.projectId !== project.id) { set.status = 404; return { error: 'File tidak ditemukan' } }
    if (access === 'EDITOR' && existing.authorId !== authResult.userId) return forbidden(set)
    await prisma.projectFile.delete({ where: { id: existing.id } })
    await invalidateCache(cacheKeys.projectFiles(params.slug))
    return { ok: true }
  })
