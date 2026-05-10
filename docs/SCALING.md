# SCALING — Panduan Ringkas untuk AI

Dokumen ini adalah intisari dari pengalaman nyata men-scale project Bun + Elysia + Prisma + React.
Tulis ulang sebagai aturan konkret yang bisa langsung diterapkan di project baru — bukan teori.

---

## Prinsip Utama

1. **Jangan lewati urutan.** Fondasi dulu, baru reliability, baru optimasi performa.
2. **Tidak ada rewrite total.** Semua perubahan adalah reorganisasi atau additive.
3. **Ukur sebelum optimasi.** Jangan implement infinite scroll sebelum ada data yang menunjukkan lambat.
4. **Satu domain per commit.** Setiap pemecahan file dilakukan bertahap, bukan sekaligus.

---

## Phase 1 — Fondasi

> Lakukan ini sebelum menambah fitur besar apapun.

### 1A. Pecah backend monolith

Jangan taruh semua route di satu file. Saat `app.ts` > 300 baris, mulai pecah:

```
src/
  app.ts              ← orchestrator, cuma .use() sub-router
  routes/
    auth.ts
    admin/
      users.ts
      logs.ts
    envman/
      projects.ts
      tokens.ts
  lib/
    auth-middleware.ts  ← requireAuth, requireEnvAuth, unauthorized(), forbidden()
    db.ts               ← Prisma singleton
    cache.ts            ← Redis withCache/invalidateCache
    pagination.ts       ← parsePagination()
```

Aturan ukuran: route file max 500 baris. Jika lebih, pecah lagi.

### 1B. Centralize auth middleware

Jangan copy-paste auth check di setiap route. Buat satu helper:

```typescript
// src/lib/auth-middleware.ts
export async function requireAuth(request: Request): Promise<Caller | null>
export function unauthorized(set: { status?: number | string }) { set.status = 401; return { error: 'Unauthorized' } }
export function forbidden(set: { status?: number | string }) { set.status = 403; return { error: 'Forbidden' } }
```

### 1C. Prisma transaction di operasi kritis

Operasi multi-step harus atomic. Jika dua operasi harus berhasil atau gagal bersama, gunakan `$transaction`:

```typescript
// Benar — atomic
await prisma.$transaction([
  prisma.user.update({ where: { id }, data: { blocked: true } }),
  prisma.session.deleteMany({ where: { userId: id } }),
])

// Salah — tidak atomic, bisa korup jika tengah-tengah gagal
await prisma.user.update(...)
await prisma.session.deleteMany(...)
```

Kapan wajib `$transaction`: update + delete bersamaan, create + relasi, bulk upsert yang harus konsisten.

### 1D. Pagination default di semua findMany

Tidak boleh ada `findMany` tanpa `take`. Buat helper:

```typescript
// src/lib/pagination.ts
export function parsePagination(query: Record<string, unknown>, defaultLimit = 50, maxLimit = 200) {
  return {
    limit: Math.min(Number(query.limit) || defaultLimit, maxLimit),
    offset: Number(query.offset) || 0,
  }
}
```

Limit yang direkomendasikan: list umum 50, audit log 100, search results 20.

---

## Phase 2 — Reliability

> Lakukan ini setelah Phase 1 selesai. Goal: sistem tidak korup data, perubahan tidak merusak yang sudah jalan.

### 2A. Integration test minimal per endpoint

Setiap endpoint wajib punya minimal 3 test:
1. Happy path (berhasil)
2. Unauthorized (tanpa/invalid auth)
3. Invalid input atau not found

Target coverage: endpoint kritis (auth, CRUD utama) 60-100%. Total minimal 40%.

