import { Elysia } from 'elysia'
import { getSettingNumber } from '../../lib/app-settings'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { decryptSecret, encryptSecret } from '../../lib/crypto'
import { prisma } from '../../lib/db'

// Account-scoped single-slot clipboard (pbcopy/pbpaste across devices).
// Content is encrypted at rest and auto-expires. One row per user.

const DEFAULT_MAX_KB = 1024 // 1 MB
const DEFAULT_MAX_TTL_HOURS = 168 // 7 days
const DEFAULT_TTL_SECONDS = 24 * 60 * 60 // 24h

export const clipboardRouter = new Elysia()

  // GET — read the clipboard. Lazily deletes + 404s when expired.
  .get('/api/envman/clip', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const row = await prisma.clipboard.findUnique({ where: { userId: caller.userId } })
    if (!row) {
      set.status = 404
      return { error: 'Clipboard kosong' }
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      await prisma.clipboard.delete({ where: { userId: caller.userId } }).catch(() => {})
      set.status = 404
      return { error: 'Clipboard kedaluwarsa' }
    }
    return { content: decryptSecret(row.content), expiresAt: row.expiresAt.toISOString() }
  })

  // PUT — set the clipboard (upsert, overwrites). Encrypts before storing.
  .put('/api/envman/clip', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    // No canWrite gate: the clipboard is the caller's own per-user scratch space
    // (keyed by userId, touches no shared project data), like Gists. A read-only
    // token still owns its account's clipboard.
    const body = (await request.json().catch(() => null)) as { content?: string; ttlSeconds?: number } | null
    if (typeof body?.content !== 'string') {
      set.status = 400
      return { error: 'content (string) required' }
    }

    const maxKb = await getSettingNumber('clipboard_max_kb', DEFAULT_MAX_KB)
    if (Buffer.byteLength(body.content, 'utf8') > maxKb * 1024) {
      set.status = 413
      return { error: `Konten melebihi batas ${maxKb} KB` }
    }

    const maxTtlHours = await getSettingNumber('clipboard_max_ttl_hours', DEFAULT_MAX_TTL_HOURS)
    const maxTtlSeconds = maxTtlHours * 60 * 60
    let ttl =
      typeof body.ttlSeconds === 'number' && body.ttlSeconds > 0 ? Math.floor(body.ttlSeconds) : DEFAULT_TTL_SECONDS
    if (ttl > maxTtlSeconds) ttl = maxTtlSeconds

    const expiresAt = new Date(Date.now() + ttl * 1000)
    const encrypted = encryptSecret(body.content)
    await prisma.clipboard.upsert({
      where: { userId: caller.userId },
      update: { content: encrypted, expiresAt, createdAt: new Date() },
      create: { userId: caller.userId, content: encrypted, expiresAt },
    })
    return { ok: true, expiresAt: expiresAt.toISOString(), bytes: Buffer.byteLength(body.content, 'utf8') }
  })

  // DELETE — clear the clipboard.
  .delete('/api/envman/clip', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    // No canWrite gate — clearing your own clipboard, see PUT above.
    await prisma.clipboard.deleteMany({ where: { userId: caller.userId } })
    return { ok: true }
  })
