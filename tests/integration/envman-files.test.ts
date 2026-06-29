import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createTestApp, seedTestUser, createTestSession, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

let ownerId: string
let editorId: string
let editor2Id: string
let viewerId: string
let outsiderId: string
let ownerToken: string
let editorToken: string
let editor2Token: string
let viewerToken: string
let outsiderToken: string
const projectSlug = 'files-test-proj'

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })
const sampleFiles = [{ filename: 'main.ts', content: 'console.log("hello")', language: 'typescript' }]

beforeAll(async () => {
  await cleanupTestData()

  const owner = await seedTestUser('files-owner@test.com', 'pass123', 'FilesOwner', 'ADMIN')
  const editor = await seedTestUser('files-editor@test.com', 'pass123', 'FilesEditor', 'ADMIN')
  const editor2 = await seedTestUser('files-editor2@test.com', 'pass123', 'FilesEditor2', 'ADMIN')
  const viewer = await seedTestUser('files-viewer@test.com', 'pass123', 'FilesViewer', 'ADMIN')
  const outsider = await seedTestUser('files-outsider@test.com', 'pass123', 'FilesOutsider', 'ADMIN')
  ownerId = owner.id
  editorId = editor.id
  editor2Id = editor2.id
  viewerId = viewer.id
  outsiderId = outsider.id
  ownerToken = await createTestSession(ownerId)
  editorToken = await createTestSession(editorId)
  editor2Token = await createTestSession(editor2Id)
  viewerToken = await createTestSession(viewerId)
  outsiderToken = await createTestSession(outsiderId)

  await app.handle(new Request('http://localhost/api/envman/projects', {
    method: 'POST',
    headers: authHeader(ownerToken),
    body: JSON.stringify({ slug: projectSlug, name: 'Files Test Project' }),
  }))

  const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
  await prisma.projectMember.createMany({
    data: [
      { projectId: project!.id, userId: editorId, role: 'EDITOR' },
      { projectId: project!.id, userId: editor2Id, role: 'EDITOR' },
      { projectId: project!.id, userId: viewerId, role: 'VIEWER' },
    ],
  })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

// ─── GET ────────────────────────────────────────────────────────────────────

describe('GET /api/envman/projects/:slug/files', () => {
  test('returns empty array for VIEWER', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      headers: authHeader(viewerToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.files).toBeArray()
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`))
    expect(res.status).toBe(401)
  })

  test('returns 403 for non-member', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      headers: authHeader(outsiderToken),
    }))
    expect(res.status).toBe(403)
  })
})

// ─── POST ───────────────────────────────────────────────────────────────────

describe('POST /api/envman/projects/:slug/files', () => {
  test('EDITOR creates file successfully', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ title: 'My Config', description: 'Docker config', files: sampleFiles, tags: ['docker', 'config'] }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.file.title).toBe('My Config')
    expect(body.file.description).toBe('Docker config')
    expect(body.file.tags).toEqual(['docker', 'config'])
    expect(body.file.author).toBeDefined()
    expect(Array.isArray(body.file.files)).toBe(true)
  })

  test('OWNER creates file', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ title: 'Owner File', files: sampleFiles }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.file.title).toBe('Owner File')
  })

  test('missing title returns 400', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ files: sampleFiles }),
    }))
    expect(res.status).toBe(400)
  })

  test('empty files array returns 400', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ title: 'Test', files: [] }),
    }))
    expect(res.status).toBe(400)
  })

  test('VIEWER cannot create (403)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      method: 'POST',
      headers: authHeader(viewerToken),
      body: JSON.stringify({ title: 'Test', files: sampleFiles }),
    }))
    expect(res.status).toBe(403)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', files: sampleFiles }),
    }))
    expect(res.status).toBe(401)
  })
})

// ─── PUT ────────────────────────────────────────────────────────────────────

describe('PUT /api/envman/projects/:slug/files/:id', () => {
  let fileId: string
  let ownerFileId: string

  beforeAll(async () => {
    const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
    const file = await prisma.projectFile.create({
      data: { projectId: project!.id, authorId: editorId, title: 'Edit Me', description: '', files: sampleFiles as any, tags: [] },
    })
    fileId = file.id
    const ownerFile = await prisma.projectFile.create({
      data: { projectId: project!.id, authorId: ownerId, title: 'Owner Only', description: '', files: sampleFiles as any, tags: [] },
    })
    ownerFileId = ownerFile.id
  })

  test('EDITOR updates own file', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/${fileId}`, {
      method: 'PUT',
      headers: authHeader(editorToken),
      body: JSON.stringify({ title: 'Updated Title' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.file.title).toBe('Updated Title')
  })

  test('OWNER can update any file', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/${fileId}`, {
      method: 'PUT',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ description: 'Updated by owner' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.file.description).toBe('Updated by owner')
  })

  test('other EDITOR cannot update file they do not own (403)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/${fileId}`, {
      method: 'PUT',
      headers: authHeader(editor2Token),
      body: JSON.stringify({ title: 'Stolen' }),
    }))
    expect(res.status).toBe(403)
  })

  test('VIEWER cannot update (403)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/${fileId}`, {
      method: 'PUT',
      headers: authHeader(viewerToken),
      body: JSON.stringify({ title: 'X' }),
    }))
    expect(res.status).toBe(403)
  })

  test('non-existent file returns 404', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/does-not-exist`, {
      method: 'PUT',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ title: 'X' }),
    }))
    expect(res.status).toBe(404)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({ title: 'X' }),
    }))
    expect(res.status).toBe(401)
  })
})

// ─── DELETE ─────────────────────────────────────────────────────────────────

describe('DELETE /api/envman/projects/:slug/files/:id', () => {
  let fileId: string
  let ownerFileId: string

  beforeAll(async () => {
    const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
    const file = await prisma.projectFile.create({
      data: { projectId: project!.id, authorId: editorId, title: 'Delete Me', description: '', files: sampleFiles as any, tags: [] },
    })
    fileId = file.id
    const ownerFile = await prisma.projectFile.create({
      data: { projectId: project!.id, authorId: ownerId, title: 'Delete Owner', description: '', files: sampleFiles as any, tags: [] },
    })
    ownerFileId = ownerFile.id
  })

  test('other EDITOR cannot delete file they do not own (403)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/${fileId}`, {
      method: 'DELETE',
      headers: authHeader(editor2Token),
    }))
    expect(res.status).toBe(403)
  })

  test('VIEWER cannot delete (403)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/${fileId}`, {
      method: 'DELETE',
      headers: authHeader(viewerToken),
    }))
    expect(res.status).toBe(403)
  })

  test('non-existent file returns 404', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/not-found`, {
      method: 'DELETE',
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(404)
  })

  test('EDITOR deletes own file', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/${fileId}`, {
      method: 'DELETE',
      headers: authHeader(editorToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('OWNER deletes any file', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/${ownerFileId}`, {
      method: 'DELETE',
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(200)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files/${fileId}`, {
      method: 'DELETE',
    }))
    expect(res.status).toBe(401)
  })
})

// ─── PREFIX ──────────────────────────────────────────────────────────────────

describe('POST /files with prefix', () => {
  test('creates file with prefix', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ title: 'Deploy Script', prefix: 'deploy', files: [{ filename: 'deploy.sh', content: 'echo hello', language: 'bash' }] }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.file.prefix).toBe('deploy')
  })

  test('duplicate prefix returns 400', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ title: 'Another', prefix: 'deploy', files: sampleFiles }),
    }))
    expect(res.status).toBe(400)
  })
})

// ─── RESOLVE ─────────────────────────────────────────────────────────────────

describe('GET /api/envman/projects/:slug/files/resolve', () => {
  const multiFiles = [
    { filename: 'a.sh', content: 'echo a', language: 'bash' },
    { filename: 'b.sh', content: 'echo b', language: 'bash' },
  ]

  beforeAll(async () => {
    // create entry with prefix "scripts" and two files
    await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/files`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ title: 'Scripts', prefix: 'scripts', files: multiFiles }),
    }))
  })

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
