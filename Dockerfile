FROM oven/bun:1 AS base
WORKDIR /app

# ── Install deps ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Build frontend bundle ─────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN bunx prisma generate
RUN bun run build
RUN bun run build:cli

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/generated     ./generated
COPY --from=builder /app/src           ./src
COPY --from=builder /app/dist          ./dist
COPY --from=builder /app/public        ./public
COPY --from=builder /app/prisma        ./prisma
COPY --from=builder /app/package.json  ./
COPY --from=builder /app/bunfig.toml   ./
COPY --from=builder /app/tsconfig.json ./

# Ensure default volume paths exist with correct permissions
RUN mkdir -p /app/state /cliproxy-auth

EXPOSE 3000

CMD ["bun", "src/index.tsx"]
