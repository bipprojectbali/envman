import { Elysia } from 'elysia'
import { forbidden, requireSuperAdmin } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { cleanupTokenActivity } from '../../lib/token-activity'

export const adminTokenActivityRouter = new Elysia()

  // ─── Stats ───────────────────────────────────────────────
  .get('/api/admin/token-activity/stats', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const total = await prisma.tokenActivityLog.count()
    const oldest = await prisma.tokenActivityLog.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    })

    const topTokensRaw = await prisma.$queryRaw<{ tokenId: string; tokenName: string | null; count: bigint }[]>`
      SELECT "tokenId", "tokenName", COUNT(*) as count
      FROM token_activity_log
      GROUP BY "tokenId", "tokenName"
      ORDER BY count DESC
      LIMIT 5
    `

    const byAction = await prisma.$queryRaw<{ action: string; count: bigint }[]>`
      SELECT action, COUNT(*) as count
      FROM token_activity_log
      GROUP BY action
      ORDER BY count DESC
    `

    return {
      total,
      estimatedBytes: total * 180,
      oldestEntry: oldest?.createdAt ?? null,
      topTokens: topTokensRaw.map((r) => ({ tokenId: r.tokenId, tokenName: r.tokenName, count: Number(r.count) })),
      byAction: byAction.map((r) => ({ action: r.action, count: Number(r.count) })),
    }
  })

  // ─── Cleanup manual (pakai setting aktif) ────────────────
  .post('/api/admin/token-activity/cleanup', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const { deleted } = await cleanupTokenActivity()
    return { ok: true, deleted }
  })

  // ─── Hapus semua (truncate) ───────────────────────────────
  .delete('/api/admin/token-activity', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const { count } = await prisma.tokenActivityLog.deleteMany()
    return { ok: true, deleted: count }
  })
