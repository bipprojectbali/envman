/**
 * debug-dev: MCP server untuk inspeksi dan kontrol runtime local (dev).
 * Menggantikan app-mcp yang generic — tools lebih fokus untuk debugging:
 * semua operasi read/inspect + tools dev (test, lint, typecheck, migrate).
 * Tidak perlu MCP_SECRET karena connect langsung ke DB/Redis local.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import { prisma } from '../../src/lib/db'
import { redis } from '../../src/lib/redis'
import { getAppLogs, clearAppLogs } from '../../src/lib/applog'
import { getOnlineUserIds } from '../../src/lib/presence'
import { ok, errText } from './tools/debug-dev-helpers'
import { registerDbTools } from './tools/debug-dev-db'
import { registerAdminTools } from './tools/debug-dev-admin'
import { registerTicketTools } from './tools/debug-dev-tickets'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertInsideRoot(target: string): string {
  const root = process.cwd()
  const full = isAbsolute(target) ? target : resolve(root, target)
  const rel = relative(root, full)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path is outside project root')
  return full
}

interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
}

async function run(cmd: string[], timeoutMs: number): Promise<RunResult> {
  const started = Date.now()
  const proc = Bun.spawn(cmd, {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, FORCE_COLOR: '0' },
  })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; try { proc.kill() } catch {} }, timeoutMs)
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  clearTimeout(timer)
  const truncate = (s: string) => s.length > 80_000 ? `${s.slice(0, 80_000)}\n…(truncated)` : s
  return { exitCode: exitCode ?? -1, stdout: truncate(stdout), stderr: truncate(stderr), durationMs: Date.now() - started, timedOut }
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'debug-dev', version: '1.0.0' })

// ── Health ────────────────────────────────────────────────────────────────────

server.registerTool(
  'health_full',
  {
    title: 'Full health check',
    description: 'Ping database + Redis local, report uptime and environment',
    inputSchema: {},
  },
  async () => {
    const started = Date.now()
    const [dbOk, redisOk] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redis.ping().then((r: string) => r === 'PONG').catch(() => false),
    ])
    return ok({
      status: dbOk && redisOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'down',
      redis: redisOk ? 'ok' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV ?? 'development',
      checkDurationMs: Date.now() - started,
      pid: process.pid,
    })
  },
)

// ── Logs ──────────────────────────────────────────────────────────────────────

server.registerTool(
  'logs_app',
  {
    title: 'App logs',
    description: 'Tail the Redis-backed app log buffer local (last 500 entries)',
    inputSchema: {
      level: z.enum(['info', 'warn', 'error']).optional(),
      limit: z.number().int().min(1).max(500).default(100),
      afterId: z.number().int().optional(),
      search: z.string().optional().describe('Substring match on message'),
    },
  },
  async ({ level, limit, afterId, search }) => {
    let logs = await getAppLogs({ level, limit, afterId })
    if (search) {
      const s = search.toLowerCase()
      logs = logs.filter((l) => l.message.toLowerCase().includes(s))
    }
    return ok({ count: logs.length, logs })
  },
)

server.registerTool(
  'logs_audit',
  {
    title: 'Audit logs',
    description: 'Persistent audit trail dari DB local',
    inputSchema: {
      userId: z.string().optional(),
      action: z.string().optional(),
      sinceISO: z.string().optional(),
      limit: z.number().int().min(1).max(1000).default(100),
    },
  },
  async ({ userId, action, sinceISO, limit }) => {
    const where: Record<string, unknown> = {}
    if (userId) where.userId = userId
    if (action) where.action = action
    if (sinceISO) where.createdAt = { gte: new Date(sinceISO) }
    const logs = await prisma.auditLog.findMany({ where, take: limit, orderBy: { createdAt: 'desc' } })
    return ok({ count: logs.length, logs })
  },
)

server.registerTool(
  'logs_clear_app',
  {
    title: 'Clear app logs',
    description: 'Wipe the Redis app log buffer local',
    inputSchema: {},
  },
  async () => { await clearAppLogs(); return ok({ ok: true }) },
)

server.registerTool(
  'logs_clear_audit',
  {
    title: 'Clear audit logs',
    description: 'Delete all audit log rows dari DB local',
    inputSchema: { confirm: z.literal(true).describe('Must be true to execute') },
  },
  async ({ confirm }) => {
    if (!confirm) return ok({ error: 'confirm must be true' })
    const result = await prisma.auditLog.deleteMany({})
    return ok({ ok: true, deleted: result.count })
  },
)

// ── Database ──────────────────────────────────────────────────────────────────

registerDbTools(server)

// ── Admin ─────────────────────────────────────────────────────────────────────

registerAdminTools(server)

// ── Presence ──────────────────────────────────────────────────────────────────

server.registerTool(
  'presence_online',
  {
    title: 'Online users',
    description: 'List currently connected users via WebSocket presence tracker local',
    inputSchema: {},
  },
  async () => {
    const ids = getOnlineUserIds()
    if (ids.length === 0) return ok({ count: 0, users: [] })
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, role: true },
    })
    return ok({ count: users.length, users })
  },
)

// ── Redis ─────────────────────────────────────────────────────────────────────

server.registerTool(
  'redis_info',
  {
    title: 'Redis info',
    description: 'Connection status dan ping round-trip ke Redis local',
    inputSchema: {},
  },
  async () => {
    const started = Date.now()
    try {
      const pong = await redis.ping()
      return ok({ connected: true, pong, pingMs: Date.now() - started })
    } catch (e) {
      return ok({ connected: false, error: String(e) })
    }
  },
)

server.registerTool(
  'redis_keys',
  {
    title: 'Redis keys',
    description: 'List keys matching pattern di Redis local (use sparingly — O(N))',
    inputSchema: {
      pattern: z.string().default('*'),
      limit: z.number().int().min(1).max(1000).default(200),
    },
  },
  async ({ pattern, limit }) => {
    const keys = await redis.keys(pattern) as string[]
    return ok({ count: keys.length, keys: keys.slice(0, limit) })
  },
)

server.registerTool(
  'redis_get',
  {
    title: 'Redis GET',
    description: 'Get a string value by key dari Redis local',
    inputSchema: { key: z.string() },
  },
  async ({ key }) => {
    const value = await redis.get(key)
    return ok({ key, value })
  },
)

server.registerTool(
  'redis_set',
  {
    title: 'Redis SET',
    description: 'Set a string value di Redis local. Optional TTL in seconds.',
    inputSchema: {
      key: z.string(),
      value: z.string(),
      ttlSeconds: z.number().int().min(1).optional(),
    },
  },
  async ({ key, value, ttlSeconds }) => {
    if (ttlSeconds) {
      await redis.set(key, value, 'EX', String(ttlSeconds))
    } else {
      await redis.set(key, value)
    }
    return ok({ ok: true, key, ttlSeconds: ttlSeconds ?? null })
  },
)

server.registerTool(
  'redis_del',
  {
    title: 'Redis DEL',
    description: 'Delete one or more keys dari Redis local',
    inputSchema: { keys: z.array(z.string()).min(1) },
  },
  async ({ keys }) => {
    let removed = 0
    for (const k of keys) {
      const result = await redis.del(k)
      removed += typeof result === 'number' ? result : result ? 1 : 0
    }
    return ok({ ok: true, removed })
  },
)

// ── Tickets ───────────────────────────────────────────────────────────────────

registerTicketTools(server)

// ── Code / File ───────────────────────────────────────────────────────────────

server.registerTool(
  'code_read_file',
  {
    title: 'Read file',
    description: 'Read a project file by relative path (limited to project root). Returns contents with line range support.',
    inputSchema: {
      path: z.string().describe('Relative path from project root'),
      offset: z.number().int().min(1).optional().describe('1-based line to start at'),
      limit: z.number().int().min(1).max(5000).optional(),
    },
  },
  async ({ path: rel, offset, limit }) => {
    try {
      const full = assertInsideRoot(rel)
      if (!existsSync(full)) return ok({ error: 'File not found' })
      const st = statSync(full)
      if (!st.isFile()) return ok({ error: 'Not a regular file' })
      if (st.size > 2_000_000) return ok({ error: `File too large (${st.size} bytes)` })
      const text = readFileSync(full, 'utf-8')
      const lines = text.split('\n')
      const start = (offset ?? 1) - 1
      const end = limit ? start + limit : lines.length
      return ok({ path: rel, totalLines: lines.length, range: { start: start + 1, end: Math.min(end, lines.length) }, content: lines.slice(start, end).join('\n') })
    } catch (e) {
      return errText((e as Error).message)
    }
  },
)

server.registerTool(
  'code_grep',
  {
    title: 'Grep project',
    description: 'Search files for a regex pattern inside the project using ripgrep.',
    inputSchema: {
      pattern: z.string(),
      glob: z.string().optional().describe('Glob filter, e.g. src/**/*.ts'),
      maxResults: z.number().int().min(1).max(500).default(100),
      caseInsensitive: z.boolean().default(false),
    },
  },
  async ({ pattern, glob, maxResults, caseInsensitive }) => {
    const args = ['--json', '--max-count', '5', '-n', '--max-filesize', '1M']
    if (caseInsensitive) args.push('-i')
    if (glob) args.push('--glob', glob)
    args.push(pattern)
    try {
      const proc = Bun.spawn(['rg', ...args], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' })
      const out = await new Response(proc.stdout).text()
      await proc.exited
      const matches: { path: string; line: number; text: string }[] = []
      for (const raw of out.split('\n')) {
        if (!raw.trim()) continue
        try {
          const j = JSON.parse(raw)
          if (j.type === 'match') {
            matches.push({ path: j.data.path.text, line: j.data.line_number, text: j.data.lines.text.replace(/\n$/, '') })
            if (matches.length >= maxResults) break
          }
        } catch {}
      }
      return ok({ matches: matches.length, results: matches })
    } catch (e) {
      return ok({ error: `ripgrep unavailable: ${(e as Error).message}` })
    }
  },
)

