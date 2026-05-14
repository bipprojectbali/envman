# Audit Migrasi Prisma 6 → 7

Dokumen ini mencatat semua breaking changes yang relevan untuk project ini,
status masing-masing, dan solusi konkret yang siap dieksekusi.

Prisma 7 adalah rewrite besar: engine Rust dihapus, bundle turun 90% (14MB → 1.6MB),
query hingga 3x lebih cepat untuk result set besar. Tradeoffnya: beberapa perubahan
arsitektural yang wajib diikuti.

---

## Ringkasan Status

| # | Breaking Change | Severity | Status di project ini |
|---|---|---|---|
| 1 | Generator provider: `prisma-client-js` → `prisma-client` | CRITICAL | ⚠️ Perlu ubah |
| 2 | Driver adapter wajib (`@prisma/adapter-pg`) | CRITICAL | ⚠️ Perlu ubah |
| 3 | `prisma.config.ts` wajib dibuat | CRITICAL | ⚠️ Perlu buat file baru |
| 4 | `datasource.url` di schema deprecated | MODERATE | ⚠️ Perlu pindah ke config |
| 5 | ESM only (`"type": "module"`) | ✅ Sudah OK | `package.json` sudah set |
| 6 | Node 20.19.0+ & TypeScript 5.4.0+ | ✅ Sudah OK | TS 6.x, tsconfig ESNext |
| 7 | `tsconfig.json` module settings | ✅ Sudah OK | `bundler`, `ESNext`, `ES2023` |
| 8 | Middleware `$use()` dihapus | ✅ Tidak terpakai | Tidak ada `$use()` di codebase |
| 9 | Auto-seeding dihapus | LOW | Workflow sudah terpisah |
| 10 | Mapped enum behavior | ✅ Tidak berubah | v7 revert ke behavior v6 |
| 11 | `$transaction` API | ✅ Tidak terpakai | Tidak ada `$transaction` |
| 12 | Raw queries API | ✅ Tidak terpakai | Tidak ada `$queryRaw`/`$executeRaw` |
| 13 | Connection pool timeout default berubah | ⚠️ Perlu test | pg default: no timeout (0) vs v6: 5s |

---

## Perubahan yang Harus Dilakukan

### 1. `prisma/schema.prisma` — ganti provider

**Sebelum:**
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Sesudah:**
```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")   // deprecated tapi masih bekerja
}
```

> `output` sudah di-set ke `../generated/prisma` — tidak perlu ubah.
> Import path di `src/lib/db.ts` dan `prisma/seed.ts` tetap valid.

---

### 2. `prisma.config.ts` — file baru di root project

Prisma 7 memerlukan file konfigurasi ini untuk CLI commands (migrate, seed, dll).
Bun auto-load `.env` jadi tidak perlu `dotenv`.

**Buat file: `/prisma.config.ts`**
```typescript
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
})
```

> Tidak perlu `import 'dotenv/config'` karena Bun auto-load `.env`.
> Seed tidak dikonfigurasi di sini — tetap dijalankan via `bun run db:seed`.

---

### 3. `src/lib/db.ts` — tambah adapter

**Sebelum (`src/lib/db.ts`):**
```typescript
import { PrismaClient } from '../../generated/prisma'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

**Sesudah:**
```typescript
import { PrismaClient } from '../../generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

> `PrismaPg` dari `@prisma/adapter-pg` langsung terima `connectionString` — tidak perlu buat `Pool` manual.
> Singleton pattern tetap sama.

---

### 4. `prisma/seed.ts` — tambah adapter

**Sebelum:**
```typescript
import { PrismaClient } from '../generated/prisma'

const prisma = new PrismaClient()
```

**Sesudah:**
```typescript
import { PrismaClient } from '../generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})
const prisma = new PrismaClient({ adapter })
```

> Sisa file seed tidak perlu diubah.

---

### 5. `package.json` — update dependencies

```json
{
  "dependencies": {
    "@prisma/adapter-pg": "^7.0.0",
    "@prisma/client": "^7.0.0"
  },
  "devDependencies": {
    "prisma": "^7.0.0"
  }
}
```

Jalankan:
```bash
bun install
```

---

## Yang TIDAK Perlu Diubah

### Import paths — tetap valid
```typescript
// src/lib/db.ts — tetap
import { PrismaClient } from '../../generated/prisma'

// prisma/seed.ts — tetap
import { PrismaClient } from '../generated/prisma'

// Semua route — tetap
import { prisma } from '../../lib/db'
```

Output path `../generated/prisma` sudah di-set eksplisit di schema → tidak ada perubahan lokasi generated client.

### tsconfig.json — sudah kompatibel
```json
{
  "module": "ESNext",
  "moduleResolution": "bundler",
  "target": "ESNext"
}
```
Prisma 7 butuh `target: ES2023` minimum — `ESNext` sudah mencakup itu. ✅

