/**
 * debug-stg: MCP server yang connect ke runtime staging via HTTP API.
 * Digunakan AI agent di local untuk inspect state stg secara langsung
 * dan compare dengan local untuk debug lebih akurat.
 *
 * Auth: MCP_SECRET dikirim sebagai Bearer token ke /mcp endpoint stg.
 * BASE_URL: URL staging, e.g. https://envman.wibudev.com
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BASE_URL = (process.env.BASE_URL ?? '').replace(/\/$/, '')
const MCP_SECRET = process.env.MCP_SECRET ?? ''

if (!BASE_URL) {
  process.stderr.write('ERROR: BASE_URL is required\n')
  process.exit(1)
}
if (!MCP_SECRET) {
  process.stderr.write('ERROR: MCP_SECRET is required\n')
  process.exit(1)
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function stgCall(toolName: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MCP_SECRET}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`STG HTTP ${res.status}: ${body}`)
  }

  const json = await res.json() as {
    result?: { content?: Array<{ type: string; text: string }> }
    error?: { message: string }
  }

  if (json.error) throw new Error(`STG MCP error: ${json.error.message}`)

  const text = json.result?.content?.find((c) => c.type === 'text')?.text ?? '{}'
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function err(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  }
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'debug-stg',
  version: '1.0.0',
})

// ── Health ────────────────────────────────────────────────────────────────────

server.registerTool(
  'stg_health',
  {
    title: '[STG] Health check',
    description: 'Ping stg runtime: DB + Redis status, uptime, environment',
    inputSchema: {},
  },
  async () => {
    try {
      const data = await stgCall('health_full')
      return ok({ source: 'stg', baseUrl: BASE_URL, ...data })
    } catch (e) {
      return err(String(e))
    }
  },
)

// ── App Logs ──────────────────────────────────────────────────────────────────

server.registerTool(
  'stg_logs_app',
  {
    title: '[STG] App logs',
    description: 'Tail the Redis-backed app log buffer di stg (last 500 entries)',
    inputSchema: {
      level: z.enum(['info', 'warn', 'error']).optional(),
      limit: z.number().int().min(1).max(500).default(100),
      afterId: z.number().int().optional(),
      search: z.string().optional().describe('Substring match on message'),
    },
  },
  async (args) => {
    try {
      return ok(await stgCall('logs_app', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_logs_audit',
  {
    title: '[STG] Audit logs',
    description: 'Persistent audit trail dari DB stg',
    inputSchema: {
      userId: z.string().optional(),
      action: z.string().optional().describe('Exact action match, e.g. LOGIN, LOGOUT, ROLE_CHANGED'),
      sinceISO: z.string().optional().describe('ISO timestamp lower bound'),
      limit: z.number().int().min(1).max(1000).default(100),
    },
  },
  async (args) => {
    try {
      return ok(await stgCall('logs_audit', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

// ── Database ──────────────────────────────────────────────────────────────────

server.registerTool(
  'stg_db_count_by_table',
  {
    title: '[STG] Table row counts',
    description: 'Row counts for each primary table di stg',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await stgCall('db_count_by_table'))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_db_list_users',
  {
    title: '[STG] List users',
    description: 'List users di stg dengan filter role/blocked/search',
    inputSchema: {
      role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
      blocked: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).default(50),
      search: z.string().optional().describe('Substring match on name or email'),
    },
  },
  async (args) => {
    try {
      return ok(await stgCall('db_list_users', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_db_get_user',
  {
    title: '[STG] Get user',
    description: 'Fetch a single user by id or email di stg, including active session count',
    inputSchema: {
      id: z.string().optional(),
      email: z.string().email().optional(),
    },
  },
  async (args) => {
    try {
      return ok(await stgCall('db_get_user', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_db_list_sessions',
  {
    title: '[STG] List sessions',
    description: 'List sessions di stg dengan filter',
    inputSchema: {
      userId: z.string().optional(),
      active: z.boolean().optional().describe('true = not expired, false = expired'),
      limit: z.number().int().min(1).max(500).default(50),
    },
  },
  async (args) => {
    try {
      return ok(await stgCall('db_list_sessions', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_db_list_audit_logs',
  {
    title: '[STG] Audit logs (DB)',
    description: 'Recent audit log entries di stg, filterable by user or action',
    inputSchema: {
      userId: z.string().optional(),
      action: z.string().optional().describe('Exact action match, e.g. LOGIN, LOGOUT, ROLE_CHANGED'),
      sinceISO: z.string().optional().describe('ISO timestamp lower bound'),
      limit: z.number().int().min(1).max(1000).default(100),
    },
  },
  async (args) => {
    try {
      return ok(await stgCall('db_list_audit_logs', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

// ── Presence ──────────────────────────────────────────────────────────────────

server.registerTool(
  'stg_presence_online',
  {
    title: '[STG] Online users',
    description: 'List currently connected users di stg (via WebSocket presence tracker)',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await stgCall('presence_online'))
    } catch (e) {
      return err(String(e))
    }
  },
)

// ── Redis ─────────────────────────────────────────────────────────────────────

server.registerTool(
  'stg_redis_info',
  {
    title: '[STG] Redis info',
    description: 'Connection status dan ping round-trip ke Redis stg',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await stgCall('redis_info'))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_redis_keys',
  {
    title: '[STG] Redis keys',
    description: 'List keys matching pattern di Redis stg (use sparingly — O(N))',
    inputSchema: {
      pattern: z.string().default('*'),
      limit: z.number().int().min(1).max(1000).default(200),
    },
  },
  async (args) => {
    try {
      return ok(await stgCall('redis_keys', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_redis_get',
  {
    title: '[STG] Redis GET',
    description: 'Get a string value by key dari Redis stg',
    inputSchema: { key: z.string() },
  },
  async (args) => {
    try {
      return ok(await stgCall('redis_get', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

// ── Project / Schema ──────────────────────────────────────────────────────────

server.registerTool(
  'stg_env_map',
  {
    title: '[STG] Env map',
    description: 'Environment variables yang digunakan di stg: set/unset status, required/optional',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await stgCall('project_env_map'))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_routes',
  {
    title: '[STG] Routes',
    description: 'All HTTP + WS + frontend routes di stg dengan auth level dan category',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await stgCall('project_routes'))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_migrations',
  {
    title: '[STG] Migrations',
    description: 'Timeline Prisma migrations di stg dengan SQL snippet',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await stgCall('project_migrations'))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_schema',
  {
    title: '[STG] DB Schema',
    description: 'Parsed Prisma schema di stg: models, enums, relations',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await stgCall('project_schema'))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_dependencies',
  {
    title: '[STG] Dependencies',
    description: 'Runtime dan dev dependencies dari package.json di stg',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await stgCall('project_dependencies'))
    } catch (e) {
      return err(String(e))
    }
  },
)

// ── Tickets ───────────────────────────────────────────────────────────────────

server.registerTool(
  'stg_ticket_list',
  {
    title: '[STG] List tickets',
    description: 'List tickets di stg. Default: OPEN + IN_PROGRESS + REOPENED',
    inputSchema: {
      status: z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED', 'ACTIVE', 'ALL']).default('ACTIVE'),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
  },
  async (args) => {
    try {
      return ok(await stgCall('ticket_list', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_ticket_get',
  {
    title: '[STG] Get ticket',
    description: 'Fetch full ticket dengan comments dan evidence di stg',
    inputSchema: { id: z.string() },
  },
  async (args) => {
    try {
      return ok(await stgCall('ticket_get', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

// ── Compare helper ────────────────────────────────────────────────────────────

server.registerTool(
  'stg_compare_health',
  {
    title: '[STG] Compare health local vs stg',
    description: 'Panggil health_full ke stg DAN local app-mcp sekaligus untuk compare. Berguna untuk debug perbedaan state.',
    inputSchema: {},
  },
  async () => {
    try {
      const stgHealth = await stgCall('health_full').catch((e: unknown) => ({ error: String(e) }))
      // Local health via direct HTTP (local dev server biasanya di port 3000)
      const localRes = await fetch('http://localhost:3000/health').catch(() => null)
      const localHealth = localRes?.ok ? await localRes.json().catch(() => null) : null
      return ok({
        stg: { baseUrl: BASE_URL, ...stgHealth },
        local: localHealth ?? { note: 'local /health tidak reachable (server mungkin tidak jalan)' },
      })
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_compare_env_map',
  {
    title: '[STG] Compare env vars local vs stg',
    description: 'Bandingkan env vars yang di-set/unset antara local dan stg untuk deteksi missing config.',
    inputSchema: {},
  },
  async () => {
    try {
      const stgEnv = await stgCall('project_env_map').catch((e: unknown) => ({ error: String(e) }))
      return ok({
        note: 'stg env map dari runtime stg. Bandingkan dengan output `project_env_map` dari app-mcp local.',
        stg: stgEnv,
      })
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_compare_migrations',
  {
    title: '[STG] Compare migrations local vs stg',
    description: 'List migrations di stg untuk detect drift dengan local schema.',
    inputSchema: {},
  },
  async () => {
    try {
      const stgMigrations = await stgCall('project_migrations').catch((e: unknown) => ({ error: String(e) }))
      return ok({
        note: 'Migration list di stg. Bandingkan dengan `project_migrations` dari app-mcp local untuk detect schema drift.',
        stg: stgMigrations,
      })
    } catch (e) {
      return err(String(e))
    }
  },
)

// ── Aliases ───────────────────────────────────────────────────────────────────

server.registerTool(
  'stg_alias_list',
  {
    title: '[STG] List project aliases',
    description: 'List all aliases for a project by slug di stg',
    inputSchema: { slug: z.string().describe('Project slug') },
  },
  async (args) => {
    try {
      return ok(await stgCall('alias_list', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_alias_get',
  {
    title: '[STG] Get project alias',
    description: 'Fetch a single alias by project slug and alias name di stg',
    inputSchema: { slug: z.string(), name: z.string() },
  },
  async (args) => {
    try {
      return ok(await stgCall('alias_get', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
