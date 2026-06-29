import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createTestApp, seedTestUser, createTestSession, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

let ownerId: string
let otherId: string
let ownerToken: string
let otherToken: string
let createdTokenId: string
let createdTokenValue: string

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('token-owner@test.com', 'pass123', 'TokenOwner', 'ADMIN')
  const other = await seedTestUser('token-other@test.com', 'pass123', 'TokenOther', 'ADMIN')
  ownerId = owner.id
  otherId = other.id
  ownerToken = await createTestSession(ownerId)
  otherToken = await createTestSession(otherId)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

describe('POST /api/envman/tokens', () => {
  test('owner creates token, response returns the token value', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/tokens', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ name: 'test-token', canWrite: false, scopes: [] }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toMatch(/^em_[a-f0-9]{32}$/)
    expect(body.name).toBe('test-token')
    createdTokenId = body.id
    createdTokenValue = body.token
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/tokens', {
      method: 'POST',
      body: JSON.stringify({ name: 'nope' }),
    }))
    expect(res.status).toBe(401)
  })

  test('returns 400 when name missing', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/tokens', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/envman/tokens', () => {
  test('list returns metadata only — never includes token value', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/tokens', {
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tokens).toBeArray()
    expect(body.tokens.length).toBeGreaterThan(0)
    for (const t of body.tokens) {
      expect(t.token).toBeUndefined()
    }
  })

  test('list scoped to caller — other user does not see owner token', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/tokens', {
      headers: authHeader(otherToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tokens.find((t: any) => t.id === createdTokenId)).toBeUndefined()
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/tokens'))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/envman/tokens/:id/reveal', () => {
  test('owner reveals token value', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/tokens/${createdTokenId}/reveal`, {
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBe(createdTokenValue)
  })

  test('other user gets 404 (cannot reveal someone else token)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/tokens/${createdTokenId}/reveal`, {
      headers: authHeader(otherToken),
    }))
    expect(res.status).toBe(404)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/tokens/${createdTokenId}/reveal`))
    expect(res.status).toBe(401)
  })

  test('returns 404 for non-existent token id', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/tokens/non-existent-id/reveal', {
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/envman/tokens/:id/rotate', () => {
  test('owner rotates token — value changes, lastUsedAt resets', async () => {
    // Simulate prior usage so we can verify reset
    await prisma.apiToken.update({
      where: { id: createdTokenId },
      data: { lastUsedAt: new Date() },
    })

    const res = await app.handle(new Request(`http://localhost/api/envman/tokens/${createdTokenId}/rotate`, {
      method: 'POST',
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toMatch(/^em_[a-f0-9]{32}$/)
    expect(body.token).not.toBe(createdTokenValue)
    expect(body.id).toBe(createdTokenId)

    // Verify DB state: new value stored, lastUsedAt cleared
    const dbToken = await prisma.apiToken.findUnique({ where: { id: createdTokenId } })
    expect(dbToken?.token).toBe(body.token)
    expect(dbToken?.lastUsedAt).toBeNull()

    createdTokenValue = body.token // for subsequent tests
  })

  test('other user gets 404 (cannot rotate someone else token)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/tokens/${createdTokenId}/rotate`, {
      method: 'POST',
      headers: authHeader(otherToken),
    }))
    expect(res.status).toBe(404)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/tokens/${createdTokenId}/rotate`, {
      method: 'POST',
    }))
    expect(res.status).toBe(401)
  })

  test('returns 404 for non-existent token id', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/tokens/non-existent-id/rotate', {
      method: 'POST',
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(404)
  })
})
