import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Menguji ENFORCEMENT capability Portainer granular (delegasi tanpa SUPER_ADMIN).
// Catatan: tak ada server Portainer nyata di test — jadi kita bedakan
//   403 = ditolak GATE capability (yang diuji), vs
//   status lain (404/400/500) = LOLOS gate, gagal di step Portainer berikutnya.
// Assert utamanya: user tanpa cap → 403; user dengan cap → BUKAN 403.

const app = createTestApp()

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

const slug = 'pcap-proj'
let connId: string
let superToken: string
let noCapToken: string
let noCapUserId: string

// helper: seed USER dengan set capability tertentu, balikan session token
async function userWith(email: string, perms: string[]) {
  const u = await seedTestUser(email, 'pass123', email, 'USER', perms)
  return { id: u.id, token: await createTestSession(u.id) }
}

beforeAll(async () => {
  await cleanupTestData()

  const superU = await seedTestUser('pcap-super@test.com', 'pass123', 'PcapSuper', 'SUPER_ADMIN')
  superToken = await createTestSession(superU.id)

  const noCap = await userWith('pcap-nocap@test.com', [])
  noCapToken = noCap.token
  noCapUserId = noCap.id

  // Project + env (dibuat langsung via prisma agar deterministik)
  const project = await prisma.project.create({ data: { slug, name: 'Pcap Project' } })
  await prisma.environment.create({ data: { name: 'prod', projectId: project.id } })

  // Portainer connection + config env (URL dummy — tak akan benar-benar dihubungi
  // karena test berhenti di gate 403 / step resolve sebelum fetch).
  const conn = await prisma.portainerConnection.create({
    data: { name: 'pcap-conn', portainerUrl: 'http://127.0.0.1:59999', apiToken: 'dummy', createdById: superU.id },
  })
  connId = conn.id
  await prisma.portainerConfig.create({
    data: {
      projectId: project.id,
      envName: 'prod',
      connectionId: conn.id,
      stackId: 1,
      stackName: 'pcap-stack',
      endpointId: 1,
    },
  })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('Security: probe tidak boleh pinjam apiToken project orang lain', () => {
  test('user tanpa akses env → probe dengan slug/env → 403', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/envman/portainer/probe', {
        method: 'POST',
        headers: authHeader(noCapToken),
        body: JSON.stringify({ portainerUrl: 'http://x', slug, envName: 'prod' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('SUPER_ADMIN → probe lolos gate akses (bukan 403)', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/envman/portainer/probe', {
        method: 'POST',
        headers: authHeader(superToken),
        body: JSON.stringify({ portainerUrl: 'http://127.0.0.1:59999', slug, envName: 'prod' }),
      }),
    )
    expect(res.status).not.toBe(403)
  })
})

describe('stack:exec dipisah dari stack:operate', () => {
  test('user hanya stack:operate → exec 403', async () => {
    const { token } = await userWith('pcap-op@test.com', ['stack:operate'])
    const res = await app.handle(
      new Request(`http://localhost/api/envman/portainer/connections/${connId}/exec`, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ containerId: 'c', endpointId: 1, command: 'ls' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('user stack:exec → lolos gate (bukan 403)', async () => {
    const { token } = await userWith('pcap-exec@test.com', ['stack:exec'])
    const res = await app.handle(
      new Request(`http://localhost/api/envman/portainer/connections/${connId}/exec`, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ containerId: 'c', endpointId: 1, command: 'ls' }),
      }),
    )
    expect(res.status).not.toBe(403)
  })
})

describe('env-scoped: role ATAU capability', () => {
  test('non-member tanpa cap → repull env 403', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/environments/prod/portainer/repull`, {
        method: 'POST',
        headers: authHeader(noCapToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('non-member dengan stack:deploy → repull lolos gate (bukan 403)', async () => {
    const { token } = await userWith('pcap-deploy@test.com', ['stack:deploy'])
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/environments/prod/portainer/repull`, {
        method: 'POST',
        headers: authHeader(token),
      }),
    )
    expect(res.status).not.toBe(403)
  })

  test('EDITOR project tanpa cap → repull tetap lolos (backward-compat)', async () => {
    const editor = await userWith('pcap-editor@test.com', [])
    const project = await prisma.project.findUnique({ where: { slug } })
    await prisma.projectMember.create({ data: { projectId: project!.id, userId: editor.id, role: 'EDITOR' } })
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/environments/prod/portainer/repull`, {
        method: 'POST',
        headers: authHeader(editor.token),
      }),
    )
    expect(res.status).not.toBe(403)
  })
})

describe('backup: view vs manage', () => {
  test('user tanpa cap → list backup 403', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/portainer/connections/${connId}/backups`, {
        headers: authHeader(noCapToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('backup:view → list lolos (bukan 403), tapi create 403', async () => {
    const { token } = await userWith('pcap-bview@test.com', ['backup:view'])
    const list = await app.handle(
      new Request(`http://localhost/api/envman/portainer/connections/${connId}/backups`, {
        headers: authHeader(token),
      }),
    )
    expect(list.status).not.toBe(403)
    const create = await app.handle(
      new Request(`http://localhost/api/envman/portainer/connections/${connId}/backups`, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ type: 'PORTAINER_DB' }),
      }),
    )
    expect(create.status).toBe(403)
  })

  test('backup:manage → create lolos gate (bukan 403)', async () => {
    const { token } = await userWith('pcap-bmanage@test.com', ['backup:manage'])
    const res = await app.handle(
      new Request(`http://localhost/api/envman/portainer/connections/${connId}/backups`, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ type: 'PORTAINER_DB' }),
      }),
    )
    expect(res.status).not.toBe(403)
  })
})

describe('connection:manage lepas dari SUPER_ADMIN', () => {
  test('non-super tanpa cap → create connection 403', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/envman/portainer/connections', {
        method: 'POST',
        headers: authHeader(noCapToken),
        body: JSON.stringify({ name: 'x', portainerUrl: 'http://x', apiToken: 't' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('non-super dengan connection:manage → create connection lolos', async () => {
    const { token } = await userWith('pcap-cmanage@test.com', ['connection:manage'])
    const res = await app.handle(
      new Request('http://localhost/api/envman/portainer/connections', {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ name: 'pcap-new', portainerUrl: 'http://new', apiToken: 't' }),
      }),
    )
    expect(res.status).toBe(200)
  })
})

describe('validasi capability di endpoint assign', () => {
  test('capability ngawur → 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/admin/users/${noCapUserId}/permissions`, {
        method: 'PUT',
        headers: authHeader(superToken),
        body: JSON.stringify({ permissions: ['stack:notreal'] }),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('capability Portainer baru diterima → 200', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/admin/users/${noCapUserId}/permissions`, {
        method: 'PUT',
        headers: authHeader(superToken),
        body: JSON.stringify({ permissions: ['stack:deploy', 'backup:view', 'connection:manage'] }),
      }),
    )
    expect(res.status).toBe(200)
  })
})