Pattern test dengan Elysia (tanpa server yang jalan):
```typescript
const app = createTestApp()
const res = await app.handle(new Request('http://localhost/api/...', {
  method: 'POST',
  headers: { 'cookie': `session=${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ... }),
}))
expect(res.status).toBe(200)
```

### 2B. Redis cache untuk query berulang

Buat wrapper sederhana:

```typescript
// src/lib/cache.ts
export async function withCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached) as T
  } catch {}
  const data = await fetcher()
  if (data != null) redis.set(key, JSON.stringify(data), 'EX', String(ttlSeconds)).catch(() => {})
  return data
}

export async function invalidateCache(...keys: string[]) {
  if (keys.length === 0) return
  redis.del(...keys).catch(() => {})
}
```

TTL yang direkomendasikan: project list 60s, project access/role 120s, token list 30s.
**Jangan cache**: env vars (data sensitif), session (sudah dihandle auth library).

Setiap mutasi harus invalidate cache yang relevan — jangan lupa ini.

### 2C. Soft delete untuk data penting

Tambah field `deletedAt DateTime?` ke model yang tidak boleh di-hard-delete (Project, User):

```typescript
// src/lib/db-helpers.ts
export const notDeleted = { deletedAt: null } as const
export function softDelete() { return { deletedAt: new Date() } }

// Penggunaan
const projects = await prisma.project.findMany({ where: { ...notDeleted, ... } })
await prisma.project.update({ where: { id }, data: softDelete() })
```

### 2D. API versioning

Buat `/api/v1/` yang identik dengan endpoint yang ada. Breaking changes hanya masuk di versi baru.
Additive changes (tambah field, tambah endpoint) tidak perlu bump versi.

---

## Phase 3 — Performance & Scale

> Lakukan hanya saat ada data nyata yang menunjukkan bottleneck. Phase 1 dan 2 harus selesai dulu.

### 3A. HTTP Cache-Control untuk static assets

```typescript
// Saat serve file dari dist/ di production
const isHashed = /\.[a-f0-9]{8,}\.(js|css)$/.test(url.pathname)
set.headers['Cache-Control'] = isHashed
  ? 'public, max-age=31536000, immutable'   // file dengan content hash → cache 1 tahun
  : 'public, max-age=0, must-revalidate'    // index.html dll → selalu cek ke server
```

### 3B. Query tuning di TanStack Query

Gunakan nilai yang tepat per tipe data, bukan default global untuk semua:

```typescript
// Data stabil (project list, token list)
{ staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, refetchIntervalInBackground: false }

// Data real-time (session, presence)
{ staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false }

// Data yang berubah sering (vars, ticket status)
{ staleTime: 10_000, refetchOnWindowFocus: true }

