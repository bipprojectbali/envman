Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn`
- Use `bunx <package>` instead of `npx <package>`
- Bun auto-loads `.env` — never use dotenv.

## Server

Elysia.js on Bun. `src/app.ts` — all API routes (exported as `createApp()`). `src/index.tsx` — server entry + Vite middleware. `src/serve.ts` — dev entry (`bun --watch src/serve.ts`).

## Database

PostgreSQL via Prisma v6. Client singleton: `src/lib/db.ts` (import `{ prisma }`). Schema: `prisma/schema.prisma`. Commands: `bun run db:migrate`, `bun run db:seed`, `bun run db:generate`.

See @docs/DATABASE.md for full schema models, enums, secret encryption, and seed users.

## Auth

Session-based (HttpOnly cookie + DB). `POST /api/auth/login` → bcrypt verify → Session record. Google OAuth at `/api/auth/google`. Blocked users get 403; sessions invalidated on block. Dev-auth: `GET /api/dev-auth/login-as/:email` (development only).

## Routing Rules (Ketetapan Mutlak)

**Static routes wajib untuk semua navigasi yang merepresentasikan lokasi dalam hierarki data.**

### Kapan pakai static route (`/path/:param`)
- Navigasi antar resource (project → environment → vars)
- URL yang harus bisa di-bookmark, di-share, dan di-reload tanpa kehilangan context
- Setiap level hierarki data yang punya identitas sendiri

### Kapan boleh pakai search params (`?key=value`)
- **Hanya** untuk view state dalam satu halaman: tab aktif, filter, sort order
- Contoh benar: `?tab=environments` di `/envmanager/:slug`
- Contoh salah: `?em_project=myapp&em_env=production` (ini lokasi, bukan view state)

### Larangan keras
- **Dilarang** `useState` untuk navigasi antar halaman/resource
- **Dilarang** search params sebagai pengganti path params untuk resource hierarchy
- **Dilarang** "temporary routes" yang hilang saat reload

### Route structure
```
/envmanager                    → project list
/envmanager/tokens             → tokens page
/envmanager/connections        → global Portainer connections
/envmanager/:slug              → project detail (?tab=environments|members OK)
/envmanager/:slug/:env         → vars page
```

## Role-Based Routing

| Role | Default | Can Access |
|------|---------|------------|
| SUPER_ADMIN | `/dev` | `/dev`, `/dashboard`, `/envmanager`, `/profile` |
| ADMIN | `/dashboard` | `/dashboard`, `/envmanager`, `/profile` |
| QC | `/dashboard` | `/dashboard` (QC tickets only), `/profile` |
| USER | `/profile` | `/profile` |

`getDefaultRoute(role)` in `src/frontend/hooks/useAuth.ts`. Blocked → `/blocked`.

## Aturan Penambahan Fitur (Ketetapan Mutlak)

**Setiap penambahan fitur baru WAJIB disertai:**

1. **Test** — minimal integration test untuk endpoint/flow baru. Patuh pola Phase 2A SCALING.md: happy path + unauthorized + invalid input/not found. Letakkan di `tests/integration/` atau `tests/unit/` sesuai layer.
2. **MCP tool dev** — tambahkan tool di `scripts/mcp/tools/` untuk inspect/manipulasi data fitur baru di lingkungan **development** (terdaftar di server MCP `debug-dev`).
3. **MCP tool stg** — tambahkan tool readonly setara di MCP server staging (`debug-stg`) untuk inspeksi data produksi-like tanpa write access destruktif.

### Kenapa wajib
- **Test**: cegah regresi, jadi sumber kebenaran kontrak. Fitur tanpa test = bug menunggu.
- **MCP dev**: AI dan developer butuh "mata" untuk verifikasi state di dev. Tanpa tool, debugging jadi tebak-tebakan (langgar @docs/AI-CONTRACT.md §9).
- **MCP stg**: incident di staging tidak bisa di-reproduce tanpa cara inspeksi data — wajib ada readonly counterpart per fitur.

### Skala tool MCP
- **Fitur CRUD resource baru**: minimal `list_<entity>`, `get_<entity>` (dev + stg readonly), plus tool admin/mutate di dev jika perlu.
- **Fitur background job / async**: tool untuk inspect queue state + cancel/retry (dev only untuk mutate).
- **Fitur yang ubah DB schema**: pastikan `db_count_by_table` dan `schema` tool sudah refleksi model baru (umumnya otomatis).

### Larangan
- ❌ Commit fitur tanpa test → blocked di code review
- ❌ Buat MCP tool yang sama untuk dev dan stg dengan write access yang sama — stg WAJIB readonly untuk data sensitif
- ❌ Skip salah satu (test only, atau MCP only) — ketiganya satu paket

## Aturan Update Dokumentasi (Ketetapan Mutlak)

**Setiap perubahan yang menyentuh business logic WAJIB update `CLAUDE.md` dan/atau dokumen di `docs/` yang relevan dalam commit yang sama.**

### Yang dianggap "business logic"
- Aturan autentikasi/otorisasi (role, capability, permission, scope token)
- Status machine (ticket, project, environment lifecycle)
- Validasi domain (rules input, constraint cross-entity)
- Kontrak API publik (endpoint baru, payload baru, breaking change)
- Behavior CLI (resolusi auth, urutan merge `-e`, opsi baru)
- Enkripsi/keamanan data (secret, audit log action baru)
- Routing rules (path baru, redirect rules, role-based default route)
- Skema DB yang ubah relasi/cardinality/constraint

### Yang BUKAN business logic (boleh skip update doc)
- Refactor internal, rename variable, perbaikan typo
- Optimasi performa yang tidak ubah behavior
- Penambahan logging/observability
- Styling, layout, animasi murni UI tanpa ubah aliran data
- Update dependency tanpa breaking change

### Mapping dokumen
| Perubahan | Dokumen target |
|---|---|
| Endpoint API baru/ubah | `docs/API.md` |
| Schema/enum/encryption | `docs/DATABASE.md` |
| Route frontend baru, hook, component pattern | `docs/FRONTEND.md` |
| CLI flag/command baru | `docs/CLI.md` |
| Redis key, logging, MCP tool baru | `docs/INFRA.md` |
| Aturan kerja AI / contract test | `docs/AI-CONTRACT.md` |
| Pattern performa, caching strategy | `docs/PERFORMANCE.md` |
| Aturan global, role, routing, testing | `CLAUDE.md` |

### Larangan
- ❌ Merge PR yang ubah business logic tanpa update dokumen — reviewer wajib reject
- ❌ "Update doc nanti aja di PR terpisah" — drift pasti terjadi, dokumen jadi bohong
- ❌ Update doc tapi tidak update tabel/section yang ada — tambahkan sebagai entry baru atau replace entry lama

## Testing

```bash
bun run test              # all tests
bun run test:unit         # tests/unit/
bun run test:integration  # tests/integration/ — via app.handle(), no server needed
```

`tests/helpers.ts` — `createTestApp()`, `seedTestUser()`, `createTestSession()`, `cleanupTestData()`

## Bun APIs Used

- `Bun.password.hash()` / `Bun.password.verify()` — bcrypt
- `Bun.RedisClient` — Redis (native, no package)
- `Bun.file()` — static file serving in production
- `crypto.randomUUID()` — session tokens

## Detail Docs

- @docs/API.md — all API endpoints (Admin, Tickets, Envman, Auth, WebSocket)
- @docs/DATABASE.md — full schema, enums, secret encryption, seed users
- @docs/FRONTEND.md — routes, components, hooks, UI patterns, dev console visualizations
- @docs/CLI.md — CLI commands, options, auth resolution, examples
- @docs/INFRA.md — Redis, logging, MCP server, dev tools
- @docs/AI-CONTRACT.md — aturan kerja AI di repo ini (wajib dibaca sebelum edit kode)
- @docs/PERFORMANCE.md — panduan performa per layer: runtime, caching, bundle, infra (agnostik, bisa diterapkan di project serupa)
- @docs/PRISMA7-MIGRATION.md — audit lengkap migrasi Prisma 6 → 7: breaking changes, solusi, potensi bug, urutan eksekusi

## Scaling Roadmap

Baca sebelum menambah fitur besar atau melakukan refactor:

- @docs/SCALING.md — panduan lengkap: fondasi, reliability, performance (Phase 1–3)
