/**
 * Verifikasi bulk operasi yang dilakukan FE via fan-out endpoint existing:
 * - Bulk PATCH project member role
 * - Bulk PUT env override
 * - Partial failure: last-owner protection ditolak per-item, sisanya success
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let ownerId: string
let userAId: string
let userBId: string
let userCId: string
let ownerToken: string
const projectSlug = 'bulk-test-proj'
let projectId: string

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('bulk-owner@test.com', 'pass123', 'BulkOwner', 'ADMIN')
  const a = await seedTestUser('bulk-a@test.com', 'pass123', 'UserA', 'ADMIN')
  const b = await seedTestUser('bulk-b@test.com', 'pass123', 'UserB', 'ADMIN')
  const c = await seedTestUser('bulk-c@test.com', 'pass123', 'UserC', 'ADMIN')
  ownerId = owner.id
  userAId = a.id
  userBId = b.id
  userCId = c.id
  ownerToken = await createTestSession(ownerId)

  await app.handle(
    new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ slug: projectSlug, name: 'Bulk Test' }),
    }),
  )
  const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
  projectId = project!.id
  await prisma.environment.create({ data: { name: 'prod', projectId } })
  await prisma.environment.create({ data: { name: 'dev', projectId } })
  await prisma.environment.create({ data: { name: 'staging', projectId } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

beforeEach(async () => {
  // Reset: keep owner; reset 3 user as VIEWER members fresh
  await prisma.environmentMember.deleteMany({ where: { environment: { projectId } } })
  await prisma.projectMember.deleteMany({
    where: { projectId, userId: { in: [userAId, userBId, userCId] } },
  })
  await prisma.projectMember.createMany({
    data: [
      { projectId, userId: userAId, role: 'VIEWER' },
      { projectId, userId: userBId, role: 'VIEWER' },
      { projectId, userId: userCId, role: 'VIEWER' },
    ],
  })
})

describe('bulk PATCH project member role', () => {
  test('all 3 users updated to EDITOR', async () => {
    const ids = [userAId, userBId, userCId]
    const results = await Promise.allSettled(
      ids.map((uid) =>
        app.handle(
          new Request(`http://localhost/api/envman/projects/${projectSlug}/members/${uid}`, {
            method: 'PATCH',
            headers: authHeader(ownerToken),
            body: JSON.stringify({ role: 'EDITOR' }),
          }),
        ),
      ),
    )
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    for (const r of results) {
      if (r.status === 'fulfilled') expect(r.value.status).toBe(200)
    }

    const updated = await prisma.projectMember.findMany({
      where: { projectId, userId: { in: ids } },
    })
    expect(updated.every((m) => m.role === 'EDITOR')).toBe(true)
  })
})

describe('bulk PUT env override', () => {
  test('2 users × 3 envs = 6 calls all updated', async () => {
    const userIds = [userAId, userBId]
    const envs = ['prod', 'dev', 'staging']
    const pairs = userIds.flatMap((u) => envs.map((e) => ({ u, e })))
    const results = await Promise.allSettled(
      pairs.map(({ u, e }) =>
        app.handle(
          new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/${e}/members/${u}`, {
            method: 'PUT',
            headers: authHeader(ownerToken),
            body: JSON.stringify({ role: 'denied' }),
          }),
        ),
      ),
    )
    expect(results).toHaveLength(6)
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    for (const r of results) {
      if (r.status === 'fulfilled') expect(r.value.status).toBe(200)
    }

    const overrides = await prisma.environmentMember.findMany({
      where: { environment: { projectId }, userId: { in: userIds } },
    })
    expect(overrides.length).toBe(6)
    expect(overrides.every((o) => o.role === null)).toBe(true)
  })
})

describe('partial failure: last-owner protection', () => {
  test('1 last-owner demote fails (400), 2 sisanya success', async () => {
    // Promote userA jadi project OWNER; deny creator (ownerId) di prod via env override
    // → di env prod, satu-satunya effective project OWNER adalah userA. Demote userA pada prod harus 400.
    // userB/userC tetap VIEWER project, jadi env override mereka aman.
    await prisma.projectMember.update({
      where: { userId_projectId: { userId: userAId, projectId } },
      data: { role: 'OWNER' },
    })
    await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/members/${ownerId}`, {
        method: 'PUT',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ role: 'denied' }),
      }),
    )

    const ids = [userAId, userBId, userCId]
    const results = await Promise.allSettled(
      ids.map((uid) =>
        app.handle(
          new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/members/${uid}`, {
            method: 'PUT',
            headers: authHeader(ownerToken),
            body: JSON.stringify({ role: 'EDITOR' }),
          }),
        ),
      ),
    )
    const statuses = await Promise.all(
      results.map(async (r) => (r.status === 'fulfilled' ? r.value.status : 0)),
    )
    // userA: 400 last-owner; userB & userC: 200 (upsert env override EDITOR)
    expect(statuses.filter((s) => s === 400)).toHaveLength(1)
    expect(statuses.filter((s) => s === 200)).toHaveLength(2)
  })
})
