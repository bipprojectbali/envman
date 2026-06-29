import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Elysia } from 'elysia'
import { createMcpServer, type McpScope } from '../../scripts/mcp/server'
import { appLog } from '../lib/applog'
import { env } from '../lib/env'
import { addConnection, broadcastToAdmins, removeConnection } from '../lib/presence'
import { requireAuth } from '../lib/auth-middleware'
import { getIp } from '../lib/request'
import pkg from '../../package.json'

// Bridge between beforeHandle and open() on WS presence — one Request lives only
// during handshake so WeakMap is safe and auto-GC'd.
const presenceAuth = new WeakMap<Request, { userId: string; role: string }>()

// Infrastructure routes: WebSocket presence, MCP over HTTP, version endpoint
export const infraRouter = new Elysia()

  // WS /ws/presence — real-time presence with role-based admin broadcast
  .ws('/ws/presence', {
    async beforeHandle({ request, set }) {
      const caller = await requireAuth(request)
      if (!caller) {
        set.status = 401
        return 'Unauthorized'
      }
      presenceAuth.set(request, caller)
    },
    open(ws) {
      const req = (ws.data as { request: Request }).request
      const caller = presenceAuth.get(req)
      presenceAuth.delete(req)
      if (!caller) {
        ws.close()
        return
      }
      const isAdmin = caller.role === 'ADMIN' || caller.role === 'SUPER_ADMIN'
      ;(ws.data as { userId?: string }).userId = caller.userId
      addConnection(ws, caller.userId, isAdmin)
    },
    close(ws) {
      const userId = (ws.data as { userId?: string }).userId
      if (userId) removeConnection(ws, userId)
    },
  })

  // POST /mcp — MCP over HTTP, auth via Bearer or x-mcp-secret header
  .all('/mcp', async ({ request }) => {
    if (!env.MCP_SECRET && !env.MCP_SECRET_ADMIN) {
      return new Response(JSON.stringify({ error: 'MCP not configured: set MCP_SECRET and/or MCP_SECRET_ADMIN' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const header = request.headers.get('authorization') ?? ''
    const bearer = header.replace(/^Bearer\s+/i, '').trim()
    const provided = bearer || request.headers.get('x-mcp-secret') || ''
    let scope: McpScope | null = null
    if (env.MCP_SECRET_ADMIN && provided === env.MCP_SECRET_ADMIN) scope = 'admin'
    else if (env.MCP_SECRET && provided === env.MCP_SECRET) scope = 'readonly'
    if (!scope) {
      appLog('warn', `MCP unauthorized from ${getIp(request)}`)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
      })
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    const mcp = createMcpServer(scope)
    await mcp.connect(transport)
    const response = await transport.handleRequest(request)
    response.headers.set('x-mcp-server', 'app-mcp')
    response.headers.set('x-mcp-scope', scope)
    return response
  })

  .get('/api/version', () => ({ name: pkg.name, version: pkg.version }))
