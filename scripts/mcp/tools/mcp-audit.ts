// MCP tools untuk audit log MCP_* events (dari Claude pakai envman mcp di local).
//
// Readonly:
//   - mcp_recent_audit: latest N audit events dari Claude session

import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { jsonText, type ToolModule } from './shared'

const MCP_ACTION_PREFIX = 'MCP_'

export const mcpAuditTools: ToolModule = {
  name: 'mcp-audit',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'mcp_recent_audit',
      {
        title: 'List recent MCP_* audit events',
        description:
          'Returns most recent audit events from `envman mcp` sessions. Action prefix MCP_* — MCP_SESSION_STARTED, MCP_VAR_SET, MCP_PM_START, MCP_VARS_REVEALED, etc.\n\nArgs: limit (default 50, max 200).\nReturns: { events: [{ id, action, userId, detail, ip, createdAt }] }.',
        inputSchema: {
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async (args) => {
        const events = await prisma.auditLog.findMany({
          where: { action: { startsWith: MCP_ACTION_PREFIX } },
          orderBy: { createdAt: 'desc' },
          take: args.limit ?? 50,
          select: {
            id: true,
            action: true,
            userId: true,
            detail: true,
            ip: true,
            createdAt: true,
          },
        })
        return jsonText({ events, count: events.length })
      },
    )
  },
}
