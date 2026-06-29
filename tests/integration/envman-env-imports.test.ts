import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

// owner: OWNER di target & source (bisa setup import + baca source)
// outsider: OWNER di target, TIDAK punya akses ke source (uji deniedImports)
let ownerId: string
let outsiderId: string
let viewerId: string
let ownerToken: string
let outsiderToken: string
let viewerToken: string

const targetSlug = 'ei-target'
const sourceSlug = 'ei-source'

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

async function createProject(token: string, slug: string, name: string) {
  await app.handle(
    new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ slug, name }),
    }),
  )
}

beforeAll(async () => {
  await cleanupTestData()

  const owner = await seedTestUser('ei-owner@test.com', 'pass123', 'EiOwner', 'ADMIN')
  const outsider = await seedTestUser('ei-outsider@test.com', 'pass123', 'EiOutsider', 'ADMIN')
  const viewer = await seedTestUser('ei-viewer@test.com', 'pass123', 'EiViewer', 'ADMIN')
  ownerId = owner.id
  outsiderId = outsider.id
  viewerId = viewer.id
  ownerToken = await createTestSession(ownerId)
  outsiderToken = await createTestSession(outsiderId)
  viewerToken = await createTestSession(viewerId)

  // owner buat kedua project (otomatis jadi OWNER member keduanya)
  await createProject(ownerToken, sourceSlug, 'EI Source')
  await createProject(ownerToken, targetSlug, 'EI Target')

  const source = await prisma.project.findUnique({ where: { slug: sourceSlug } })
  const target = await prisma.project.findUnique({ where: { slug: targetSlug } })

  // env source:base dengan vars (termasuk secret). Tanpa MASTER_KEY di test, value secret
  // tersimpan plaintext — masking '***' murni soal isSecret + akses caller, bukan enkripsi.
  const baseEnv = await prisma.environment.create({ data: { name: 'base', projectId: source!.id } })
  await prisma.envVar.createMany({
    data: [
      { key: 'SHARED_KEY', value: 'from-source', environmentId: baseEnv.id },
      { key: 'DB_HOST', value: 'db.internal', environmentId: baseEnv.id },
      { key: 'SECRET_TOKEN', value: 'topsecret', environmentId: baseEnv.id, isSecret: true },
      { key: 'DISABLED_VAR', value: 'nope', environmentId: baseEnv.id, isDisabled: true },
    ],
  })

  // env target:prod dengan satu var lokal yang override SHARED_KEY
  const prodEnv = await prisma.environment.create({ data: { name: 'prod', projectId: target!.id } })
  await prisma.envVar.create({ data: { key: 'SHARED_KEY', value: 'local-wins', environmentId: prodEnv.id } })

  // outsider jadi OWNER di target saja (tidak di-add ke source → tak punya akses source)
  await prisma.projectMember.create({ data: { projectId: target!.id, userId: outsiderId, role: 'OWNER' } })

  // viewer: OWNER di target (boleh baca export), VIEWER di source (secret → '***')
  await prisma.projectMember.create({ data: { projectId: target!.id, userId: viewerId, role: 'OWNER' } })
  await prisma.projectMember.create({ data: { projectId: source!.id, userId: viewerId, role: 'VIEWER' } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('POST /api/envman/projects/:slug/environments/:env/imports', () => {
  test('non-OWNER target ditolak 403', async () => {
    // owner buat env baru di target tanpa kasih outsider akses? outsider sudah OWNER target.
    // Uji pakai user yang sama sekali bukan member: gunakan source env sebagai target oleh outsider.
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${sourceSlug}/environments/base/imports`, {
        method: 'POST',
        headers: authHeader(outsiderToken),
        body: JSON.stringify({ sourceProject: targetSlug, sourceEnv: 'prod' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('OWNER target tapi tanpa akses source → 403', async () => {
    // outsider OWNER di target:prod, tapi bukan member source → tak boleh import dari source
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${targetSlug}/environments/prod/imports`, {
        method: 'POST',
        headers: authHeader(outsiderToken),
        body: JSON.stringify({ sourceProject: sourceSlug, sourceEnv: 'base' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('OWNER dengan akses source bisa buat import lintas project', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${targetSlug}/environments/prod/imports`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ sourceProject: sourceSlug, sourceEnv: 'base' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.id).toBeString()
  })

  test('duplicate import ditolak 409', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${targetSlug}/environments/prod/imports`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ sourceProject: sourceSlug, sourceEnv: 'base' }),
      }),
    )
    expect(res.status).toBe(409)
  })

  test('self-import (cycle) ditolak 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${sourceSlug}/environments/base/imports`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ sourceProject: sourceSlug, sourceEnv: 'base' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('cycle A->B->A ditolak 400', async () => {
    // sudah ada: prod imports base. Sekarang base imports prod → menutup siklus.
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${sourceSlug}/environments/base/imports`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ sourceProject: targetSlug, sourceEnv: 'prod' }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('GET imports list', () => {
  test('OWNER target lihat link', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${targetSlug}/environments/prod/imports`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imports.length).toBe(1)
    expect(body.imports[0].sourceProject).toBe(sourceSlug)
    expect(body.imports[0].sourceEnv).toBe('base')
  })
})

describe('Resolve di vars/export', () => {
  test('owner: imported vars masuk + local menang per-key', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${targetSlug}/environments/prod/vars/export`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vars.DB_HOST).toBe('db.internal') // dari import
    expect(body.vars.SHARED_KEY).toBe('local-wins') // local override import
    expect(body.vars.DISABLED_VAR).toBeUndefined() // disabled di source di-skip
  })

  test('owner (akses penuh source): secret import ter-reveal', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${targetSlug}/environments/prod/vars/export`, {
        headers: authHeader(ownerToken),
      }),
    )
    const body = await res.json()
    expect(body.vars.SECRET_TOKEN).toBe('topsecret')
  })

  test('viewer di source: secret import di-mask ***', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${targetSlug}/environments/prod/vars/export`, {
        headers: authHeader(viewerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vars.SECRET_TOKEN).toBe('***') // VIEWER di source → mask
    expect(body.vars.DB_HOST).toBe('db.internal') // non-secret tetap terbaca
  })

  test('outsider: source denied → key import tak muncul + deniedImports', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${targetSlug}/environments/prod/vars/export`, {
        headers: authHeader(outsiderToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vars.DB_HOST).toBeUndefined() // import tak terbaca
    expect(body.vars.SHARED_KEY).toBe('local-wins') // local target tetap ada
    expect(body.deniedImports).toEqual([{ project: sourceSlug, env: 'base' }])
  })
})

describe('Resolve di vars list (UI)', () => {
  test('imported var muncul terpisah, key yang overridden di-suppress', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${targetSlug}/environments/prod/vars`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const importedKeys = body.imported.map((v: any) => v.key)
    expect(importedKeys).toContain('DB_HOST')
    expect(importedKeys).not.toContain('SHARED_KEY') // local menang → imported di-suppress
    expect(body.importedKeys).toContain('SHARED_KEY') // tapi tetap tercatat untuk badge override
  })
})

describe('Cascade delete', () => {
  test('hapus source env → import otomatis hilang, resolve tidak error', async () => {
    const source = await prisma.project.findUnique({ where: { slug: sourceSlug } })
    const baseEnv = await prisma.environment.findFirst({ where: { name: 'base', projectId: source!.id } })
    await prisma.environment.delete({ where: { id: baseEnv!.id } })

    const links = await prisma.envImport.count({ where: { sourceEnvId: baseEnv!.id } })
    expect(links).toBe(0)

    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${targetSlug}/environments/prod/vars/export`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vars.SHARED_KEY).toBe('local-wins')
    expect(body.vars.DB_HOST).toBeUndefined()
  })
})
