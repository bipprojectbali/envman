import { Elysia } from 'elysia'
import { getProjectAccess } from '../../lib/access'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { notDeleted } from '../../lib/db-helpers'
import { isMinioEnabled } from '../../lib/minio'
import { prisma } from '../../lib/db'
import {
  MULTIPART_CHUNK_SIZE,
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  uploadPart,
} from '../../lib/s3-multipart'
import {
  buildMinioKey,
  getMaxFileSizeBytesForProject,
  getQuotaBytes,
  getUsedBytes,
  sanitizePath,
} from '../../lib/storage-service'

export const storageMultipartRouter = new Elysia()

  // ── 1. Init ───────────────────────────────────────────────────────────────
  // Validasi auth + quota, buat sesi multipart di MinIO, kembalikan uploadId.
  .post('/api/envman/projects/:slug/storage/multipart/init', async ({ request, params, body, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Akses ditolak (butuh EDITOR atau OWNER)' } }
    if (!isMinioEnabled()) { set.status = 503; return { error: 'Storage tidak dikonfigurasi' } }

    const { path: rawPath, size, mimeType } = (body ?? {}) as { path?: string; size?: number; mimeType?: string }
    const path = sanitizePath(rawPath ?? '')
    if (!path) { set.status = 400; return { error: 'Path tidak valid' } }
    if (typeof size !== 'number' || size <= 0) { set.status = 400; return { error: 'Size harus number > 0' } }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true, storageQuotaMb: true, storageMaxFileMb: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    const maxFileBytes = await getMaxFileSizeBytesForProject(project.storageMaxFileMb)
    if (size > maxFileBytes) {
      set.status = 413
      return { error: `File terlalu besar (maks ${Math.round(maxFileBytes / 1024 / 1024)} MB)` }
    }

    const [usedBytes, quotaBytes] = await Promise.all([
      getUsedBytes(project.id),
      getQuotaBytes(project.storageQuotaMb),
    ])
    if (usedBytes + size > quotaBytes) {
      set.status = 413; return { error: 'Kuota storage project habis' }
    }

    const minioKey = buildMinioKey(project.id, path)
    try {
      const uploadId = await createMultipartUpload(minioKey, mimeType ?? 'application/octet-stream')
      const totalParts = Math.ceil(size / MULTIPART_CHUNK_SIZE)
      return { uploadId, minioKey, path, chunkSize: MULTIPART_CHUNK_SIZE, totalParts }
    } catch (e) {
      set.status = 502
      return { error: `Gagal inisiasi multipart: ${(e as Error).message}` }
    }
  })

  // ── 2. Part ───────────────────────────────────────────────────────────────
  // Terima chunk dari client, forward ke MinIO sebagai S3 UploadPart.
  .post('/api/envman/projects/:slug/storage/multipart/part', async ({ request, params, query, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Akses ditolak' } }
    if (!isMinioEnabled()) { set.status = 503; return { error: 'Storage tidak dikonfigurasi' } }

    const uploadId = (query as Record<string, string>).uploadId ?? ''
    const partNumber = parseInt((query as Record<string, string>).partNumber ?? '0')
    const minioKey = (query as Record<string, string>).minioKey ?? ''
    if (!uploadId || !minioKey || partNumber < 1 || partNumber > 10000) {
      set.status = 400; return { error: 'uploadId, minioKey, dan partNumber (1–10000) wajib ada' }
    }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    if (!minioKey.startsWith(`${project.id}/`)) {
      set.status = 400; return { error: 'minioKey tidak valid untuk project ini' }
    }

    let chunk: Uint8Array
    try {
      chunk = new Uint8Array(await request.arrayBuffer())
    } catch {
      set.status = 400; return { error: 'Gagal baca body chunk' }
    }
    if (chunk.byteLength === 0) { set.status = 400; return { error: 'Chunk kosong' } }
    // Guard: tiap chunk maks 100 MB (double dari MULTIPART_CHUNK_SIZE sebagai safety margin)
    if (chunk.byteLength > 100 * 1024 * 1024) {
      set.status = 413; return { error: 'Chunk terlalu besar (maks 100 MB per part)' }
    }

    try {
      const etag = await uploadPart(minioKey, uploadId, partNumber, chunk)
      return { etag }
    } catch (e) {
      set.status = 502
      return { error: `Gagal upload part ${partNumber}: ${(e as Error).message}` }
    }
  })

  // ── 3. Complete ───────────────────────────────────────────────────────────
  // Selesaikan multipart, daftarkan object ke DB.
  .post('/api/envman/projects/:slug/storage/multipart/complete', async ({ request, params, body, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Akses ditolak' } }
    if (!isMinioEnabled()) { set.status = 503; return { error: 'Storage tidak dikonfigurasi' } }

    const { path: rawPath, uploadId, minioKey, parts, size, mimeType, description, tags } = (body ?? {}) as {
      path?: string; uploadId?: string; minioKey?: string
      parts?: { partNumber: number; etag: string }[]
      size?: number; mimeType?: string; description?: string; tags?: string[]
    }
    const path = sanitizePath(rawPath ?? '')
    if (!path || !uploadId || !minioKey || !Array.isArray(parts) || parts.length === 0) {
      set.status = 400; return { error: 'path, uploadId, minioKey, dan parts wajib ada' }
    }
    if (typeof size !== 'number' || size <= 0) { set.status = 400; return { error: 'Size tidak valid' } }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    if (!minioKey.startsWith(`${project.id}/`)) {
      set.status = 400; return { error: 'minioKey tidak valid untuk project ini' }
    }

    try {
      await completeMultipartUpload(minioKey, uploadId, parts)
    } catch (e) {
      set.status = 502
      return { error: `Gagal complete multipart: ${(e as Error).message}` }
    }

    const object = await prisma.projectStorageObject.upsert({
      where: { projectId_path: { projectId: project.id, path } },
      create: {
        projectId: project.id, path, minioKey, size,
        mimeType: mimeType ?? 'application/octet-stream',
        isPublic: false,
        description: description ?? null,
        tags: tags ?? [],
        uploadedById: auth.userId,
      },
      update: {
        minioKey, size,
        mimeType: mimeType ?? 'application/octet-stream',
        description: description ?? null,
        tags: tags ?? [],
        uploadedById: auth.userId,
      },
      select: { id: true, path: true, size: true, mimeType: true, isPublic: true, tags: true, description: true },
    })

    return { ok: true, object }
  })

  // ── 4. Abort ──────────────────────────────────────────────────────────────
  // Batalkan multipart — bersihkan part yang sudah terupload di MinIO.
  .delete('/api/envman/projects/:slug/storage/multipart/abort', async ({ request, params, body, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Akses ditolak' } }

    const { uploadId, minioKey } = (body ?? {}) as { uploadId?: string; minioKey?: string }
    if (!uploadId || !minioKey) { set.status = 400; return { error: 'uploadId dan minioKey wajib ada' } }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }
    if (!minioKey.startsWith(`${project.id}/`)) {
      set.status = 400; return { error: 'minioKey tidak valid untuk project ini' }
    }

    await abortMultipartUpload(minioKey, uploadId)
    return { ok: true }
  })
