import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { redis } from '../../src/lib/redis'
import { sweepTransfers } from '../../src/lib/transfer-sweep'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Claiming: the burn-after-read CAS, the anonymous code path and its
// brute-force guard. Sending/listing lives in envman-transfer.test.ts.

const app = createTestApp()
const jsonHeaders = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

let aliceToken: string
let bobToken: string
let carolToken: string

beforeAll(async () => {
  await cleanupTestData()
  const alice = await seedTestUser('c-alice@test.com', 'pass123', 'CAlice', 'USER')
  const bob = await seedTestUser('c-bob@test.com', 'pass123', 'CBob', 'USER')
  const carol = await seedTestUser('c-carol@test.com', 'pass123', 'CCarol', 'USER')
  aliceToken = await createTestSession(alice.id)
  bobToken = await createTestSession(bob.id)
  carolToken = await createTestSession(carol.id)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

// Rate-limit counters live in Redis with a 10-minute TTL, so they outlive the
// process: a fixed test IP would accumulate failures across repeated runs and
// start returning 429. Every run gets its own IP space instead.
const RUN = Math.floor(Math.random() * 1e6)
const ip = (n: number) => `10.${(RUN >> 8) & 0xff}.${RUN & 0xff}.${n}`

beforeEach(async () => {
  await redis.del('xfer:claim:global').catch(() => {})
})

const send = (token: string, body: unknown) =>
  app.handle(
    new Request('http://localhost/api/envman/transfers', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(body),
    }),
  )

const claimById = (id: string, token: string) =>
  app.handle(
    new Request(`http://localhost/api/envman/transfers/${id}/claim`, {
      method: 'POST',
      headers: jsonHeaders(token),
    }),
  )

const claimByCode = (code: string, addr: string = ip(1)) =>
  app.handle(
    new Request('http://localhost/api/envman/transfers/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': addr },
      body: JSON.stringify({ code }),
    }),
  )

async function sendToBob(content = 'SECRET=1', extra: Record<string, unknown> = {}) {
  const res = await send(aliceToken, { to: 'c-bob@test.com', content, ...extra })
  return (await res.json()) as { id: string }
}

