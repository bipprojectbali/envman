import { prisma } from './db'

// TTL sweep for user-to-user transfers.
//
// Lives in its own module rather than inline next to the clipboard sweep
// because the delete ordering (MinIO object BEFORE the DB row, once the file
// path lands) is a correctness rule that must not be forked across entry
// points — it is wired into both src/server.prod.ts and src/index.tsx.

// Claimed rows linger briefly instead of vanishing at claim time. Claiming only
// marks the row; deletion happens here, so there is exactly one delete path.
// The grace must exceed any presigned-URL TTL, or the sweep could yank a file
// out from under an in-flight download once the file path exists.
const CLAIMED_GRACE_MS = 2 * 60 * 60 * 1000

const BATCH = 500

export async function sweepTransfers(): Promise<{ deleted: number }> {
  const now = new Date()
  const graceCutoff = new Date(now.getTime() - CLAIMED_GRACE_MS)

  const rows = await prisma.transfer.findMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        // burn: false (--keep) rows are not reaped on claim; they die at expiry
        // like everything else.
        { burn: true, claimedAt: { lt: graceCutoff } },
      ],
    },
    select: { id: true, minioKey: true },
    take: BATCH,
  })
  if (rows.length === 0) return { deleted: 0 }

  // NOTE for the file path (v2): delete the MinIO objects HERE, before the rows.
  // The row is the only record that an object exists — deleting rows first
  // leaves objects orphaned with nothing left to find them by.

  const { count } = await prisma.transfer.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
  return { deleted: count }
}
