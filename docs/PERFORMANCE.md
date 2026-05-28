# PERFORMANCE — Panduan Performa untuk Bun + Elysia + React SPA

Catatan ini merangkum semua lapisan optimasi yang membuat stack ini terasa cepat di production.
Ditulis agnostik — bisa diterapkan di project Bun/Elysia/React lain tanpa perubahan signifikan.

---

## 1. Runtime: Bun sebagai Fondasi

Ganti Node.js dengan Bun di seluruh stack. Bukan sekadar runtime swap — Bun membawa API native yang mengeliminasi layer abstraksi.

**Apa yang diganti:**

| Node.js / npm package | Bun native |
|---|---|
| `ioredis` / `node-redis` | `new Bun.RedisClient(url)` |
| `bcrypt` / `argon2` | `Bun.password.hash()` / `Bun.password.verify()` |
| `fs.createReadStream()` | `Bun.file(path)` — zero-copy sendfile |
| `node:http` server | Bun native HTTP — lebih cepat startup |
| `dotenv` | Bun auto-load `.env` |

**Aturan praktis:** Sebelum install npm package, cek apakah Bun punya API native-nya.

---

## 2. Static Asset Caching — 1 Tahun untuk Hashed Files

File dengan content hash di nama (hasil Vite build: `main.abc123.js`) tidak akan pernah berubah.
Beri mereka cache 1 tahun. File tanpa hash (index.html) harus selalu dicek ulang.

```typescript
const isHashed = pathname.startsWith('/assets/')  // atau regex: /\.[a-f0-9]{8,}\.(js|css)$/

return new Response(Bun.file(filePath), {
  headers: {
    'Cache-Control': isHashed
      ? 'public, max-age=31536000, immutable'  // 1 tahun, tidak perlu revalidate
      : 'public, max-age=0, must-revalidate',  // index.html: selalu cek ke server
  },
})
```

**Dampak:** Returning user tidak download ulang React, Mantine, atau app code — langsung dari disk cache browser.

---

## 3. Frontend Bundle Splitting — Chunk per Vendor

Satu bundle besar berarti satu cache miss invalidates everything. Pisah per vendor besar.

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: (id) => {
        if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/'))
          return 'react'
        if (id.includes('node_modules/@mantine/'))
          return 'mantine'
        if (id.includes('node_modules/@tanstack/'))
          return 'tanstack'
        if (id.includes('node_modules/react-icons/'))
          return 'icons'
        if (id.includes('node_modules/'))
          return 'vendor'
        // App code: tidak di-chunk (Rollup handle sendiri)
      },
    },
  },
}
```

**Aturan:** Library yang jarang update (React, UI library) = chunk sendiri = browser cache hit rate tinggi.
Update fitur app tidak membatalkan cache React atau Mantine.

---

## 4. Lazy Loading Routes

Jangan bundle semua route di initial load. Hanya load saat user navigasi ke route tersebut.

```typescript
// File stub: envmanager.tokens.tsx (kecil, hanya registerRoute)
export const Route = createFileRoute('/envmanager/tokens')({})

// File implementasi: envmanager.tokens.lazy.tsx (besar, load on demand)
export const Route = createLazyFileRoute('/envmanager/tokens')({ component: TokensPage })
```

TanStack Router generate `routeTree.gen.ts` otomatis dengan `.lazy()` call untuk tiap lazy route.

**Aturan:** Route yang tidak diakses semua user (admin panel, settings, fitur advanced) = lazy. Route yang pasti dikunjungi semua user (login, dashboard utama) = eager.

**Preload on intent:** TanStack Router bisa preload chunk saat user hover link — jauh sebelum click.

```typescript
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',          // Preload saat hover/focus
  defaultPreloadStaleTime: 30_000,   // Jangan preload ulang jika fresh < 30 detik
})
```

---

## 5. Redis Caching — Kurangi Database Query

Setiap query yang sama di-request berkali-kali oleh banyak user adalah kandidat cache.

```typescript
// src/lib/cache.ts
export async function withCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached) as T
  } catch {
    // Redis gagal → fallback ke database, tidak throw
  }
  const data = await fetcher()
  if (data != null) redis.set(key, JSON.stringify(data), 'EX', String(ttlSeconds)).catch(() => {})
  return data
}

