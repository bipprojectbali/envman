import { Elysia } from 'elysia'
import { getProjectAccess } from '../../lib/access'
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
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access) return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const files = await withCache(cacheKeys.projectFiles(params.slug), 60, () =>
      prisma.projectFile.findMany({
        where: { projectId: project.id },
        orderBy: { updatedAt: 'desc' },
        select: fileSelect,
      }),
    )
    return { files }
  })

  // GET /api/envman/projects/:slug/files/resolve — resolve file by prefix for CLI
  .get('/api/envman/projects/:slug/files/resolve', async ({ request, params, set, query }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access) return forbidden(set)
    const prefix = (query.prefix as string | undefined)?.trim()
    const filename = (query.filename as string | undefined)?.trim()
    if (!prefix) {
      set.status = 400
      return { error: 'prefix wajib diisi' }
    }
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const entry = await prisma.projectFile.findFirst({ where: { projectId: project.id, prefix } })
    if (!entry) {
      set.status = 404
      return { error: `File dengan prefix "${prefix}" tidak ditemukan di project ${params.slug}` }
    }
    const fileList = entry.files as unknown as FileEntry[]
    let resolved: FileEntry | undefined
    if (filename) {
      resolved = fileList.find((f) => f.filename === filename)
      if (!resolved) {
        set.status = 404
        return { error: `Filename "${filename}" tidak ditemukan di entry "${entry.title}"` }
      }
    } else {
      if (fileList.length > 1) {
        set.status = 400
        return {
          error: `Entry "${entry.title}" punya ${fileList.length} file. Tentukan filename: files:${prefix}/<filename>. Files: ${fileList.map((f) => f.filename).join(', ')}`,
        }
      }
      resolved = fileList[0]
    }
    return {
      content: resolved.content,
      filename: resolved.filename,
      language: resolved.language,
      entryTitle: entry.title,
    }
  })

  // POST /api/envman/projects/:slug/files — create file (EDITOR+)
  .post('/api/envman/projects/:slug/files', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
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
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access || access === 'VIEWER') return forbidden(set)
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const existing = await prisma.projectFile.findUnique({ where: { id: params.id } })
    if (!existing || existing.projectId !== project.id) {
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
        ...(body?.description !== undefined ? { description: typeof body.description === 'string' ? body.description.trim() : '' } : {}),
        ...(body?.prefix !== undefined ? { prefix: typeof body.prefix === 'string' ? body.prefix.trim() || null : null } : {}),
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
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const existing = await prisma.projectFile.findUnique({ where: { id: params.id } })
    if (!existing || existing.projectId !== project.id) {
      set.status = 404
      return { error: 'File tidak ditemukan' }
    }
    if (access === 'EDITOR' && existing.authorId !== authResult.userId) return forbidden(set)
    await prisma.projectFile.delete({ where: { id: existing.id } })
    await invalidateCache(cacheKeys.projectFiles(params.slug))
    return { ok: true }
  })
