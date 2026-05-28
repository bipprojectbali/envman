#!/usr/bin/env bun
/**
 * copy-migrate — Copies the custom Prisma migrator to any Bun/Elysia project.
 *
 * Copies:
 *   • src/lib/migrate.ts      — core migrator (zero npm dep, zero modification needed)
 *   • scripts/migrate.ts      — standalone CLI wrapper
 *   • src/server.prod.ts      — production binary entry (skipped if exists)
 *   • Dockerfile              — multi-stage lean image (skipped if exists)
 *   • package.json            — patches build:migrate + build:server scripts
 *
 * Usage:
 *   bun scripts/copy-migrate.ts <target-path>
 *   bun scripts/copy-migrate.ts <target-path> --force    # overwrite existing files
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, chmodSync } from "node:fs"
import { join, resolve, dirname } from "node:path"

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const force = args.includes("--force")
const targetArg = args.find(a => !a.startsWith("-"))

if (!targetArg) {
  console.error("Usage: bun scripts/copy-migrate.ts <target-project-path> [--force]")
  process.exit(1)
}

const SOURCE_ROOT = resolve(import.meta.dir, "..")
const TARGET = resolve(targetArg)

if (!existsSync(join(TARGET, "package.json"))) {
  console.error(`✗ Not a valid project — no package.json at: ${TARGET}`)
  process.exit(1)
}

// ─── Detect Target ────────────────────────────────────────────────────────────

const detect = {
  hasSrcLib:     existsSync(join(TARGET, "src/lib")),
  hasScripts:    existsSync(join(TARGET, "scripts")),
  hasDockerfile: existsSync(join(TARGET, "Dockerfile")),
  hasPrisma:     existsSync(join(TARGET, "prisma/schema.prisma")),
  hasServerProd: existsSync(join(TARGET, "src/server.prod.ts")),
  hasMigrateLib: existsSync(join(TARGET, "src/lib/migrate.ts")),
  hasMigrateScr: existsSync(join(TARGET, "scripts/migrate.ts")),
  hasBunLock:    existsSync(join(TARGET, "bun.lock")) || existsSync(join(TARGET, "bun.lockb")),
  hasPublicDir:  existsSync(join(TARGET, "public")),
  hasStateDir:   false, // rarely needed in base projects
}

const pkg = JSON.parse(readFileSync(join(TARGET, "package.json"), "utf-8"))

detect.hasStateDir  = !!pkg.scripts?.["start"]?.includes("state")
const hasBuildCli   = !!pkg.scripts?.["build:cli"]
const hasMcpScripts = existsSync(join(TARGET, "scripts/mcp"))

// ─── Report ───────────────────────────────────────────────────────────────────

const dim  = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`

console.log()
console.log(bold("copy-migrate") + " → " + cyan(TARGET))
console.log()
console.log("  Detected:")
console.log(`    src/lib/        ${detect.hasSrcLib ? green("✓") : dim("missing — will create")}`)
console.log(`    scripts/        ${detect.hasScripts ? green("✓") : dim("missing — will create")}`)
console.log(`    prisma/         ${detect.hasPrisma ? green("✓") : yellow("⚠ not found — add migrations manually")}`)
const dockerStatus = !detect.hasDockerfile ? dim("missing — will create")
  : force ? yellow("exists — will OVERWRITE (--force)")
  : yellow("exists — will SKIP (use --force to replace)")
const serverProdStatus = !detect.hasServerProd ? dim("missing — will create")
  : force ? yellow("exists — will OVERWRITE (--force)")
  : yellow("exists — will SKIP (use --force to replace)")
console.log(`    Dockerfile      ${dockerStatus}`)
console.log(`    server.prod.ts  ${serverProdStatus}`)
console.log(`    build:cli       ${hasBuildCli ? green("✓ found") : dim("not found — omitted from Dockerfile")}`)
console.log(`    scripts/mcp/    ${hasMcpScripts ? green("✓ found") : dim("not found — omitted from Dockerfile")}`)
console.log()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function step(n: number, label: string) {
  console.log(bold(`Step ${n}: ${label}`))
}

function copied(label: string) {
  console.log(`  ${green("✓")} ${label}`)
}

function skipped(label: string, reason = "already exists") {
  console.log(`  ${dim("⏭")}  ${label} — ${dim(reason)}`)
}

function patched(label: string) {
  console.log(`  ${green("✓")} ${label}`)
}

function copyFile(src: string, dest: string, label: string): boolean {
  if (existsSync(dest) && !force) { skipped(label); return false }
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  copied(label)
  return true
}

function writeFile(dest: string, content: string, label: string): boolean {
  if (existsSync(dest) && !force) { skipped(label); return false }
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, content, "utf-8")
  copied(label)
  return true
}

// ─── Step 1: src/lib/migrate.ts ───────────────────────────────────────────────

step(1, "Core migrator module")
copyFile(
  join(SOURCE_ROOT, "src/lib/migrate.ts"),
  join(TARGET, "src/lib/migrate.ts"),
  "src/lib/migrate.ts"
)
console.log()

// ─── Step 2: scripts/migrate.ts ───────────────────────────────────────────────

step(2, "CLI wrapper")
copyFile(
  join(SOURCE_ROOT, "scripts/migrate.ts"),
  join(TARGET, "scripts/migrate.ts"),
  "scripts/migrate.ts"
)
console.log()

// ─── Step 3: Patch package.json ───────────────────────────────────────────────

step(3, "package.json scripts")
let pkgDirty = false

if (!pkg.scripts["build:migrate"]) {
  pkg.scripts["build:migrate"] =
    "bun build scripts/migrate.ts --compile --target=bun-linux-x64 --outfile migrate"
  patched("Added build:migrate")
  pkgDirty = true
} else {
  skipped("build:migrate")
}

if (!pkg.scripts["build:server"]) {
  pkg.scripts["build:server"] =
    "bun build src/server.prod.ts --compile --target=bun-linux-x64 --outfile server"
  patched("Added build:server")
  pkgDirty = true
} else {
  skipped("build:server")
}

if (pkgDirty) {
  writeFileSync(join(TARGET, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf-8")
  patched("Saved package.json")
}
console.log()

// ─── Step 4: src/server.prod.ts ───────────────────────────────────────────────

step(4, "Production server entry")

const serverProdTemplate = `/// <reference types="bun-types" />
/**
 * Production-only server entry point.
 * Compiled via: bun build src/server.prod.ts --compile --target=bun-linux-x64 --outfile server
 *
 * Omits Vite dev middleware so the bundle doesn't pull in devDependencies.
 * Dev workflow unchanged — use src/serve.ts as before.
 *
 * TODO: Review API_PREFIXES and startup tasks to match this project.
 */

