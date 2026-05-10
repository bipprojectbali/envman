# Phase 1 — Fondasi

> Prerequisite untuk semua phase berikutnya.
> Tidak ada breaking change — semua perubahan adalah reorganisasi kode yang sudah ada.

---

## 1. Split File Backend Monolith

### Masalah
Satu file `app.ts` berisi semua route dari semua domain (auth, admin, tickets, env manager, gists, dll).
File >2000 baris menyebabkan: merge conflict, sulit di-navigate, sulit di-test per domain.

### Solusi
Pisah berdasarkan domain. Setiap file export Elysia instance yang di-mount ke app utama.

```
src/
  app.ts              ← orchestrator, mount semua sub-app
  routes/
    auth.ts           ← /api/auth/*
    admin.ts          ← /api/admin/*
    tickets.ts        ← /api/tickets/*
    envman/
      index.ts        ← mount semua envman sub-routes
      projects.ts     ← /api/envman/projects/*
      tokens.ts       ← /api/envman/tokens/*
      portainer.ts    ← /api/envman/portainer/*
      gists.ts        ← /api/envman/gists/*
  lib/
    auth.ts           ← middleware helper (requireAuth, requireEnvAuth)
    access.ts         ← getProjectAccess dan helper akses lainnya
```

### Pattern
```typescript
// src/routes/tickets.ts
import { Elysia } from 'elysia'
import { prisma } from '../lib/db'
import { requireAuth } from '../lib/auth-middleware'

export const ticketsRouter = new Elysia()
  .get('/api/tickets', async ({ request, set }) => {
    const caller = await requireAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    // ...
  })

// src/app.ts
import { ticketsRouter } from './routes/tickets'

export function createApp() {
  return new Elysia()
    .use(ticketsRouter)
    .use(envmanRouter)
    .use(adminRouter)
}
```

### Aturan ukuran file
- Route file: max 500 baris
- Jika melebihi, pecah lagi per resource

---

## 2. Centralize Auth Middleware

### Masalah
`requireAuth()` dan `requireEnvAuth()` dipanggil manual di setiap route handler.
Duplikasi ini menyebabkan: error handling tidak konsisten, sulit diubah, mudah lupa.

### Solusi
Pindahkan helper auth ke file tersendiri. Buat wrapper yang menangani 401 secara otomatis.

```typescript
// src/lib/auth-middleware.ts

export async function requireAuth(request: Request) {
  // ... implementasi
}

export async function requireEnvAuth(request: Request) {
  // ... implementasi
}

// Helper untuk early return yang konsisten
export function unauthorized(set: { status: number }) {
  set.status = 401
  return { error: 'Unauthorized' }
}

export function forbidden(set: { status: number }) {
  set.status = 403
  return { error: 'Forbidden' }
}
```

### Pattern penggunaan yang konsisten
```typescript
// Sebelum (duplikasi di setiap route)
.get('/api/tickets', async ({ request, set }) => {
  const cookie = request.headers.get('cookie') ?? ''
  const token = cookie.match(/session=([^;]+)/)?.[1]
  if (!token) { set.status = 401; return { error: 'Unauthorized' } }
  // ...
})

// Sesudah (centralized)
.get('/api/tickets', async ({ request, set }) => {
  const caller = await requireAuth(request)
  if (!caller) return unauthorized(set)
  // ...
})
```

### Request-scoped cache untuk `getProjectAccess`
Fungsi ini dipanggil berkali-kali dalam satu request. Cache hasilnya di level request:

```typescript
// src/lib/access.ts
export async function getProjectAccess(
  userId: string,
  role: string,
  projectSlug: string,
  cache?: Map<string, 'OWNER' | 'EDITOR' | 'VIEWER' | null>
): Promise<'OWNER' | 'EDITOR' | 'VIEWER' | null> {
  if (role === 'SUPER_ADMIN') return 'OWNER'

  const cacheKey = `${userId}:${projectSlug}`
  if (cache?.has(cacheKey)) return cache.get(cacheKey)!

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: { members: { where: { userId } } },
  })
  const result = (project?.members[0]?.role ?? null) as 'OWNER' | 'EDITOR' | 'VIEWER' | null
  cache?.set(cacheKey, result)
  return result
}
```

