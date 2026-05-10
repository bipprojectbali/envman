# Phase 2 — Reliability

> Prerequisite: Phase 1 selesai.
> Goal: sistem tidak korup data saat error, perubahan tidak merusak yang sudah jalan.

---

## 1. Test Coverage Minimal 40%

### Masalah
Coverage ~5% (hanya auth flow) membuat refactor berbahaya — tidak ada jaring pengaman.

### Target coverage per kategori

| Kategori | Target | Prioritas |
|---|---|---|
| Auth endpoints | 100% | Sudah ada |
| Env manager endpoints | 60% | Tinggi |
| Tickets endpoints | 60% | Tinggi |
| Admin endpoints | 40% | Sedang |
| Gists, Notes | 40% | Sedang |
| Frontend components | 20% | Rendah (Phase 3) |

### Pattern integration test (Elysia)

```typescript
// tests/integration/envman-projects.test.ts
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createTestApp, seedTestUser, createTestSession, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

let adminId: string
let sessionToken: string

beforeAll(async () => {
  await cleanupTestData()
  const admin = await seedTestUser('admin@test.com', 'pass123', 'Admin', 'ADMIN')
  adminId = admin.id
  sessionToken = await createTestSession(adminId)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('POST /api/envman/projects', () => {
  test('create project berhasil', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': `session=${sessionToken}`,
      },
      body: JSON.stringify({ slug: 'test-project', name: 'Test Project' }),
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.slug).toBe('test-project')
  })

  test('slug duplikat return 400', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': `session=${sessionToken}` },
      body: JSON.stringify({ slug: 'test-project', name: 'Duplicate' }),
    }))
    expect(res.status).toBe(400)
  })

  test('tanpa auth return 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'no-auth', name: 'No Auth' }),
    }))
    expect(res.status).toBe(401)
  })
})
```

### Minimal test per endpoint
Setiap endpoint wajib punya minimal 3 test:
1. Happy path (berhasil)
2. Unauthorized (tanpa/invalid auth)
3. Invalid input (validasi gagal atau not found)

---

## 2. Redis Caching untuk Query Berulang

### Masalah
`getProjectAccess()` dan query serupa dipanggil berkali-kali per request atau per detik.
Tanpa cache, setiap call = 1 DB query.

### Pattern: Cache dengan TTL dan invalidasi

```typescript
// src/lib/cache.ts
import { redis } from './redis'

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached) as T

  const data = await fetcher()
  if (data !== null && data !== undefined) {
    await redis.set(key, JSON.stringify(data), { exSeconds: ttlSeconds })
  }
  return data
}

export async function invalidateCache(...keys: string[]) {
  if (keys.length > 0) await redis.del(...keys)
}

export const cacheKeys = {
  projectList: (userId: string) => `projects:user:${userId}`,
  projectDetail: (slug: string) => `project:${slug}`,
  projectAccess: (userId: string, slug: string) => `access:${userId}:${slug}`,
  tokenList: (userId: string) => `tokens:user:${userId}`,
}
```

```typescript
// Contoh penggunaan di route
const projects = await withCache(
  cacheKeys.projectList(caller.userId),
  60, // TTL 60 detik
  () => prisma.project.findMany({ where: { members: { some: { userId: caller.userId } } } })
)

// Saat ada update, invalidate cache
await invalidateCache(
  cacheKeys.projectList(caller.userId),
  cacheKeys.projectDetail(params.slug)
)
```

### TTL yang direkomendasikan

| Data | TTL | Alasan |
|---|---|---|
| Project list | 60 detik | Jarang berubah, bisa stale 1 menit |
| Project access/role | 120 detik | Perubahan role tidak kritis real-time |
| Token list | 30 detik | Lebih sering dipakai |
| User session | Jangan cache | Sudah di-handle better-auth |
| Env vars | Jangan cache | Data sensitif, harus selalu fresh |

### Invalidasi yang konsisten
Setiap mutasi harus invalidate key yang relevan:
```typescript
// Setelah update project member role
await invalidateCache(
  cacheKeys.projectAccess(userId, slug),  // Cache akses user ini
  cacheKeys.projectDetail(slug),           // Cache detail project
)
```

