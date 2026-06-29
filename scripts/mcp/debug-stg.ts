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
import { registerStgDbTools } from './tools/debug-stg-db.js'
import { registerStgCompareTools } from './tools/debug-stg-compare.js'

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
      'Accept': 'application/json, text/event-stream',
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

registerStgDbTools(server, stgCall, ok, err)

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

registerStgCompareTools(server, stgCall, ok, err, BASE_URL)

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

// ── Env Imports ───────────────────────────────────────────────────────────────

server.registerTool(
  'stg_envimport_list',
  {
    title: '[STG] List env import links',
    description: 'List live-link imports for a target environment di stg (source envs whose vars it borrows)',
    inputSchema: { slug: z.string().describe('Target project slug'), envName: z.string().describe('Target environment name') },
  },
  async (args) => {
    try {
      return ok(await stgCall('envimport_list', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_envimport_get',
  {
    title: '[STG] Get one env import link',
    description: 'Fetch a single env import link by id di stg, including source env keys (values masked)',
    inputSchema: { id: z.string().describe('EnvImport id') },
  },
  async (args) => {
    try {
      return ok(await stgCall('envimport_get', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

// ── Project Files ─────────────────────────────────────────────────────────────

server.registerTool(
  'stg_project_file_list',
  {
    title: '[STG] List project files',
    description: 'List all files for a project by slug di stg',
    inputSchema: { slug: z.string().describe('Project slug') },
  },
  async (args) => {
    try {
      return ok(await stgCall('project_file_list', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

server.registerTool(
  'stg_project_file_get',
  {
    title: '[STG] Get project file',
    description: 'Fetch a single project file by id di stg',
    inputSchema: { slug: z.string(), id: z.string() },
  },
  async (args) => {
    try {
      return ok(await stgCall('project_file_get', args))
    } catch (e) {
      return err(String(e))
    }
  },
)

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
