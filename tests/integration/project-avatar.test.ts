import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Menguji kustomisasi avatar project (icon + background color) via PATCH.
// Validasi: hanya nilai dari registry/palet yang tersimpan; null = reset;
// hanya OWNER yang boleh; nilai ngawur diabaikan (tak masuk DB).

const app = createTestApp()

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })
const slug = 'avatar-proj'
let ownerToken: string
let editorToken: string

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('av-owner@test.com', 'pass123', 'AvOwner', 'ADMIN')
  const editor = await seedTestUser('av-editor@test.com', 'pass123', 'AvEditor', 'ADMIN')
  ownerToken = await createTestSession(owner.id)
  editorToken = await createTestSession(editor.id)

  const project = await prisma.project.create({ data: { slug, name: 'Avatar Project' } })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id, role: 'OWNER' } })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: editor.id, role: 'EDITOR' } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const patch = (token: string, body: unknown) =>
  app.handle(
    new Request(`http://localhost/api/envman/projects/${slug}`, {
      method: 'PATCH',
      headers: authHeader(token),
      body: JSON.stringify(body),
    }),
  )

const getIconColor = async () => {
  const p = await prisma.project.findUnique({
    where: { slug },
    select: { icon: true, color: true, cardColor: true },
  })
  return p
}

describe('PATCH avatar icon/color', () => {
  test('OWNER set icon + color valid → tersimpan', async () => {
    const res = await patch(ownerToken, { name: 'Avatar Project', icon: 'TbCloud', color: 'grape' })
    expect(res.status).toBe(200)
    const ic = await getIconColor()
    expect(ic?.icon).toBe('TbCloud')
    expect(ic?.color).toBe('grape')
  })

  test('OWNER set cardColor valid → tersimpan; tak valid diabaikan', async () => {
    const ok = await patch(ownerToken, { name: 'Avatar Project', cardColor: 'blue' })
    expect(ok.status).toBe(200)
    expect((await getIconColor())?.cardColor).toBe('blue')
    const bad = await patch(ownerToken, { name: 'Avatar Project', cardColor: '#hack' })
    expect(bad.status).toBe(200)
    expect((await getIconColor())?.cardColor).toBe('blue') // dipertahankan
    const reset = await patch(ownerToken, { name: 'Avatar Project', cardColor: null })
    expect(reset.status).toBe(200)
    expect((await getIconColor())?.cardColor).toBeNull()
  })

  test('icon tak valid → diabaikan (nilai lama dipertahankan)', async () => {
    const res = await patch(ownerToken, { name: 'Avatar Project', icon: 'rm -rf /' })
    expect(res.status).toBe(200)
    expect((await getIconColor())?.icon).toBe('TbCloud') // tetap nilai valid sebelumnya
  })

  test('color tak valid → diabaikan', async () => {
    const res = await patch(ownerToken, { name: 'Avatar Project', color: '#deadbeef' })
    expect(res.status).toBe(200)
    expect((await getIconColor())?.color).toBe('grape')
  })

  test('reset icon ke null → tersimpan null', async () => {
    const res = await patch(ownerToken, { name: 'Avatar Project', icon: null })
    expect(res.status).toBe(200)
    expect((await getIconColor())?.icon).toBeNull()
  })

  test('EDITOR tidak boleh set avatar → 403', async () => {
    const res = await patch(editorToken, { name: 'Avatar Project', icon: 'TbRocket' })
    expect(res.status).toBe(403)
  })

  test('GET detail memuat icon/color', async () => {
    await patch(ownerToken, { name: 'Avatar Project', icon: 'TbServer', color: 'teal' })
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}`, { headers: authHeader(ownerToken) }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.icon).toBe('TbServer')
    expect(body.project.color).toBe('teal')
  })
})
