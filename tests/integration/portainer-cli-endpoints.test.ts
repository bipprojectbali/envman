import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Menguji endpoint baru untuk CLI portainer: restart (stack:power) & logs/stream (SSE).
// Tak ada server Portainer nyata → bedakan 403 (ditolak GATE) vs status lain (lolos gate,
// gagal di step Portainer). Assert utama: gate capability/akses berperilaku benar.

const app = createTestApp()
const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

const slug = 'ptcli-proj'
let superToken: string
let noCapToken: string

async function userWith(email: string, perms: string[]) {
  const u = await seedTestUser(email, 'pass123', email, 'USER', perms)
  return { id: u.id, token: await createTestSession(u.id) }
}

beforeAll(async () => {
  await cleanupTestData()
  const superU = await seedTestUser('ptcli-super@test.com', 'pass123', 'PtcliSuper', 'SUPER_ADMIN')
  superToken = await createTestSession(superU.id)
  const noCap = await userWith('ptcli-nocap@test.com', [])
  noCapToken = noCap.token

  const project = await prisma.project.create({ data: { slug, name: 'Ptcli Project' } })
  await prisma.environment.create({ data: { name: 'prod', projectId: project.id } })
  const conn = await prisma.portainerConnection.create({
    data: { name: 'ptcli-conn', portainerUrl: 'http://127.0.0.1:59998', apiToken: 'dummy', createdById: superU.id },
  })
  await prisma.portainerConfig.create({
    data: { projectId: project.id, envName: 'prod', connectionId: conn.id, stackId: 1, stackName: 'ptcli-stack', endpointId: 1 },
  })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const restartUrl = `http://localhost/api/envman/projects/${slug}/environments/prod/portainer/restart`

describe('POST portainer/restart — gate stack:power', () => {
  test('tanpa auth → 401', async () => {
    const res = await app.handle(new Request(restartUrl, { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  test('user tanpa cap & bukan member → 403', async () => {
    const res = await app.handle(new Request(restartUrl, { method: 'POST', headers: authHeader(noCapToken) }))
    expect(res.status).toBe(403)
  })

  test('user dengan stack:power → lolos gate (bukan 401/403)', async () => {
    const { token } = await userWith('ptcli-power@test.com', ['stack:power'])
    const res = await app.handle(new Request(restartUrl, { method: 'POST', headers: authHeader(token) }))
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(401)
  })

  test('env belum dikonfigurasi Portainer → 404', async () => {
    const url = `http://localhost/api/envman/projects/${slug}/environments/nonexistent/portainer/restart`
    const res = await app.handle(new Request(url, { method: 'POST', headers: authHeader(superToken) }))
    expect(res.status).toBe(404)
  })
})

const streamUrl = `http://localhost/api/envman/projects/${slug}/environments/prod/portainer/logs/abc123/stream`

describe('GET portainer/logs/:id/stream — gate akses env', () => {
  test('tanpa auth → 401', async () => {
    const res = await app.handle(new Request(streamUrl))
    expect(res.status).toBe(401)
  })

  test('user tanpa akses env → 403', async () => {
    const res = await app.handle(new Request(streamUrl, { headers: authHeader(noCapToken) }))
    expect(res.status).toBe(403)
  })

  test('env tanpa config → 404 (SUPER_ADMIN lolos gate akses)', async () => {
    const url = `http://localhost/api/envman/projects/${slug}/environments/nonexistent/portainer/logs/abc/stream`
    const res = await app.handle(new Request(url, { headers: authHeader(superToken) }))
    expect(res.status).toBe(404)
  })
})
