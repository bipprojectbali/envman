import { Elysia } from 'elysia'
import { canAccessItem, getSectionAccess, getSectionAccessWithScope, tagScopeWhere } from '../../lib/access'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { isMinioEnabled } from '../../lib/minio'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'
import { getUsedBytes, getQuotaBytes, minioDelete, minioPresign } from '../../lib/storage-service'

export const storageCoreRouter = new Elysia()

  // ─── List (dengan prefix untuk tree navigation + pagination) ──────────────
  .get('/api/envman/projects/:slug/storage', async ({ request, params, query, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    const { role: access, scopeTags } = await getSectionAccessWithScope(auth.userId, auth.role, params.slug, 'STORAGE')
    if (!access) { set.status = 403; return { error: 'Akses ditolak' } }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true, storageQuotaMb: true, storageMaxFileMb: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    const prefix = ((query.prefix as string | undefined) ?? '').replace(/^\/+/, '')
    const page = Math.max(1, parseInt((query.page as string | undefined) ?? '1') || 1)
    const PAGE_SIZE = 50

    // Query 1: path (+tags untuk scope) — ringan, untuk deteksi folder + enumerate
    // file di level ini. Filter tag-scope WAJIB di sini agar folder & totalFiles
    // hanya menghitung objek yang boleh dilihat caller.
    const allPaths = await prisma.projectStorageObject.findMany({
      where: { projectId: project.id, path: prefix ? { startsWith: prefix + '/' } : undefined, ...tagScopeWhere(scopeTags) },
      orderBy: { path: 'asc' },
      select: { path: true },
    })

    const folders = new Set<string>()
    const filePathsAtLevel: string[] = []
    for (const { path } of allPaths) {
      const relative = prefix ? path.slice(prefix.length + 1) : path
      const parts = relative.split('/')
      if (parts.length > 1) folders.add(parts[0])
      else filePathsAtLevel.push(path)
    }

    // Query 2: data lengkap hanya untuk file di halaman ini
    const paginatedPaths = filePathsAtLevel.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const files = paginatedPaths.length > 0
      ? await prisma.projectStorageObject.findMany({
          where: { projectId: project.id, path: { in: paginatedPaths } },
          orderBy: { path: 'asc' },
          select: { id: true, path: true, size: true, mimeType: true, isPublic: true, tags: true, description: true, createdAt: true, updatedAt: true },
        })
      : []

    const [usedBytes, quotaBytes] = await Promise.all([
      getUsedBytes(project.id),
      getQuotaBytes(project.storageQuotaMb),
    ])

    return {
      prefix, page, pageSize: PAGE_SIZE,
      totalFiles: filePathsAtLevel.length,
      folders: [...folders].sort(),
      files,
      usage: { usedBytes, quotaBytes },
      limits: { storageMaxFileMb: project.storageMaxFileMb, storageQuotaMb: project.storageQuotaMb },
    }
  })

  // ─── Download presigned URL ───────────────────────────────────────────────
  .get('/api/envman/projects/:slug/storage/download', async ({ request, params, query, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    const { role: access, scopeTags } = await getSectionAccessWithScope(auth.userId, auth.role, params.slug, 'STORAGE')
    if (!access) { set.status = 403; return { error: 'Akses ditolak' } }
    if (!isMinioEnabled()) { set.status = 503; return { error: 'Storage tidak dikonfigurasi' } }

    const path = (query.path as string | undefined) ?? ''
    if (!path) { set.status = 400; return { error: 'Query param "path" wajib ada' } }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    const obj = await prisma.projectStorageObject.findUnique({
      where: { projectId_path: { projectId: project.id, path } },
      select: { minioKey: true, isPublic: true, path: true, size: true, updatedAt: true, tags: true },
    })
    // File di luar tag-scope = tak terlihat → 404.
    if (!obj || !canAccessItem(obj.tags, scopeTags)) { set.status = 404; return { error: 'File tidak ditemukan' } }

    const filename = obj.path.split('/').pop() ?? obj.path
    const url = minioPresign(obj.minioKey, filename, obj.isPublic)
    // size + updatedAt are cache validators for the CLI: `storage exec` reuses a
    // cached binary when both match, avoiding a full re-download of unchanged files.
    return { url, size: obj.size, updatedAt: obj.updatedAt.toISOString() }
  })

  // ─── Update metadata (EDITOR+; isPublic hanya OWNER) ────────────────────
  .patch('/api/envman/projects/:slug/storage/meta', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    const { role: access, scopeTags } = await getSectionAccessWithScope(auth.userId, auth.role, params.slug, 'STORAGE')
    if (!access || (access !== 'EDITOR' && access !== 'OWNER')) {
      set.status = 403; return { error: 'EDITOR atau OWNER required' }
    }

    const body = await request.json().catch(() => null)
    if (!body?.path) { set.status = 400; return { error: 'Field "path" wajib ada' } }

    // Cek permission isPublic sebelum DB lookup
    if (body.isPublic !== undefined && access !== 'OWNER') {
      set.status = 403; return { error: 'Hanya OWNER yang bisa ubah visibilitas file' }
    }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    const obj = await prisma.projectStorageObject.findUnique({
      where: { projectId_path: { projectId: project.id, path: body.path } },
    })
    // File di luar tag-scope = tak terlihat → 404.
    if (!obj || !canAccessItem(obj.tags, scopeTags)) { set.status = 404; return { error: 'File tidak ditemukan' } }

    // Retag yang mengeluarkan file dari scope sendiri ditolak.
    if (body.tags !== undefined && !canAccessItem(body.tags, scopeTags)) {
      set.status = 400; return { error: `File harus tetap punya minimal satu tag yang Anda kelola: ${scopeTags.join(', ')}` }
    }

    const update: Record<string, unknown> = {}
    if (body.description !== undefined) update.description = body.description
    if (body.tags !== undefined) update.tags = body.tags
    if (body.isPublic !== undefined) update.isPublic = body.isPublic

    const updated = await prisma.projectStorageObject.update({
      where: { id: obj.id },
      data: update,
      select: { id: true, path: true, isPublic: true, tags: true, description: true, updatedAt: true },
    })
    return { ok: true, object: updated }
  })

  // ─── Delete (OWNER) ───────────────────────────────────────────────────────
  .delete('/api/envman/projects/:slug/storage', async ({ request, params, query, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    // Delete = OWNER only; OWNER selalu full-access (scope kosong), jadi tak perlu
    // guard tag di sini — role check sudah cukup.
    const access = await getSectionAccess(auth.userId, auth.role, params.slug, 'STORAGE')
    if (!access || access !== 'OWNER') { set.status = 403; return { error: 'OWNER required untuk hapus file' } }
    if (!isMinioEnabled()) { set.status = 503; return { error: 'Storage tidak dikonfigurasi' } }

    const path = (query.path as string | undefined) ?? ''
    if (!path) { set.status = 400; return { error: 'Query param "path" wajib ada' } }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    const obj = await prisma.projectStorageObject.findUnique({
      where: { projectId_path: { projectId: project.id, path } },
      select: { id: true, minioKey: true },
    })
    if (!obj) { set.status = 404; return { error: 'File tidak ditemukan' } }

    // Hapus dari MinIO dulu, baru DB
    await minioDelete(obj.minioKey)
    await prisma.projectStorageObject.delete({ where: { id: obj.id } })
    return { ok: true }
  })
