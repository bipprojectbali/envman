import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let superAdminId: string
let ownerId: string
let editorId: string
let superAdminToken: string
const projectSlug = 'admin-em-proj'

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

// audit() is fire-and-forget — poll briefly until the row lands.
async function waitForAuditCount(action: string, expected: number, timeoutMs = 1000): Promise<number> {
  const deadline = Date.now() + timeoutMs
  let count = 0
  while (Date.now() < deadline) {
    count = await prisma.auditLog.count({ where: { action } })
    if (count >= expected) return count
    await new Promise((r) => setTimeout(r, 25))
  }
  return count
}

beforeAll(async () => {
  await cleanupTestData()

  const superAdmin = await seedTestUser('admin-em-su@test.com', 'pass123', 'SuperAdmin', 'SUPER_ADMIN')
  const owner = await seedTestUser('admin-em-owner@test.com', 'pass123', 'Owner', 'ADMIN')
  const editor = await seedTestUser('admin-em-editor@test.com', 'pass123', 'Editor', 'ADMIN')
  superAdminId = superAdmin.id
  ownerId = owner.id
  editorId = editor.id
  superAdminToken = await createTestSession(superAdminId)
  const ownerToken = await createTestSession(ownerId)

  await app.handle(
    new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ slug: projectSlug, name: 'Admin EM Test' }),
    }),
  )
  const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
  await prisma.projectMember.create({ data: { projectId: project!.id, userId: editorId, role: 'EDITOR' } })
  await prisma.environment.create({ data: { name: 'prod', projectId: project!.id } })
  await prisma.environment.create({ data: { name: 'dev', projectId: project!.id } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('PUT /api/envman/admin/users/:userId/projects/:slug/envs/:envName', () => {
  test('SUPER_ADMIN can set env override (denied) for project member and emits ENV_MEMBER_SET audit', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'ENV_MEMBER_SET' } })
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${editorId}/projects/${projectSlug}/envs/prod`,
        {
          method: 'PUT',
          headers: authHeader(superAdminToken),
          body: JSON.stringify({ role: 'denied' }),
        },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.role).toBe('denied')

    // Audit log emitted with caller=superAdminId
    const after = await waitForAuditCount('ENV_MEMBER_SET', before + 1)
    expect(after).toBe(before + 1)
    const log = await prisma.auditLog.findFirst({
      where: { action: 'ENV_MEMBER_SET', userId: superAdminId },
      orderBy: { createdAt: 'desc' },
    })
    expect(log).toBeTruthy()
    expect(log!.detail).toContain(`${projectSlug}/prod`)
    expect(log!.detail).toContain('(admin)')
  })

  test('inherit emits ENV_MEMBER_CLEARED audit', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'ENV_MEMBER_CLEARED' } })
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${editorId}/projects/${projectSlug}/envs/prod`,
        {
          method: 'PUT',
          headers: authHeader(superAdminToken),
          body: JSON.stringify({ role: 'inherit' }),
        },
      ),
    )
    expect(res.status).toBe(200)
    const after = await waitForAuditCount('ENV_MEMBER_CLEARED', before + 1)
    expect(after).toBe(before + 1)
  })

  test('rejects override for non-project-member', async () => {
    const ghost = await seedTestUser('admin-em-ghost@test.com', 'pass123', 'Ghost', 'USER')
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${ghost.id}/projects/${projectSlug}/envs/prod`,
        {
          method: 'PUT',
          headers: authHeader(superAdminToken),
          body: JSON.stringify({ role: 'EDITOR' }),
        },
      ),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/member project/)
  })

  test('rejects demoting last OWNER of an env', async () => {
    // owner is the only OWNER on dev (inherit). Try to deny them via admin endpoint.
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${ownerId}/projects/${projectSlug}/envs/dev`,
        {
          method: 'PUT',
          headers: authHeader(superAdminToken),
          body: JSON.stringify({ role: 'denied' }),
        },
      ),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/OWNER terakhir/)
  })

  test('non-SUPER_ADMIN rejected with 403', async () => {
    const editorToken = await createTestSession(editorId)
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${editorId}/projects/${projectSlug}/envs/prod`,
        {
          method: 'PUT',
          headers: authHeader(editorToken),
          body: JSON.stringify({ role: 'denied' }),
        },
      ),
    )
    expect(res.status).toBe(403)
  })

  test('invalid role payload rejected with 400', async () => {
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${editorId}/projects/${projectSlug}/envs/prod`,
        {
          method: 'PUT',
          headers: authHeader(superAdminToken),
          body: JSON.stringify({ role: 'GOD' }),
        },
      ),
    )
    expect(res.status).toBe(400)
  })
})
