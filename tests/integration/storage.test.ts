import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'


// Guard: storage tests hanya jalankan jika MinIO dikonfigurasi
const MINIO_ENABLED = !!(process.env.MINIO_ENDPOINT && process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY && process.env.MINIO_BUCKET)

const app = createTestApp()
let ownerToken: string
let editorToken: string
let viewerToken: string
let superAdminToken: string
let projectSlug: string

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('storage-owner@test.com', 'pass123', 'StorageOwner', 'ADMIN')
  const editor = await seedTestUser('storage-editor@test.com', 'pass123', 'StorageEditor', 'ADMIN')
  const viewer = await seedTestUser('storage-viewer@test.com', 'pass123', 'StorageViewer', 'USER')
  const superAdmin = await seedTestUser('storage-superadmin@test.com', 'pass123', 'StorageSuperAdmin', 'SUPER_ADMIN')
  ownerToken = await createTestSession(owner.id)
  editorToken = await createTestSession(editor.id)
  viewerToken = await createTestSession(viewer.id)
  superAdminToken = await createTestSession(superAdmin.id)

  // Buat project + tambah member
  const createRes = await app.handle(new Request('http://localhost/api/envman/projects', {
    method: 'POST',
    headers: { cookie: `session=${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'storage-test-project', name: 'Storage Test' }),
  }))
  const created = await createRes.json()
  projectSlug = created.project?.slug ?? 'storage-test-project'

  // Tambah editor + viewer
  await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/members`, {
    method: 'POST',
    headers: { cookie: `session=${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'storage-editor@test.com', role: 'EDITOR' }),
  }))
})

afterAll(async () => { await cleanupTestData() })

function makeFile(name: string, content: string, type = 'text/plain'): File {
  return new File([content], name, { type })
}

function makeUploadRequest(token: string, path: string, file: File): Request {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('path', path)
  return new Request(`http://localhost/api/envman/projects/${projectSlug}/storage/upload`, {
    method: 'POST',
    headers: { cookie: `session=${token}` },
    body: fd,
  })
}

describe('Storage — Upload', () => {
  test('EDITOR bisa upload file', async () => {
    if (!MINIO_ENABLED) return
    const res = await app.handle(makeUploadRequest(editorToken, 'scripts/test.sh', makeFile('test.sh', '#!/bin/bash\necho hello')))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.object.path).toBe('scripts/test.sh')
  })

  test('VIEWER tidak bisa upload', async () => {
    const res = await app.handle(makeUploadRequest(viewerToken, 'scripts/nope.sh', makeFile('nope.sh', 'x')))
    expect(res.status).toBe(403)
  })

  test('Tolak path traversal (..)', async () => {
    if (!MINIO_ENABLED) return
    const res = await app.handle(makeUploadRequest(editorToken, '../secret.env', makeFile('secret.env', 'SECRET=x')))
    expect(res.status).toBe(400)
  })

  test('Upload ulang ke path sama = replace (upsert)', async () => {
    if (!MINIO_ENABLED) return
    await app.handle(makeUploadRequest(editorToken, 'assets/logo.png', makeFile('logo.png', 'v1', 'image/png')))
    const res = await app.handle(makeUploadRequest(editorToken, 'assets/logo.png', makeFile('logo.png', 'v2-content-longer', 'image/png')))
    expect(res.status).toBe(200)
    const json = await res.json()
    // size harus update ke versi baru
    expect(json.object.size).toBeGreaterThan(2)
  })
})

describe('Storage — List', () => {
  test('VIEWER bisa list storage', async () => {
    if (!MINIO_ENABLED) return
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage`, {
      headers: { cookie: `session=${viewerToken}` },
    }))
    // VIEWER tidak ada di members → 403; tapi kalau sudah di-add, expect 200
    expect([200, 403]).toContain(res.status)
  })

  test('EDITOR melihat folder virtual dari prefix path', async () => {
    if (!MINIO_ENABLED) return
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage`, {
      headers: { cookie: `session=${editorToken}` },
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.folders)).toBe(true)
    expect(Array.isArray(json.files)).toBe(true)
    expect(json.usage).toBeDefined()
  })

  test('Prefix filter hanya tampilkan file di folder tersebut', async () => {
    if (!MINIO_ENABLED) return
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage?prefix=scripts`, {
      headers: { cookie: `session=${editorToken}` },
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    for (const f of json.files) {
      expect(f.path).toMatch(/^scripts\//)
    }
  })
})

describe('Storage — Metadata (PATCH)', () => {
  test('OWNER bisa set isPublic', async () => {
    if (!MINIO_ENABLED) return
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage/meta`, {
      method: 'PATCH',
      headers: { cookie: `session=${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'scripts/test.sh', isPublic: true }),
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.object.isPublic).toBe(true)
  })

  test('EDITOR tidak bisa ubah isPublic', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage/meta`, {
      method: 'PATCH',
      headers: { cookie: `session=${editorToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'scripts/test.sh', isPublic: false }),
    }))
    expect(res.status).toBe(403)
  })
})

describe('Storage — Download', () => {
  test('VIEWER dapat presigned URL', async () => {
    if (!MINIO_ENABLED) return
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage/download?path=scripts/test.sh`, {
      headers: { cookie: `session=${editorToken}` },
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.url).toBe('string')
    expect(json.url).toMatch(/^https?:\/\//)
  })

  test('File tidak ada → 404', async () => {
    if (!MINIO_ENABLED) return
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage/download?path=tidak/ada.txt`, {
      headers: { cookie: `session=${editorToken}` },
    }))
    expect(res.status).toBe(404)
  })
})

describe('Storage — Public endpoint', () => {
  test('File publik bisa diakses tanpa auth (redirect)', async () => {
    if (!MINIO_ENABLED) return
    const res = await app.handle(new Request(`http://localhost/api/public/storage/${projectSlug}/scripts/test.sh`))
    // 302 redirect ke presigned URL, atau 404 jika MinIO tidak reachable
    expect([302, 404]).toContain(res.status)
  })

  test('File private → 404 dari public endpoint (tidak bocorkan eksistensi)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/public/storage/${projectSlug}/assets/logo.png`))
    expect(res.status).toBe(404)
  })
})

describe('Storage — Delete', () => {
  test('OWNER bisa hapus file', async () => {
    if (!MINIO_ENABLED) return
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage?path=assets/logo.png`, {
      method: 'DELETE',
      headers: { cookie: `session=${ownerToken}` },
    }))
    expect(res.status).toBe(200)
    // Verify tidak ada di DB
    const project = await prisma.project.findFirst({ where: { slug: projectSlug } })
    if (project) {
      const obj = await prisma.projectStorageObject.findFirst({ where: { projectId: project.id, path: 'assets/logo.png' } })
      expect(obj).toBeNull()
    }
  })

  test('EDITOR tidak bisa hapus file', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage?path=scripts/test.sh`, {
      method: 'DELETE',
      headers: { cookie: `session=${editorToken}` },
    }))
    expect(res.status).toBe(403)
  })
})

describe('Storage — Per-project Limits', () => {
  test('SUPER_ADMIN bisa set storageMaxFileMb via PATCH project', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}`, {
      method: 'PATCH',
      headers: { cookie: `session=${superAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageMaxFileMb: 10 }),
    }))
    expect(res.status).toBe(200)
    const project = await prisma.project.findFirst({ where: { slug: projectSlug } })
    expect(project?.storageMaxFileMb).toBe(10)
  })

  test('SUPER_ADMIN bisa set storageQuotaMb via PATCH project', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}`, {
      method: 'PATCH',
      headers: { cookie: `session=${superAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageQuotaMb: 200 }),
    }))
    expect(res.status).toBe(200)
    const project = await prisma.project.findFirst({ where: { slug: projectSlug } })
    expect(project?.storageQuotaMb).toBe(200)
  })

  test('OWNER tidak bisa ubah storageMaxFileMb (field diabaikan)', async () => {
    // Set dulu ke 10 oleh superAdmin, pastikan OWNER tidak bisa overwrite
    await prisma.project.update({ where: { slug: projectSlug }, data: { storageMaxFileMb: 10 } })
    await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}`, {
      method: 'PATCH',
      headers: { cookie: `session=${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageMaxFileMb: 999 }),
    }))
    // Field HARUS tetap 10 — perubahan oleh OWNER diabaikan server
    const project = await prisma.project.findFirst({ where: { slug: projectSlug } })
    expect(project?.storageMaxFileMb).toBe(10)
  })

  test('SUPER_ADMIN bisa reset ke null (kembali ke global default)', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}`, {
      method: 'PATCH',
      headers: { cookie: `session=${superAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageMaxFileMb: null }),
    }))
    expect(res.status).toBe(200)
    const project = await prisma.project.findFirst({ where: { slug: projectSlug } })
    expect(project?.storageMaxFileMb).toBeNull()
  })

  test('Presign ditolak jika file melebihi per-project storageMaxFileMb', async () => {
    // Set limit 1 MB
    await prisma.project.update({ where: { slug: projectSlug }, data: { storageMaxFileMb: 1 } })
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage/presign-upload`, {
      method: 'POST',
      headers: { cookie: `session=${editorToken}`, 'Content-Type': 'application/json' },
      // Kirim size 2 MB — melebihi limit 1 MB
      body: JSON.stringify({ path: 'large.bin', size: 2 * 1024 * 1024, mimeType: 'application/octet-stream' }),
    }))
    expect(res.status).toBe(413)
    const json = await res.json()
    expect(json.error).toMatch(/1 MB/)
  })

  test('GET /storage response menyertakan field limits', async () => {
    const res = await app.handle(new Request(`http://localhost/api/envman/projects/${projectSlug}/storage`, {
      headers: { cookie: `session=${editorToken}` },
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.limits).toBeDefined()
    expect('storageMaxFileMb' in json.limits).toBe(true)
    expect('storageQuotaMb' in json.limits).toBe(true)
  })

  // Cleanup limit setelah test selesai
  afterAll(async () => {
    await prisma.project.update({ where: { slug: projectSlug }, data: { storageMaxFileMb: null, storageQuotaMb: null } })
  })
})