export async function invalidateCache(...keys: string[]) {
  if (keys.length === 0) return
  redis.del(...keys).catch(() => {})  // fire-and-forget
}
```

**TTL yang direkomendasikan:**

| Data | TTL | Alasan |
|---|---|---|
| Project/resource list per user | 60s | Berubah jarang, stale 1 menit OK |
| Access/role per user per resource | 120s | Berubah hanya saat admin edit |
| Token list per user | 30s | Lebih sensitif |
| Session validation | Handled by Better Auth cookie cache (5 menit) | — |

**Jangan cache:** Env vars (data sensitif), response yang user-specific dan sering berubah.

**Cache key pattern:** `{entity}:{scope}:{id}` — contoh: `projects:user:abc123`, `access:user123:myapp`.

---

## 6. Prisma Singleton — Connection Pool Reuse

Jangan buat `new PrismaClient()` di setiap request atau module. Satu instance, reuse connection pool.

```typescript
// src/lib/db.ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma  // Reuse across hot reloads di dev
}
```

**Kenapa:** Prisma default pool = 10 koneksi. Buat 2 instance = 20 koneksi, setengah idle. Singleton = pool dipakai optimal.

**Production logging:** Hanya log `error` — `query` dan `info` di production = banjir log yang memperlambat I/O.

---

## 7. Parallel Queries — Promise.all() bukan Sequential Await

Dua query yang tidak saling bergantung harus jalan paralel.

```typescript
// ❌ Sequential — 2x latency
const project = await prisma.project.findUnique(...)
const members = await prisma.projectMember.findMany(...)

// ✅ Parallel — latency = max(query1, query2)
const [project, members] = await Promise.all([
  prisma.project.findUnique(...),
  prisma.projectMember.findMany(...),
])
```

**Bulk upsert:**
```typescript
// ✅ Semua upsert jalan paralel
await Promise.all(
  items.map(item => prisma.envVar.upsert({ where: ..., update: ..., create: ... }))
)
```

**Aturan:** Kalau dua `await` berturut-turut tidak pakai hasil satu sama lain, ganti dengan `Promise.all()`.

---

## 8. Session Cookie Cache — Skip Database per Request

Session validation yang hit database setiap request membunuh performa di skala. Better Auth punya cookie cache built-in.

```typescript
// src/lib/auth.ts
session: {
  expiresIn: 60 * 60 * 24,     // Session valid 24 jam
  updateAge: 60 * 60,           // Perpanjang session tiap 1 jam jika aktif
  cookieCache: {
    enabled: true,
    maxAge: 5 * 60,             // Cache session di cookie, skip DB 5 menit
  },
}
```

**Dampak:** 5 menit pertama setelah login = nol DB query untuk validasi session. Semua request langsung validasi dari cookie.

---

## 9. Async Logging — Jangan Block Response

Log request setelah response dikirim, bukan sebelum.

```typescript
// Elysia hooks
.onRequest(({ request }) => {
  ;(request as any).__startTime = performance.now()
})
.onAfterResponse(({ request, set }) => {
  const duration = Math.round(performance.now() - (request as any).__startTime)
  appLog('info', `${request.method} ${pathname} ${status} ${duration}ms`)
  // fire-and-forget — tidak await, tidak block
})
```

**Redis log buffer:**
```typescript
// Circular buffer 500 entries di Redis
await redis.lpush('app:logs', JSON.stringify(entry))   // O(1)
await redis.ltrim('app:logs', 0, 499)                  // Keep last 500
```

**Aturan:** Logging tidak boleh ada di critical path response. Selalu `onAfterResponse`, bukan `onBeforeHandle`.

---

## 10. React Query — Tuning staleTime per Jenis Data

Jangan pakai satu staleTime untuk semua query. Data yang berbeda punya karakteristik freshness yang berbeda.

```typescript
// QueryClient global default
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // 30 detik — sensible default
      gcTime: 10 * 60_000,         // Simpan di memory 10 menit setelah unused
      refetchOnWindowFocus: true,  // Refresh saat user balik ke tab
      retry: (count, err) => !(err instanceof UnauthorizedError) && count < 1,
    },
  },
})
```

**Per-query override:**

```typescript
// Data stabil (list jarang berubah)
useQuery({ staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, refetchIntervalInBackground: false })

// Data real-time (presence, session)
useQuery({ staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false })

// Data static (docs, config)
useQuery({ staleTime: Infinity, refetchInterval: false })
```

**Aturan:** `staleTime` terlalu rendah = unnecessary refetch. Terlalu tinggi = stale data. Match ke seberapa sering data berubah di server.

---

## 11. Docker Multi-Stage Build — Zero node_modules di Runtime

Kompilasi server dan migrator menjadi self-contained binary menggunakan `bun build --compile`.
Runtime image tidak membutuhkan `node_modules` sama sekali — semua npm dependency di-embed di binary.

**Estimasi ukuran:** ~600-700MB (dengan node_modules) → ~300-370MB (binary only).

```dockerfile
# Stage 1: Install deps saja
FROM oven/bun:1 AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: Build artifacts
FROM deps AS builder
COPY . .
RUN bunx prisma generate        # Generate Prisma client (pure TypeScript di v6)
RUN bun run build               # Vite build → dist/
RUN bun run build:cli           # CLI binary → dist/cli/
RUN bun run build:migrate       # Migrator binary → ./migrate (zero npm dependency)
RUN bun run build:server        # Server binary → ./server (embed semua npm deps)