describe('claim by id', () => {
  test('recipient claims and gets the plaintext back', async () => {
    const { id } = await sendToBob('DB_URL=postgres://x')
    const res = await claimById(id, bobToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { content: string; from: { email: string } }
    expect(body.content).toBe('DB_URL=postgres://x')
    expect(body.from.email).toBe('c-alice@test.com')
  })

  test('claiming marks the row but does not delete it (the sweep owns deletion)', async () => {
    const { id } = await sendToBob()
    await claimById(id, bobToken)
    const row = await prisma.transfer.findUnique({ where: { id } })
    expect(row).not.toBeNull()
    expect(row?.claimedAt).not.toBeNull()
  })

  test('second claim → 409, and it drops out of the inbox', async () => {
    const { id } = await sendToBob()
    expect((await claimById(id, bobToken)).status).toBe(200)
    expect((await claimById(id, bobToken)).status).toBe(409)

    const inbox = await app.handle(
      new Request('http://localhost/api/envman/transfers/inbox', { headers: { cookie: `session=${bobToken}` } }),
    )
    const body = (await inbox.json()) as { transfers: { id: string }[] }
    expect(body.transfers.some((t) => t.id === id)).toBe(false)
  })

  test('third party claiming → 404, not 403', async () => {
    const { id } = await sendToBob()
    // 403 would confirm the transfer exists.
    expect((await claimById(id, carolToken)).status).toBe(404)
  })

  test('concurrent claims: exactly one wins', async () => {
    const { id } = await sendToBob('RACE=1')
    const [a, b] = await Promise.all([claimById(id, bobToken), claimById(id, bobToken)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
  })

  test('expired transfer → 404 and the row is lazily deleted', async () => {
    const { id } = await sendToBob()
    await prisma.transfer.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await claimById(id, bobToken)).status).toBe(404)
    expect(await prisma.transfer.findUnique({ where: { id } })).toBeNull()
  })

  test('corrupt ciphertext → 500 and the row stays UNCLAIMED', async () => {
    const { id } = await sendToBob()
    await prisma.transfer.update({ where: { id }, data: { content: 'enc:dead:beef:cafe' } })

    const res = await claimById(id, bobToken)
    expect(res.status).toBe(500)
    // Critical: the sentinel is caught before the CAS, so burn-after-read has
    // not consumed the only copy in exchange for an error string.
    const row = await prisma.transfer.findUnique({ where: { id } })
    expect(row?.claimedAt).toBeNull()
  })
})

describe('claim by one-time code', () => {
  async function mintCode(content = 'ONCE=1', extra: Record<string, unknown> = {}) {
    const res = await send(aliceToken, { once: true, content, ...extra })
    return (await res.json()) as { id: string; code: string }
  }

  test('anonymous claim works with no auth at all', async () => {
    const { id, code } = await mintCode('ANON=yes')
    const res = await claimByCode(code)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { content: string }).content).toBe('ANON=yes')

    const row = await prisma.transfer.findUnique({ where: { id } })
    expect(row?.claimedAt).not.toBeNull()
    expect(row?.claimedByUserId).toBeNull()
    expect(row?.claimedIp).toBe(ip(1))
  })

  test('code normalization: lowercase, no dashes, ambiguous glyphs', async () => {
    const { code } = await mintCode('NORM=1')
    const messy = code.replace(/^EM-/, '').replace(/-/g, '').toLowerCase()
    const res = await claimByCode(messy, ip(2))
    expect(res.status).toBe(200)
  })

  test('reused code → 404 (same body as unknown)', async () => {
    const { code } = await mintCode()
    await claimByCode(code, ip(3))

    const reuse = await claimByCode(code, ip(3))
    expect(reuse.status).toBe(404)
    const reuseBody = (await reuse.json()) as { error: string }

    const unknown = await claimByCode('ABCD1234ABCD1234', ip(3))
    const unknownBody = (await unknown.json()) as { error: string }
    // Distinguishing them would tell an attacker the guess was structurally valid.
    expect(reuseBody.error).toBe(unknownBody.error)
  })

  test('malformed code → 400', async () => {
    expect((await claimByCode('too-short', ip(4))).status).toBe(400)
  })

  test('brute force: budget exhausts, and a valid code from that IP is still refused', async () => {
    const attacker = ip(90)
    await redis.del(`xfer:claim:ip:${attacker}`).catch(() => {})
    await redis.del('xfer:claim:global').catch(() => {})

    const { code } = await mintCode('GUARDED=1')

    // 10 failures is the per-IP budget.
    for (let i = 0; i < 10; i++) {
      const res = await claimByCode('ZZZZZZZZZZZZZZZZ', attacker)
      expect(res.status).toBe(404)
    }
    expect((await claimByCode('ZZZZZZZZZZZZZZZZ', attacker)).status).toBe(429)

    // The correct code from the same IP must ALSO be refused — otherwise an
    // attacker who guesses right on the last attempt would still be served.
    expect((await claimByCode(code, attacker)).status).toBe(429)

    // A different IP is unaffected (the global budget is far higher).
    expect((await claimByCode(code, ip(91))).status).toBe(200)
  })

  test('successful claims do not consume the budget', async () => {
    const happy = ip(80)
    await redis.del(`xfer:claim:ip:${happy}`).catch(() => {})
    for (let i = 0; i < 12; i++) {
      const { code } = await mintCode(`OK${i}`)
      expect((await claimByCode(code, happy)).status).toBe(200)
    }
  })
})

describe('sweep', () => {
  test('removes expired and claimed-past-grace, keeps fresh and --keep rows', async () => {
    const past = new Date(Date.now() - 1000)
    const longAgo = new Date(Date.now() - 3 * 60 * 60 * 1000) // beyond the 2h grace

    const expired = await sendToBob('EXPIRED=1')
    await prisma.transfer.update({ where: { id: expired.id }, data: { expiresAt: past } })

    const burned = await sendToBob('BURNED=1')
    await prisma.transfer.update({ where: { id: burned.id }, data: { claimedAt: longAgo } })

    const kept = await sendToBob('KEPT=1', { burn: false })
    await prisma.transfer.update({ where: { id: kept.id }, data: { claimedAt: longAgo } })

    const recent = await sendToBob('RECENT=1')
    await prisma.transfer.update({ where: { id: recent.id }, data: { claimedAt: new Date() } })

    await sweepTransfers()

    expect(await prisma.transfer.findUnique({ where: { id: expired.id } })).toBeNull()
    expect(await prisma.transfer.findUnique({ where: { id: burned.id } })).toBeNull()
    // --keep survives its claim; it only dies at expiry.
    expect(await prisma.transfer.findUnique({ where: { id: kept.id } })).not.toBeNull()
    // Claimed within the grace window stays, so an in-flight download is safe.
    expect(await prisma.transfer.findUnique({ where: { id: recent.id } })).not.toBeNull()
  })
})
