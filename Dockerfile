FROM oven/bun:1 AS base
WORKDIR /app

# ── Install deps ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .

# Generate Prisma client (pure TypeScript in v6 — no native binary)
RUN bunx prisma generate

# Frontend bundle (Vite → dist/)
RUN bun run build

# CLI binaries (multi-platform, served at /download/cli/:platform)
RUN bun run build:cli

# Compile migration binary — zero npm dependency at runtime
# Uses Bun.sql built-in, compatible with _prisma_migrations table
RUN bun build scripts/migrate.ts \
      --compile --target=bun-linux-x64 \
      --outfile migrate

# Compile server binary — bundles all npm deps including Prisma client
# Uses src/server.prod.ts (production entry, no Vite/Babel imports)
RUN bun build src/server.prod.ts \
      --compile --target=bun-linux-x64 \
      --outfile server

# ── Runtime (lean — no node_modules) ─────────────────────────────────────────
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production

# Compiled self-contained binaries
COPY --from=builder /app/migrate  ./migrate
COPY --from=builder /app/server   ./server

# Frontend static files (served from dist/ at runtime via Bun.file)
COPY --from=builder /app/dist     ./dist
COPY --from=builder /app/public   ./public

# Migration SQL files (read from disk by migrate binary)
COPY --from=builder /app/prisma/migrations ./prisma/migrations

# CLI binaries for /download/cli/:platform endpoint
COPY --from=builder /app/dist/cli  ./dist/cli

# MCP server scripts (dev tooling, mounted via .mcp.json — safe to keep)
COPY --from=builder /app/scripts  ./scripts

# Ensure volume paths exist
RUN mkdir -p /app/state /cliproxy-auth

EXPOSE 3000

CMD ["./server"]
