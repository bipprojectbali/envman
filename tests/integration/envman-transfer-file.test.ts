import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { sweepTransfers } from '../../src/lib/transfer-sweep'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// The file path: presign -> (client PUTs to MinIO) -> confirm -> claim returns
// a presigned download URL. Cases that need real object bytes are skipped when
// MinIO is not configured, following tests/integration/storage.test.ts.

const MINIO_ENABLED = !!(
  process.env.MINIO_ENDPOINT &&
  process.env.MINIO_ACCESS_KEY &&
  process.env.MINIO_SECRET_KEY &&
  process.env.MINIO_BUCKET
)

const app = createTestApp()
const jsonHeaders = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

let aliceToken: string
let bobToken: string
let aliceId: string

beforeAll(async () => {
  await cleanupTestData()
  const alice = await seedTestUser('f-alice@test.com', 'pass123', 'FAlice', 'USER')
  const bob = await seedTestUser('f-bob@test.com', 'pass123', 'FBob', 'USER')
  aliceId = alice.id
  aliceToken = await createTestSession(alice.id)
  bobToken = await createTestSession(bob.id)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const presign = (token: string, body: unknown) =>
  app.handle(
    new Request('http://localhost/api/envman/transfers/presign', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(body),
    }),
  )

const confirm = (token: string, id: string) =>
  app.handle(
    new Request(`http://localhost/api/envman/transfers/${id}/confirm`, {
      method: 'POST',
      headers: jsonHeaders(token),
    }),
  )

describe('file transfer presign', () => {
  test('validates filename and size', async () => {
    expect((await presign(aliceToken, { to: 'f-bob@test.com', size: 10 })).status).toBe(400)
    expect((await presign(aliceToken, { to: 'f-bob@test.com', filename: 'a.bin' })).status).toBe(400)
    expect((await presign(aliceToken, { filename: 'a.bin', size: 10 })).status).toBe(400)
  })

  test('unauthenticated → 401', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/envman/transfers/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'f-bob@test.com', filename: 'a.bin', size: 10 }),
      }),
    )
    expect(res.status).toBe(401)
  })

  test('read-only token → 403', async () => {
    const token = await prisma.apiToken.create({
      data: { userId: aliceId, name: 'ro-file', token: `test-rof-${crypto.randomUUID()}`, canWrite: false },
    })
    const res = await app.handle(
      new Request('http://localhost/api/envman/transfers/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token.token}` },
        body: JSON.stringify({ to: 'f-bob@test.com', filename: 'a.bin', size: 10 }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('oversized declaration → 413', async () => {
    if (!MINIO_ENABLED) return
    const huge = 200 * 1024 * 1024 // default limit is 100 MB
    const res = await presign(aliceToken, { to: 'f-bob@test.com', filename: 'big.bin', size: huge })
    expect(res.status).toBe(413)
  })

  test('creates the row before any bytes exist, so the sweep can find it', async () => {
    if (!MINIO_ENABLED) return
    const res = await presign(aliceToken, { to: 'f-bob@test.com', filename: 'notes.bin', size: 12 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; uploadUrl: string; mimeType: string }
    expect(body.uploadUrl).toContain('http')

    const row = await prisma.transfer.findUnique({ where: { id: body.id } })
    expect(row?.kind).toBe('FILE')
    expect(row?.uploaded).toBe(false)
    // Namespaced away from project storage's {projectId}/{path}.
    expect(row?.minioKey).toBe(`transfers/${body.id}/notes.bin`)
  })

  test('strips any directory part from the filename', async () => {
    if (!MINIO_ENABLED) return
    const res = await presign(aliceToken, { to: 'f-bob@test.com', filename: '../../etc/passwd', size: 10 })
    expect(res.status).toBe(200)
    const { id } = (await res.json()) as { id: string }
    const row = await prisma.transfer.findUnique({ where: { id } })
    // A transfer is one file, never a tree — the key must stay inside its prefix.
    expect(row?.minioKey).toBe(`transfers/${id}/passwd`)
    expect(row?.filename).toBe('passwd')
  })
})

describe('file transfer visibility and confirm', () => {
  test('an unconfirmed upload is hidden from the inbox', async () => {
    if (!MINIO_ENABLED) return
    const res = await presign(aliceToken, { to: 'f-bob@test.com', filename: 'pending.bin', size: 5 })
    const { id } = (await res.json()) as { id: string }

    const inbox = await app.handle(
      new Request('http://localhost/api/envman/transfers/inbox', { headers: { cookie: `session=${bobToken}` } }),
    )
    const body = (await inbox.json()) as { transfers: { id: string }[] }
    expect(body.transfers.some((t) => t.id === id)).toBe(false)
  })

  test('claiming an unconfirmed upload → 409', async () => {
    if (!MINIO_ENABLED) return
    const res = await presign(aliceToken, { to: 'f-bob@test.com', filename: 'half.bin', size: 5 })
    const { id } = (await res.json()) as { id: string }

    const claim = await app.handle(
      new Request(`http://localhost/api/envman/transfers/${id}/claim`, {
        method: 'POST',
        headers: jsonHeaders(bobToken),
      }),
    )
    expect(claim.status).toBe(409)
  })

  test('confirming someone else’s transfer → 404', async () => {
    if (!MINIO_ENABLED) return
    const res = await presign(aliceToken, { to: 'f-bob@test.com', filename: 'mine.bin', size: 5 })
    const { id } = (await res.json()) as { id: string }
    // The recipient is not the sender: confirm is the sender's step only.
    expect((await confirm(bobToken, id)).status).toBe(404)
  })

  test('confirming with no object uploaded → 502, not a false success', async () => {
    if (!MINIO_ENABLED) return
    const res = await presign(aliceToken, { to: 'f-bob@test.com', filename: 'ghost.bin', size: 5 })
    const { id } = (await res.json()) as { id: string }
    // Nothing was ever PUT, so stat fails and the row must stay unconfirmed.
    expect((await confirm(aliceToken, id)).status).toBe(502)
    const row = await prisma.transfer.findUnique({ where: { id } })
    expect(row?.uploaded).toBe(false)
  })
})

describe('file transfer sweep', () => {
  test('expired file rows are removed', async () => {
    if (!MINIO_ENABLED) return
    const res = await presign(aliceToken, { to: 'f-bob@test.com', filename: 'old.bin', size: 5 })
    const { id } = (await res.json()) as { id: string }
    await prisma.transfer.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } })

    await sweepTransfers()
    expect(await prisma.transfer.findUnique({ where: { id } })).toBeNull()
  })
})
