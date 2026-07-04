import { Elysia } from 'elysia'
import { getProjectAccess } from '../../lib/access'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'
import { isMinioEnabled } from '../../lib/minio'
import { buildMinioKey, minioCopy, minioDelete, sanitizePath } from '../../lib/storage-service'

export const storageMoveRouter = new Elysia()

  // ─── Batch move (EDITOR+) ─────────────────────────────────────────────────
  .patch('/api/envman/projects/:slug/storage/move', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || (access !== 'EDITOR' && access !== 'OWNER')) {
      set.status = 403; return { error: 'EDITOR atau OWNER required' }
    }
    if (!isMinioEnabled()) { set.status = 503; return { error: 'Storage tidak dikonfigurasi' } }

    const body = await request.json().catch(() => null) as { paths?: string[]; targetFolder?: string } | null
    if (!body?.paths || !Array.isArray(body.paths) || body.paths.length === 0) {
      set.status = 400; return { error: 'Field "paths" wajib ada dan tidak boleh kosong' }
    }

    const rawTarget = (body.targetFolder ?? '').trim().replace(/^\/+|\/+$/g, '')
    // Validasi format folder tujuan — pakai sanitizePath dengan dummy filename
    if (rawTarget && !sanitizePath(`${rawTarget}/x`)) {
      set.status = 400; return { error: 'Target folder tidak valid' }
    }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    const errors: string[] = []
    let moved = 0

    for (const oldPath of body.paths) {
      const filename = oldPath.split('/').pop() ?? oldPath
      const newPath = rawTarget ? `${rawTarget}/${filename}` : filename

      if (oldPath === newPath) continue // sudah di folder tujuan

      const conflict = await prisma.projectStorageObject.findUnique({
        where: { projectId_path: { projectId: project.id, path: newPath } },
        select: { id: true },
      })
      if (conflict) { errors.push(`${filename}: sudah ada di folder tujuan`); continue }

      const obj = await prisma.projectStorageObject.findUnique({
        where: { projectId_path: { projectId: project.id, path: oldPath } },
      })
      if (!obj) { errors.push(`${oldPath}: tidak ditemukan`); continue }

      const newMinioKey = buildMinioKey(project.id, newPath)
      try {
        await minioCopy(obj.minioKey, newMinioKey, obj.mimeType)
        try {
          await prisma.projectStorageObject.update({
            where: { id: obj.id },
            data: { path: newPath, minioKey: newMinioKey },
          })
          await minioDelete(obj.minioKey)
          moved++
        } catch (e) {
          // Rollback MinIO copy jika DB gagal
          await minioDelete(newMinioKey)
          errors.push(`${filename}: gagal update database`)
        }
      } catch {
        errors.push(`${filename}: gagal copy di storage`)
      }
    }

    return { ok: true, moved, errors }
  })
