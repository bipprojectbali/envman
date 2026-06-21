import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createTestApp, seedTestUser, createTestSession, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

let user1Id: string
let user2Id: string
let token1: string
let token2: string
let gistId: string

beforeAll(async () => {
  await cleanupTestData()
  const u1 = await seedTestUser('gist1@test.com', 'pass123', 'GistUser1', 'ADMIN')
  const u2 = await seedTestUser('gist2@test.com', 'pass123', 'GistUser2', 'ADMIN')
  user1Id = u1.id
  user2Id = u2.id
  token1 = await createTestSession(user1Id)
  token2 = await createTestSession(user2Id)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const json = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })
const sampleGist = {
  title: 'Docker setup',
  description: 'Docker compose for dev',
  files: [{ filename: 'docker-compose.yml', content: 'version: "3"', language: 'yaml' }],
  isPublic: false,
  tags: ['docker', 'devops'],
}

describe('POST /api/envman/gists', () => {
  test('creates gist berhasil', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/gists', {
      method: 'POST',
      headers: json(token1),
      body: JSON.stringify(sampleGist),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.gist.title).toBe('Docker setup')
    expect(body.gist.tags).toEqual(['docker', 'devops'])
    gistId = body.gist.id
  })

  test('missing title returns 400', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/gists', {
      method: 'POST',
      headers: json(token1),
      body: JSON.stringify({ files: [{ filename: 'f.txt', content: 'x', language: 'plaintext' }] }),
    }))
    expect(res.status).toBe(400)
  })

  test('missing files returns 400', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/gists', {
      method: 'POST',
      headers: json(token1),
      body: JSON.stringify({ title: 'No files', files: [] }),
    }))
    expect(res.status).toBe(400)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/gists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleGist),
    }))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/envman/gists', () => {
  test('returns own gists for user1', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/gists', {
      headers: json(token1),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.gists).toBeArray()
    expect(body.gists.some((g: any) => g.id === gistId)).toBe(true)
  })

  test('user2 does NOT see private gist from user1', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/gists', {
      headers: json(token2),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.gists.some((g: any) => g.id === gistId)).toBe(false)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/gists'))
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/envman/gists/:id', () => {
  test('owner can update gist', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/gists/${gistId}`, {
      method: 'PUT',
      headers: json(token1),
      body: JSON.stringify({ title: 'Updated Docker setup', isPublic: true }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.gist.title).toBe('Updated Docker setup')
    expect(body.gist.isPublic).toBe(true)
  })

  test('non-owner gets 403', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/gists/${gistId}`, {
      method: 'PUT',
      headers: json(token2),
      body: JSON.stringify({ title: 'Hijack' }),
    }))
    expect(res.status).toBe(403)
  })

  test('now public gist visible to user2', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/gists', {
      headers: json(token2),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.gists.some((g: any) => g.id === gistId)).toBe(true)
  })
})

describe('Conditional caching (ETag / Last-Modified)', () => {
  const filename = 'docker-compose.yml'
  let etag: string
  let lastModified: string

  test('raw file: GET pertama kirim ETag + Last-Modified', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/gists/${gistId}/raw/${filename}`, { headers: json(token1) }),
    )
    expect(res.status).toBe(200)
    etag = res.headers.get('etag') ?? ''
    lastModified = res.headers.get('last-modified') ?? ''
    expect(etag).not.toBe('')
    expect(lastModified).not.toBe('')
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(await res.text()).toBe('version: "3"')
  })

  test('raw file: If-None-Match cocok → 304 tanpa body', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/gists/${gistId}/raw/${filename}`, {
        headers: { ...json(token1), 'If-None-Match': etag },
      }),
    )
    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
    expect(res.headers.get('etag')).toBe(etag)
  })

  test('raw file: If-Modified-Since >= updatedAt → 304', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/gists/${gistId}/raw/${filename}`, {
        headers: { ...json(token1), 'If-Modified-Since': lastModified },
      }),
    )
    expect(res.status).toBe(304)
  })

  test('raw file public: 304 via If-None-Match', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/public/gists/${gistId}/raw/${filename}`, {
        headers: { 'If-None-Match': etag },
      }),
    )
    expect(res.status).toBe(304)
  })

  test('single public gist JSON: kirim ETag + 304 saat cocok', async () => {
    const first = await app.handle(new Request(`http://localhost/api/public/gists/${gistId}`))
    expect(first.status).toBe(200)
    const jsonEtag = first.headers.get('etag') ?? ''
    expect(jsonEtag).toStartWith('W/')
    const body = await first.json()
    expect(body.gist.id).toBe(gistId)

    const second = await app.handle(
      new Request(`http://localhost/api/public/gists/${gistId}`, { headers: { 'If-None-Match': jsonEtag } }),
    )
    expect(second.status).toBe(304)
  })

  test('ETag berubah setelah konten file di-update', async () => {
    await app.handle(
      new Request(`http://localhost/api/envman/gists/${gistId}`, {
        method: 'PUT',
        headers: json(token1),
        body: JSON.stringify({ files: [{ filename, content: 'version: "4"', language: 'yaml' }] }),
      }),
    )
    const res = await app.handle(
      new Request(`http://localhost/api/envman/gists/${gistId}/raw/${filename}`, {
        headers: { ...json(token1), 'If-None-Match': etag },
      }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).not.toBe(etag)
  })
})

describe('DELETE /api/envman/gists/:id', () => {
  test('non-owner cannot delete (403)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/gists/${gistId}`, {
      method: 'DELETE',
      headers: json(token2),
    }))
    expect(res.status).toBe(403)
  })

  test('owner deletes gist', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/gists/${gistId}`, {
      method: 'DELETE',
      headers: json(token1),
    }))
    expect(res.status).toBe(200)
  })

  test('deleted gist no longer in list', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/gists', {
      headers: json(token1),
    }))
    const body = await res.json()
    expect(body.gists.some((g: any) => g.id === gistId)).toBe(false)
  })
})
