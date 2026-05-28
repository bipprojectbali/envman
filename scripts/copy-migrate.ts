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

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join, resolve, dirname } from "node:path"

// ─── Auto-detect API prefixes from route source files ────────────────────────
// Scans src/app.ts + src/routes/**/*.ts for route method calls and extracts
// the first path segment of each route to build API_PREFIXES automatically.
function detectApiPrefixes(targetRoot: string): string[] {
  const files: string[] = []

  function collectTs(dir: string) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) collectTs(full)
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full)
    }
  }

  for (const f of ['src/app.ts', 'src/app.tsx', 'src/index.ts', 'src/index.tsx']) {
    const p = join(targetRoot, f)
    if (existsSync(p)) files.push(p)
  }
  collectTs(join(targetRoot, 'src/routes'))

  const prefixes = new Set<string>()
  // Match .get('/path', ...), .post(`/path`, ...), .ws('/path', ...) etc.
  const RE = /\.(get|post|put|delete|patch|all|ws|mount)\s*\(\s*['"`]([^'"`]+)['"`]/g

  for (const file of files) {
    RE.lastIndex = 0  // reset between files — global regex retains lastIndex
    const content = readFileSync(file, 'utf-8')
    let m
    while ((m = RE.exec(content)) !== null) {
      const p = m[2]
      if (!p.startsWith('/')) continue
      const parts = p.split('/').filter(Boolean)
      if (!parts.length || parts[0].startsWith(':')) continue
      // Multi-segment → trailing slash prefix (/api/ not /api)
      prefixes.add(parts.length > 1 ? `/${parts[0]}/` : `/${parts[0]}`)
    }
  }

  prefixes.add('/health')
  return Array.from(prefixes).sort()
}

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

// ─── Validate source files exist ──────────────────────────────────────────────

const SOURCE_MIGRATE_LIB = join(SOURCE_ROOT, "src/lib/migrate.ts")
const SOURCE_MIGRATE_SCR = join(SOURCE_ROOT, "scripts/migrate.ts")

if (!existsSync(SOURCE_MIGRATE_LIB)) {
  console.error(`✗ Source file not found: ${SOURCE_MIGRATE_LIB}`)
  console.error("  Run this script from the envman project root.")
  process.exit(1)
}
if (!existsSync(SOURCE_MIGRATE_SCR)) {
  console.error(`✗ Source file not found: ${SOURCE_MIGRATE_SCR}`)
  process.exit(1)
}

// ─── Validate target ──────────────────────────────────────────────────────────

if (!existsSync(join(TARGET, "package.json"))) {
  console.error(`✗ Not a valid project — no package.json at: ${TARGET}`)
  process.exit(1)
}

// Guard: prevent running against envman itself
if (resolve(TARGET) === resolve(SOURCE_ROOT)) {
  console.error("✗ Target cannot be the same as the source (envman) project.")
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
  hasEnvLib:     existsSync(join(TARGET, "src/lib/env.ts")) || existsSync(join(TARGET, "src/lib/env.js")),
  hasAppEntry:   existsSync(join(TARGET, "src/app.ts")) || existsSync(join(TARGET, "src/app.tsx")),
  hasPublicDir:  existsSync(join(TARGET, "public")),
}

// Determine lock file — check specifically which one exists
const lockFile = existsSync(join(TARGET, "bun.lock")) ? "bun.lock"
  : existsSync(join(TARGET, "bun.lockb")) ? "bun.lockb"
  : null

let rawPkg: string
try {
  rawPkg = readFileSync(join(TARGET, "package.json"), "utf-8")
} catch (e) {
  console.error(`✗ Cannot read package.json: ${e}`)
  process.exit(1)
}

let pkg: any
try {
  pkg = JSON.parse(rawPkg)
} catch (e) {
  console.error(`✗ Invalid JSON in package.json: ${e}`)
  process.exit(1)
}

// Guard: pkg.scripts might not exist
if (!pkg.scripts || typeof pkg.scripts !== 'object') pkg.scripts = {}

const hasBuildCli   = !!pkg.scripts["build:cli"]
const hasMcpScripts = existsSync(join(TARGET, "scripts/mcp"))

// ─── Colors ───────────────────────────────────────────────────────────────────

const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const red    = (s: string) => `\x1b[31m${s}\x1b[0m`
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`

// ─── Warnings ─────────────────────────────────────────────────────────────────

const warnings: string[] = []

if (!detect.hasPrisma)
  warnings.push("prisma/schema.prisma not found — add migrations manually after setup")
if (!detect.hasEnvLib)
  warnings.push("src/lib/env.ts not found — server.prod.ts imports './lib/env'; create it or update the import")
if (!detect.hasAppEntry)
  warnings.push("src/app.ts not found — server.prod.ts imports './app'; update the import to match your entry file")
if (!lockFile)
  warnings.push("No bun.lock / bun.lockb found — Dockerfile will use 'bun.lock' but it doesn't exist yet; run 'bun install' first")

// ─── Report ───────────────────────────────────────────────────────────────────

const fileStatus = (exists: boolean, willOverwrite: boolean) =>
  !exists         ? dim("missing — will create")
  : willOverwrite ? yellow("exists — will OVERWRITE (--force)")
  :                 yellow("exists — will SKIP (use --force to replace)")

console.log()
console.log(bold("copy-migrate") + " → " + cyan(TARGET))
console.log()
console.log("  Detected:")
console.log(`    src/lib/            ${detect.hasSrcLib    ? green("✓") : dim("missing — will create")}`)
console.log(`    scripts/            ${detect.hasScripts   ? green("✓") : dim("missing — will create")}`)
console.log(`    prisma/             ${detect.hasPrisma    ? green("✓") : red("✗ not found")}`)
console.log(`    src/lib/env.ts      ${detect.hasEnvLib    ? green("✓") : red("✗ not found — server.prod.ts will fail to compile")}`)
console.log(`    src/app.ts          ${detect.hasAppEntry  ? green("✓") : red("✗ not found — update createApp() import manually")}`)
console.log(`    bun.lock            ${lockFile            ? green(`✓ (${lockFile})`) : red("✗ not found — run bun install first")}`)
console.log(`    src/lib/migrate.ts  ${fileStatus(detect.hasMigrateLib, force)}`)
console.log(`    scripts/migrate.ts  ${fileStatus(detect.hasMigrateScr, force)}`)
console.log(`    Dockerfile          ${fileStatus(detect.hasDockerfile, force)}`)
console.log(`    server.prod.ts      ${fileStatus(detect.hasServerProd, force)}`)
console.log(`    build:cli           ${hasBuildCli  ? green("✓ found") : dim("not found — omitted from Dockerfile")}`)
console.log(`    scripts/mcp/        ${hasMcpScripts ? green("✓ found") : dim("not found — omitted from Dockerfile")}`)

if (warnings.length) {
  console.log()
  console.log(yellow("  Warnings:"))
  for (const w of warnings) console.log(`    ${yellow("⚠")}  ${w}`)
}

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
copyFile(SOURCE_MIGRATE_LIB, join(TARGET, "src/lib/migrate.ts"), "src/lib/migrate.ts")
console.log()

// ─── Step 2: scripts/migrate.ts ───────────────────────────────────────────────

step(2, "CLI wrapper")
copyFile(SOURCE_MIGRATE_SCR, join(TARGET, "scripts/migrate.ts"), "scripts/migrate.ts")
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
  // Preserve original formatting by doing a clean stringify
  writeFileSync(join(TARGET, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf-8")
  patched("Saved package.json")
}
console.log()

// ─── Step 4: src/server.prod.ts ───────────────────────────────────────────────

step(4, "Production server entry")

const detectedPrefixes = detectApiPrefixes(TARGET)
const prefixesLiteral = detectedPrefixes.map(p => `'${p}'`).join(', ')

if (detectedPrefixes.length <= 1) {
  console.log(`  ${yellow("⚠")}  API_PREFIXES only has ${yellow("/health")} — no routes detected in src/app.ts or src/routes/`)
  console.log(`     Update API_PREFIXES manually in src/server.prod.ts after creation.`)
} else {
  console.log(`  ${green("✓")} Detected API prefixes: ${cyan(prefixesLiteral)}`)
}

const serverProdTemplate = `/// <reference types="bun-types" />
/**
 * Production-only server entry point.
 * Compiled via: bun build src/server.prod.ts --compile --target=bun-linux-x64 --outfile server
 *
 * Omits Vite dev middleware so the bundle doesn't pull in devDependencies.
 * Dev workflow unchanged — use src/serve.ts as before.
 */

import fs from 'node:fs'
import path from 'node:path'
import { env } from './lib/env'
import { runMigrations } from './lib/migrate'

// ─── Route Classification ──────────────────────────────
// Auto-detected from src/app.ts + src/routes/**. Verify and add any missing prefixes.
const API_PREFIXES = [${prefixesLiteral}]

function isApiRoute(pathname: string): boolean {
  return API_PREFIXES.some(p =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + '/')
  )
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
// Examples:
//   import { cleanupOldLogs } from './lib/cleanup'
//   cleanupOldLogs().catch(console.error)
//   setInterval(() => cleanupOldLogs().catch(console.error), 24 * 60 * 60 * 1000)

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
  const resolvedLockFile = lockFile ?? "bun.lock"

  const cliBuildLine = hasBuildCli
    ? "\n# CLI binaries\nRUN bun run build:cli\n"
    : ""

  const cliCopyLine = hasBuildCli
    ? "\nCOPY --from=builder /app/dist/cli  ./dist/cli\n"
    : ""

  const publicCopyLine = detect.hasPublicDir
    ? "\nCOPY --from=builder /app/public   ./public"
    : ""

  const mcpCopyLine = hasMcpScripts
    ? "COPY --from=builder /app/scripts  ./scripts\n"
    : ""

  const dockerfileContent = `FROM oven/bun:1 AS base
WORKDIR /app

# ── Install deps ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json ${resolvedLockFile} ./
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
if (warnings.length) {
  console.log(yellow(`⚠  ${warnings.length} warning(s) above need attention before building.`))
  console.log()
}
console.log(bold("✅ Done! Review & next steps:"))
console.log()
console.log(cyan("1. ENV vars") + " to add in your compose.yml / .env:")
console.log("   MIGRATE_ON_STARTUP=true")
console.log("   MIGRATE_DATABASE_URL=${DIRECT_URL}  # direct conn (bypass pooler)")
console.log("   MIGRATE_DB_RETRIES=5               # optional, default 5")
console.log()
console.log(cyan("2. Review") + " src/server.prod.ts:")
console.log("   • API_PREFIXES auto-detected — add any missing prefixes manually")
console.log("   • Add startup tasks if needed (audit log cleanup, cron jobs, etc.)")
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
