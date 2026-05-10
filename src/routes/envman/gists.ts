import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireAuth, unauthorized, forbidden } from '../../lib/auth-middleware'

export const gistsRouter = new Elysia()

      // ─── Gists ────────────────────────────────────────────

      // GET /api/envman/gists — list (milik sendiri + public milik user lain)
  .get('/api/envman/gists', async ({ request, set }) => {
    const caller = await requireAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const [mine, publicOthers] = await Promise.all([
      prisma.gist.findMany({
        where: { userId: caller.userId },
        orderBy: [{ updatedAt: 'desc' }],
        include: { user: { select: { id: true, name: true } } },
      }),
      prisma.gist.findMany({
        where: { isPublic: true, NOT: { userId: caller.userId } },
        orderBy: [{ updatedAt: 'desc' }],
        include: { user: { select: { id: true, name: true } } },
      }),
    ])
    return { gists: [...mine, ...publicOthers] }
      })

      // POST /api/envman/gists — create
  .post('/api/envman/gists', async ({ request, set }) => {
    const caller = await requireAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const { title, description, files, isPublic, tags } = (await request.json()) as {
      title: string; description?: string; files: { filename: string; content: string; language: string }[]
      isPublic?: boolean; tags?: string[]
    }
    if (!title?.trim()) { set.status = 400; return { error: 'Title wajib diisi' } }
    if (!files?.length) { set.status = 400; return { error: 'Minimal satu file' } }
    const gist = await prisma.gist.create({
      data: { userId: caller.userId, title: title.trim(), description: description ?? '', files, isPublic: isPublic ?? false, tags: tags ?? [] },
      include: { user: { select: { id: true, name: true } } },
    })
    return { gist }
      })

      // PUT /api/envman/gists/:id — update (owner only)
  .put('/api/envman/gists/:id', async ({ request, params, set }) => {
    const caller = await requireAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const gist = await prisma.gist.findUnique({ where: { id: params.id } })
    if (!gist) { set.status = 404; return { error: 'Gist tidak ditemukan' } }
    if (gist.userId !== caller.userId) { set.status = 403; return { error: 'Forbidden' } }
    const { title, description, files, isPublic, tags } = (await request.json()) as {
      title?: string; description?: string; files?: { filename: string; content: string; language: string }[]
      isPublic?: boolean; tags?: string[]
    }
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
      })

      // DELETE /api/envman/gists/:id — delete (owner only)
  .delete('/api/envman/gists/:id', async ({ request, params, set }) => {
    const caller = await requireAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const gist = await prisma.gist.findUnique({ where: { id: params.id } })
    if (!gist) { set.status = 404; return { error: 'Gist tidak ditemukan' } }
    if (gist.userId !== caller.userId) { set.status = 403; return { error: 'Forbidden' } }
    await prisma.gist.delete({ where: { id: params.id } })
    return { ok: true }
      })
