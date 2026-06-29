import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

type OkFn = (data: unknown) => { content: Array<{ type: 'text'; text: string }> }
type ErrFn = (message: string) => { isError: boolean; content: Array<{ type: 'text'; text: string }> }
type StgCallFn = (toolName: string, args?: Record<string, unknown>) => Promise<unknown>

/** Register all STG database inspection tools onto the given MCP server. */
export function registerStgDbTools(server: McpServer, stgCall: StgCallFn, ok: OkFn, err: ErrFn): void {
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
}
