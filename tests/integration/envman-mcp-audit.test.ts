// Integration test: POST /api/envman/mcp/audit endpoint.
// Verifies allowlist + audit row creation.

import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createTestApp, seedTestUser, createTestSession, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()
let userId: string
let sessionToken: string

beforeAll(async () => {
  await cleanupTestData()
  const u = await seedTestUser('mcp-audit@test.com', 'pass123', 'MCP Audit', 'ADMIN')
  userId = u.id
  sessionToken = await createTestSession(userId)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const authHeader = (t: string) => ({ 'Content-Type': 'application/json', cookie: `session=${t}` })

describe('POST /api/envman/mcp/audit', () => {
  test('records valid MCP_* action', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/mcp/audit', {
      method: 'POST',
      headers: authHeader(sessionToken),
      body: JSON.stringify({ action: 'MCP_VAR_SET', slug: 'myapp', env: 'prod', detail: 'key=PORT' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    // Wait briefly for fire-and-forget audit insert
    await new Promise((r) => setTimeout(r, 100))
    const log = await prisma.auditLog.findFirst({
      where: { userId, action: 'MCP_VAR_SET' },
      orderBy: { createdAt: 'desc' },
    })
    expect(log).not.toBeNull()
    expect(log?.detail).toContain('myapp')
  })

  test('rejects unknown action with 400', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/mcp/audit', {
      method: 'POST',
      headers: authHeader(sessionToken),
      body: JSON.stringify({ action: 'PM_PROCESS_STARTED' }),  // valid for pm-audit but not mcp-audit
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('unknown MCP action')
  })

  test('rejects without action field with 400', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/mcp/audit', {
      method: 'POST',
      headers: authHeader(sessionToken),
      body: JSON.stringify({ detail: 'no action' }),
    }))
    expect(res.status).toBe(400)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/mcp/audit', {
      method: 'POST',
      body: JSON.stringify({ action: 'MCP_SESSION_STARTED' }),
    }))
    expect(res.status).toBe(401)
  })

  test('accepts MCP_VARS_REVEALED for secret-reveal audit', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/mcp/audit', {
      method: 'POST',
      headers: authHeader(sessionToken),
      body: JSON.stringify({ action: 'MCP_VARS_REVEALED', slug: 'myapp', env: 'prod' }),
    }))
    expect(res.status).toBe(200)
  })
})
