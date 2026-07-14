import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Account-scoped clipboard: PUT/GET/DELETE /api/envman/clip.
// Encrypted at rest, single-slot per user, TTL with lazy + sweep expiry.

const app = createTestApp()
const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })
let userToken: string
let userId: string

beforeAll(async () => {
  await cleanupTestData()
  const user = await seedTestUser('clip-user@test.com', 'pass123', 'ClipUser', 'USER')
  userId = user.id
  userToken = await createTestSession(user.id)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const clip = (method: string, token?: string, body?: unknown) =>
  app.handle(
    new Request('http://localhost/api/envman/clip', {
      method,
      headers: token ? authHeader(token) : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )

describe('clipboard endpoints', () => {
  test('GET empty → 404', async () => {
    const res = await clip('GET', userToken)
    expect(res.status).toBe(404)
  })

  test('PUT sets content, encrypted at rest', async () => {
    const res = await clip('PUT', userToken, { content: 'FOO=bar\nBAZ=qux' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.ok).toBe(true)
    expect(body.expiresAt).toBeTruthy()

    // stored value must be encrypted, not plaintext
    const row = await prisma.clipboard.findUnique({ where: { userId } })
    expect(row).not.toBeNull()
    expect(row!.content).not.toBe('FOO=bar\nBAZ=qux')
    expect(row!.content).toContain('enc:')
  })

  test('GET returns decrypted content round-trip', async () => {
    const res = await clip('GET', userToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.content).toBe('FOO=bar\nBAZ=qux')
  })

  test('PUT overwrites (single-slot)', async () => {
    await clip('PUT', userToken, { content: 'SECOND=value' })
    const res = await clip('GET', userToken)
    const body = (await res.json()) as any
    expect(body.content).toBe('SECOND=value')
  })

  test('default TTL ~24h', async () => {
    await clip('PUT', userToken, { content: 'x' })
    const row = await prisma.clipboard.findUnique({ where: { userId } })
    const ms = row!.expiresAt.getTime() - Date.now()
    expect(ms).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(ms).toBeLessThan(25 * 60 * 60 * 1000)
  })

  test('custom ttlSeconds respected', async () => {
    await clip('PUT', userToken, { content: 'x', ttlSeconds: 3600 })
    const row = await prisma.clipboard.findUnique({ where: { userId } })
    const ms = row!.expiresAt.getTime() - Date.now()
    expect(ms).toBeGreaterThan(50 * 60 * 1000)
    expect(ms).toBeLessThan(70 * 60 * 1000)
  })

  test('expired clipboard → GET 404 and row deleted (lazy expiry)', async () => {
    await prisma.clipboard.update({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const res = await clip('GET', userToken)
    expect(res.status).toBe(404)
    const row = await prisma.clipboard.findUnique({ where: { userId } })
    expect(row).toBeNull()
  })

  test('DELETE clears', async () => {
    await clip('PUT', userToken, { content: 'to-clear' })
    const del = await clip('DELETE', userToken)
    expect(del.status).toBe(200)
    const res = await clip('GET', userToken)
    expect(res.status).toBe(404)
  })

  test('content over size limit → 413', async () => {
    // default clipboard_max_kb = 1024 (1 MB); send > 1 MB
    const big = 'a'.repeat(1024 * 1024 + 1)
    const res = await clip('PUT', userToken, { content: big })
    expect(res.status).toBe(413)
  })

  test('missing content → 400', async () => {
    const res = await clip('PUT', userToken, {})
    expect(res.status).toBe(400)
  })

  test('unauthorized → 401', async () => {
    expect((await clip('GET')).status).toBe(401)
    expect((await clip('PUT', undefined, { content: 'x' })).status).toBe(401)
  })

  // Regression: a read-only API token still owns its account's clipboard.
  // The clipboard is per-user scratch space, not shared project data, so
  // canWrite (which protects vars/projects) must NOT gate it.
  test('read-only API token can set/get/clear its own clipboard', async () => {
    const roToken = crypto.randomUUID()
    await prisma.apiToken.create({
      data: { userId, name: 'ro-clip', token: roToken, canWrite: false, scopes: [] },
    })
    const bearer = (method: string, body?: unknown) =>
      app.handle(
        new Request('http://localhost/api/envman/clip', {
          method,
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${roToken}` },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      )

    const setRes = await bearer('PUT', { content: 'from-ro-token' })
    expect(setRes.status).toBe(200)
    const getRes = await bearer('GET')
    expect(getRes.status).toBe(200)
    expect(((await getRes.json()) as any).content).toBe('from-ro-token')
    expect((await bearer('DELETE')).status).toBe(200)
  })
})
