import { Elysia } from 'elysia'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { conditional, notModifiedResponse, strongEtag, weakEtag } from '../../lib/http-cache'
import { hasCapability } from '../../lib/permissions'

// A gist title collides on (userId, title) — surfaced as a clean 409 to the CLI
// (`envman gists push`) instead of a raw Prisma 500.
function isUniqueTitleError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

export const gistsRouter = new Elysia()

  // ─── Gists ────────────────────────────────────────────

  // GET /api/envman/gists — list (milik sendiri + public milik user lain)
  .get('/api/envman/gists', async ({ request, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const limit = Math.min(Number(query.limit) || 20, 100)
    const cursor = query.cursor as string | undefined
    const search = (query.search as string | undefined)?.trim().toLowerCase()
    const tags = (query.tags as string | undefined)?.split(',').filter(Boolean) ?? []
    const sort = query.sort === 'created' ? 'createdAt' : 'updatedAt'
    // Additive search/tag filter (mirrors GET /api/public/gists) so the CLI can
    // `find` across private gists too. Matches title OR description.
    const match = (g: { title: string; description: string; tags: string[] }) => {
      if (search && !g.title.toLowerCase().includes(search) && !g.description.toLowerCase().includes(search)) {
        return false
      }
      if (tags.length > 0 && !tags.some((t) => g.tags.includes(t))) return false
      return true
    }
    const [mine, publicOthers] = await Promise.all([
      prisma.gist.findMany({
        where: { userId: caller.userId },
        orderBy: [{ [sort]: 'desc' }],
        include: { user: { select: { id: true, name: true } } },
      }),
      prisma.gist.findMany({
        where: { isPublic: true, NOT: { userId: caller.userId } },
        orderBy: [{ [sort]: 'desc' }],
        include: { user: { select: { id: true, name: true } } },
      }),
    ])
    const all = [...mine, ...publicOthers].filter(match).sort((a, b) => b[sort].getTime() - a[sort].getTime())
    const startIdx = cursor ? all.findIndex((g) => g.id === cursor) + 1 : 0
    const page = all.slice(startIdx, startIdx + limit)
    const nextCursor = page.length === limit ? page[page.length - 1]?.id : undefined
    return { gists: page, nextCursor, total: all.length }
  })

  // POST /api/envman/gists — create
  .post('/api/envman/gists', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!caller.canWrite) {
      set.status = 403
      return { error: 'Token is read-only' }
    }
    if (!hasCapability(caller, 'gist:create')) {
      set.status = 403
      return { error: 'Tidak punya izin create gist.' }
    }
    const { title, description, files, isPublic, tags } = (await request.json()) as {
      title: string
      description?: string
      files: { filename: string; content: string; language: string }[]
      isPublic?: boolean
      tags?: string[]
    }
    if (!title?.trim()) {
      set.status = 400
      return { error: 'Title wajib diisi' }
    }
    if (!files?.length) {
      set.status = 400
      return { error: 'Minimal satu file' }
    }
    try {
      const gist = await prisma.gist.create({
        data: {
          userId: caller.userId,
          title: title.trim(),
          description: description ?? '',
          files,
          isPublic: isPublic ?? false,
          tags: tags ?? [],
        },
        include: { user: { select: { id: true, name: true } } },
      })
      return { gist }
    } catch (e) {
      if (isUniqueTitleError(e)) {
        set.status = 409
        return { error: 'Gist dengan judul ini sudah ada' }
      }
      throw e
    }
  })

  // PUT /api/envman/gists/:id — update (owner atau SUPER_ADMIN)
  .put('/api/envman/gists/:id', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const gist = await prisma.gist.findUnique({ where: { id: params.id } })
    if (!gist) {
      set.status = 404
      return { error: 'Gist tidak ditemukan' }
    }
    if (gist.userId !== caller.userId && caller.role !== 'SUPER_ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }
    if (!caller.canWrite) {
      set.status = 403
      return { error: 'Token is read-only' }
    }
    const { title, description, files, isPublic, tags } = (await request.json()) as {
      title?: string
      description?: string
      files?: { filename: string; content: string; language: string }[]
      isPublic?: boolean
      tags?: string[]
    }
    try {
      const updated = await prisma.gist.update({
        where: { id: params.id },
        data: {
          ...(title !== undefined ? { title: title.trim() } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(files !== undefined ? { files } : {}),
          ...(isPublic !== undefined ? { isPublic } : {}),
          ...(tags !== undefined ? { tags } : {}),
        },
        include: { user: { select: { id: true, name: true } } },
      })
      return { gist: updated }
    } catch (e) {
      if (isUniqueTitleError(e)) {
        set.status = 409
        return { error: 'Gist dengan judul ini sudah ada' }
      }
      throw e
    }
  })

  // DELETE /api/envman/gists/:id — delete (owner atau SUPER_ADMIN)
  .delete('/api/envman/gists/:id', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const gist = await prisma.gist.findUnique({ where: { id: params.id } })
    if (!gist) {
      set.status = 404
      return { error: 'Gist tidak ditemukan' }
    }
    if (gist.userId !== caller.userId && caller.role !== 'SUPER_ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }
    if (!caller.canWrite) {
      set.status = 403
      return { error: 'Token is read-only' }
    }
    await prisma.gist.delete({ where: { id: params.id } })
    return { ok: true }
  })

  // GET /api/envman/gists/:id/raw/:filename — raw file content (auth required, owner atau public)
  .get('/api/envman/gists/:id/raw/:filename', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return new Response('Unauthorized', { status: 401 })
    }
    const gist = await prisma.gist.findUnique({ where: { id: params.id } })
    if (!gist) {
      set.status = 404
      return new Response('Not found', { status: 404 })
    }
    if (!gist.isPublic && gist.userId !== caller.userId && caller.role !== 'SUPER_ADMIN') {
      set.status = 403
      return new Response('Forbidden', { status: 403 })
    }
    const files = gist.files as { filename: string; content: string; language: string }[]
    const file = files.find((f) => f.filename === params.filename)
    if (!file) {
      set.status = 404
      return new Response('File tidak ditemukan', { status: 404 })
    }
    const { notModified, headers } = conditional(request, {
      etag: strongEtag(file.content),
      lastModified: gist.updatedAt,
    })
    if (notModified) return notModifiedResponse(headers)
    return new Response(file.content, { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } })
  })

  // ─── Public Gists (no auth) ───────────────────────────

  // GET /api/public/gists — list semua public gist
  .get('/api/public/gists', async ({ query }) => {
    const limit = Math.min(Number(query.limit) || 20, 100)
    const cursor = query.cursor as string | undefined
    const search = (query.search as string | undefined)?.trim().toLowerCase()
    const tags = (query.tags as string | undefined)?.split(',').filter(Boolean) ?? []
    const sort = query.sort === 'created' ? 'createdAt' : 'updatedAt'

    const where = {
      isPublic: true,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(tags.length > 0 ? { tags: { hasSome: tags } } : {}),
    }

    const gists = await prisma.gist.findMany({
      where,
      orderBy: [{ [sort]: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: { id: true, name: true } } },
    })

    const hasMore = gists.length > limit
    const page = hasMore ? gists.slice(0, limit) : gists
    return { gists: page, nextCursor: hasMore ? page[page.length - 1]?.id : undefined }
  })

  // GET /api/public/gists/:id — single public gist
  .get('/api/public/gists/:id', async ({ request, params, set }) => {
    const gist = await prisma.gist.findUnique({
      where: { id: params.id },
      include: { user: { select: { id: true, name: true } } },
    })
    if (!gist) {
      set.status = 404
      return { error: 'Gist tidak ditemukan' }
    }
    if (!gist.isPublic) {
      set.status = 403
      return { error: 'Gist ini bersifat private' }
    }
    const { notModified, headers } = conditional(request, {
      etag: weakEtag(`${gist.id}:${gist.updatedAt.toISOString()}`),
      lastModified: gist.updatedAt,
    })
    if (notModified) return notModifiedResponse(headers)
    return new Response(JSON.stringify({ gist }), {
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    })
  })

  // GET /api/public/gists/:id/raw/:filename — raw file content (plaintext)
  .get('/api/public/gists/:id/raw/:filename', async ({ request, params, set }) => {
    const gist = await prisma.gist.findUnique({ where: { id: params.id } })
    if (!gist) {
      set.status = 404
      return new Response('Not found', { status: 404 })
    }
    if (!gist.isPublic) {
      set.status = 403
      return new Response('Forbidden', { status: 403 })
    }
    const files = gist.files as { filename: string; content: string; language: string }[]
    const file = files.find((f) => f.filename === params.filename)
    if (!file) {
      set.status = 404
      return new Response('File tidak ditemukan', { status: 404 })
    }
    const { notModified, headers } = conditional(request, {
      etag: strongEtag(file.content),
      lastModified: gist.updatedAt,
    })
    if (notModified) return notModifiedResponse(headers)
    return new Response(file.content, { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } })
  })
