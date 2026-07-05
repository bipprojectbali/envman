import { Elysia } from 'elysia'
import { getProjectAccess } from '../../lib/access'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'
import {
  buildMinioKey,
  getMaxFileSizeBytesForProject,
  getQuotaBytes,
  getUsedBytes,
  minioDelete,
  minioUpload,
  sanitizePath,
} from '../../lib/storage-service'
import { isMinioEnabled } from '../../lib/minio'

export const storageUploadRouter = new Elysia()

  .post('/api/envman/projects/:slug/storage/upload', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)

    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || (access !== 'EDITOR' && access !== 'OWNER')) {
      set.status = 403
      return { error: 'EDITOR atau OWNER required untuk upload' }
    }

    if (!isMinioEnabled()) {
      set.status = 503
      return { error: 'Storage belum dikonfigurasi (MINIO_* env vars tidak lengkap)' }
    }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true, storageQuotaMb: true, storageMaxFileMb: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    let formData: FormData
    try { formData = await request.formData() }
    catch { set.status = 400; return { error: 'Body harus multipart/form-data' } }

    const file = formData.get('file') as File | null
    const rawPath = formData.get('path') as string | null
    const description = (formData.get('description') as string | null) ?? undefined
    const rawTags = formData.get('tags') as string | null
    const tags = rawTags ? rawTags.split(',').map((t) => t.trim()).filter(Boolean) : []

    if (!file || !rawPath) {
      set.status = 400; return { error: 'Field "file" dan "path" wajib ada' }
    }

    const path = sanitizePath(rawPath)
    if (!path) {
      set.status = 400
      return { error: 'Path tidak valid (jangan gunakan .., karakter khusus, atau lebih dari 10 level)' }
    }

    // Validasi ukuran file sebelum baca ke memory
    const maxBytes = await getMaxFileSizeBytesForProject(project.storageMaxFileMb)
    if (file.size > maxBytes) {
      set.status = 413
      return { error: `Ukuran file melebihi batas ${Math.round(maxBytes / 1024 / 1024)} MB` }
    }

    // Cek quota (fresh dari DB, bukan cache — cegah race condition)
    const [usedBytes, quotaBytes] = await Promise.all([
      getUsedBytes(project.id),
      getQuotaBytes(project.storageQuotaMb),
    ])
    if (usedBytes + file.size > quotaBytes) {
      set.status = 413
      return {
        error: `Quota project penuh (${Math.round(usedBytes / 1024 / 1024)}MB / ${Math.round(quotaBytes / 1024 / 1024)}MB)`,
      }
    }

    const minioKey = buildMinioKey(project.id, path)
    const mimeType = file.type || 'application/octet-stream'

    // Upload ke MinIO dulu, baru upsert DB
    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      await minioUpload(minioKey, buffer, mimeType)
    } catch (e) {
      set.status = 502
      return { error: `Gagal upload ke storage: ${(e as Error).message ?? e}` }
    }

    let obj: { id: string; path: string; size: number; mimeType: string; isPublic: boolean; tags: string[]; description: string | null; createdAt: Date; updatedAt: Date }
    try {
      obj = await prisma.projectStorageObject.upsert({
        where: { projectId_path: { projectId: project.id, path } },
        create: {
          projectId: project.id,
          path,
          minioKey,
          size: file.size,
          mimeType,
          tags,
          description,
          uploadedById: auth.userId,
        },
        update: {
          minioKey,
          size: file.size,
          mimeType,
          tags,
          description,
          uploadedById: auth.userId,
        },
        select: { id: true, path: true, size: true, mimeType: true, isPublic: true, tags: true, description: true, createdAt: true, updatedAt: true },
      })
    } catch (e) {
      // DB gagal → hapus dari MinIO agar tidak ada orphan
      await minioDelete(minioKey)
      throw new Error(`Gagal simpan metadata storage: ${(e as Error).message}`)
    }

    return { ok: true, object: obj }
  })
