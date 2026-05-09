import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createTestApp, seedTestUser, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

beforeAll(async () => {
  await cleanupTestData()
  await seedTestUser('admin@example.com', 'admin123', 'Admin')
  await seedTestUser('user@example.com', 'user123', 'User')
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('POST /api/auth/login', () => {
  test('login with valid credentials returns user and session cookie', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' }),
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user).toBeDefined()
    expect(body.user.email).toBe('admin@example.com')
    expect(body.user.name).toBe('Admin')
    expect(body.user.id).toBeDefined()
    expect(body.user.role).toBe('USER')
    // Should not expose password
    expect(body.user.password).toBeUndefined()

    // Check session cookie
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Path=/')
  })

  test('login with wrong password returns 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'wrongpassword' }),
    }))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Email atau password salah')
  })

  test('login with non-existent email returns 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'anything' }),
    }))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Email atau password salah')
  })

  test('login returns role field in response', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'user123' }),
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.role).toBe('USER')
  })

  test('login creates a session in database', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'user123' }),
    }))

    expect(res.status).toBe(200)

    const setCookie = res.headers.get('set-cookie')!
    expect(setCookie).toContain('session=')

    // better-auth uses signed tokens — verify session exists by checking DB count
    // (signed token format differs from raw DB token)
    const user = await prisma.user.findUnique({ where: { email: 'user@example.com' } })
    const sessions = await prisma.session.findMany({ where: { userId: user!.id } })
    expect(sessions.length).toBeGreaterThan(0)
    expect(sessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})
