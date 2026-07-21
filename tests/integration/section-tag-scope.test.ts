import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Enforcement per-tag scope untuk section. Diuji lewat NOTES & FILES sebagai
// representatif (logika identik lintas section — semua lewat helper yang sama).
// scopeTags di-set langsung via prisma (endpoint PUT scopeTags = fase berikutnya).

const app = createTestApp()

let ownerId: string
let limitedId: string
let ownerToken: string
let limitedToken: string
let projectId: string
const slug = 'tagscope-proj'

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

// Beri member akses penuh EDITOR ke sebuah section, lalu batasi dengan scopeTags.
async function setSectionScope(userId: string, section: 'NOTES' | 'FILES', role: 'EDITOR' | 'OWNER', scopeTags: string[]) {
  await prisma.projectSectionMember.upsert({
    where: { userId_projectId_section: { userId, projectId, section } },
    create: { userId, projectId, section, role, scopeTags },
    update: { role, scopeTags },
  })
}

beforeAll(async () => {
  await cleanupTestData()

  const owner = await seedTestUser('ts-owner@test.com', 'pass123', 'TsOwner', 'ADMIN')
  const limited = await seedTestUser('ts-limited@test.com', 'pass123', 'TsLimited', 'ADMIN')
  ownerId = owner.id
  limitedId = limited.id
  ownerToken = await createTestSession(ownerId)
  limitedToken = await createTestSession(limitedId)

  await app.handle(
    new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ slug, name: 'TagScope' }),
    }),
  )
  const proj = await prisma.project.findUniqueOrThrow({ where: { slug } })
  projectId = proj.id

  // limited jadi project member EDITOR (POST /members auto-seed default-deny section).
  await app.handle(
    new Request(`http://localhost/api/envman/projects/${slug}/members`, {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ userId: limitedId, role: 'EDITOR' }),
    }),
  )

  // Seed 3 notes oleh owner: tag [a], tag [b], tanpa tag.
  await prisma.projectNote.createMany({
    data: [
      { projectId, authorId: ownerId, title: 'note-a', body: '', tags: ['a'] },
      { projectId, authorId: ownerId, title: 'note-b', body: '', tags: ['b'] },
      { projectId, authorId: ownerId, title: 'note-untagged', body: '', tags: [] },
    ],
  })

  // limited jadi section OWNER + scope ['a'] agar author-check (EDITOR hanya
  // boleh edit note sendiri) tak mengaburkan logika tag-scope yang diuji —
  // OWNER bypass author-check, jadi hanya guard tag yang menentukan.
  await setSectionScope(limitedId, 'NOTES', 'OWNER', ['a'])
  await setSectionScope(limitedId, 'FILES', 'OWNER', ['a'])
}, 30000)

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
}, 30000)

describe('NOTES list — tag scope filtering', () => {
  test('owner (full access) melihat semua 3 note', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/notes`, { headers: authHeader(ownerToken) }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.notes).toHaveLength(3)
  })

  test('limited (scope [a]) hanya melihat note bertag a — untagged & b tersembunyi', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/notes`, { headers: authHeader(limitedToken) }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const titles = body.notes.map((n: any) => n.title).sort()
    expect(titles).toEqual(['note-a'])
  })
})

describe('NOTES item guards', () => {
  test('limited edit note bertag b → 404 (invisible)', async () => {
    const noteB = await prisma.projectNote.findFirstOrThrow({ where: { projectId, title: 'note-b' } })
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/notes/${noteB.id}`, {
        method: 'PUT',
        headers: authHeader(limitedToken),
        body: JSON.stringify({ body: 'hack' }),
      }),
    )
    expect(res.status).toBe(404)
  })

  test('limited delete note untagged → 404', async () => {
    const noteU = await prisma.projectNote.findFirstOrThrow({ where: { projectId, title: 'note-untagged' } })
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/notes/${noteU.id}`, {
        method: 'DELETE',
        headers: authHeader(limitedToken),
      }),
    )
    expect(res.status).toBe(404)
  })

  test('limited edit note bertag a → 200 (dalam scope)', async () => {
    const noteA = await prisma.projectNote.findFirstOrThrow({ where: { projectId, title: 'note-a' } })
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/notes/${noteA.id}`, {
        method: 'PUT',
        headers: authHeader(limitedToken),
        body: JSON.stringify({ body: 'ok edit' }),
      }),
    )
    expect(res.status).toBe(200)
  })
})

describe('NOTES create rule', () => {
  test('limited create note tanpa tag scope → 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/notes`, {
        method: 'POST',
        headers: authHeader(limitedToken),
        body: JSON.stringify({ title: 'x', body: '', tags: [] }),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('limited create note bertag b (bukan scope) → 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/notes`, {
        method: 'POST',
        headers: authHeader(limitedToken),
        body: JSON.stringify({ title: 'y', body: '', tags: ['b'] }),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('limited create note bertag a → 200', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/notes`, {
        method: 'POST',
        headers: authHeader(limitedToken),
        body: JSON.stringify({ title: 'z', body: '', tags: ['a', 'extra'] }),
      }),
    )
    expect(res.status).toBe(200)
  })

  test('limited retag note dari a ke b → 400 (keluar dari view sendiri)', async () => {
    const noteA = await prisma.projectNote.findFirstOrThrow({ where: { projectId, title: 'note-a' } })
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/notes/${noteA.id}`, {
        method: 'PUT',
        headers: authHeader(limitedToken),
        body: JSON.stringify({ tags: ['b'] }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('FILES — scope shares the same helper', () => {
  test('limited create file bertag a → 200; tanpa tag → 400', async () => {
    const ok = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/files`, {
        method: 'POST',
        headers: authHeader(limitedToken),
        body: JSON.stringify({ title: 'f1', files: [{ filename: 'a.txt', content: 'x' }], tags: ['a'] }),
      }),
    )
    expect(ok.status).toBe(200)

    const bad = await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/files`, {
        method: 'POST',
        headers: authHeader(limitedToken),
        body: JSON.stringify({ title: 'f2', files: [{ filename: 'b.txt', content: 'x' }], tags: [] }),
      }),
    )
    expect(bad.status).toBe(400)
  })

  test('owner sees all files; limited only tag-a files', async () => {
    // owner creates a b-tagged file
    await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/files`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ title: 'f-owner-b', files: [{ filename: 'c.txt', content: 'x' }], tags: ['b'] }),
      }),
    )
    const ownerList = await (await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/files`, { headers: authHeader(ownerToken) }),
    )).json()
    const limitedList = await (await app.handle(
      new Request(`http://localhost/api/envman/projects/${slug}/files`, { headers: authHeader(limitedToken) }),
    )).json()
    // owner melihat lebih banyak; limited tak melihat file bertag b.
    expect(ownerList.files.length).toBeGreaterThan(limitedList.files.length)
    expect(limitedList.files.every((f: any) => f.tags.includes('a'))).toBe(true)
  })
})
