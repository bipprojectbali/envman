import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, seedTestUser } from '../helpers'

const app = createTestApp()

beforeAll(async () => { await cleanupTestData() })
afterAll(async () => { await cleanupTestData() })

describe('PATCH /api/envman/projects/:slug/storage/move', () => {
  test('returns 401 when not authenticated', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects/any/storage/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: ['file.txt'], targetFolder: 'folder' }),
    }))
    expect(res.status).toBe(401)
  })

  test('returns 400 when paths is missing', async () => {
    const user = await seedTestUser('sa-move1@test.com', 'pass123', 'SA1', 'SUPER_ADMIN')
    const token = await createTestSession(user.id)
    const res = await app.handle(new Request('http://localhost/api/envman/projects/any/storage/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify({ targetFolder: 'folder' }),
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  test('returns 400 when paths is empty array', async () => {
    const user = await seedTestUser('sa-move2@test.com', 'pass123', 'SA2', 'SUPER_ADMIN')
    const token = await createTestSession(user.id)
    const res = await app.handle(new Request('http://localhost/api/envman/projects/any/storage/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify({ paths: [], targetFolder: 'folder' }),
    }))
    expect(res.status).toBe(400)
  })

  test('returns 403 when user has no project access', async () => {
    // USER without membership → access = null → 403 (before MinIO check)
    const user = await seedTestUser('user-move@test.com', 'pass123', 'User', 'USER')
    const token = await createTestSession(user.id)
    const res = await app.handle(new Request('http://localhost/api/envman/projects/nonexistent/storage/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify({ paths: ['file.txt'], targetFolder: 'folder' }),
    }))
    expect(res.status).toBe(403)
  })

  test('returns 404 when project does not exist', async () => {
    const user = await seedTestUser('sa-move3@test.com', 'pass123', 'SA3', 'SUPER_ADMIN')
    const token = await createTestSession(user.id)
    const res = await app.handle(new Request('http://localhost/api/envman/projects/nonexistent-move-slug/storage/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify({ paths: ['file.txt'], targetFolder: 'folder' }),
    }))
    expect(res.status).toBe(404)
  })
})
