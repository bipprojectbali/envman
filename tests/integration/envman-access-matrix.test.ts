import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let ownerId: string
let editorId: string
let viewerId: string
let outsiderId: string
let superAdminId: string
let ownerToken: string
let editorToken: string
let viewerToken: string
let outsiderToken: string
let superAdminToken: string
const projectSlug = 'am-test-proj'

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

beforeAll(async () => {
  await cleanupTestData()

  const owner = await seedTestUser('am-owner@test.com', 'pass123', 'AmOwner', 'ADMIN')
  const editor = await seedTestUser('am-editor@test.com', 'pass123', 'AmEditor', 'ADMIN')
  const viewer = await seedTestUser('am-viewer@test.com', 'pass123', 'AmViewer', 'ADMIN')
  const outsider = await seedTestUser('am-outsider@test.com', 'pass123', 'AmOutsider', 'ADMIN')
  const superAdmin = await seedTestUser('am-super@test.com', 'pass123', 'AmSuper', 'SUPER_ADMIN')
  ownerId = owner.id
  editorId = editor.id
  viewerId = viewer.id
  outsiderId = outsider.id
  superAdminId = superAdmin.id
  ownerToken = await createTestSession(ownerId)
  editorToken = await createTestSession(editorId)
  viewerToken = await createTestSession(viewerId)
  outsiderToken = await createTestSession(outsiderId)
  superAdminToken = await createTestSession(superAdminId)

  await app.handle(
    new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ slug: projectSlug, name: 'AM Test' }),
    }),
  )
  const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
  await prisma.projectMember.create({ data: { projectId: project!.id, userId: editorId, role: 'EDITOR' } })
  await prisma.projectMember.create({ data: { projectId: project!.id, userId: viewerId, role: 'VIEWER' } })
  await prisma.environment.create({ data: { name: 'prod', projectId: project!.id } })
  await prisma.environment.create({ data: { name: 'dev', projectId: project!.id } })
  await prisma.environment.create({ data: { name: 'staging', projectId: project!.id } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/envman/projects/:slug/access-matrix', () => {
  test('OWNER receives full matrix with default inherit', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/access-matrix`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.slug).toBe(projectSlug)
    expect(body.environments.map((e: { name: string }) => e.name).sort()).toEqual(['dev', 'prod', 'staging'])
    expect(body.members).toBeArray()
    expect(body.members.length).toBe(3)

    const editorRow = body.members.find((m: { userId: string }) => m.userId === editorId)
    expect(editorRow.projectRole).toBe('EDITOR')
    expect(editorRow.envAccess.prod.envRole).toBe('inherit')
    expect(editorRow.envAccess.prod.effectiveRole).toBe('EDITOR')
    expect(editorRow.envAccess.dev.effectiveRole).toBe('EDITOR')

    const viewerRow = body.members.find((m: { userId: string }) => m.userId === viewerId)
    expect(viewerRow.projectRole).toBe('VIEWER')
    expect(viewerRow.envAccess.prod.effectiveRole).toBe('VIEWER')
  })

  test('SUPER_ADMIN can access matrix on any project', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/access-matrix`, {
        headers: authHeader(superAdminToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members.length).toBe(3)
  })

  test('matrix reflects env override after PUT', async () => {
    await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/members/${editorId}`, {
        method: 'PUT',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ role: 'denied' }),
      }),
    )
    await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/dev/members/${viewerId}`, {
        method: 'PUT',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ role: 'OWNER' }),
      }),
    )

    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/access-matrix`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const editorRow = body.members.find((m: { userId: string }) => m.userId === editorId)
    expect(editorRow.envAccess.prod.envRole).toBe('denied')
    expect(editorRow.envAccess.prod.effectiveRole).toBeNull()
    expect(editorRow.envAccess.dev.envRole).toBe('inherit')

    const viewerRow = body.members.find((m: { userId: string }) => m.userId === viewerId)
    expect(viewerRow.envAccess.dev.envRole).toBe('OWNER')
    expect(viewerRow.envAccess.dev.effectiveRole).toBe('OWNER')
  })

  test('EDITOR cannot access matrix', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/access-matrix`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('VIEWER cannot access matrix', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/access-matrix`, {
        headers: authHeader(viewerToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('outsider (not a member) gets 403', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/access-matrix`, {
        headers: authHeader(outsiderToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('no session gets 401', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/access-matrix`),
    )
    expect(res.status).toBe(401)
  })

  test('non-existent project returns 404 for SUPER_ADMIN', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/does-not-exist/access-matrix`, {
        headers: authHeader(superAdminToken),
      }),
    )
    expect(res.status).toBe(404)
  })
})
