import { Elysia } from 'elysia'
import { canAccessItem, filterByTagScope, getSectionAccessWithScope } from '../../lib/access'
import { forbidden, requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { cacheKeys, invalidateCache, withCache } from '../../lib/cache'
import { prisma } from '../../lib/db'
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
  prefix: true,
  files: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const

function isValidFiles(files: unknown): files is FileEntry[] {
  return (
    Array.isArray(files) &&
    files.length > 0 &&
    files.every(
      (f) =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as any).filename === 'string' &&
        typeof (f as any).content === 'string',
    )
  )
}

export function slugifyPrefix(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const filesRouter = new Elysia()

  // GET /api/envman/projects/:slug/files — list files (VIEWER+)
  .get('/api/envman/projects/:slug/files', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const { role: access, scopeTags } = await getSectionAccessWithScope(authResult.userId, authResult.role, params.slug, 'FILES')
    if (!access) return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const cachedFiles = await withCache(cacheKeys.projectFiles(params.slug), 60, () =>
      prisma.projectFile.findMany({
        where: { projectId: project.id },
        orderBy: { updatedAt: 'desc' },
        select: fileSelect,
      }),
    )
    // Cache global per-project; tag-scope per-user → filter setelah cache boundary.
    const files = filterByTagScope(cachedFiles, scopeTags)
    return { files }
  })

  // POST /api/envman/projects/:slug/files — create file (EDITOR+)
  .post('/api/envman/projects/:slug/files', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const { role: access, scopeTags } = await getSectionAccessWithScope(authResult.userId, authResult.role, params.slug, 'FILES')
    if (!access || access === 'VIEWER') return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const body = (await request.json().catch(() => null)) as {
      title?: string
      description?: string
      files?: unknown
      tags?: string[]
      prefix?: string
    } | null
    if (!body?.title?.trim()) {
      set.status = 400
      return { error: 'title wajib diisi' }
    }
    if (!isValidFiles(body?.files)) {
      set.status = 400
      return { error: 'files harus berisi minimal satu file' }
    }
    // Limited-by-tag user wajib memberi ≥1 tag scope-nya.
    if (!canAccessItem(body.tags ?? [], scopeTags)) {
      set.status = 400
      return { error: `File harus punya minimal satu tag yang Anda kelola: ${scopeTags.join(', ')}` }
    }
    const prefix = body.prefix?.trim() || null
    if (prefix) {
      const dup = await prisma.projectFile.findFirst({ where: { projectId: project.id, prefix } })
      if (dup) {
        set.status = 400
        return { error: `Prefix "${prefix}" sudah dipakai di project ini` }
      }
    }
    const file = await prisma.projectFile.create({
      data: {
        projectId: project.id,
        authorId: authResult.userId,
        title: body.title.trim(),
        description: body.description?.trim() ?? '',
        prefix,
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
    const { role: access, scopeTags } = await getSectionAccessWithScope(authResult.userId, authResult.role, params.slug, 'FILES')
    if (!access || access === 'VIEWER') return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const existing = await prisma.projectFile.findUnique({ where: { id: params.id } })
    // Item di luar tag-scope = tak terlihat → 404.
    if (!existing || existing.projectId !== project.id || !canAccessItem(existing.tags, scopeTags)) {
      set.status = 404
      return { error: 'File tidak ditemukan' }
    }
    if (access === 'EDITOR' && existing.authorId !== authResult.userId) return forbidden(set)
    const body = (await request.json().catch(() => null)) as {
      title?: string
      description?: string
      files?: unknown
      tags?: string[]
      prefix?: string
    } | null
    if (body?.files !== undefined && !isValidFiles(body.files)) {
      set.status = 400
      return { error: 'files harus berisi minimal satu file' }
    }
    // Retag yang mengeluarkan file dari scope sendiri ditolak.
    if (body?.tags !== undefined && !canAccessItem(body.tags, scopeTags)) {
      set.status = 400
      return { error: `File harus tetap punya minimal satu tag yang Anda kelola: ${scopeTags.join(', ')}` }
    }
    if (body?.prefix !== undefined) {
      const newPrefix = typeof body.prefix === 'string' ? body.prefix.trim() || null : null
      if (newPrefix && newPrefix !== existing.prefix) {
        const dup = await prisma.projectFile.findFirst({ where: { projectId: project.id, prefix: newPrefix } })
        if (dup) {
          set.status = 400
          return { error: `Prefix "${newPrefix}" sudah dipakai di project ini` }
        }
      }
    }
    const updated = await prisma.projectFile.update({
      where: { id: existing.id },
      data: {
        ...(body?.title !== undefined ? { title: typeof body.title === 'string' ? body.title.trim() : '' } : {}),
        ...(body?.description !== undefined
          ? { description: typeof body.description === 'string' ? body.description.trim() : '' }
          : {}),
        ...(body?.prefix !== undefined
          ? { prefix: typeof body.prefix === 'string' ? body.prefix.trim() || null : null }
          : {}),
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
    const { role: access, scopeTags } = await getSectionAccessWithScope(authResult.userId, authResult.role, params.slug, 'FILES')
    if (!access || access === 'VIEWER') return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const existing = await prisma.projectFile.findUnique({ where: { id: params.id } })
    // Item di luar tag-scope = tak terlihat → 404.
    if (!existing || existing.projectId !== project.id || !canAccessItem(existing.tags, scopeTags)) {
      set.status = 404
      return { error: 'File tidak ditemukan' }
    }
    if (access === 'EDITOR' && existing.authorId !== authResult.userId) return forbidden(set)
    await prisma.projectFile.delete({ where: { id: existing.id } })
    await invalidateCache(cacheKeys.projectFiles(params.slug))
    return { ok: true }
  })
