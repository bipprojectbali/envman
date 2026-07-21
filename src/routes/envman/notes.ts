import { Elysia } from 'elysia'
import { canAccessItem, getSectionAccessWithScope, tagScopeWhere } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { hasCapability } from '../../lib/permissions'

export const notesRouter = new Elysia()

  // ─── Project Notes ────────────────────────────────────

  // GET /api/envman/projects/:slug/notes — list notes (VIEWER+)
  .get('/api/envman/projects/:slug/notes', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const { role: access, scopeTags } = await getSectionAccessWithScope(authResult.userId, authResult.role, params.slug, 'NOTES')
    if (!access) {
      set.status = 403
      return { error: 'Forbidden' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const notes = await prisma.projectNote.findMany({
      where: { projectId: project.id, ...tagScopeWhere(scopeTags) },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        body: true,
        pinned: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true } },
      },
    })
    return { notes }
  })

  // POST /api/envman/projects/:slug/notes — create note (butuh note:create + EDITOR+ project)
  .post('/api/envman/projects/:slug/notes', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(authResult, 'note:create')) {
      set.status = 403
      return { error: 'Tidak punya izin create note. Hubungi SUPER_ADMIN.' }
    }
    const { role: access, scopeTags } = await getSectionAccessWithScope(authResult.userId, authResult.role, params.slug, 'NOTES')
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Forbidden' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const { title, body, tags } = (await request.json()) as { title: string; body: string; tags?: string[] }
    if (!title?.trim()) {
      set.status = 400
      return { error: 'Title wajib diisi' }
    }
    // Limited-by-tag user wajib memberi ≥1 tag scope-nya, kalau tidak note yang
    // ia buat jadi tak terlihat oleh dirinya sendiri.
    if (!canAccessItem(tags ?? [], scopeTags)) {
      set.status = 400
      return { error: `Note harus punya minimal satu tag yang Anda kelola: ${scopeTags.join(', ')}` }
    }
    const note = await prisma.projectNote.create({
      data: {
        projectId: project.id,
        authorId: authResult.userId,
        title: title.trim(),
        body: body ?? '',
        tags: tags ?? [],
      },
      select: {
        id: true,
        title: true,
        body: true,
        pinned: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true } },
      },
    })
    return { note }
  })

  // PUT /api/envman/projects/:slug/notes/:id — update note (author atau OWNER)
  .put('/api/envman/projects/:slug/notes/:id', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const { role: access, scopeTags } = await getSectionAccessWithScope(authResult.userId, authResult.role, params.slug, 'NOTES')
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Forbidden' }
    }
    const note = await prisma.projectNote.findUnique({ where: { id: params.id } })
    // Item di luar tag-scope = tak terlihat → 404 (bukan 403; jangan bocorkan keberadaan).
    if (!note || !canAccessItem(note.tags, scopeTags)) {
      set.status = 404
      return { error: 'Note tidak ditemukan' }
    }
    // EDITOR hanya bisa edit note sendiri; OWNER bisa edit semua
    if (access === 'EDITOR' && note.authorId !== authResult.userId) {
      set.status = 403
      return { error: 'Hanya author atau Owner yang bisa mengedit' }
    }
    const { title, body, pinned, tags } = (await request.json()) as {
      title?: string
      body?: string
      pinned?: boolean
      tags?: string[]
    }
    // Retag yang mengeluarkan note dari scope sendiri ditolak.
    if (tags !== undefined && !canAccessItem(tags, scopeTags)) {
      set.status = 400
      return { error: `Note harus tetap punya minimal satu tag yang Anda kelola: ${scopeTags.join(', ')}` }
    }
    const updated = await prisma.projectNote.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(pinned !== undefined ? { pinned } : {}),
        ...(tags !== undefined ? { tags } : {}),
      },
      select: {
        id: true,
        title: true,
        body: true,
        pinned: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true } },
      },
    })
    return { note: updated }
  })

  // DELETE /api/envman/projects/:slug/notes/:id — delete (author atau OWNER)
  .delete('/api/envman/projects/:slug/notes/:id', async ({ request, params, set }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const { role: access, scopeTags } = await getSectionAccessWithScope(authResult.userId, authResult.role, params.slug, 'NOTES')
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Forbidden' }
    }
    const note = await prisma.projectNote.findUnique({ where: { id: params.id } })
    // Item di luar tag-scope = tak terlihat → 404.
    if (!note || !canAccessItem(note.tags, scopeTags)) {
      set.status = 404
      return { error: 'Note tidak ditemukan' }
    }
    if (access === 'EDITOR' && note.authorId !== authResult.userId) {
      set.status = 403
      return { error: 'Hanya author atau Owner yang bisa menghapus' }
    }
    await prisma.projectNote.delete({ where: { id: params.id } })
    return { ok: true }
  })