---

## 3. Prisma Transaction untuk Operasi Kritis

### Masalah
Operasi multi-step tanpa transaksi bisa menghasilkan state tidak konsisten jika salah satu langkah gagal.

Contoh yang berbahaya:
- Bulk upsert env vars: 50 dari 1000 berhasil, 950 gagal → data korup
- Block user + delete sessions: user diblock tapi sessions masih valid beberapa milidetik
- Delete project + semua relasinya: partial delete jika cascade gagal

### Solusi
Gunakan `prisma.$transaction()` untuk operasi yang harus atomic.

```typescript
// Sebelum (tidak atomic)
await prisma.user.update({ where: { id }, data: { blocked: true } })
await prisma.session.deleteMany({ where: { userId: id } })

// Sesudah (atomic)
await prisma.$transaction([
  prisma.user.update({ where: { id }, data: { blocked: true } }),
  prisma.session.deleteMany({ where: { userId: id } }),
])
```

```typescript
// Bulk upsert dengan transaksi (untuk konsistensi)
await prisma.$transaction(async (tx) => {
  await Promise.all(
    Object.entries(vars).map(([key, value]) =>
      tx.envVar.upsert({
        where: { environmentId_key: { environmentId, key } },
        update: { value, isSecret: secretKeys.includes(key) },
        create: { key, value, isSecret: secretKeys.includes(key), environmentId },
      })
    )
  )
})
```

### Kapan pakai `$transaction`
| Operasi | Perlu Transaction? |
|---|---|
| Single upsert/update | Tidak |
| Bulk upsert (idempotent) | Sebaiknya ya |
| Update + delete bersamaan | Ya |
| Create + relasi | Ya |
| Read-only | Tidak |

---

## 4. Pagination Default di Semua `findMany`

### Masalah
`findMany` tanpa limit mengambil semua data. Saat data 10x, query ini timeout atau habiskan memory.

### Solusi: Offset pagination (sederhana, cukup untuk <10.000 items)

```typescript
// src/lib/pagination.ts
export interface PaginationParams {
  limit?: number
  offset?: number
}

export function parsePagination(query: Record<string, unknown>, maxLimit = 100) {
  const limit = Math.min(Number(query.limit) || 50, maxLimit)
  const offset = Number(query.offset) || 0
  return { limit, offset }
}

// Penggunaan di route
.get('/api/tickets', async ({ request, set, query }) => {
  const caller = await requireAuth(request)
  if (!caller) return unauthorized(set)

  const { limit, offset } = parsePagination(query)
  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({ take: limit, skip: offset, orderBy: { createdAt: 'desc' } }),
    prisma.ticket.count(),
  ])

  return { tickets, total, limit, offset, hasMore: offset + limit < total }
})
```

### Solusi: Cursor pagination (untuk infinite scroll, Phase 3)

```typescript
// API: GET /api/gists?cursor=<lastId>&limit=20
const gists = await prisma.gist.findMany({
  cursor: query.cursor ? { id: query.cursor } : undefined,
  skip: query.cursor ? 1 : 0,
  take: limit,
  orderBy: { updatedAt: 'desc' },
})

return {
  gists,
  nextCursor: gists.length === limit ? gists[gists.length - 1].id : null,
}
```

### Aturan limit
| Resource | Default limit | Max limit |
|---|---|---|
| List umum | 50 | 200 |
| Audit log | 100 | 1000 |
| Env vars | 500 | 2000 |
| Search results | 20 | 100 |

---

## Urutan Pengerjaan Phase 1

1. Buat struktur folder `src/routes/` dan `src/lib/`
2. Extract `requireAuth`, `requireEnvAuth`, `getProjectAccess` ke `src/lib/`
3. Pindah routes satu domain per PR: tickets → envman → admin → auth
4. Tambah `$transaction()` di setiap operasi multi-step (bisa sambil jalan)
5. Tambah pagination di semua `findMany` (bisa sambil jalan)

> **Jangan refactor semua sekaligus.** Satu domain per commit, pastikan test pass sebelum lanjut.
