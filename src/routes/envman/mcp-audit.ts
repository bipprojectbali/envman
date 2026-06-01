// MCP audit endpoint — receive write-tool events dari `envman mcp` server.
// Allow user track AI agent (Claude Code, etc.) actions di dashboard envman.

import { Elysia } from 'elysia'
import { audit } from '../../lib/audit'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'

const MCP_AUDIT_ACTIONS = new Set([
  'MCP_SESSION_STARTED',
  'MCP_VAR_SET',
  'MCP_VAR_DELETED',
  'MCP_VARS_REVEALED',
  'MCP_ALIAS_CREATED',
  'MCP_ALIAS_UPDATED',
  'MCP_ALIAS_DELETED',
  'MCP_FILE_CREATED',
  'MCP_PM_START',
  'MCP_PM_STOP',
  'MCP_PM_RESTART',
  'MCP_PM_DELETE',
  'MCP_PM_SYNC',
  'MCP_PM_RESET',
  'MCP_PM_DAEMON_START',
  'MCP_PM_DAEMON_STOP',
])

interface McpAuditBody {
  action: string
  detail?: string
  slug?: string
  env?: string
  processName?: string
}

export const mcpAuditRouter = new Elysia().post('/api/envman/mcp/audit', async ({ request, set, body }) => {
  const caller = await requireEnvAuth(request)
  if (!caller) return unauthorized(set)

  const b = body as McpAuditBody
  if (!b || typeof b.action !== 'string') {
    set.status = 400
    return { error: 'action required' }
  }
  if (!MCP_AUDIT_ACTIONS.has(b.action)) {
    set.status = 400
    return { error: `unknown MCP action: ${b.action}` }
  }

  const detail = JSON.stringify({
    slug: b.slug,
    env: b.env,
    processName: b.processName,
    message: b.detail,
  })
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'

  audit(caller.userId, b.action, detail, ip)
  return { ok: true }
})
