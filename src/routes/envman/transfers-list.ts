import { Elysia } from 'elysia'
import { audit } from '../../lib/audit'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { getIp } from '../../lib/request'
import { shapeTransfer } from '../../lib/transfer-service'

// Inbox / sent listing and revocation. Reads and self-destructive writes are
// deliberately not gated on canWrite: a read-only deploy token must be able to
// drain its own inbox (a CI job pulling a cert is the main use case), and
// revoking your own send only removes state.

const userSelect = { id: true, name: true, email: true }

export const transfersListRouter = new Elysia()
  .get('/api/envman/transfers/inbox', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)

    const rows = await prisma.transfer.findMany({
      where: {
        toUserId: caller.userId,
        claimedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { fromUser: { select: userSelect } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { transfers: rows.map(shapeTransfer) }
  })

  .get('/api/envman/transfers/sent', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)

    const rows = await prisma.transfer.findMany({
      where: { fromUserId: caller.userId, expiresAt: { gt: new Date() } },
      include: { toUser: { select: userSelect } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { transfers: rows.map(shapeTransfer) }
  })

  // Either party may drop a transfer: the sender revokes, the recipient
  // declines. 404 (not 403) for anyone else, so this cannot confirm existence.
  .delete('/api/envman/transfers/:id', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)

    const { count } = await prisma.transfer.deleteMany({
      where: {
        id: params.id,
        OR: [{ fromUserId: caller.userId }, { toUserId: caller.userId }],
      },
    })
    if (count === 0) {
      set.status = 404
      return { error: 'Transfer tidak ditemukan' }
    }
    audit(caller.userId, 'TRANSFER_REVOKED', `id=${params.id}`, getIp(request))
    return { ok: true }
  })
