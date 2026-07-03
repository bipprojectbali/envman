import { Elysia } from 'elysia'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { checkBucketExists, ensureBucket } from '../../lib/minio-bucket'

export const adminStorageRouter = new Elysia()

  .get('/api/admin/storage/status', async ({ request, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    if (auth.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Forbidden' } }

    const check = await checkBucketExists()
    return {
      configured: check.status !== 'not_configured',
      bucketExists: check.status === 'exists',
      status: check.status,
      detail: check.detail,
      bucket: process.env.MINIO_BUCKET ?? null,
      endpoint: process.env.MINIO_ENDPOINT ?? null,
    }
  })

  .post('/api/admin/storage/ensure-bucket', async ({ request, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) return unauthorized(set)
    if (auth.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Forbidden' } }

    const result = await ensureBucket()
    if (result.notConfigured) { set.status = 503; return { error: 'MinIO belum dikonfigurasi (MINIO_* env vars)' } }
    if (result.error) { set.status = 502; return { error: result.error } }
    return { ok: true, created: result.created, alreadyExisted: result.alreadyExisted }
  })
