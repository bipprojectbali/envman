import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let ownerId: string
let editorId: string
let ownerToken: string
let editorToken: string
const projectSlug = 'sec-test-proj'

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

beforeAll(async () => {
  await cleanupTestData()

  const owner = await seedTestUser('sec-owner@test.com', 'pass123', 'SecOwner', 'ADMIN')
  const editor = await seedTestUser('sec-editor@test.com', 'pass123', 'SecEditor', 'ADMIN')
  ownerId = owner.id
  editorId = editor.id
  ownerToken = await createTestSession(ownerId)
  editorToken = await createTestSession(editorId)

  await app.handle(
    new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ slug: projectSlug, name: 'Sec Test' }),
    }),
  )
  // Add editor via API POST /members → memicu auto-seed default-deny untuk keempat section.
  const res = await app.handle(
    new Request(`http://localhost/api/envman/projects/${projectSlug}/members`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ userId: editorId, role: 'EDITOR' }),
    }),
  )
  const body = await res.json()
  // Sanity: response menandakan default-deny diterapkan.
  expect(body.defaultDenied).toBe(true)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('secure-by-default: member baru default-deny di semua section', () => {
  test('editor tidak bisa baca notes (denied by default)', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/notes`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('editor tidak bisa list storage (denied by default)', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/storage`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('GET /projects/:slug expose sectionAccess=null untuk section denied', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.sectionAccess.NOTES).toBeNull()
    expect(body.project.sectionAccess.STORAGE).toBeNull()
  })
})

describe('GET /api/envman/projects/:slug/sections/:section/members', () => {
  test('OWNER list menampilkan editor sebagai denied', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/sections/NOTES/members`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const editorRow = body.members.find((m: any) => m.userId === editorId)
    expect(editorRow.sectionRole).toBe('denied')
    expect(editorRow.effectiveRole).toBeNull()
  })

  test('non-OWNER tidak bisa list section members', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/sections/NOTES/members`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('section tidak valid → 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/sections/BOGUS/members`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/envman/projects/:slug/sections/:section/members/:userId', () => {
  test('OWNER grant VIEWER di NOTES → editor bisa baca notes', async () => {
    const put = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/sections/NOTES/members/${editorId}`, {
        method: 'PUT',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ role: 'VIEWER' }),
      }),
    )
    expect(put.status).toBe(200)

    const read = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/notes`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(read.status).toBe(200)
  })

  test('grant NOTES tidak membuka STORAGE (isolasi antar section)', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/storage`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('role invalid → 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/sections/NOTES/members/${editorId}`, {
        method: 'PUT',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ role: 'SUPERUSER' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('target bukan project member → 400', async () => {
    const stranger = await seedTestUser('sec-stranger@test.com', 'pass123', 'Stranger', 'ADMIN')
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/sections/NOTES/members/${stranger.id}`, {
        method: 'PUT',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ role: 'VIEWER' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('non-OWNER tidak bisa mutate → 403', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/sections/NOTES/members/${editorId}`, {
        method: 'PUT',
        headers: authHeader(editorToken),
        body: JSON.stringify({ role: 'OWNER' }),
      }),
    )
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/envman/projects/:slug/sections/:section/members/:userId', () => {
  test('OWNER reset ke inherit → editor ikut role project (EDITOR) lagi di NOTES', async () => {
    const del = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/sections/NOTES/members/${editorId}`, {
        method: 'DELETE',
        headers: authHeader(ownerToken),
      }),
    )
    expect(del.status).toBe(200)

    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/sections/NOTES/members`, {
        headers: authHeader(ownerToken),
      }),
    )
    const body = await res.json()
    const editorRow = body.members.find((m: any) => m.userId === editorId)
    expect(editorRow.sectionRole).toBe('inherit')
    expect(editorRow.effectiveRole).toBe('EDITOR')
  })
})