### Enum values — tidak berubah
Prisma 7 sempat mengubah behavior mapped enum di early release, lalu **di-revert ke behavior v6**.
Enum values tetap menggunakan schema names (`'SUPER_ADMIN'`, `'OWNER'`, dll), bukan mapped values.
Tidak ada perubahan di code yang menggunakan enum. ✅

### `$use()` middleware — tidak ada di codebase
Grep di seluruh `src/` tidak menemukan `$use()`. ✅

### `$transaction` — tidak ada di codebase
Tidak ada usage, tidak ada yang perlu diubah. ✅

---

## Potensi Bug Setelah Migrasi

### Bug #1 — Connection pool timeout
**Masalah:** Prisma v6 default connection timeout = 5 detik. Driver `pg` default = tidak ada timeout (0 = tunggu selamanya).

**Gejala:** Query yang hanging karena koneksi DB overload tidak akan pernah timeout — request menggantung selamanya.

**Solusi:** Set timeout eksplisit di adapter:
```typescript
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  // Explicit timeout untuk parity dengan v6 behavior
  connectionTimeoutMillis: 5000,   // 5 detik, sama dengan v6 default
  idleTimeoutMillis: 30000,        // Tutup koneksi idle setelah 30 detik
  max: 10,                         // Max pool size (sama dengan v6 default)
})
```

### Bug #2 — `DIRECT_URL` untuk migration
**Masalah:** Di `prisma.config.ts`, hanya `url` yang dikonfigurasi. Project ini punya `DIRECT_URL` (dipakai saat migrate untuk bypass connection pooler seperti PgBouncer).

**Gejala:** Migration gagal jika `DATABASE_URL` mengarah ke pooler.

**Solusi:** Tambah `directUrl` di config:
```typescript
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
    directUrl: process.env.DIRECT_URL,   // Tambahkan ini
  },
})
```

Dan di `compose.yml`, service `migrate` sudah pakai `DIRECT_URL` sebagai `DATABASE_URL` — pattern ini tetap bekerja. ✅

### Bug #3 — Seed di `compose.yml` entrypoint
**Masalah:** `compose.yml` entrypoint:
```yaml
entrypoint: ["sh", "-c", "bun prisma migrate deploy && bun prisma/seed.ts"]
```
Di Prisma 7, `bun prisma migrate deploy` memerlukan `prisma.config.ts` yang ada di root project. Ini sudah ter-copy ke container via Dockerfile.

**Perlu verifikasi:** `prisma.config.ts` ikut ter-COPY di Dockerfile stage runner.

**Solusi:** Pastikan Dockerfile menyertakan file ini:
```dockerfile
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
```

### Bug #4 — `PrismaClient` tanpa adapter di test
**Masalah:** `tests/helpers.ts` import `prisma` dari `src/lib/db.ts`. Jika `src/lib/db.ts` sudah diupdate dengan adapter, ini otomatis dapat adapter. Tapi jika ada test yang buat `new PrismaClient()` langsung — akan error karena v7 wajib adapter.

**Grep untuk verifikasi:**
```bash
grep -r "new PrismaClient" tests/
```

---

## Urutan Eksekusi Migrasi

```bash
# 1. Install dependencies baru
bun add @prisma/adapter-pg
bun add -d prisma@7 @prisma/client@7

# 2. Update schema.prisma (ganti provider)

# 3. Buat prisma.config.ts

# 4. Update src/lib/db.ts (tambah adapter)

# 5. Update prisma/seed.ts (tambah adapter)

# 6. Regenerate client
bun run db:generate

# 7. Typecheck
bun run typecheck

# 8. Test
bun run test

# 9. Jalankan migration (verifikasi prisma.config.ts bekerja)
bun run db:migrate

# 10. Verifikasi seed
bun run db:seed
```

---

## Checklist Verifikasi Setelah Migrasi

- [ ] `bun run typecheck` — tidak ada error TypeScript baru
- [ ] `bun run test` — semua test pass
- [ ] `bun run db:migrate` — migration CLI bekerja dengan `prisma.config.ts`
- [ ] `bun run db:seed` — seed berhasil dengan adapter
- [ ] Koneksi DB berhasil di dev (cek log prisma)
- [ ] Query project list, vars, tokens berjalan normal
- [ ] Auth login/logout berjalan (session query)
- [ ] Portainer sync berjalan (query dengan relasi nested)
- [ ] `prisma.config.ts` ter-copy di Dockerfile runner stage
- [ ] Staging deploy sukses dan migration auto-run di container

---

## Referensi

- [Prisma 7 Upgrade Guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Prisma 7 Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [Mapped Enum Breaking Change Issue](https://github.com/prisma/prisma/issues/28930)
