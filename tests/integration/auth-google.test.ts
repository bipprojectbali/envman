import { test, expect, describe, afterAll } from 'bun:test'
import { createTestApp, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/auth/google', () => {
  test('redirects to better-auth social sign-in endpoint', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/google'))

    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    // /api/auth/google now redirects to better-auth social sign-in handler
    expect(location).toContain('/api/auth/sign-in/social')
    expect(location).toContain('provider=google')
  })
})

describe('GET /api/auth/callback/google', () => {
  test('redirects to error page when no state/code provided', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/callback/google'))

    // better-auth redirects to its own error page when state is missing
    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toBeTruthy()
  })
})
