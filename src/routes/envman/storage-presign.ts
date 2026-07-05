import { Elysia } from 'elysia'
import { getProjectAccess } from '../../lib/access'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { isMinioEnabled } from '../../lib/minio'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'
import {
  sanitizePath, getUsedBytes, getQuotaBytes, getMaxFileSizeBytes,
  buildMinioKey, minioPresignPut,
} from '../../lib/storage-service'

export const storagePresignRouter = new Elysia()

  // Issue presigned PUT URL — CLI upload langsung ke MinIO tanpa lewat proxy.
  .post('/api/envman/projects/:slug/storage/presign-upload', async ({ request, params, body, set }) => {
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
      select: { id: true, storageQuotaMb: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    const maxFileBytes = await getMaxFileSizeBytes()
    if (size > maxFileBytes) {
      set.status = 413
      return { error: `File terlalu besar (maks ${Math.round(maxFileBytes / 1024 / 1024)} MB)` }
    }

    const [usedBytes, quotaBytes] = await Promise.all([
      getUsedBytes(project.id),
      getQuotaBytes(project.storageQuotaMb),
    ])
    if (usedBytes + size > quotaBytes) {
      set.status = 413
      return { error: 'Kuota storage project habis' }
    }

    const minioKey = buildMinioKey(project.id, path)
    const uploadUrl = minioPresignPut(minioKey, 3600)
    return { uploadUrl, minioKey, path, projectId: project.id }
  })

  // Konfirmasi setelah CLI selesai PUT ke MinIO — daftarkan ke DB.
  .post('/api/envman/projects/:slug/storage/confirm-upload', async ({ request, params, body, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Akses ditolak' } }
    if (!isMinioEnabled()) { set.status = 503; return { error: 'Storage tidak dikonfigurasi' } }

    const { path: rawPath, minioKey, size, mimeType, description, tags } = (body ?? {}) as {
      path?: string; minioKey?: string; size?: number; mimeType?: string
      description?: string; tags?: string[]
    }
    const path = sanitizePath(rawPath ?? '')
    if (!path || !minioKey) { set.status = 400; return { error: 'path atau minioKey tidak valid' } }
    if (typeof size !== 'number' || size <= 0) { set.status = 400; return { error: 'Size tidak valid' } }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    // Pastikan minioKey milik project ini — cegah injeksi key dari project lain.
    if (!minioKey.startsWith(`${project.id}/`)) {
      set.status = 400; return { error: 'minioKey tidak valid untuk project ini' }
    }

    const object = await prisma.projectStorageObject.upsert({
      where: { projectId_path: { projectId: project.id, path } },
      create: {
        projectId: project.id, path, minioKey,
        size,
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
    })

    return {
      ok: true,
      object: {
        id: object.id, path: object.path,
        size: object.size,
        mimeType: object.mimeType,
        isPublic: object.isPublic,
        tags: object.tags,
        description: object.description,
      },
    }
  })
