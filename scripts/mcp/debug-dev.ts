/**
 * debug-dev: MCP server untuk inspeksi dan kontrol runtime local (dev).
 * Menggantikan app-mcp yang generic — tools lebih fokus untuk debugging:
 * semua operasi read/inspect + tools dev (test, lint, typecheck, migrate).
 * Tidak perlu MCP_SECRET karena connect langsung ke DB/Redis local.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { prisma } from '../../src/lib/db'
import { redis } from '../../src/lib/redis'
import { getAppLogs, clearAppLogs } from '../../src/lib/applog'
import { getOnlineUserIds } from '../../src/lib/presence'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function errText(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  }
}

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

server.registerTool(
  'db_count_by_table',
  {
    title: 'Table row counts',
    description: 'Row counts for each primary table di DB local',
    inputSchema: {},
  },
  async () => {
    const [users, sessions, auditLogs, activeSessions, blockedUsers, projects, environments, envVars, tickets] =
      await Promise.all([
        prisma.user.count(),
        prisma.session.count(),
        prisma.auditLog.count(),
        prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
        prisma.user.count({ where: { blocked: true } }),
        prisma.project.count(),
        prisma.environment.count(),
        prisma.envVar.count(),
        prisma.ticket.count(),
      ])
    return ok({ users, sessions, auditLogs, activeSessions, blockedUsers, projects, environments, envVars, tickets })
  },
)

server.registerTool(
  'db_list_users',
  {
    title: 'List users',
    description: 'List users di DB local dengan filter role/blocked/search',
    inputSchema: {
      role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
      blocked: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).default(50),
      search: z.string().optional().describe('Substring match on name or email'),
    },
  },
  async ({ role, blocked, limit, search }) => {
    const where: Record<string, unknown> = {}
    if (role) where.role = role
    if (typeof blocked === 'boolean') where.blocked = blocked
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
    const users = await prisma.user.findMany({
      where, take: limit, orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
    })
    return ok({ count: users.length, users })
  },
)

server.registerTool(
  'db_get_user',
  {
    title: 'Get user',
    description: 'Fetch a single user by id or email, including active session count',
    inputSchema: {
      id: z.string().optional(),
      email: z.string().email().optional(),
    },
  },
  async ({ id, email }) => {
    if (!id && !email) return ok({ error: 'Provide id or email' })
    const user = await prisma.user.findFirst({
      where: id ? { id } : { email },
      include: { _count: { select: { sessions: true } } },
    })
    if (!user) return ok({ user: null })
    const { password, _count, ...safe } = user
    return ok({ user: { ...safe, sessionCount: _count.sessions } })
  },
)

server.registerTool(
  'db_list_sessions',
  {
    title: 'List sessions',
    description: 'List sessions local dengan filter',
    inputSchema: {
      userId: z.string().optional(),
      active: z.boolean().optional().describe('true = not expired, false = expired'),
      limit: z.number().int().min(1).max(500).default(50),
    },
  },
  async ({ userId, active, limit }) => {
    const where: Record<string, unknown> = {}
    if (userId) where.userId = userId
    if (typeof active === 'boolean') where.expiresAt = active ? { gt: new Date() } : { lte: new Date() }
    const sessions = await prisma.session.findMany({
      where, take: limit, orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, role: true } } },
    })
    return ok({
      count: sessions.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        token: `${s.token.slice(0, 8)}…`,
        userId: s.userId,
        userEmail: s.user.email,
        userRole: s.user.role,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isExpired: s.expiresAt < new Date(),
      })),
    })
  },
)

// ── Admin ─────────────────────────────────────────────────────────────────────

server.registerTool(
  'admin_set_user_role',
  {
    title: 'Change user role',
    description: 'Set role to USER, QC, or ADMIN. SUPER_ADMIN promotion must be done via env.',
    inputSchema: {
      userId: z.string(),
      role: z.enum(['USER', 'QC', 'ADMIN']),
    },
  },
  async ({ userId, role }) => {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return ok({ error: 'User not found' })
    if (user.role === 'SUPER_ADMIN') return ok({ error: 'Cannot demote SUPER_ADMIN' })
    const updated = await prisma.user.update({
      where: { id: userId }, data: { role },
      select: { id: true, email: true, role: true },
    })
    await prisma.auditLog.create({ data: { userId, action: 'ROLE_CHANGED', detail: `${user.role} -> ${role}`, ip: 'mcp-dev' } }).catch(() => {})
    return ok({ ok: true, user: updated })
  },
)

server.registerTool(
  'admin_block_user',
  {
    title: 'Block user',
    description: 'Block a user and revoke all their sessions',
    inputSchema: { userId: z.string(), reason: z.string().optional() },
  },
  async ({ userId, reason }) => {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return ok({ error: 'User not found' })
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { blocked: true } }),
      prisma.session.deleteMany({ where: { userId } }),
    ])
    await prisma.auditLog.create({ data: { userId, action: 'BLOCKED', detail: reason ?? null, ip: 'mcp-dev' } }).catch(() => {})
    return ok({ ok: true, userId })
  },
)

server.registerTool(
  'admin_unblock_user',
  {
    title: 'Unblock user',
    description: 'Remove the blocked flag from a user',
    inputSchema: { userId: z.string() },
  },
  async ({ userId }) => {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return ok({ error: 'User not found' })
    await prisma.user.update({ where: { id: userId }, data: { blocked: false } })
    await prisma.auditLog.create({ data: { userId, action: 'UNBLOCKED', detail: null, ip: 'mcp-dev' } }).catch(() => {})
    return ok({ ok: true, userId })
  },
)

server.registerTool(
  'admin_revoke_sessions',
  {
    title: 'Revoke all sessions',
    description: 'Delete all sessions for a user (force logout everywhere)',
    inputSchema: { userId: z.string() },
  },
  async ({ userId }) => {
    const result = await prisma.session.deleteMany({ where: { userId } })
    return ok({ ok: true, revoked: result.count })
  },
)

server.registerTool(
  'admin_create_user',
  {
    title: 'Create user',
    description: 'Create a new user with hashed password',
    inputSchema: {
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['USER', 'QC', 'ADMIN']).default('USER'),
    },
  },
  async ({ name, email, password, role }) => {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return ok({ error: 'Email already taken' })
    const hashed = await Bun.password.hash(password)
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
    return ok({ ok: true, user })
  },
)

server.registerTool(
  'admin_reset_password',
  {
    title: 'Reset password',
    description: 'Reset a user password (requires the new password). Revokes all sessions.',
    inputSchema: {
      userId: z.string(),
      newPassword: z.string().min(6),
      revokeSessions: z.boolean().default(true),
    },
  },
  async ({ userId, newPassword, revokeSessions }) => {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return ok({ error: 'User not found' })
    const hashed = await Bun.password.hash(newPassword)
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } })
    if (revokeSessions) await prisma.session.deleteMany({ where: { userId } })
    return ok({ ok: true, userId, sessionRevoked: revokeSessions })
  },
)

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

const CLAUDE_EMAIL = 'claude@mcp.local'

async function getOrCreateClaudeUser() {
  const existing = await prisma.user.findUnique({ where: { email: CLAUDE_EMAIL } })
  if (existing) return existing
  const hashed = await Bun.password.hash(crypto.randomUUID())
  return prisma.user.create({
    data: { email: CLAUDE_EMAIL, name: 'Claude (MCP)', password: hashed, role: 'ADMIN' },
  })
}

server.registerTool(
  'ticket_list',
  {
    title: 'List tickets',
    description: 'List tickets local. Default: OPEN + IN_PROGRESS + REOPENED (active only).',
    inputSchema: {
      status: z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED', 'ACTIVE', 'ALL']).default('ACTIVE'),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
      assigneeId: z.string().optional(),
      mine: z.boolean().default(false).describe('Only tickets assigned to Claude MCP user'),
      limit: z.number().int().min(1).max(200).default(50),
    },
  },
  async ({ status, priority, assigneeId, mine, limit }) => {
    const where: Record<string, unknown> = {}
    if (status === 'ACTIVE') where.status = { in: ['OPEN', 'IN_PROGRESS', 'REOPENED', 'READY_FOR_QC'] }
    else if (status !== 'ALL') where.status = status
    if (priority) where.priority = priority
    if (assigneeId) where.assigneeId = assigneeId
    if (mine) { const claude = await getOrCreateClaudeUser(); where.assigneeId = claude.id }
    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true, evidence: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    })
    return ok({ count: tickets.length, tickets })
  },
)

server.registerTool(
  'ticket_get',
  {
    title: 'Get ticket',
    description: 'Fetch full ticket dengan comments dan evidence',
    inputSchema: { id: z.string() },
  },
  async ({ id }) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
        comments: { include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
        evidence: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!ticket) return ok({ error: 'Ticket not found' })
    return ok({ ticket })
  },
)

server.registerTool(
  'ticket_create',
  {
    title: 'Create ticket',
    description: 'Create a new ticket. Reporter defaults to Claude MCP user.',
    inputSchema: {
      title: z.string().min(1),
      description: z.string().min(1),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
      route: z.string().optional(),
      reporterEmail: z.string().email().optional(),
      assigneeEmail: z.string().email().optional(),
    },
  },
  async ({ title, description, priority, route, reporterEmail, assigneeEmail }) => {
    const reporter = reporterEmail
      ? await prisma.user.findUnique({ where: { email: reporterEmail } })
      : await getOrCreateClaudeUser()
    if (!reporter) return ok({ error: `Reporter not found: ${reporterEmail}` })
    let assigneeId: string | null = null
    if (assigneeEmail) {
      const assignee = await prisma.user.findUnique({ where: { email: assigneeEmail } })
      if (!assignee) return ok({ error: `Assignee not found: ${assigneeEmail}` })
      assigneeId = assignee.id
    }
    const ticket = await prisma.ticket.create({
      data: { title, description, priority, route: route ?? null, reporterId: reporter.id, assigneeId },
    })
    return ok({ ok: true, ticket })
  },
)

server.registerTool(
  'ticket_claim',
  {
    title: 'Claim ticket',
    description: 'Assign ticket to Claude MCP user and move status to IN_PROGRESS',
    inputSchema: { id: z.string() },
  },
  async ({ id }) => {
    const ticket = await prisma.ticket.findUnique({ where: { id } })
    if (!ticket) return ok({ error: 'Ticket not found' })
    if (!['OPEN', 'REOPENED'].includes(ticket.status)) return ok({ error: `Cannot claim ticket in status ${ticket.status}` })
    const claude = await getOrCreateClaudeUser()
    const updated = await prisma.ticket.update({ where: { id }, data: { assigneeId: claude.id, status: 'IN_PROGRESS' } })
    return ok({ ok: true, ticket: updated })
  },
)

server.registerTool(
  'ticket_comment',
  {
    title: 'Comment on ticket',
    description: 'Add a comment to a ticket as Claude (MCP)',
    inputSchema: { id: z.string(), body: z.string().min(1) },
  },
  async ({ id, body }) => {
    const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } })
    if (!ticket) return ok({ error: 'Ticket not found' })
    const claude = await getOrCreateClaudeUser()
    const comment = await prisma.ticketComment.create({
      data: { ticketId: id, authorId: claude.id, authorTag: 'CLAUDE', body },
    })
    return ok({ ok: true, comment })
  },
)

server.registerTool(
  'ticket_add_evidence',
  {
    title: 'Attach evidence',
    description: 'Attach evidence: screenshot path, commit hash, test log URL, or Playwright trace.',
    inputSchema: {
      id: z.string(),
      kind: z.enum(['screenshot', 'commit', 'test_log', 'trace', 'other']),
      url: z.string().min(1),
      note: z.string().optional(),
    },
  },
  async ({ id, kind, url, note }) => {
    const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } })
    if (!ticket) return ok({ error: 'Ticket not found' })
    const evidence = await prisma.ticketEvidence.create({ data: { ticketId: id, kind, url, note: note ?? null } })
    return ok({ ok: true, evidence })
  },
)

server.registerTool(
  'ticket_ready_for_qc',
  {
    title: 'Mark ready for QC',
    description: 'Move ticket to READY_FOR_QC with a summary comment',
    inputSchema: {
      id: z.string(),
      summary: z.string().min(1),
      commitHash: z.string().optional(),
      testLog: z.string().optional(),
    },
  },
  async ({ id, summary, commitHash, testLog }) => {
    const ticket = await prisma.ticket.findUnique({ where: { id } })
    if (!ticket) return ok({ error: 'Ticket not found' })
    if (!['IN_PROGRESS', 'REOPENED'].includes(ticket.status)) {
      return ok({ error: `Can only mark READY_FOR_QC from IN_PROGRESS or REOPENED (current: ${ticket.status})` })
    }
    const claude = await getOrCreateClaudeUser()
    const [updated, comment] = await prisma.$transaction([
      prisma.ticket.update({ where: { id }, data: { status: 'READY_FOR_QC' } }),
      prisma.ticketComment.create({ data: { ticketId: id, authorId: claude.id, authorTag: 'CLAUDE', body: summary } }),
    ])
    const evidence = []
    if (commitHash) evidence.push(await prisma.ticketEvidence.create({ data: { ticketId: id, kind: 'commit', url: commitHash, note: 'Fix commit' } }))
    if (testLog) evidence.push(await prisma.ticketEvidence.create({ data: { ticketId: id, kind: 'test_log', url: testLog, note: 'Playwright verification' } }))
    return ok({ ok: true, ticket: updated, comment, evidence })
  },
)

server.registerTool(
  'ticket_close',
  {
    title: 'Close ticket (QC)',
    description: 'Close a ticket. Typically used from READY_FOR_QC after verification.',
    inputSchema: { id: z.string(), comment: z.string().optional() },
  },
  async ({ id, comment }) => {
    const ticket = await prisma.ticket.findUnique({ where: { id } })
    if (!ticket) return ok({ error: 'Ticket not found' })
    if (ticket.status === 'CLOSED') return ok({ error: 'Ticket already closed' })
    const claude = await getOrCreateClaudeUser()
    const updated = await prisma.ticket.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } })
    if (comment) await prisma.ticketComment.create({ data: { ticketId: id, authorId: claude.id, authorTag: 'CLAUDE', body: comment } })
    return ok({ ok: true, ticket: updated })
  },
)

server.registerTool(
  'ticket_reopen',
  {
    title: 'Reopen ticket',
    description: 'Reopen a CLOSED or READY_FOR_QC ticket',
    inputSchema: { id: z.string(), reason: z.string().min(1) },
  },
  async ({ id, reason }) => {
    const ticket = await prisma.ticket.findUnique({ where: { id } })
    if (!ticket) return ok({ error: 'Ticket not found' })
    if (!['READY_FOR_QC', 'CLOSED'].includes(ticket.status)) return ok({ error: `Cannot reopen from status ${ticket.status}` })
    const claude = await getOrCreateClaudeUser()
    const [updated] = await prisma.$transaction([
      prisma.ticket.update({ where: { id }, data: { status: 'REOPENED', closedAt: null } }),
      prisma.ticketComment.create({ data: { ticketId: id, authorId: claude.id, authorTag: 'CLAUDE', body: `Reopened: ${reason}` } }),
    ])
    return ok({ ok: true, ticket: updated })
  },
)

server.registerTool(
  'ticket_update',
  {
    title: 'Update ticket',
    description: 'Update title, description, priority, route, or assignee.',
    inputSchema: {
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
      route: z.string().optional(),
      assigneeEmail: z.string().email().nullable().optional(),
    },
  },
  async ({ id, title, description, priority, route, assigneeEmail }) => {
    const ticket = await prisma.ticket.findUnique({ where: { id } })
    if (!ticket) return ok({ error: 'Ticket not found' })
    const data: Record<string, unknown> = {}
    if (title !== undefined) data.title = title
    if (description !== undefined) data.description = description
    if (priority !== undefined) data.priority = priority
    if (route !== undefined) data.route = route
    if (assigneeEmail !== undefined) {
      if (assigneeEmail === null) {
        data.assigneeId = null
      } else {
        const assignee = await prisma.user.findUnique({ where: { email: assigneeEmail } })
        if (!assignee) return ok({ error: `Assignee not found: ${assigneeEmail}` })
        data.assigneeId = assignee.id
      }
    }
    if (Object.keys(data).length === 0) return ok({ error: 'No fields to update' })
    const updated = await prisma.ticket.update({ where: { id }, data })
    return ok({ ok: true, ticket: updated })
  },
)

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
