export function buildSelfHostingSection(origin: string): string {
  return `
## Self-Hosting

### Environment Variables Server

\`\`\`bash
# ─── Database (wajib)
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/envman

# ─── Enkripsi secret vars (sangat dianjurkan)
MASTER_KEY=<64-char-hex>  # openssl rand -hex 32

# ─── Server
PORT=3000
NODE_ENV=production

# ─── Google OAuth (opsional)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# ─── Redis (untuk app logs + presence)
REDIS_URL=redis://localhost:6379

# ─── MCP server (opsional, untuk Claude integration)
MCP_SECRET=<hex>
MCP_SECRET_ADMIN=<hex>

# ─── Audit log retention
AUDIT_LOG_RETENTION_DAYS=90
\`\`\`

### Scripts

\`\`\`bash
# Development
bun run dev           # dev server (watch mode)

# Database
bun run db:migrate    # jalankan migrasi
bun run db:seed       # seed demo users (superadmin/admin/user)
bun run db:studio     # buka Prisma Studio di browser
bun run db:generate   # regenerate Prisma client

# Production
bun run build         # build frontend (Vite)
bun run start         # production server

# CLI binary
bun run build:cli     # build untuk semua platform

# Quality
bun run typecheck     # tsc --noEmit
bun run lint          # biome check
bun run lint:fix      # biome check --write
bun run test          # semua tests
bun run test:unit     # unit tests saja
bun run test:integration  # integration tests saja
\`\`\`

### Seed Users (development)

| Email | Password | Role |
|-------|----------|------|
| \`superadmin@example.com\` | \`superadmin123\` | SUPER_ADMIN |
| \`admin@example.com\` | \`admin123\` | ADMIN |
| \`user@example.com\` | \`user123\` | USER |

### Stack

| Layer | Teknologi |
|-------|-----------|
| Runtime | Bun |
| Backend | Elysia.js |
| Database | PostgreSQL via Prisma v6 |
| Cache/Logs | Redis (Bun native) |
| Frontend | React 19 + Vite 8 |
| UI | Mantine v8 |
| Routing | TanStack Router |
| State | TanStack Query |
| Auth | Session-based (HttpOnly cookie) + Better Auth |
| CLI | Bun compile (standalone binary) |

---

*Dokumentasi ini di-generate dari source code. Untuk raw markdown: [${origin}/api/docs.md](${origin}/api/docs.md)*
`
}