server.registerTool(
  'code_stat',
  {
    title: 'Stat file',
    description: 'Return size, line count, and mtime for a file',
    inputSchema: { path: z.string() },
  },
  async ({ path: rel }) => {
    try {
      const full = assertInsideRoot(rel)
      if (!existsSync(full)) return ok({ error: 'File not found' })
      const st = statSync(full)
      const lines = st.isFile() && st.size < 2_000_000 ? readFileSync(full, 'utf-8').split('\n').length : null
      return ok({ path: rel, isFile: st.isFile(), isDirectory: st.isDirectory(), size: st.size, lines, modifiedAt: st.mtime.toISOString() })
    } catch (e) {
      return errText((e as Error).message)
    }
  },
)

// ── Dev (test/lint/typecheck/migrate) ─────────────────────────────────────────

server.registerTool(
  'dev_typecheck',
  {
    title: 'TypeScript typecheck',
    description: 'Run `bun run typecheck` (tsc --noEmit)',
    inputSchema: { timeoutMs: z.number().int().min(1000).max(600_000).default(120_000) },
  },
  async ({ timeoutMs }) => ok(await run(['bun', 'run', 'typecheck'], timeoutMs)),
)

server.registerTool(
  'dev_lint',
  {
    title: 'Biome lint',
    description: 'Run `bun run lint` or `lint:fix`',
    inputSchema: {
      fix: z.boolean().default(false),
      timeoutMs: z.number().int().min(1000).max(300_000).default(60_000),
    },
  },
  async ({ fix, timeoutMs }) => ok(await run(['bun', 'run', fix ? 'lint:fix' : 'lint'], timeoutMs)),
)

