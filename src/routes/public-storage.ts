import { Elysia } from 'elysia'
import { prisma } from '../lib/db'
import { notDeleted } from '../lib/db-helpers'
import { isMinioEnabled } from '../lib/minio'
import { minioPresign } from '../lib/storage-service'

// Public storage: tidak perlu auth, tapi isPublic harus true & project aktif.
export const publicStorageRouter = new Elysia()

  .get('/api/public/storage/:slug/:path', async ({ params, set }) => {
    if (!isMinioEnabled()) { set.status = 503; return { error: 'Storage tidak dikonfigurasi' } }

    const { slug, path } = params
    if (!path) { set.status = 400; return { error: 'Path wajib ada' } }

    const project = await prisma.project.findFirst({
      where: { slug, ...notDeleted },
      select: { id: true },
    })
    if (!project) { set.status = 404; return { error: 'Project tidak ditemukan' } }

    const obj = await prisma.projectStorageObject.findUnique({
      where: { projectId_path: { projectId: project.id, path } },
      select: { minioKey: true, isPublic: true, path: true },
    })
    if (!obj || !obj.isPublic) {
      // Kembalikan 404 untuk keduanya agar tidak bocorkan eksistensi file private
      set.status = 404
      return { error: 'File tidak ditemukan atau tidak publik' }
    }

    const filename = obj.path.split('/').pop() ?? obj.path
    const url = minioPresign(obj.minioKey, filename, true)

    // Redirect ke presigned URL — browser/CLI stream langsung dari MinIO
    set.status = 302
    set.headers = { Location: url }
    return null
  })
