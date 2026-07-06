import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createTestApp, seedTestUser, createTestSession, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

let adminId: string
let userId: string
let adminToken: string
let userToken: string
let projectSlug: string

beforeAll(async () => {
  await cleanupTestData()
  const admin = await seedTestUser('proj-admin@test.com', 'pass123', 'ProjAdmin', 'ADMIN')
  const user = await seedTestUser('proj-user@test.com', 'pass123', 'ProjUser', 'USER')
  adminId = admin.id
  userId = user.id
  adminToken = await createTestSession(adminId)
  userToken = await createTestSession(userId)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

describe('GET /api/envman/projects', () => {
  test('returns project list for authenticated user', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      headers: authHeader(adminToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.projects).toBeArray()
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects'))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/envman/projects', () => {
  test('ADMIN creates project and becomes OWNER', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ slug: 'test-proj', name: 'Test Project', description: 'desc' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.slug).toBe('test-proj')
    projectSlug = 'test-proj'

    // Verify membership created
    const member = await prisma.projectMember.findFirst({
      where: { userId: adminId, project: { slug: 'test-proj' } },
    })
    expect(member?.role).toBe('OWNER')
  })

  test('project baru mencatat createdById = pembuat', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ slug: 'creator-proj', name: 'Creator Project' }),
    }))
    expect(res.status).toBe(200)
    const created = await prisma.project.findUnique({ where: { slug: 'creator-proj' }, select: { createdById: true } })
    expect(created?.createdById).toBe(adminId)
  })

  test('list membawa createdBy object untuk tiap project', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      headers: authHeader(adminToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const proj = body.projects.find((p: any) => p.slug === 'creator-proj')
    expect(proj).toBeDefined()
    expect(proj.createdById).toBe(adminId)
    expect(proj.createdBy?.id).toBe(adminId)
    expect(proj.createdBy?.name).toBe('ProjAdmin')
  })

  test('slug duplikat returns 400', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ slug: 'test-proj', name: 'Duplicate' }),
    }))
    expect(res.status).toBe(400)
  })

  test('USER cannot create project (403)', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(userToken),
      body: JSON.stringify({ slug: 'user-proj', name: 'User Project' }),
    }))
    expect(res.status).toBe(403)
  })

  test('missing slug returns 400', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ name: 'No Slug' }),
    }))
    expect(res.status).toBe(400)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'no-auth', name: 'No Auth' }),
    }))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/envman/projects/:slug', () => {
  test('returns project detail for member', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}`, {
      headers: authHeader(adminToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.slug).toBe(projectSlug)
    expect(body.project.members).toBeArray()
    expect(body.project.environments).toBeArray()
  })

  test('non-member gets 403', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}`, {
      headers: authHeader(userToken),
    }))
    expect(res.status).toBe(403)
  })

  test('unknown slug returns 404', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects/not-exist', {
      headers: authHeader(adminToken),
    }))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/envman/projects/:slug/environments', () => {
  test('OWNER adds environment', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/environments`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ name: 'production' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.environment.name).toBe('production')
  })

  test('duplicate env name returns 400', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/environments`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ name: 'production' }),
    }))
    expect(res.status).toBe(400)
  })

  test('returns 401 without auth', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/environments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'staging' }),
    }))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/envman/projects/:slug/environments/:env/vars', () => {
  test('OWNER can list vars (initially empty)', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/environments/production/vars`,
      { headers: authHeader(adminToken) }
    ))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vars).toBeArray()
  })

  test('non-member gets 403', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/environments/production/vars`,
      { headers: authHeader(userToken) }
    ))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/envman/projects/:slug/environments/:env/vars', () => {
  test('OWNER can create/update var', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/environments/production/vars`,
      {
        method: 'POST',
        headers: authHeader(adminToken),
        body: JSON.stringify({ key: 'DATABASE_URL', value: 'postgres://localhost/test', isSecret: false }),
      }
    ))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.var.key).toBe('DATABASE_URL')
  })

  test('missing key returns 400', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/environments/production/vars`,
      {
        method: 'POST',
        headers: authHeader(adminToken),
        body: JSON.stringify({ value: 'no-key' }),
      }
    ))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/envman/projects/:slug/environments/:env/vars/:key', () => {
  test('OWNER can delete var', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/environments/production/vars/DATABASE_URL`,
      { method: 'DELETE', headers: authHeader(adminToken) }
    ))
    expect(res.status).toBe(200)
  })

  test('non-existent key returns 404', async () => {
    const res = await app.handle(new Request(
      `http://localhost/api/envman/projects/${projectSlug}/environments/production/vars/GHOST_KEY`,
      { method: 'DELETE', headers: authHeader(adminToken) }
    ))
    expect(res.status).toBe(404)
  })
})
