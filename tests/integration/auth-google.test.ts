import { test, expect, describe, afterAll } from 'bun:test'
import { createTestApp, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/auth/google', () => {
  test('redirects to Google OAuth', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/google'))

    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    // better-auth generates the Google OAuth URL directly
    expect(location).toContain('accounts.google.com/o/oauth2/v2/auth')
    expect(location).toContain('client_id=')
    expect(location).toContain('redirect_uri=')
    expect(location).toContain('scope=')
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
