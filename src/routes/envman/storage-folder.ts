import { Elysia } from 'elysia'
import { getSectionAccessWithScope, tagScopeWhere } from '../../lib/access'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { notDeleted } from '../../lib/db-helpers'
import { prisma } from '../../lib/db'
import { isMinioEnabled } from '../../lib/minio'
import { minioDelete } from '../../lib/storage-service'

export const storageFolderRouter = new Elysia()

  // ─── Delete folder (OWNER) ────────────────────────────────────────────────
  // Hapus semua file di bawah prefix. Operasi ini tidak bisa dibatalkan.
  .delete('/api/envman/projects/:slug/storage/folder', async ({ request, params, query, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    // OWNER only. Section-role OWNER pun bisa dibatasi scopeTags lewat matrix,
    // jadi guard tag: OWNER ber-scope hanya boleh menghapus file dalam scope-nya.
    // Project-OWNER (inherit) selalu scope kosong → menghapus seluruh folder.
    const { role: access, scopeTags } = await getSectionAccessWithScope(auth.userId, auth.role, params.slug, 'STORAGE')
    if (!access || access !== 'OWNER') { set.status = 403; return { error: 'OWNER required untuk hapus folder' } }
    if (!isMinioEnabled()) { set.status = 503; return { error: 'Storage tidak dikonfigurasi' } }

    const rawPrefix = ((query.prefix as string | undefined) ?? '').replace(/^\/+|\/+$/g, '')
    if (!rawPrefix) { set.status = 400; return { error: 'Query param "prefix" wajib ada' } }
    if (rawPrefix.includes('..')) { set.status = 400; return { error: 'Path tidak valid' } }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    // tagScopeWhere hanya menghapus file yang boleh dilihat caller (scope kosong = semua).
    const scopeWhere = tagScopeWhere(scopeTags)
    const objects = await prisma.projectStorageObject.findMany({
      where: { projectId: project.id, path: { startsWith: rawPrefix + '/' }, ...scopeWhere },
      select: { id: true, minioKey: true },
    })
    if (objects.length === 0) { set.status = 404; return { error: 'Folder tidak ditemukan atau kosong' } }

    await Promise.allSettled(objects.map((o) => minioDelete(o.minioKey)))
    const { count } = await prisma.projectStorageObject.deleteMany({
      where: { id: { in: objects.map((o) => o.id) } },
    })
    return { ok: true, deleted: count }
  })
