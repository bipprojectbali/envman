import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// storageStats (badge tab Storage) di GET /projects/:slug — aggregate count+size,
// hanya untuk caller yang punya akses section STORAGE.

const app = createTestApp()
const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })
const slug = 'sstats-proj'
let ownerToken: string
let deniedToken: string

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('sstats-owner@test.com', 'pass123', 'SstatsOwner', 'ADMIN')
  ownerToken = await createTestSession(owner.id)
  const denied = await seedTestUser('sstats-denied@test.com', 'pass123', 'SstatsDenied', 'USER')
  deniedToken = await createTestSession(denied.id)

  const project = await prisma.project.create({ data: { slug, name: 'Sstats Project', createdById: owner.id } })
  await prisma.projectMember.create({ data: { userId: owner.id, projectId: project.id, role: 'OWNER' } })

  // Anggota project tapi section STORAGE di-deny (role=null).
  await prisma.projectMember.create({ data: { userId: denied.id, projectId: project.id, role: 'VIEWER' } })
  await prisma.projectSectionMember.create({
    data: { userId: denied.id, projectId: project.id, section: 'STORAGE', role: null },
  })

  // Dua objek storage: total 2 file, 300 byte.
  await prisma.projectStorageObject.createMany({
    data: [
      { projectId: project.id, path: 'a.txt', minioKey: `${project.id}/a.txt`, size: 100, mimeType: 'text/plain', uploadedById: owner.id },
      { projectId: project.id, path: 'sub/b.bin', minioKey: `${project.id}/sub/b.bin`, size: 200, mimeType: 'application/octet-stream', uploadedById: owner.id },
    ],
  })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

async function getDetail(token: string) {
  const res = await app.handle(new Request(`http://localhost/api/envman/projects/${slug}`, { headers: authHeader(token) }))
  return { status: res.status, body: (await res.json()) as any }
}

describe('GET /projects/:slug — storageStats', () => {
  test('OWNER dengan akses STORAGE → count+size agregat seluruh project', async () => {
    const { status, body } = await getDetail(ownerToken)
    expect(status).toBe(200)
    expect(body.project.storageStats).toEqual({ fileCount: 2, usedBytes: 300 })
  })

  test('member dengan STORAGE denied → storageStats tidak dikirim (undefined)', async () => {
    const { status, body } = await getDetail(deniedToken)
    expect(status).toBe(200)
    expect(body.project.storageStats).toBeUndefined()
  })
})
