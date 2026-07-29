import { Elysia } from 'elysia'
import { audit } from '../../lib/audit'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { decryptSecret } from '../../lib/crypto'
import { prisma } from '../../lib/db'
import { hitLimit, peekLimit } from '../../lib/rate-limit'
import { getIp } from '../../lib/request'
import { hashCode, normalizeCode } from '../../lib/transfer-service'

// Claiming a transfer. Two doors into the same logic: an authenticated
// recipient claiming by id, and an anonymous holder claiming by one-time code.

const DECRYPT_FAILED = '[decryption failed]'

// Failure-only buckets: a legitimate claim never spends budget. A per-IP limit
// alone is useless against a botnet, hence the global one.
const IP_LIMIT = 10
const GLOBAL_LIMIT = 100
const WINDOW_SECONDS = 10 * 60

interface ClaimableRow {
  id: string
  content: string | null
  kind: string
  filename: string | null
  label: string | null
  expiresAt: Date
  claimedAt: Date | null
  fromUser: { name: string; email: string } | null
}

/**
 * Marks a row claimed and returns its plaintext.
 *
 * The compare-and-swap on claimedAt is what makes burn-after-read safe: two
 * concurrent claims both reach the UPDATE, Postgres serialises them on the row
 * lock, and the loser re-evaluates `claimedAt: null` and matches zero rows.
 * A findUnique-then-update sequence would race.
 *
 * Deletion is NOT done here — the sweep owns it (see src/lib/transfer-sweep.ts),
 * so the object-before-row ordering lives in exactly one place.
 */
async function claimRow(row: ClaimableRow, userId: string | null, ip: string, set: { status?: number | string }) {
  const plaintext = decryptSecret(row.content ?? '')
  // Check before the CAS: otherwise burn deletes the only copy and hands the
  // caller a 20-byte error string that `envman recv > .env` writes to disk.
  if (plaintext === DECRYPT_FAILED) {
    set.status = 500
    return { error: 'Gagal mendekripsi konten — MASTER_KEY mungkin berubah' }
  }

  const { count } = await prisma.transfer.updateMany({
    where: { id: row.id, claimedAt: null },
    data: { claimedAt: new Date(), claimedByUserId: userId, claimedIp: ip },
  })
  if (count === 0) {
    set.status = 409
    return { error: 'Transfer sudah diklaim' }
  }

  audit(userId, 'TRANSFER_CLAIMED', `id=${row.id}`, ip)
  return {
    kind: row.kind,
    content: plaintext,
    filename: row.filename,
    label: row.label,
    from: row.fromUser ? { name: row.fromUser.name, email: row.fromUser.email } : null,
  }
}

export const transfersClaimRouter = new Elysia()
  .post('/api/envman/transfers/:id/claim', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)

    const row = await prisma.transfer.findFirst({
      where: { id: params.id, toUserId: caller.userId },
      include: { fromUser: { select: { name: true, email: true } } },
    })
    // 404 rather than 403 for someone else's transfer: 403 would confirm it exists.
    if (!row) {
      set.status = 404
      return { error: 'Transfer tidak ditemukan' }
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      await prisma.transfer.delete({ where: { id: row.id } }).catch(() => {})
      set.status = 404
      return { error: 'Transfer kedaluwarsa' }
    }
    if (row.claimedAt) {
      set.status = 409
      return { error: 'Transfer sudah diklaim' }
    }
    return claimRow(row, caller.userId, getIp(request), set)
  })

  // Unauthenticated: this is how someone without an account collects a send.
  //
  // The code travels in the POST body, never the path, because src/app.ts logs
  // `${method} ${pathname}` for every /api/ request into the Redis app-log ring
  // AND broadcasts it to the dev panel over a websocket — a code in the URL
  // would be persisted and streamed in the clear.
  .post('/api/envman/transfers/claim', async ({ request, set }) => {
    const ip = getIp(request)
    const body = (await request.json().catch(() => null)) as { code?: string } | null

    // Budget is spent on failures only, so a legitimate claim never consumes
    // it. Failures are fire-and-forget: the response does not depend on them.
    const spendFailure = () =>
      Promise.all([
        hitLimit(`xfer:claim:ip:${ip}`, IP_LIMIT, WINDOW_SECONDS),
        hitLimit('xfer:claim:global', GLOBAL_LIMIT, WINDOW_SECONDS),
      ]).catch(() => {})

    // Refuse once the budget is exhausted, checked BEFORE any lookup — so an
    // attacker who guesses correctly on attempt 500 is still turned away. This
    // only reads the counters; it must not consume budget itself.
    try {
      const [perIp, global] = await Promise.all([
        peekLimit(`xfer:claim:ip:${ip}`, IP_LIMIT),
        peekLimit('xfer:claim:global', GLOBAL_LIMIT),
      ])
      if (!perIp.allowed || !global.allowed) {
        set.status = 429
        return { error: 'Terlalu banyak percobaan kode — coba lagi dalam 10 menit' }
      }
    } catch {
      // Redis down => refuse. Letting requests through unguarded would turn a
      // cache outage into an open brute-force window.
      set.status = 503
      return { error: 'Layanan klaim sementara tidak tersedia' }
    }

    const normalized = typeof body?.code === 'string' ? normalizeCode(body.code) : null
    if (!normalized) {
      await spendFailure()
      set.status = 400
      return { error: 'Format kode tidak valid' }
    }

    const row = await prisma.transfer.findUnique({
      where: { codeHash: hashCode(normalized) },
      include: { fromUser: { select: { name: true, email: true } } },
    })

    // One body for unknown / expired / already-claimed: distinguishing them
    // tells an attacker their guess was structurally valid.
    const notFound = async () => {
      await spendFailure()
      set.status = 404
      return { error: 'Kode tidak ditemukan atau sudah tidak berlaku' }
    }
    if (!row) return notFound()
    if (row.expiresAt.getTime() <= Date.now()) {
      await prisma.transfer.delete({ where: { id: row.id } }).catch(() => {})
      return notFound()
    }
    if (row.claimedAt) return notFound()

    return claimRow(row, null, ip, set)
  })
