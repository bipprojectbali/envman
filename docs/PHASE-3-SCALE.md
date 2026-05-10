# Phase 3 — Scale

> Prerequisite: Phase 1 dan Phase 2 selesai.
> Goal: UX tetap responsif dan server tidak kewalahan saat data dan user tumbuh.
> Terapkan hanya saat ada data nyata yang menunjukkan bottleneck.

---

## 1. Infinite Scroll di List Panjang

### Masalah
List yang ambil semua data sekaligus (gists, tickets, audit log) akan timeout atau habiskan memory
saat data tumbuh ke ribuan record.

### Backend: Cursor-based pagination

Cursor pagination lebih efisien dari offset untuk data besar karena tidak perlu `SKIP` query:

```typescript
// GET /api/gists?cursor=<lastId>&limit=20
.get('/api/gists', async ({ request, set, query }) => {
  const caller = await requireAuth(request)
  if (!caller) return unauthorized(set)

  const limit = Math.min(Number(query.limit) || 20, 100)
  const cursor = query.cursor as string | undefined

  const gists = await prisma.gist.findMany({
    where: { userId: caller.userId },
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,   // skip cursor item itu sendiri
    take: limit,
    orderBy: { updatedAt: 'desc' },
    include: { user: { select: { id: true, name: true } } },
  })

  return {
    gists,
    nextCursor: gists.length === limit ? gists[gists.length - 1].id : null,
  }
})
```

### Frontend: `useInfiniteQuery`

```typescript
// src/frontend/hooks/useGistsInfinite.ts
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '@/frontend/lib/api'

interface GistsPage {
  gists: Gist[]
  nextCursor: string | null
}

export function useGistsInfinite() {
  return useInfiniteQuery({
    queryKey: ['envman', 'gists', 'infinite'],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' })
      if (pageParam) params.set('cursor', pageParam)
      return apiFetch<GistsPage>(`/api/gists?${params}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
  })
}
```

### Component dengan IntersectionObserver (auto-load saat scroll)

```tsx
// src/frontend/components/InfiniteList.tsx
import { useEffect, useRef } from 'react'
import { Loader } from '@mantine/core'

interface InfiniteListProps {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  children: React.ReactNode
}

export function InfiniteList({ hasNextPage, isFetchingNextPage, fetchNextPage, children }: InfiniteListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <>
      {children}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {isFetchingNextPage && <Loader size="sm" mx="auto" mt="md" />}
    </>
  )
}

