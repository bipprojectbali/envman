import { Elysia } from 'elysia'
import { audit } from '../../lib/audit'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { getMinioClient, isMinioEnabled } from '../../lib/minio'
import { getIp } from '../../lib/request'
import { minioDelete, minioPresignPut } from '../../lib/storage-service'
import {
  buildTransferKey,
  generateCode,
  maxFileBytes,
  maxPending,
  pendingCount,
  resolveRecipient,
  resolveTtlMs,
  safeFilename,
} from '../../lib/transfer-service'

// File transfers. Bytes go straight from the CLI to MinIO via a presigned PUT,
// so they never pass through the server's memory the way the text path's JSON
// body does — which is why the file limit can be two orders of magnitude
// larger than the text one.
//
// Flow: presign (creates the row, uploaded=false) -> client PUTs to MinIO ->
// confirm (verifies the object and flips uploaded=true). The row must exist
// first: it is the only record that an object exists, so creating it only at
// confirm would leak objects the sweep could never find.

export const transfersFileRouter = new Elysia()
  .post('/api/envman/transfers/presign', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!caller.canWrite) {
      set.status = 403
      return { error: 'Token bersifat read-only — tidak bisa mengirim transfer' }
    }
    if (!isMinioEnabled()) {
      set.status = 503
      return { error: 'Storage belum dikonfigurasi di server — file besar tidak bisa dikirim' }
    }

    const body = (await request.json().catch(() => null)) as {
      filename?: string
      size?: number
      mimeType?: string
      to?: string
      once?: boolean
      label?: string
      ttlHours?: number
      burn?: boolean
    } | null

    const filename = typeof body?.filename === 'string' ? safeFilename(body.filename) : null
    if (!filename) {
      set.status = 400
      return { error: 'filename (string) wajib diisi' }
    }
    if (typeof body?.size !== 'number' || body.size <= 0) {
      set.status = 400
      return { error: 'size (number) wajib diisi' }
    }
    const wantsCode = body.once === true
    if (!wantsCode && typeof body.to !== 'string') {
      set.status = 400
      return { error: 'to (email atau nama) wajib diisi, atau pakai once: true' }
    }

    const limit = await maxFileBytes()
    if (body.size > limit) {
      set.status = 413
      return { error: `File melebihi batas ${Math.floor(limit / 1024 / 1024)} MB` }
    }

    const pending = await pendingCount(caller.userId)
    const pendingLimit = await maxPending()
    if (pending >= pendingLimit) {
      set.status = 429
      return { error: `Terlalu banyak transfer tertunda (${pending}/${pendingLimit}) — tunggu diklaim atau hapus dulu` }
    }

    let toUserId: string | null = null
    let toHint: string | null = null
    if (!wantsCode) {
      const resolved = await resolveRecipient(body.to as string)
      if (!resolved.ok) {
        if (resolved.reason === 'ambiguous') {
          set.status = 409
          return {
            error: `Nama "${body.to}" cocok dengan beberapa user — pakai email`,
            candidates: resolved.candidates,
          }
        }
        set.status = 404
        return { error: 'Penerima tidak ditemukan' }
      }
      toUserId = resolved.user.id
      toHint = body.to as string
    }

    const code = wantsCode ? generateCode() : null
    const expiresAt = new Date(Date.now() + (await resolveTtlMs(body.ttlHours)))
    const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'application/octet-stream'

    const row = await prisma.transfer.create({
      data: {
        kind: 'FILE',
        fromUserId: caller.userId,
        toUserId,
        toHint,
        filename,
        size: BigInt(Math.floor(body.size)),
        mimeType,
        uploaded: false,
        label: typeof body.label === 'string' ? body.label : null,
        burn: body.burn !== false,
        codeHash: code?.hash ?? null,
        codePrefix: code?.prefix ?? null,
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    })

    const minioKey = buildTransferKey(row.id, filename)
    await prisma.transfer.update({ where: { id: row.id }, data: { minioKey } })

    return {
      id: row.id,
      uploadUrl: minioPresignPut(minioKey),
      // Echoed so the client signs the PUT with exactly this value: a mismatch
      // against the presigned Content-Type yields an opaque MinIO 403.
      mimeType,
      expiresAt: row.expiresAt.toISOString(),
      ...(code ? { code: code.formatted } : {}),
    }
  })

  .post('/api/envman/transfers/:id/confirm', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!caller.canWrite) {
      set.status = 403
      return { error: 'Token bersifat read-only' }
    }

    // Scoped to the sender, and the key is re-derived from the row rather than
    // accepted from the client — strictly stronger and free.
    const row = await prisma.transfer.findFirst({
      where: { id: params.id, fromUserId: caller.userId, kind: 'FILE' },
    })
    if (!row || !row.minioKey) {
      set.status = 404
      return { error: 'Transfer tidak ditemukan' }
    }

    const client = getMinioClient()
    if (!client) {
      set.status = 503
      return { error: 'Storage belum dikonfigurasi di server' }
    }

    // Verify what actually landed. Without this a client could declare 1 KB and
    // upload 5 GB, sailing past the configured limit.
    let actualSize: number
    try {
      const stat = await client.file(row.minioKey).stat()
      actualSize = Number(stat.size)
    } catch {
      set.status = 502
      return { error: 'Gagal memeriksa file yang diupload — coba ulangi' }
    }

    const limit = await maxFileBytes()
    if (actualSize > limit) {
      await minioDelete(row.minioKey)
      await prisma.transfer.delete({ where: { id: row.id } }).catch(() => {})
      set.status = 413
      return { error: `File melebihi batas ${Math.floor(limit / 1024 / 1024)} MB` }
    }

    await prisma.transfer.update({
      where: { id: row.id },
      data: { uploaded: true, size: BigInt(actualSize) },
    })

    audit(
      caller.userId,
      'TRANSFER_SENT',
      row.codePrefix
        ? `code=${row.codePrefix} file=${row.filename} bytes=${actualSize}`
        : `to=${row.toHint} file=${row.filename} bytes=${actualSize}`,
      getIp(request),
    )

    return { ok: true, id: row.id, size: actualSize }
  })