// Data static (docs, config)
{ staleTime: Infinity, refetchInterval: false }
```

Global default di QueryClient:
```typescript
new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 10 * 60_000, refetchOnWindowFocus: true } }
})
```

### 3C. Optimistic updates untuk mutasi yang sering

Pattern standar — harus konsisten di semua mutations:

```typescript
const mutation = useMutation({
  mutationFn: (data) => apiFetch('/api/...', { method: 'PATCH', body: JSON.stringify(data) }),
  onMutate: async (data) => {
    await qc.cancelQueries({ queryKey: KEY })
    const previous = qc.getQueryData(KEY)
    qc.setQueryData(KEY, (old: any) => ({ ...old, /* update optimistis */ }))
    return { previous }
  },
  onError: (_err, _data, context) => {
    if (context?.previous) qc.setQueryData(KEY, context.previous)  // rollback
    notifyErr(...)
  },
  onSettled: () => qc.invalidateQueries({ queryKey: KEY }),  // selalu refresh dari server
})
```

Kapan pakai: toggle (pin, disable, active), update text/name, role change.
Kapan tidak pakai: bulk operation, create baru (butuh temp ID), operasi yang jarang.

### 3D. Cursor-based pagination untuk list panjang

Backend — lebih efisien dari offset untuk data besar:

```typescript
// GET /api/resource?cursor=<lastId>&limit=20
const limit = Math.min(Number(query.limit) || 20, 100)
const items = await prisma.resource.findMany({
  take: limit + 1,
  ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  orderBy: { updatedAt: 'desc' },
})
const hasMore = items.length > limit
return { items: hasMore ? items.slice(0, limit) : items, nextCursor: hasMore ? items[limit - 1]?.id : undefined }
```

Frontend — pakai `useInfiniteQuery`:

```typescript
useInfiniteQuery({
  queryKey: ['resource', 'infinite'],
  queryFn: ({ pageParam }) => apiFetch(`/api/resource?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})
```

IntersectionObserver untuk auto-load saat scroll:
```typescript
// Letakkan sentinel div di bawah list
// Observer trigger fetchNextPage() saat sentinel masuk viewport
```

### 3E. Pecah frontend component besar

Aturan: file > 500 baris = wajib pecah, > 1000 baris = darurat.

Pattern: route file jadi orchestrator, logic dipindah ke `components/<domain>/`:

```
routes/
  envmanager.$slug.index.lazy.tsx   ← orchestrator (state + tab routing saja)
components/
  slug/
    NotesPanel.tsx                   ← notes feature lengkap
    NoteModals.tsx                   ← form + view modal
    MembersTab.tsx                   ← member management
```

Gunakan `memo()` di component yang props-nya jarang berubah untuk mencegah re-render tidak perlu.

---

## Session Expiry & Auto-Redirect

Implementasikan dua layer deteksi:

**Layer 1 — Polling**: useSession dengan `refetchInterval: 60_000`. Saat response `user: null`, SessionGuard redirect ke `/login`.

**Layer 2 — 401 interceptor**: Di QueryCache global, tangkap `UnauthorizedError` dari semua query/mutation dan set session data ke `{ user: null }` agar SessionGuard bereaksi.

```typescript
// Centralized apiFetch dengan 401 detection
export class UnauthorizedError extends Error { constructor() { super('Unauthorized') } }
export const apiFetch = (url, opts) => fetch(url, { credentials: 'include', ...opts }).then(async r => {
  if (r.status === 401) throw new UnauthorizedError()
  if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`)
  return r.json()
})

// Di QueryClient
new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => { if (err instanceof UnauthorizedError) queryClient.setQueryData(['auth', 'session'], { user: null }) }
  })
})
```

---

## Code Splitting (Frontend)

Lazy-load route yang berat. Di TanStack Router, gunakan `createLazyFileRoute`:

```typescript
// File: envmanager.tokens.lazy.tsx
export const Route = createLazyFileRoute('/envmanager/tokens')({ component: TokensPage })

// File: envmanager.tokens.tsx (stub)
export const Route = createFileRoute('/envmanager/tokens')({})
```

Vendor splitting di Vite:
```typescript
manualChunks: (id) => {
  if (id.includes('node_modules/react')) return 'react'
  if (id.includes('node_modules/@mantine')) return 'mantine'
  if (id.includes('node_modules/@tanstack')) return 'tanstack'
  if (id.includes('node_modules/react-icons')) return 'icons'
  if (id.includes('node_modules/')) return 'vendor'
}
```

---

## Anti-Pattern yang Harus Dihindari

| ❌ Jangan | ✅ Gantinya |
|---|---|
| `findMany` tanpa `take` | Selalu set limit, gunakan `parsePagination()` |
| Auth check copy-paste di setiap route | Centralize di `requireAuth()` |
| Multi-step DB tanpa `$transaction` | Bungkus dengan `prisma.$transaction([...])` |
| Hard delete data penting | Soft delete dengan `deletedAt` |
| `refetchInterval` sama untuk semua query | Sesuaikan per tipe data |
| Component > 1000 baris | Pecah ke sub-components per domain |
| Catch error tanpa feedback ke user | Selalu `notifyErr(e)` atau log |
| Optimistic update tanpa rollback | Selalu sertakan `onError` dengan context rollback |
| Invalidate cache tapi lupa di beberapa mutasi | Audit semua mutasi yang ubah data yang di-cache |
