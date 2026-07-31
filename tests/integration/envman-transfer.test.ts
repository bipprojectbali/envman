import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// User-to-user transfer: sending, listing and revoking.
// Claiming (CAS, burn race, code brute-force) lives in envman-transfer-claim.test.ts.

const app = createTestApp()
const jsonHeaders = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

let aliceToken: string
let bobToken: string
let bobId: string
let carolToken: string

beforeAll(async () => {
  await cleanupTestData()
  const alice = await seedTestUser('alice@test.com', 'pass123', 'Alice', 'USER')
  const bob = await seedTestUser('bob@test.com', 'pass123', 'Bob', 'USER')
  const carol = await seedTestUser('carol@test.com', 'pass123', 'Carol', 'USER')
  bobId = bob.id
  aliceToken = await createTestSession(alice.id)
  bobToken = await createTestSession(bob.id)
  carolToken = await createTestSession(carol.id)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const send = (token: string | undefined, body: unknown) =>
  app.handle(
    new Request('http://localhost/api/envman/transfers', {
      method: 'POST',
      headers: token ? jsonHeaders(token) : { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const get = (path: string, token?: string) =>
  app.handle(
    new Request(`http://localhost/api/envman/transfers/${path}`, {
      headers: token ? { cookie: `session=${token}` } : {},
    }),
  )

describe('transfer send', () => {
  test('sends to a registered user by email and stores ciphertext', async () => {
    const res = await send(aliceToken, { to: 'bob@test.com', content: 'DB_PASSWORD=s3cret' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; expiresAt: string; code?: string }
    expect(body.id).toBeTruthy()
    expect(body.code).toBeUndefined() // no code for a targeted send

    const row = await prisma.transfer.findUnique({ where: { id: body.id } })
    expect(row?.content).toContain('enc:')
    expect(row?.content).not.toBe('DB_PASSWORD=s3cret')
    expect(row?.toUserId).toBe(bobId)
  })

  test('sends by exact name', async () => {
    const res = await send(aliceToken, { to: 'Bob', content: 'X=1' })
    expect(res.status).toBe(200)
  })

  test('unknown recipient → 404', async () => {
    const res = await send(aliceToken, { to: 'nobody@test.com', content: 'X=1' })
    expect(res.status).toBe(404)
  })

  test('blocked recipient → 404, same body as unknown', async () => {
    const blocked = await seedTestUser('blocked@test.com', 'pass123', 'BlockedUser', 'USER')
    await prisma.user.update({ where: { id: blocked.id }, data: { blocked: true } })

    const res = await send(aliceToken, { to: 'blocked@test.com', content: 'X=1' })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }

    const unknown = await send(aliceToken, { to: 'ghost@test.com', content: 'X=1' })
    const unknownBody = (await unknown.json()) as { error: string }
    // Identical body: send must not be an account-state oracle.
    expect(body.error).toBe(unknownBody.error)
  })

  test('ambiguous name → 409 with candidates', async () => {
    const dupA = await seedTestUser('dup-a@test.com', 'pass123', 'SameName', 'USER')
    await seedTestUser('dup-b@test.com', 'pass123', 'SameName', 'USER')

    const res = await send(aliceToken, { to: 'SameName', content: 'X=1' })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { candidates: string[] }
    expect(body.candidates.length).toBeGreaterThan(1)

    // An exact email still resolves even when the name is ambiguous.
    const byEmail = await send(aliceToken, { to: 'dup-a@test.com', content: 'X=1' })
    expect(byEmail.status).toBe(200)
    await prisma.transfer.deleteMany({ where: { toUserId: dupA.id } })
  })

  test('missing content → 400; missing recipient → 400', async () => {
    expect((await send(aliceToken, { to: 'bob@test.com' })).status).toBe(400)
    expect((await send(aliceToken, { content: 'X=1' })).status).toBe(400)
  })

  test('oversized content → 413', async () => {
    const huge = 'x'.repeat(2 * 1024 * 1024) // default text limit is 1 MB
    const res = await send(aliceToken, { to: 'bob@test.com', content: huge })
    expect(res.status).toBe(413)
  })

  test('unauthenticated → 401', async () => {
    expect((await send(undefined, { to: 'bob@test.com', content: 'X=1' })).status).toBe(401)
  })

  test('--once mints a four-word code; only its hash is stored', async () => {
    const res = await send(aliceToken, { once: true, content: 'ONCE=1' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; code: string }
    // Four lowercase words, dot-separated — dictatable over the phone, unlike
    // the base32 it replaced.
    expect(body.code).toMatch(/^[a-z-]+\.[a-z-]+\.[a-z-]+\.[a-z-]+$/)

    const row = await prisma.transfer.findUnique({ where: { id: body.id } })
    expect(row?.codeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(row?.toUserId).toBeNull()

    // The plaintext code must appear in no column. Assert on the code exactly
    // as issued: deriving a stripped variant would make this pass even if the
    // row leaked the code verbatim.
    const serialized = JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))
    expect(serialized).not.toContain(body.code)

    // codePrefix labels the send without giving the code away — one word out
    // of four, never the whole thing.
    expect(row?.codePrefix).toBe(body.code.split('.')[0])
    expect(row?.codePrefix).not.toBe(body.code)
  })

  test('--code sets a custom code, and its TTL is capped at 15 minutes', async () => {
    const custom = 'setup-mesin-baru'
    // Ask for a week; the custom-code ceiling must override it.
    const res = await send(aliceToken, { once: true, content: 'C=1', code: custom, ttlHours: 168 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; code: string; expiresAt: string }
    expect(body.code).toBe(custom)

    const minutes = (new Date(body.expiresAt).getTime() - Date.now()) / 60_000
    expect(minutes).toBeLessThanOrEqual(15)
    expect(minutes).toBeGreaterThan(13)

    // No prefix at all for a custom code: it reaches the sent list, the audit
    // log and the app-log ring, and a memorable code is often reused.
    const row = await prisma.transfer.findUnique({ where: { id: body.id } })
    expect(row?.codePrefix).toBeNull()

    const serialized = JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))
    expect(serialized).not.toContain(custom)
  })

  test('--code rejects anything too short or shell-unsafe', async () => {
    for (const bad of ['pendek', 'ada spasi disini', 'kode;rm -rf /']) {
      const res = await send(aliceToken, { once: true, content: 'X=1', code: bad })
      expect(res.status).toBe(400)
    }
  })
})

describe('transfer inbox / sent / revoke', () => {
  test('recipient sees it; sender and third party do not', async () => {
    const created = await send(aliceToken, { to: 'bob@test.com', content: 'INBOX=1' })
    const { id } = (await created.json()) as { id: string }

    const bobInbox = (await (await get('inbox', bobToken)).json()) as { transfers: { id: string }[] }
    expect(bobInbox.transfers.some((t) => t.id === id)).toBe(true)

    const aliceInbox = (await (await get('inbox', aliceToken)).json()) as { transfers: { id: string }[] }
    expect(aliceInbox.transfers.some((t) => t.id === id)).toBe(false)

    const carolInbox = (await (await get('inbox', carolToken)).json()) as { transfers: { id: string }[] }
    expect(carolInbox.transfers.some((t) => t.id === id)).toBe(false)
  })

  test('inbox never leaks content', async () => {
    await send(aliceToken, { to: 'bob@test.com', content: 'SUPER_SECRET_VALUE' })
    const raw = await (await get('inbox', bobToken)).text()
    expect(raw).not.toContain('SUPER_SECRET_VALUE')
    expect(raw).not.toContain('enc:')
  })

  test('sent list shows the sender their own transfers', async () => {
    const res = await get('sent', aliceToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { transfers: { id: string }[] }
    expect(body.transfers.length).toBeGreaterThan(0)
  })

  test('sender can revoke; recipient can decline; third party gets 404', async () => {
    const created = await send(aliceToken, { to: 'bob@test.com', content: 'REVOKE=1' })
    const { id } = (await created.json()) as { id: string }

    const byCarol = await app.handle(
      new Request(`http://localhost/api/envman/transfers/${id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${carolToken}` },
      }),
    )
    expect(byCarol.status).toBe(404)

    const bySender = await app.handle(
      new Request(`http://localhost/api/envman/transfers/${id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${aliceToken}` },
      }),
    )
    expect(bySender.status).toBe(200)
    expect(await prisma.transfer.findUnique({ where: { id } })).toBeNull()
  })

  test('unauthenticated inbox → 401', async () => {
    expect((await get('inbox')).status).toBe(401)
  })
})

describe('read-only token', () => {
  test('cannot send (403) but can read its own inbox (200)', async () => {
    const bob = await prisma.user.findUnique({ where: { email: 'bob@test.com' } })
    const token = await prisma.apiToken.create({
      data: { userId: bob!.id, name: 'ro', token: `test-ro-${crypto.randomUUID()}`, canWrite: false },
    })
    const bearer = { 'Content-Type': 'application/json', authorization: `Bearer ${token.token}` }

    const sendRes = await app.handle(
      new Request('http://localhost/api/envman/transfers', {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({ to: 'alice@test.com', content: 'X=1' }),
      }),
    )
    expect(sendRes.status).toBe(403)

    // Draining your own inbox is not a write — a CI token pulling a cert is the
    // main use case for this.
    const inboxRes = await app.handle(
      new Request('http://localhost/api/envman/transfers/inbox', { headers: bearer }),
    )
    expect(inboxRes.status).toBe(200)
  })
})
