// Audit emission for write tools. Fire-and-forget — never blocks tool response.
// Bug Sec3 mitigation: track AI agent actions in envman audit dashboard.

import type { Config } from './api-client'
import { AUDIT_TIMEOUT_MS } from './constants'
import { log } from './logger'

export type McpAuditAction =
  | 'MCP_SESSION_STARTED'
  | 'MCP_VAR_SET'
  | 'MCP_VAR_DELETED'
  | 'MCP_VARS_REVEALED'
  | 'MCP_ALIAS_CREATED'
  | 'MCP_ALIAS_UPDATED'
  | 'MCP_ALIAS_DELETED'
  | 'MCP_FILE_CREATED'
  | 'MCP_PM_START'
  | 'MCP_PM_STOP'
  | 'MCP_PM_RESTART'
  | 'MCP_PM_DELETE'
  | 'MCP_PM_SYNC'
  | 'MCP_PM_RESET'
  | 'MCP_PM_DAEMON_START'
  | 'MCP_PM_DAEMON_STOP'

export interface AuditDetail {
  detail?: string
  slug?: string
  env?: string
  processName?: string
}

export function emitAudit(cfg: Config, action: McpAuditAction, detail: AuditDetail = {}): void {
  // No await — fire and forget. Errors never propagate to tool response.
  void (async () => {
    try {
      const res = await fetch(`${cfg.server.replace(/\/$/, '')}/api/envman/mcp/audit`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cfg.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action, ...detail }),
        signal: AbortSignal.timeout(AUDIT_TIMEOUT_MS),
      })
      if (!res.ok) {
        log.warn('audit POST failed', { action, status: res.status })
      }
    } catch (e: unknown) {
      log.warn('audit POST error', { action, error: e instanceof Error ? e.message : String(e) })
    }
  })()
}
