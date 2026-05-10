import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireEnvAuth, unauthorized, forbidden } from '../../lib/auth-middleware'
import { getProjectAccess } from '../../lib/access'

export const notesRouter = new Elysia()

      // ─── Project Notes ────────────────────────────────────

      // GET /api/envman/projects/:slug/notes — list notes (VIEWER+)
  .get('/api/envman/projects/:slug/notes', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access) { set.status = 403; return { error: 'Forbidden' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const notes = await prisma.projectNote.findMany({
      where: { projectId: project.id },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true, title: true, body: true, pinned: true, tags: true,
        createdAt: true, updatedAt: true,
        author: { select: { id: true, name: true } },
      },
    })
    return { notes }
      })

      // POST /api/envman/projects/:slug/notes — create note (EDITOR+)
  .post('/api/envman/projects/:slug/notes', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Forbidden' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    const { title, body, tags } = (await request.json()) as { title: string; body: string; tags?: string[] }
    if (!title?.trim()) { set.status = 400; return { error: 'Title wajib diisi' } }
    const note = await prisma.projectNote.create({
      data: { projectId: project.id, authorId: authResult.userId, title: title.trim(), body: body ?? '', tags: tags ?? [] },
      select: { id: true, title: true, body: true, pinned: true, tags: true, createdAt: true, updatedAt: true, author: { select: { id: true, name: true } } },
    })
    return { note }
      })

      // PUT /api/envman/projects/:slug/notes/:id — update note (author atau OWNER)
  .put('/api/envman/projects/:slug/notes/:id', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Forbidden' } }
    const note = await prisma.projectNote.findUnique({ where: { id: params.id } })
    if (!note) { set.status = 404; return { error: 'Note tidak ditemukan' } }
    // EDITOR hanya bisa edit note sendiri; OWNER bisa edit semua
    if (access === 'EDITOR' && note.authorId !== authResult.userId) { set.status = 403; return { error: 'Hanya author atau Owner yang bisa mengedit' } }
    const { title, body, pinned, tags } = (await request.json()) as { title?: string; body?: string; pinned?: boolean; tags?: string[] }
    const updated = await prisma.projectNote.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(pinned !== undefined ? { pinned } : {}),
        ...(tags !== undefined ? { tags } : {}),
      },
      select: { id: true, title: true, body: true, pinned: true, tags: true, createdAt: true, updatedAt: true, author: { select: { id: true, name: true } } },
    })
    return { note: updated }
      })

      // DELETE /api/envman/projects/:slug/notes/:id — delete (author atau OWNER)
  .delete('/api/envman/projects/:slug/notes/:id', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getProjectAccess(authResult.userId, authResult.role, params.slug)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Forbidden' } }
    const note = await prisma.projectNote.findUnique({ where: { id: params.id } })
    if (!note) { set.status = 404; return { error: 'Note tidak ditemukan' } }
    if (access === 'EDITOR' && note.authorId !== authResult.userId) { set.status = 403; return { error: 'Hanya author atau Owner yang bisa menghapus' } }
    await prisma.projectNote.delete({ where: { id: params.id } })
    return { ok: true }
      })
