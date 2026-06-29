import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let ownerId: string
let userAId: string
let userBId: string
let ownerToken: string
const projectSlug = 'mdd-test-proj'

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

beforeAll(async () => {
  await cleanupTestData()

  const owner = await seedTestUser('mdd-owner@test.com', 'pass123', 'MddOwner', 'ADMIN')
  const userA = await seedTestUser('mdd-a@test.com', 'pass123', 'MddA', 'ADMIN')
  const userB = await seedTestUser('mdd-b@test.com', 'pass123', 'MddB', 'ADMIN')
  ownerId = owner.id
  userAId = userA.id
  userBId = userB.id
  ownerToken = await createTestSession(ownerId)

  await app.handle(
    new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ slug: projectSlug, name: 'MDD Test' }),
    }),
  )
  const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
  await prisma.environment.create({ data: { name: 'prod', projectId: project!.id } })
  await prisma.environment.create({ data: { name: 'dev', projectId: project!.id } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('POST /api/envman/projects/:slug/members — default deny env access', () => {
  test('new EDITOR is denied on all existing envs by default', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/members`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ userId: userAId, role: 'EDITOR' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.defaultDenied).toBe(true)

    const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
    const envs = await prisma.environment.findMany({ where: { projectId: project!.id } })
    const overrides = await prisma.environmentMember.findMany({
      where: { userId: userAId, environmentId: { in: envs.map((e) => e.id) } },
    })
    expect(overrides.length).toBe(2)
    expect(overrides.every((o) => o.role === null)).toBe(true)
  })

  test('matrix view reflects DENIED effectiveRole for new member', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/access-matrix`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const aRow = body.members.find((m: { userId: string }) => m.userId === userAId)
    expect(aRow.envAccess.prod.envRole).toBe('denied')
    expect(aRow.envAccess.prod.effectiveRole).toBe(null)
    expect(aRow.envAccess.dev.envRole).toBe('denied')
    expect(aRow.envAccess.dev.effectiveRole).toBe(null)
  })

  test('updating existing member role does NOT touch env overrides', async () => {
    await prisma.environmentMember.deleteMany({ where: { userId: userAId } })
    const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
    const prodEnv = await prisma.environment.findFirst({ where: { projectId: project!.id, name: 'prod' } })
    await prisma.environmentMember.create({
      data: { userId: userAId, environmentId: prodEnv!.id, role: 'OWNER' },
    })

    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/members`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ userId: userAId, role: 'VIEWER' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.defaultDenied).toBe(false)

    const override = await prisma.environmentMember.findFirst({
      where: { userId: userAId, environmentId: prodEnv!.id },
    })
    expect(override?.role).toBe('OWNER')
  })

  test('new env created later defaults to denied for existing non-owner members', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ name: 'staging' }),
      }),
    )
    expect(res.status).toBe(200)

    const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
    const stagingEnv = await prisma.environment.findFirst({
      where: { projectId: project!.id, name: 'staging' },
    })
    const override = await prisma.environmentMember.findFirst({
      where: { userId: userAId, environmentId: stagingEnv!.id },
    })
    expect(override?.role).toBe(null)
  })

  test('OWNER member does NOT get default-deny on new env', async () => {
    await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/members`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ userId: userBId, role: 'OWNER' }),
      }),
    )
    await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ name: 'qa' }),
      }),
    )
    const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
    const qaEnv = await prisma.environment.findFirst({ where: { projectId: project!.id, name: 'qa' } })
    const override = await prisma.environmentMember.findFirst({
      where: { userId: userBId, environmentId: qaEnv!.id },
    })
    expect(override).toBe(null)
  })
})