# Stage 3: Runtime image — HANYA binary + static files
FROM oven/bun:1 AS runner
COPY --from=builder /app/migrate   ./migrate
COPY --from=builder /app/server    ./server
COPY --from=builder /app/dist      ./dist
COPY --from=builder /app/public    ./public
COPY --from=builder /app/prisma/migrations ./prisma/migrations
COPY --from=builder /app/dist/cli  ./dist/cli
COPY --from=builder /app/scripts   ./scripts
CMD ["./server"]
```

**Yang dihapus dari runner:** `node_modules/` (818MB), `src/`, `generated/`, `package.json`, `tsconfig.json`.

**Kenapa bisa:** Prisma v6 generate pure TypeScript (tidak ada native binary / WASM), sehingga
`bun build --compile` bisa embed Prisma client sepenuhnya ke dalam binary server.

**Entry point production:** `src/server.prod.ts` — production-only entry, tidak mengimpor Vite/Babel.
Jangan gunakan `src/index.tsx` sebagai target compile karena pull seluruh devDependency saat bundle.

**Migrator:** `src/lib/migrate.ts` — reusable module, zero npm dep, compatible `_prisma_migrations`.
Dijalankan di server startup via `runMigrations()` sebelum `app.listen()`. `MIGRATE_ON_STARTUP=false` untuk skip.
Tidak ada service `migrate` terpisah di compose — satu container, satu proses.
`scripts/migrate.ts` adalah thin CLI wrapper untuk standalone binary atau manual run.

```bash
# Build scripts di package.json:
"build:migrate": "bun build scripts/migrate.ts --compile --target=bun-linux-x64 --outfile migrate",
"build:server":  "bun build src/server.prod.ts --compile --target=bun-linux-x64 --outfile server",
```

**Kenapa:** DevDependencies (TypeScript, Vite, ESLint) + prodDependencies semuanya tidak masuk
production image = image 50%+ lebih kecil = pull lebih cepat = deploy lebih cepat = attack surface lebih kecil.

---

## 12. Bounded Buffers — Cegah Memory Leak di Production

Semua data yang tumbuh seiring waktu harus punya batas.

**Redis log buffer:**
```typescript
const MAX_ENTRIES = 500
await redis.lpush(key, entry)
await redis.ltrim(key, 0, MAX_ENTRIES - 1)  // Selalu 500 terakhir
```

**Audit log rotation:**
```typescript
// Jalankan saat startup + setiap 24 jam
async function cleanup() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000)
  await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
}
cleanupAuditLogs()
setInterval(cleanupAuditLogs, 86400_000)
```

**Container log rotation (compose.yml):**
```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"    # Max 30MB total logs on disk
```

> Catatan: field `deploy.resources` di compose.yml hanya aktif di Docker Swarm mode.
> Di plain Docker Compose, gunakan `mem_limit` dan `cpus` di level service jika ingin membatasi resource.

```yaml
# Plain Docker Compose — resource limits yang benar-benar aktif
services:
  app:
    mem_limit: 512m
    cpus: '1.0'
```

**Aturan:** Setiap data yang bisa tumbuh tanpa batas harus punya cleanup mechanism. `ltrim`, `deleteMany`, atau `max-size`.

---

## 13. Flash-Free Color Scheme

Inline script di `<head>` yang jalan sebelum React mount — cegah flicker dark↔light.

```html
<!-- index.html — di dalam <head>, sebelum semua script lain -->
<script>
  (function() {
    var stored = localStorage.getItem('mantine-color-scheme-value');
    var scheme = stored || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-mantine-color-scheme', scheme);
    document.documentElement.style.colorScheme = scheme;
  })();
</script>
```

Ganti `'mantine-color-scheme-value'` dengan key localStorage yang dipakai library UI kamu.

---

## Checklist Performa per Layer

### Backend
- [ ] Bun native APIs (Redis, bcrypt, file serving) — tidak pakai npm package jika ada padanan
- [ ] Prisma singleton (satu instance global)
- [ ] `Promise.all()` untuk query paralel
- [ ] Redis cache di query yang sering dipanggil, dengan TTL yang tepat
- [ ] Logging di `onAfterResponse`, bukan di critical path
- [ ] Bounded buffers (log buffer, audit log rotation)
- [ ] Session cookie cache aktif

### Frontend
- [ ] Vite `manualChunks` per vendor besar
- [ ] Lazy routes untuk halaman non-kritikal
- [ ] `defaultPreload: 'intent'` di TanStack Router
- [ ] `staleTime` per-query sesuai karakteristik data
- [ ] Inline color scheme script di `<head>`

### Infrastructure
- [ ] `Cache-Control: immutable` untuk hashed assets
- [ ] `Cache-Control: must-revalidate` untuk index.html
- [ ] Docker multi-stage build (deps → builder → runner)
- [ ] Compile server ke binary (`bun build src/server.prod.ts --compile`) — eliminasi node_modules di runtime
- [ ] Compile migrator ke binary (`bun build scripts/migrate.ts --compile`) — zero npm dep di migrate service
- [ ] Resource limits di compose (CPU, memory, log rotation)
- [ ] Migrate service pakai `./migrate` binary (bukan `bunx prisma migrate deploy`)