import fs from 'node:fs'
import path from 'node:path'
import { env } from './lib/env'
import { runMigrations } from './lib/migrate'

// ─── Route Classification ──────────────────────────────
// Add any project-specific prefixes (e.g. '/download/', '/install/', '/mcp')
const API_PREFIXES = ['/api/', '/webhook/', '/ws/', '/health']

function isApiRoute(pathname: string): boolean {
  return API_PREFIXES.some(p => pathname.startsWith(p)) || pathname === '/health'
}

// ─── Frontend Serving (static files from dist/) ───────
async function serveFrontend(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname
  const filePath = path.join('dist', pathname === '/' ? 'index.html' : pathname)

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const isHashed = pathname.startsWith('/assets/')
    return new Response(Bun.file(filePath), {
      headers: {
        'Cache-Control': isHashed
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=0, must-revalidate',
      },
    })
  }
  // SPA fallback
  const indexHtml = path.join('dist', 'index.html')
  if (fs.existsSync(indexHtml)) {
    return new Response(Bun.file(indexHtml), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    })
  }
  return new Response('Not Found', { status: 404 })
}

// ─── Database Migration ────────────────────────────────
if (process.env.MIGRATE_ON_STARTUP !== 'false') {
  await runMigrations()
}

// ─── TODO: Add project-specific startup tasks here ────
// Examples from envman:
//   import { syncBackupCrons } from './lib/portainer-cron'
//   syncBackupCrons().catch(console.error)
//   setInterval(() => cleanupAuditLogs().catch(console.error), 24 * 60 * 60 * 1000)

