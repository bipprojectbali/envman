# Scaling Roadmap

Panduan bertahap untuk men-scale project berbasis **Bun + Elysia + Prisma + PostgreSQL + React + TanStack Router**.
Ditulis agnostik — bisa diterapkan di project serupa dengan stack yang sama.

Urutan phase **wajib diikuti** karena ada dependency antar phase.

---

## Phase 1 — Fondasi (sebelum tambah fitur besar berikutnya)

> Goal: kode bisa di-maintain, di-test, dan dikembangkan oleh lebih dari 1 orang tanpa takut.

Lihat detail: [@docs/PHASE-1-FOUNDATION.md](./PHASE-1-FOUNDATION.md)

### Checklist
- [ ] Split `app.ts` monolith → file per domain
- [ ] Centralize auth middleware (hapus duplikasi manual)
- [ ] Tambah `prisma.$transaction()` di operasi kritis
- [ ] Tambah pagination default di semua `findMany`

---

## Phase 2 — Reliability

> Goal: sistem tidak korup data saat terjadi error, dan perubahan tidak merusak yang sudah jalan.

Lihat detail: [@docs/PHASE-2-RELIABILITY.md](./PHASE-2-RELIABILITY.md)

### Checklist
- [ ] Naikkan test coverage ke minimal 40% (endpoint kritis)
- [ ] Redis caching untuk query yang sering dipanggil
- [ ] Soft delete untuk data penting (Project, User)
- [ ] API versioning `/api/v1/`

---

## Phase 3 — Scale

> Goal: UX tetap responsif dan server tidak kewalahan saat data dan user tumbuh.

Lihat detail: [@docs/PHASE-3-SCALE.md](./PHASE-3-SCALE.md)

### Checklist
- [ ] Infinite scroll di list panjang (gists, tickets, audit log)
- [ ] Optimistic updates di semua mutations
- [ ] Pecah frontend component besar (>500 baris)
- [ ] HTTP Cache-Control headers untuk static assets
- [ ] Query tuning: staleTime, refetchInterval, gcTime

---

## Prinsip Umum

1. **Jangan lewati urutan phase.** Phase 2 butuh fondasi Phase 1. Phase 3 butuh reliability Phase 2.
2. **Setiap phase bisa dikerjakan bertahap** — tidak harus selesai semua sebelum deploy.
3. **Tidak ada rewrite total.** Semua perubahan adalah reorganisasi atau additive.
4. **Ukur sebelum optimasi** — jangan implement Phase 3 sebelum ada data nyata yang menunjukkan bottleneck.
