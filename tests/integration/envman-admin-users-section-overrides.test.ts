import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let superAdminId: string
let ownerId: string
let editorId: string
let superAdminToken: string
let editorToken: string
const projectSlug = 'admin-sec-proj'

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

  const superAdmin = await seedTestUser('admin-sec-su@test.com', 'pass123', 'SuperAdmin', 'SUPER_ADMIN')
  const owner = await seedTestUser('admin-sec-owner@test.com', 'pass123', 'Owner', 'ADMIN')
  const editor = await seedTestUser('admin-sec-editor@test.com', 'pass123', 'Editor', 'ADMIN')
  superAdminId = superAdmin.id
  ownerId = owner.id
  editorId = editor.id
  superAdminToken = await createTestSession(superAdminId)
  editorToken = await createTestSession(editorId)
  const ownerToken = await createTestSession(ownerId)

  await app.handle(
    new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ slug: projectSlug, name: 'Admin Sec Test' }),
    }),
  )
  const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
  await prisma.projectMember.create({ data: { projectId: project!.id, userId: editorId, role: 'EDITOR' } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('PUT /api/envman/admin/users/:userId/projects/:slug/sections/:section', () => {
  test('SUPER_ADMIN set section override (denied) + audit SECTION_MEMBER_SET (admin)', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'SECTION_MEMBER_SET' } })
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${editorId}/projects/${projectSlug}/sections/NOTES`,
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

    const after = await waitForAuditCount('SECTION_MEMBER_SET', before + 1)
    expect(after).toBe(before + 1)
    const log = await prisma.auditLog.findFirst({
      where: { action: 'SECTION_MEMBER_SET', userId: superAdminId },
      orderBy: { createdAt: 'desc' },
    })
    expect(log!.detail).toContain(`${projectSlug}/NOTES`)
    expect(log!.detail).toContain('(admin)')
  })

  test('editor kehilangan akses notes setelah admin deny', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/notes`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('inherit emits SECTION_MEMBER_CLEARED audit', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'SECTION_MEMBER_CLEARED' } })
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${editorId}/projects/${projectSlug}/sections/NOTES`,
        {
          method: 'PUT',
          headers: authHeader(superAdminToken),
          body: JSON.stringify({ role: 'inherit' }),
        },
      ),
    )
    expect(res.status).toBe(200)
    const after = await waitForAuditCount('SECTION_MEMBER_CLEARED', before + 1)
    expect(after).toBe(before + 1)
  })

  test('reject target non-member → 400', async () => {
    const stranger = await seedTestUser('admin-sec-stranger@test.com', 'pass123', 'Stranger', 'ADMIN')
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${stranger.id}/projects/${projectSlug}/sections/NOTES`,
        {
          method: 'PUT',
          headers: authHeader(superAdminToken),
          body: JSON.stringify({ role: 'VIEWER' }),
        },
      ),
    )
    expect(res.status).toBe(400)
  })

  test('reject section tidak valid → 400', async () => {
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${editorId}/projects/${projectSlug}/sections/BOGUS`,
        {
          method: 'PUT',
          headers: authHeader(superAdminToken),
          body: JSON.stringify({ role: 'VIEWER' }),
        },
      ),
    )
    expect(res.status).toBe(400)
  })

  test('non-SUPER_ADMIN → 403', async () => {
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${editorId}/projects/${projectSlug}/sections/NOTES`,
        {
          method: 'PUT',
          headers: authHeader(editorToken),
          body: JSON.stringify({ role: 'VIEWER' }),
        },
      ),
    )
    expect(res.status).toBe(403)
  })

  test('invalid payload → 400', async () => {
    const res = await app.handle(
      new Request(
        `http://localhost/api/envman/admin/users/${editorId}/projects/${projectSlug}/sections/NOTES`,
        {
          method: 'PUT',
          headers: authHeader(superAdminToken),
          body: JSON.stringify({ role: 'BOGUS' }),
        },
      ),
    )
    expect(res.status).toBe(400)
  })
})
