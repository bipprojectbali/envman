import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// PUT .../vars (bulk upsert) — the endpoint `envman env push` relies on:
// upsert per key, secret encryption via `secrets[]`, and auth guards.

const app = createTestApp()
const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })
const slug = 'vbulk-proj'
const env = 'prod'
let ownerToken: string
let viewerToken: string

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('vbulk-owner@test.com', 'pass123', 'VBulkOwner', 'ADMIN')
  ownerToken = await createTestSession(owner.id)
  const viewer = await seedTestUser('vbulk-viewer@test.com', 'pass123', 'VBulkViewer', 'USER')
  viewerToken = await createTestSession(viewer.id)

  const project = await prisma.project.create({ data: { slug, name: 'VBulk Project', createdById: owner.id } })
  await prisma.projectMember.create({ data: { userId: owner.id, projectId: project.id, role: 'OWNER' } })
  await prisma.projectMember.create({ data: { userId: viewer.id, projectId: project.id, role: 'VIEWER' } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const putVars = (token: string, body: unknown) =>
  app.handle(
    new Request(`http://localhost/api/envman/projects/${slug}/environments/${env}/vars`, {
      method: 'PUT',
      headers: authHeader(token),
      body: JSON.stringify(body),
    }),
  )

describe('PUT /environments/:env/vars — bulk upsert', () => {
  test('OWNER creates vars on a new env (auto-creates environment)', async () => {
    const res = await putVars(ownerToken, { vars: { PORT: '3000', APP_NAME: 'demo' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.count).toBe(2)

    const environment = await prisma.environment.findFirst({ where: { name: env, project: { slug } } })
    expect(environment).not.toBeNull()
    const vars = await prisma.envVar.findMany({ where: { environmentId: environment!.id } })
    expect(vars.map((v) => v.key).sort()).toEqual(['APP_NAME', 'PORT'])
  })

  test('re-PUT updates existing key value (upsert), keeps others', async () => {
    await putVars(ownerToken, { vars: { PORT: '8080' } })
    const environment = await prisma.environment.findFirst({ where: { name: env, project: { slug } } })
    const port = await prisma.envVar.findFirst({ where: { environmentId: environment!.id, key: 'PORT' } })
    expect(port!.value).toBe('8080')
    // APP_NAME from previous test still present (not deleted)
    const appName = await prisma.envVar.findFirst({ where: { environmentId: environment!.id, key: 'APP_NAME' } })
    expect(appName).not.toBeNull()
  })

  test('secrets[] marks a key encrypted (stored value != plaintext)', async () => {
    const res = await putVars(ownerToken, { vars: { API_TOKEN: 'super-secret' }, secrets: ['API_TOKEN'] })
    expect(res.status).toBe(200)
    const environment = await prisma.environment.findFirst({ where: { name: env, project: { slug } } })
    const tok = await prisma.envVar.findFirst({ where: { environmentId: environment!.id, key: 'API_TOKEN' } })
    expect(tok!.isSecret).toBe(true)
    expect(tok!.value).not.toBe('super-secret') // encrypted at rest
    expect(tok!.value).toContain('enc:') // AES-GCM format prefix
  })

  test('VIEWER cannot push (403)', async () => {
    const res = await putVars(viewerToken, { vars: { X: '1' } })
    expect(res.status).toBe(403)
  })

  test('missing vars object → 400', async () => {
    const res = await putVars(ownerToken, {})
    expect(res.status).toBe(400)
  })

  test('unauthorized (no session) → 401', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/environments/${env}/vars`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars: { X: '1' } }),
      }),
    )
    expect(res.status).toBe(401)
  })
})