// ─── Elysia App ────────────────────────────────────────
import { createApp } from './app'

const app = createApp()
  .onRequest(async ({ request }) => {
    const pathname = new URL(request.url).pathname
    if (!isApiRoute(pathname)) {
      return serveFrontend(request)
    }
  })
  .listen(env.PORT)

console.log(\`Server running at http://localhost:\${app.server!.port}\`)
`

writeFile(join(TARGET, "src/server.prod.ts"), serverProdTemplate, "src/server.prod.ts")
console.log()

// ─── Step 5: Dockerfile ───────────────────────────────────────────────────────

step(5, "Dockerfile")

if (detect.hasDockerfile && !force) {
  skipped("Dockerfile", "already exists — run with --force to replace")
  console.log()
} else {
  const lockFile = detect.hasBunLock ? "bun.lock" : "bun.lockb"

  const cliCopyLine = hasBuildCli
    ? "\nCOPY --from=builder /app/dist/cli  ./dist/cli\n"
    : ""

  const mcpCopyLine = hasMcpScripts
    ? "COPY --from=builder /app/scripts  ./scripts\n"
    : ""

  const publicCopyLine = detect.hasPublicDir
    ? "\nCOPY --from=builder /app/public   ./public"
    : ""

  const cliBuildLine = hasBuildCli
    ? "\n# CLI binaries\nRUN bun run build:cli\n"
    : ""

  const dockerfileContent = `FROM oven/bun:1 AS base
WORKDIR /app

# ── Install deps ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json ${lockFile} ./
RUN bun install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .

# Generate Prisma client (pure TypeScript in v7 — no native binary or WASM)
RUN bunx prisma generate

# Frontend bundle (Vite → dist/)
RUN bun run build
${cliBuildLine}
# Compile migration binary — zero npm dependency at runtime
RUN bun build scripts/migrate.ts \\
      --compile --target=bun-linux-x64 \\
      --outfile migrate

# Compile server binary — bundles all npm deps including Prisma client
RUN bun build src/server.prod.ts \\
      --compile --target=bun-linux-x64 \\
      --outfile server

# ── Runtime (lean — no node_modules, no bun runtime needed) ──────────────────
# debian:bookworm-slim (~90MB) vs oven/bun:1 (~220MB) — binary is self-contained,
# only needs glibc + ca-certificates + libssl3 from the OS.
FROM debian:bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \\
      ca-certificates \\
      libssl3 \\
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Compiled self-contained binaries
COPY --from=builder /app/migrate  ./migrate
COPY --from=builder /app/server   ./server

# Frontend static files
COPY --from=builder /app/dist     ./dist
${publicCopyLine}

# Migration SQL files (read from disk at server startup)
COPY --from=builder /app/prisma/migrations ./prisma/migrations
${cliCopyLine}${mcpCopyLine}
EXPOSE 3000

CMD ["./server"]
`

  writeFile(join(TARGET, "Dockerfile"), dockerfileContent, "Dockerfile")
  console.log()
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const line = "─".repeat(52)

console.log(line)
console.log(bold("✅ Done! Review & next steps:"))
console.log()
console.log(cyan("1. ENV vars") + " to add in your compose.yml / .env:")
console.log("   MIGRATE_ON_STARTUP=true")
console.log("   MIGRATE_DATABASE_URL=${DIRECT_URL}  # direct conn (bypass pooler)")
console.log("   MIGRATE_DB_RETRIES=5               # optional, default 5")
console.log()
console.log(cyan("2. Review") + " src/server.prod.ts — check TODO comments:")
console.log("   • Adjust API_PREFIXES for your routes")
console.log("   • Add startup tasks (audit log cleanup, cron jobs, etc.)")
console.log()
console.log(cyan("3. Test locally:"))
console.log("   bun run build:server")
console.log("   DATABASE_URL=<your-db> ./server")
console.log()
console.log(cyan("4. Verify Prisma compatibility:"))
console.log("   bunx prisma generate")
console.log("   bun build src/server.prod.ts --compile --outfile /tmp/server-test")
console.log(line)
console.log()
