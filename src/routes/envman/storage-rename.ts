import { Elysia } from 'elysia'
import { getSectionAccess } from '../../lib/access'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'
import { isMinioEnabled } from '../../lib/minio'
import { buildMinioKey, minioCopy, minioDelete, sanitizePath } from '../../lib/storage-service'

export const storageRenameRouter = new Elysia()

  .patch('/api/envman/projects/:slug/storage/rename', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    const access = await getSectionAccess(auth.userId, auth.role, params.slug, 'STORAGE')
    if (!access || (access !== 'EDITOR' && access !== 'OWNER')) {
      set.status = 403; return { error: 'EDITOR atau OWNER required' }
    }
    if (!isMinioEnabled()) { set.status = 503; return { error: 'Storage tidak dikonfigurasi' } }

    const body = await request.json().catch(() => null) as { oldPath?: string; newName?: string } | null
    if (!body?.oldPath || !body?.newName) {
      set.status = 400; return { error: 'Field "oldPath" dan "newName" wajib ada' }
    }

    // newPath = folder dari oldPath + newName (rename, bukan move)
    const folder = body.oldPath.includes('/') ? body.oldPath.split('/').slice(0, -1).join('/') : ''
    const rawNewPath = folder ? `${folder}/${body.newName}` : body.newName
    const newPath = sanitizePath(rawNewPath)
    if (!newPath) { set.status = 400; return { error: 'Nama file tidak valid' } }
    if (newPath === body.oldPath) { set.status = 400; return { error: 'Nama sama dengan sebelumnya' } }

    const project = await prisma.project.findFirst({
      where: { slug: params.slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    const obj = await prisma.projectStorageObject.findUnique({
      where: { projectId_path: { projectId: project.id, path: body.oldPath } },
    })
    if (!obj) { set.status = 404; return { error: 'File tidak ditemukan' } }

    const conflict = await prisma.projectStorageObject.findUnique({
      where: { projectId_path: { projectId: project.id, path: newPath } },
      select: { id: true },
    })
    if (conflict) { set.status = 409; return { error: `File "${newPath}" sudah ada` } }

    const newMinioKey = buildMinioKey(project.id, newPath)
    await minioCopy(obj.minioKey, newMinioKey, obj.mimeType)

    try {
      const updated = await prisma.projectStorageObject.update({
        where: { id: obj.id },
        data: { path: newPath, minioKey: newMinioKey },
        select: { id: true, path: true, size: true, mimeType: true, isPublic: true, tags: true, description: true, updatedAt: true },
      })
      await minioDelete(obj.minioKey)
      return { ok: true, object: updated }
    } catch (e) {
      // DB gagal → hapus MinIO copy agar tidak ada orphan
      await minioDelete(newMinioKey)
      throw new Error(`Gagal rename di database: ${(e as Error).message}`)
    }
  })
