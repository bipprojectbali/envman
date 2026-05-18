import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createTestApp, seedTestUser, createTestSession, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

let ownerId: string
let viewerId: string
let outsiderId: string
let ownerToken: string
let viewerToken: string
let outsiderToken: string
const projectSlug = 'alias-test-proj'

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

beforeAll(async () => {
  await cleanupTestData()

  const owner = await seedTestUser('alias-owner@test.com', 'pass123', 'AliasOwner', 'ADMIN')
  const viewer = await seedTestUser('alias-viewer@test.com', 'pass123', 'AliasViewer', 'ADMIN')
  const outsider = await seedTestUser('alias-outsider@test.com', 'pass123', 'AliasOutsider', 'ADMIN')
  ownerId = owner.id
  viewerId = viewer.id
  outsiderId = outsider.id
  ownerToken = await createTestSession(ownerId)
  viewerToken = await createTestSession(viewerId)
  outsiderToken = await createTestSession(outsiderId)

  // Create project — owner becomes OWNER automatically
  await app.handle(new Request('http://localhost/api/envman/projects', {
    method: 'POST',
    headers: authHeader(ownerToken),
    body: JSON.stringify({ slug: projectSlug, name: 'Alias Test Project' }),
  }))

  // Add viewer as VIEWER
  const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
  await prisma.projectMember.create({ data: { projectId: project!.id, userId: viewerId, role: 'VIEWER' } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

// ─── GET /api/envman/projects/:slug/aliases ───────────────────────────────────

describe('GET /api/envman/projects/:slug/aliases', () => {
  test('returns empty array for OWNER', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.aliases).toBeArray()
  })

  test('returns 200 for VIEWER', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
      headers: authHeader(viewerToken),
    }))
    expect(res.status).toBe(200)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`))
    expect(res.status).toBe(401)
  })

  test('returns 403 for non-member', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
      headers: authHeader(outsiderToken),
    }))
    expect(res.status).toBe(403)
  })
})

// ─── POST /api/envman/projects/:slug/aliases ──────────────────────────────────

describe('POST /api/envman/projects/:slug/aliases', () => {
  test('OWNER creates alias successfully', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ name: 'deploy', args: '-e alias-test-proj:production -- docker compose up -d', description: 'Deploy to production', tags: ['deploy', 'docker'] }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alias.name).toBe('deploy')
    expect(body.alias.args).toBe('-e alias-test-proj:production -- docker compose up -d')
    expect(body.alias.description).toBe('Deploy to production')
    expect(body.alias.tags).toEqual(['deploy', 'docker'])
    expect(body.alias.creator).toBeDefined()
  })

  test('DB record created correctly', async () => {
    const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
    const alias = await prisma.projectAlias.findUnique({ where: { projectId_name: { projectId: project!.id, name: 'deploy' } } })
    expect(alias).not.toBeNull()
    expect(alias!.createdBy).toBe(ownerId)
  })

  test('duplicate name returns 400', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ name: 'deploy', args: '-e alias-test-proj:staging -- docker compose up' }),
    }))
    expect(res.status).toBe(400)
  })

  test('name with uppercase gets slugified', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ name: 'MyAlias', args: '-e alias-test-proj:staging -- bun run start' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alias.name).toBe('myalias')
  })

  test('missing name returns 400', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ args: '-- bun run start' }),
    }))
    expect(res.status).toBe(400)
  })

  test('missing args returns 400', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ name: 'no-args' }),
    }))
    expect(res.status).toBe(400)
  })

  test('VIEWER cannot create alias (403)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
      method: 'POST',
      headers: authHeader(viewerToken),
      body: JSON.stringify({ name: 'viewer-alias', args: '-- echo hello' }),
    }))
    expect(res.status).toBe(403)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
      method: 'POST',
      body: JSON.stringify({ name: 'x', args: '-- echo' }),
    }))
    expect(res.status).toBe(401)
  })
})

// ─── PATCH /api/envman/projects/:slug/aliases/:name ──────────────────────────

describe('PATCH /api/envman/projects/:slug/aliases/:name', () => {
  test('OWNER updates alias args', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases/deploy`, {
      method: 'PATCH',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ args: '-e alias-test-proj:production -- docker compose up --build' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alias.args).toBe('-e alias-test-proj:production -- docker compose up --build')
  })

  test('OWNER updates description', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases/deploy`, {
      method: 'PATCH',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ description: 'Updated description' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alias.description).toBe('Updated description')
  })

  test('OWNER updates tags', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases/deploy`, {
      method: 'PATCH',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ tags: ['deploy', 'ci', 'prod'] }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alias.tags).toEqual(['deploy', 'ci', 'prod'])
  })

  test('non-existent alias returns 404', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases/does-not-exist`, {
      method: 'PATCH',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ args: '-- echo' }),
    }))
    expect(res.status).toBe(404)
  })

  test('VIEWER cannot update (403)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases/deploy`, {
      method: 'PATCH',
      headers: authHeader(viewerToken),
      body: JSON.stringify({ args: '-- echo' }),
    }))
    expect(res.status).toBe(403)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases/deploy`, {
      method: 'PATCH',
      body: JSON.stringify({ args: '-- echo' }),
    }))
    expect(res.status).toBe(401)
  })
})

// ─── DELETE /api/envman/projects/:slug/aliases/:name ─────────────────────────

describe('DELETE /api/envman/projects/:slug/aliases/:name', () => {
  test('VIEWER cannot delete (403)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases/deploy`, {
      method: 'DELETE',
      headers: authHeader(viewerToken),
    }))
    expect(res.status).toBe(403)
  })

  test('non-existent alias returns 404', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases/ghost`, {
      method: 'DELETE',
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(404)
  })

  test('OWNER deletes alias', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases/myalias`, {
      method: 'DELETE',
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases/deploy`, {
      method: 'DELETE',
    }))
    expect(res.status).toBe(401)
  })
})

// ─── GET /api/envman/aliases/resolve/:ref ────────────────────────────────────

describe('GET /api/envman/aliases/resolve/:ref', () => {
  test('returns args for member', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/aliases/resolve/${encodeURIComponent(`${projectSlug}:deploy`)}`, {
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.args).toBeString()
    expect(body.project).toBe(projectSlug)
    expect(body.alias).toBe('deploy')
  })

  test('VIEWER can resolve', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/aliases/resolve/${encodeURIComponent(`${projectSlug}:deploy`)}`, {
      headers: authHeader(viewerToken),
    }))
    expect(res.status).toBe(200)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/aliases/resolve/${encodeURIComponent(`${projectSlug}:deploy`)}`))
    expect(res.status).toBe(401)
  })

  test('returns 403 for non-member', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/aliases/resolve/${encodeURIComponent(`${projectSlug}:deploy`)}`, {
      headers: authHeader(outsiderToken),
    }))
    expect(res.status).toBe(403)
  })

  test('returns 404 for non-existent alias', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/aliases/resolve/${encodeURIComponent(`${projectSlug}:ghost`)}`, {
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(404)
  })

  test('returns 400 for ref without colon', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/aliases/resolve/nocolon`, {
      headers: authHeader(ownerToken),
    }))
    expect(res.status).toBe(400)
  })
})
