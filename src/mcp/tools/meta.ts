// Meta tools: whoami, server_info.
// These confirm connectivity + identity. First thing Claude calls on a new session.

import { z } from 'zod'
import { apiCall } from '../api-client'
import { fetchWhoami } from '../auth'
import { jsonResponse, type ToolModule, type ToolResponse } from '../shared'
import { toErrorResponse } from '../errors'

const WhoamiInputSchema = z.object({}).strict()

const WhoamiOutputSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.string(),
  }),
  tokenName: z.string().optional(),
  canWrite: z.boolean(),
  scopes: z.array(z.string()),
})

const ServerInfoInputSchema = z.object({}).strict()

const ServerInfoOutputSchema = z.object({
  envmanServer: z.string(),
  mcpVersion: z.string(),
  mode: z.enum(['readonly', 'write']),
  daemonRunning: z.boolean(),
  daemonVersion: z.string().nullable(),
})

const WHOAMI_DESCRIPTION = `Get the currently authenticated envman user, their role, token capabilities, and scope restrictions.

ARGS: (none)

RETURNS:
  - user.id, user.name, user.email, user.role — basic identity
  - tokenName — friendly name of the API token in use (if applicable)
  - canWrite — boolean; if false, all write tools will be rejected by the server with 403
  - scopes — array of "slug" or "slug:env" strings; empty = unrestricted

EXAMPLES:
  - Just verify connection: whoami() → { user: {...}, canWrite: true, scopes: [] }
  - Check token capability before writing: whoami() then inspect canWrite

ERRORS:
  - 401: Token is invalid or expired — user must re-login on the host
  - Network: envman server unreachable

NOTES:
  - Result is cached for 60 seconds. Cache invalidates on 401.
  - First call after MCP server start verifies end-to-end connectivity.`

const SERVER_INFO_DESCRIPTION = `Return MCP server self-description: envman server URL it talks to, MCP server version, current mode (readonly|write), and whether the local pm daemon is running.

ARGS: (none)

RETURNS:
  - envmanServer — base URL of the envman API server
  - mcpVersion — version of the envman binary running the MCP server
  - mode — "readonly" or "write" (controlled by --write flag at server start)
  - daemonRunning — true if pm daemon was reachable at probe time
  - daemonVersion — daemon version (or null if not running)

EXAMPLES:
  - Before calling pm_* tools, check daemonRunning to give user a helpful message

NOTES:
  - This is metadata about the MCP server itself, not the user.
  - For user identity use whoami.`

const MCP_VERSION = '0.1.0'

export const metaModule: ToolModule = {
  register(server, ctx) {
    server.registerTool(
      'whoami',
      {
        title: 'Get current authenticated envman user',
        description: WHOAMI_DESCRIPTION,
        inputSchema: WhoamiInputSchema.shape,
        outputSchema: WhoamiOutputSchema.shape,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (): Promise<ToolResponse> => {
        try {
          const result = await fetchWhoami(ctx.cfg)
          return jsonResponse({
            user: result.user,
            tokenName: result.tokenName,
            canWrite: result.canWrite,
            scopes: result.scopes,
          })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'server_info',
      {
        title: 'Get MCP server info',
        description: SERVER_INFO_DESCRIPTION,
        inputSchema: ServerInfoInputSchema.shape,
        outputSchema: ServerInfoOutputSchema.shape,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (): Promise<ToolResponse> => {
        let daemonVersion: string | null = null
        if (ctx.hasDaemon) {
          try {
            const { DaemonClient } = await import('../../pm/cli/client')
            const client = new DaemonClient({ timeoutMs: 2000 })
            const health = await client.get<{ version: string }>('/v1/daemon/health')
            daemonVersion = health.version
          } catch {
            // daemon may have stopped after probe — that's fine, treat as not running
          }
        }
        return jsonResponse({
          envmanServer: ctx.cfg.server,
          mcpVersion: MCP_VERSION,
          mode: ctx.writeEnabled ? 'write' : 'readonly',
          daemonRunning: daemonVersion !== null,
          daemonVersion,
        })
      },
    )

    // Mark as used for parameter
    void apiCall
  },
}