// Penggunaan
function GistsList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useGistsInfinite()
  const allGists = data?.pages.flatMap(p => p.gists) ?? []

  return (
    <InfiniteList hasNextPage={hasNextPage} isFetchingNextPage={isFetchingNextPage} fetchNextPage={fetchNextPage}>
      {allGists.map(g => <GistCard key={g.id} gist={g} />)}
    </InfiniteList>
  )
}
```

---

## 2. Optimistic Updates

### Masalah
Semua mutasi tunggu server response sebelum update UI. Di koneksi lambat (staging overseas),
latency terasa jelas — user klik, tidak ada feedback selama 300-1000ms.

### Pattern: onMutate + rollback

```typescript
// Pattern lengkap optimistic update
const updateMember = useMutation({
  mutationFn: ({ userId, role }: { userId: string; role: string }) =>
    apiFetch(`/api/envman/projects/${slug}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  // 1. Sebelum request: update UI langsung
  onMutate: async ({ userId, role }) => {
    // Cancel ongoing refetch agar tidak overwrite
    await qc.cancelQueries({ queryKey: ['envman', 'project', slug] })

    // Simpan data lama untuk rollback
    const previous = qc.getQueryData(['envman', 'project', slug])

    // Update UI sekarang
    qc.setQueryData(['envman', 'project', slug], (old: any) => ({
      ...old,
      project: {
        ...old.project,
        members: old.project.members.map((m: any) =>
          m.user.id === userId ? { ...m, role } : m
        ),
      },
    }))

    return { previous }
  },

  // 2. Jika server error: rollback ke data lama
  onError: (_err, _vars, context) => {
    if (context?.previous) {
      qc.setQueryData(['envman', 'project', slug], context.previous)
    }
    notifyErr(new Error('Gagal update role'))
  },

  // 3. Selalu refresh dari server setelah selesai
  onSettled: () => {
    qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
  },
})
```

### Kapan pakai optimistic update

| Operasi | Optimistic? | Alasan |
|---|---|---|
| Toggle pin/disable | Ya | Fast, low-risk, reversible |
| Update text/name | Ya | User langsung lihat hasil |
| Delete | Ya (dengan undo) | Terasa instan |
| Create baru | Partial | Bisa, tapi butuh temp ID |
| Bulk operation | Tidak | Terlalu kompleks, error handling rumit |
| Permission/role change | Ya | Perubahan kecil, mudah rollback |

### Pattern delete dengan undo

```typescript
const deleteNote = useMutation({
  mutationFn: (id: string) =>
    apiFetch(`/api/notes/${id}`, { method: 'DELETE' }),

  onMutate: async (id) => {
    await qc.cancelQueries({ queryKey: ['notes'] })
    const previous = qc.getQueryData(['notes'])
    qc.setQueryData(['notes'], (old: any) => ({
      notes: old.notes.filter((n: any) => n.id !== id)
    }))
    return { previous }
  },

  onError: (_err, _id, context) => {
    if (context?.previous) qc.setQueryData(['notes'], context.previous)
  },

  onSettled: () => qc.invalidateQueries({ queryKey: ['notes'] }),
})
```

---

## 3. Pecah Frontend Component Besar

### Masalah
Component >500 baris sulit di-maintain, render ulang lebih berat dari yang diperlukan,
dan sulit di-test per bagian.

### Aturan pemecahan

| Ukuran | Aksi |
|---|---|
| <200 baris | Fine, tidak perlu dipecah |
| 200-500 baris | Monitor, pecah kalau ada alasan (reuse, complexity) |
| >500 baris | Wajib dipecah |
| >1000 baris | Sudah darurat, banyak concern tercampur |

### Pattern pemecahan

```
routes/
  envmanager.$slug.index.lazy.tsx   ← orchestrator, state management
  components/
    slug/
      EnvironmentsTab.tsx            ← tab environments
      MembersTab.tsx                 ← tab members
      NotesPanel.tsx                 ← notes feature
      NoteForm.tsx                   ← form create/edit note
      NoteViewModal.tsx              ← modal view note
```

```tsx
// routes/envmanager.$slug.index.lazy.tsx (setelah dipecah)
import { EnvironmentsTab } from '@/frontend/components/slug/EnvironmentsTab'
import { MembersTab } from '@/frontend/components/slug/MembersTab'
import { NotesPanel } from '@/frontend/components/slug/NotesPanel'

function ProjectDetailPage() {
  // Hanya state dan tab logic di sini
  return (
    <Tabs>
      <Tabs.Panel value="environments"><EnvironmentsTab slug={slug} /></Tabs.Panel>
      <Tabs.Panel value="members"><MembersTab slug={slug} /></Tabs.Panel>
      <Tabs.Panel value="notes"><NotesPanel slug={slug} /></Tabs.Panel>
    </Tabs>
  )
}
```

### Pakai `memo` untuk prevent re-render yang tidak perlu

```tsx
import { memo } from 'react'

// Wrap component yang props-nya jarang berubah
export const NoteCard = memo(function NoteCard({ note, onEdit, onDelete }: NoteCardProps) {
  return (/* ... */)
})
```

---

## 4. HTTP Cache-Control Headers untuk Static Assets

### Masalah
Browser re-download semua file JS setiap reload meski file belum berubah.

### Solusi: Set header di Bun/Elysia saat serve static files

```typescript
// src/index.tsx — saat serve dist/ di production
if (env.NODE_ENV === 'production') {
  app.get('/assets/*', async ({ request, set }) => {
    const url = new URL(request.url)
    const filePath = `./dist${url.pathname}`
    const file = Bun.file(filePath)

    if (!await file.exists()) {
      set.status = 404
      return 'Not Found'
    }

    // Assets dengan hash di nama file (misal: index-DxkvYPBv.js) = immutable
    const isHashed = /\.[a-f0-9]{8}\.(js|css)$/.test(url.pathname)
    set.headers['Cache-Control'] = isHashed
      ? 'public, max-age=31536000, immutable'  // 1 tahun, tidak perlu re-validate
      : 'public, max-age=0, must-revalidate'   // Selalu cek ke server

    return file
  })
}
```

### Efek
- File dengan content hash (hasil Vite build): browser cache 1 tahun
- `index.html`: selalu fresh dari server
- Reload kedua dan seterusnya: **instan** untuk assets yang belum berubah
- Saat deploy baru: hash berubah → URL berbeda → browser download versi baru otomatis

---

## 5. Query Tuning di TanStack Query

### Masalah
`refetchInterval: 30_000` di semua query = polling agresif meski data jarang berubah.
`staleTime: 30_000` global terlalu pendek untuk data yang stabil.

### Strategi per tipe data

```typescript
// Data yang sangat stabil (project list, token list)
useQuery({
  queryKey: ['envman', 'projects'],
  queryFn: () => apiFetch('/api/envman/projects'),
  staleTime: 5 * 60_000,           // 5 menit — tidak refetch kalau data masih "fresh"
  refetchInterval: 5 * 60_000,     // Poll setiap 5 menit
  refetchIntervalInBackground: false, // Tidak poll saat tab tidak aktif
})

// Data real-time (session, presence)
useQuery({
  queryKey: ['auth', 'session'],
  staleTime: 30_000,
  refetchInterval: 60_000,          // Sudah benar — poll tiap 1 menit
  refetchIntervalInBackground: false,
})

// Data yang berubah sering (env vars, ticket status)
useQuery({
  queryKey: ['envman', 'vars', slug, env],
  staleTime: 10_000,               // Agak pendek
  refetchOnWindowFocus: true,      // Refresh saat user kembali ke tab
})

// Data static (docs, config)
useQuery({
  queryKey: ['docs', 'readme'],
  staleTime: Infinity,             // Tidak pernah stale — hanya fetch sekali
  refetchInterval: false,
})
```

### `gcTime` (garbage collection)

```typescript
// Default gcTime = 5 menit. Perpanjang untuk data yang sering diakses kembali.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,  // Simpan data di cache 10 menit setelah komponen unmount
    },
  },
})
```

---

## Urutan Pengerjaan Phase 3

1. HTTP Cache-Control headers — **effort 15 menit, dampak langsung**
2. Query tuning (staleTime, refetchInterval) — **effort 30 menit, tidak ada risiko**
3. Optimistic update di operasi yang paling sering (toggle, update role)
4. Infinite scroll di halaman yang datanya paling banyak (audit log, tickets)
5. Pecah component besar — **lakukan bertahap, satu component per PR**

> **Jangan implement infinite scroll sebelum backend punya cursor pagination.**
> Frontend dan backend harus bergerak bersamaan untuk fitur ini.