server.registerTool(
  'dev_test',
  {
    title: 'Run tests',
    description: 'Run unit, integration, or all tests',
    inputSchema: {
      scope: z.enum(['unit', 'integration', 'all']).default('all'),
      pattern: z.string().optional().describe('Test name pattern'),
      timeoutMs: z.number().int().min(1000).max(600_000).default(180_000),
    },
  },
  async ({ scope, pattern, timeoutMs }) => {
    const script = scope === 'all' ? 'test' : `test:${scope}`
    const args = ['bun', 'run', script]
    if (pattern) args.push('--', '--test-name-pattern', pattern)
    return ok(await run(args, timeoutMs))
  },
)

server.registerTool(
  'dev_db_migrate',
  {
    title: 'Prisma migrate dev',
    description: 'Create and apply a new Prisma migration',
    inputSchema: {
      name: z.string().min(1).describe('Migration name (snake_case)'),
      timeoutMs: z.number().int().min(1000).max(300_000).default(120_000),
    },
  },
  async ({ name, timeoutMs }) => ok(await run(['bunx', 'prisma', 'migrate', 'dev', '--name', name], timeoutMs)),
)

server.registerTool(
  'dev_db_seed',
  {
    title: 'Seed database',
    description: 'Run `bun run db:seed`',
    inputSchema: { timeoutMs: z.number().int().min(1000).max(300_000).default(60_000) },
  },
  async ({ timeoutMs }) => ok(await run(['bun', 'run', 'db:seed'], timeoutMs)),
)

server.registerTool(
  'dev_db_generate',
  {
    title: 'Generate Prisma client',
    description: 'Run `bunx prisma generate`',
    inputSchema: { timeoutMs: z.number().int().min(1000).max(300_000).default(60_000) },
  },
  async ({ timeoutMs }) => ok(await run(['bunx', 'prisma', 'generate'], timeoutMs)),
)

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
