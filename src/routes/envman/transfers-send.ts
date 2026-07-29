import { Elysia } from 'elysia'
import { audit } from '../../lib/audit'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { encryptSecret, hasMasterKey } from '../../lib/crypto'
import { prisma } from '../../lib/db'
import { getIp } from '../../lib/request'
import {
  generateCode,
  maxPending,
  maxTextBytes,
  pendingCount,
  resolveRecipient,
  resolveTtlMs,
} from '../../lib/transfer-service'

// POST /api/envman/transfers — send a secret to another user, or mint a
// one-time claim code for someone without an account.

export const transfersSendRouter = new Elysia().post('/api/envman/transfers', async ({ request, set }) => {
  const caller = await requireEnvAuth(request)
  if (!caller) return unauthorized(set)

  // Creating state in someone else's inbox is a write, unlike the clipboard's
  // self-scoped scratch space which deliberately skips this gate.
  if (!caller.canWrite) {
    set.status = 403
    return { error: 'Token bersifat read-only — tidak bisa mengirim transfer' }
  }

  // The whole point of using this instead of a chat app is the encryption, so
  // a missing MASTER_KEY must refuse rather than silently store plaintext
  // (which is what encryptSecret would do — see src/lib/crypto.ts).
  if (!hasMasterKey()) {
    set.status = 503
    return { error: 'Transfer dinonaktifkan: MASTER_KEY belum diset di server' }
  }

  const body = (await request.json().catch(() => null)) as {
    content?: string
    to?: string
    once?: boolean
    label?: string
    ttlHours?: number
    burn?: boolean
  } | null

  if (typeof body?.content !== 'string' || body.content === '') {
    set.status = 400
    return { error: 'content (string) wajib diisi' }
  }
  const wantsCode = body.once === true
  if (!wantsCode && typeof body.to !== 'string') {
    set.status = 400
    return { error: 'to (email atau nama) wajib diisi, atau pakai once: true' }
  }

  const bytes = Buffer.byteLength(body.content, 'utf8')
  const limit = await maxTextBytes()
  if (bytes > limit) {
    set.status = 413
    return { error: `Konten melebihi batas ${Math.floor(limit / 1024)} KB` }
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
        return { error: `Nama "${body.to}" cocok dengan beberapa user — pakai email`, candidates: resolved.candidates }
      }
      // Same body for "no such user" and "blocked" so this is not an oracle.
      set.status = 404
      return { error: 'Penerima tidak ditemukan' }
    }
    toUserId = resolved.user.id
    toHint = body.to as string
  }

  const code = wantsCode ? generateCode() : null
  const expiresAt = new Date(Date.now() + (await resolveTtlMs(body.ttlHours)))

  const row = await prisma.transfer.create({
    data: {
      kind: 'TEXT',
      fromUserId: caller.userId,
      toUserId,
      toHint,
      content: encryptSecret(body.content),
      label: typeof body.label === 'string' ? body.label : null,
      burn: body.burn !== false,
      codeHash: code?.hash ?? null,
      codePrefix: code?.prefix ?? null,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  })

  // Never audit the code itself — only its prefix. See the note in
  // transfers-claim.ts about request paths being logged and broadcast.
  audit(
    caller.userId,
    'TRANSFER_SENT',
    wantsCode ? `code=${code?.prefix} bytes=${bytes}` : `to=${toHint} bytes=${bytes}`,
    getIp(request),
  )

  return {
    id: row.id,
    expiresAt: row.expiresAt.toISOString(),
    bytes,
    // Returned exactly once — only the hash is stored.
    ...(code ? { code: code.formatted } : {}),
  }
})
