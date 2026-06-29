import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createTestApp, seedTestUser, createTestSession, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

let ownerId: string
let outsiderId: string
let ownerToken: string
let outsiderToken: string
const projectSlug = 'files-resolve-test-proj'

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

beforeAll(async () => {
  await cleanupTestData()

  const owner = await seedTestUser('files-resolve-owner@test.com', 'pass123', 'FilesResolveOwner', 'ADMIN')
  const outsider = await seedTestUser('files-resolve-outsider@test.com', 'pass123', 'FilesResolveOutsider', 'ADMIN')
  ownerId = owner.id
  outsiderId = outsider.id
  ownerToken = await createTestSession(ownerId)
  outsiderToken = await createTestSession(outsiderId)

  await app.handle(new Request('http://localhost/api/envman/projects', {
    method: 'POST',
    headers: authHeader(ownerToken),
    body: JSON.stringify({ slug: projectSlug, name: 'Files Resolve Test Project' }),
  }))

  // Create single-file entry with prefix "deploy"
  await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
    method: 'POST',
    headers: authHeader(ownerToken),
    body: JSON.stringify({ title: 'Deploy Script', prefix: 'deploy', files: [{ filename: 'deploy.sh', content: 'echo hello', language: 'bash' }] }),
  }))

  // Create multi-file entry with prefix "scripts"
  await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
    method: 'POST',
    headers: authHeader(ownerToken),
    body: JSON.stringify({ title: 'Scripts', prefix: 'scripts', files: [
      { filename: 'a.sh', content: 'echo a', language: 'bash' },
      { filename: 'b.sh', content: 'echo b', language: 'bash' },
    ]}),
  }))
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

// ─── RESOLVE ─────────────────────────────────────────────────────────────────

describe('GET /api/envman/projects/:slug/files/resolve', () => {
  test('resolves single-file entry by prefix only', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=deploy`,
      { headers: authHeader(ownerToken) }
    ))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content).toBe('echo hello')
    expect(body.filename).toBe('deploy.sh')
    expect(body.language).toBe('bash')
  })

  test('resolves multi-file entry by prefix + filename', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=scripts&filename=b.sh`,
      { headers: authHeader(ownerToken) }
    ))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content).toBe('echo b')
  })

  test('400 if multi-file entry and no filename given', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=scripts`,
      { headers: authHeader(ownerToken) }
    ))
    expect(res.status).toBe(400)
  })

  test('404 for unknown prefix', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=notexist`,
      { headers: authHeader(ownerToken) }
    ))
    expect(res.status).toBe(404)
  })

  test('404 for unknown filename', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=scripts&filename=nope.sh`,
      { headers: authHeader(ownerToken) }
    ))
    expect(res.status).toBe(404)
  })

  test('403 for non-member', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=deploy`,
      { headers: authHeader(outsiderToken) }
    ))
    expect(res.status).toBe(403)
  })

  test('401 without auth', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=deploy`
    ))
    expect(res.status).toBe(401)
  })

  test('GET pertama kirim ETag + Last-Modified', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=deploy`,
      { headers: authHeader(ownerToken) }
    ))
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).not.toBe(null)
    expect(res.headers.get('last-modified')).not.toBe(null)
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
  })

  test('If-None-Match cocok → 304 tanpa body', async () => {
    const first = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=deploy`,
      { headers: authHeader(ownerToken) }
    ))
    const etag = first.headers.get('etag') ?? ''
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=deploy`,
      { headers: { ...authHeader(ownerToken), 'If-None-Match': etag } }
    ))
    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
  })

  test('ETag per-filename berbeda di entry multi-file', async () => {
    const a = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=scripts&filename=a.sh`,
      { headers: authHeader(ownerToken) }
    ))
    const b = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/files/resolve?prefix=scripts&filename=b.sh`,
      { headers: authHeader(ownerToken) }
    ))
    expect(a.headers.get('etag')).not.toBe(b.headers.get('etag'))
  })
})