---

## 3. Soft Delete untuk Data Penting

### Masalah
Hard delete tidak bisa di-undo. Cascade delete menghapus data terkait tanpa jejak.

### Solusi: Tambah field `deletedAt`

```prisma
// prisma/schema.prisma
model Project {
  id        String    @id @default(uuid())
  // ... field lainnya
  deletedAt DateTime?  // null = aktif, ada nilai = sudah dihapus

  @@index([deletedAt])
}
```

### Pattern query dengan soft delete

```typescript
// src/lib/db-helpers.ts

// Helper untuk filter soft-deleted
export const notDeleted = { deletedAt: null }

// Penggunaan
const projects = await prisma.project.findMany({
  where: { ...notDeleted, members: { some: { userId } } }
})

// Soft delete (bukan delete langsung)
await prisma.project.update({
  where: { id },
  data: { deletedAt: new Date() }
})
```

### Prisma middleware untuk auto-filter (opsional)

```typescript
// src/lib/db.ts
export const prisma = new PrismaClient().$extends({
  query: {
    project: {
      findMany({ args, query }) {
        args.where = { deletedAt: null, ...args.where }
        return query(args)
      },
      findFirst({ args, query }) {
        args.where = { deletedAt: null, ...args.where }
        return query(args)
      },
    },
  },
})
```

> **Perhatian:** Middleware ini auto-filter SEMUA query. Untuk admin yang perlu lihat data deleted, buat prisma client terpisah tanpa extension.

### Retention policy
Data soft-deleted bisa dihapus permanen setelah periode tertentu:
```typescript
// Cron job atau scheduled task
async function purgeDeletedData(olderThanDays = 30) {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000)
  await prisma.project.deleteMany({
    where: { deletedAt: { lt: cutoff } }
  })
}
```

---

## 4. API Versioning

### Masalah
Perubahan breaking di API langsung break semua client (CLI, integrasi eksternal) tanpa warning.

### Solusi: URL prefix versioning

```typescript
// src/routes/v1/envman.ts
export const envmanV1 = new Elysia({ prefix: '/api/v1/envman' })
  .get('/projects', async ({ request, set }) => { /* ... */ })

// src/routes/v2/envman.ts
export const envmanV2 = new Elysia({ prefix: '/api/v2/envman' })
  .get('/projects', async ({ request, set }) => { /* ... v2 format */ })

// src/app.ts
export function createApp() {
  return new Elysia()
    .use(envmanV1)
    .use(envmanV2)
    // Legacy tanpa versi (untuk backward compat sementara)
    .use(legacyEnvman)
}
```

### Strategi migrasi
1. Buat `/api/v1/` yang identik dengan `/api/envman/` yang ada sekarang
2. Dokumentasikan bahwa `/api/envman/` akan deprecated
3. Berikan grace period (misal 3 bulan) sebelum hapus legacy endpoint
4. Breaking changes HANYA boleh masuk di versi baru

### Kapan bump versi
| Perubahan | Versi |
|---|---|
| Tambah field baru di response | Tidak perlu — additive |
| Tambah endpoint baru | Tidak perlu — additive |
| Ubah tipe/nama field | Bump major (v1 → v2) |
| Hapus field/endpoint | Bump major (v1 → v2) |
| Ubah behavior yang ada | Bump major (v1 → v2) |

---

## Urutan Pengerjaan Phase 2

1. Tulis test untuk endpoint kritis (envman projects, tickets) — **mulai dari yang paling sering dipakai**
2. Setup Redis cache helper (`src/lib/cache.ts`)
3. Terapkan cache di project list dan project access
4. Tambah `deletedAt` di Project dan User (migration)
5. Implementasi soft delete di route yang relevan
6. Buat `/api/v1/` sebagai alias dari route yang ada

> **Jangan implement soft delete dan versioning bersamaan.** Soft delete dulu, pastikan tidak ada regresi, baru versioning.
