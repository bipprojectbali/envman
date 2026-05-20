import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { adminTools } from './tools/admin'
import { codeTools } from './tools/code'
import { dbTools } from './tools/db'
import { devTools } from './tools/dev'
import { healthTools } from './tools/health'
import { logsAdmin, logsReadonly } from './tools/logs'
import { presenceTools } from './tools/presence'
import { projectTools } from './tools/project'
import { redisTools } from './tools/redis'
import { ticketTools } from './tools/tickets'
import { aliasReadonlyTools, aliasAdminTools } from './tools/aliases'
import { fileReadonlyTools, fileAdminTools } from './tools/files'
import type { McpScope, ToolModule } from './tools/shared'

export type { McpScope }

const READONLY_MODULES: ToolModule[] = [
  dbTools,
  logsReadonly,
  presenceTools,
  healthTools,
  projectTools,
  codeTools,
  aliasReadonlyTools,
  fileReadonlyTools,
]

const ADMIN_MODULES: ToolModule[] = [
  ...READONLY_MODULES,
  logsAdmin,
  adminTools,
  devTools,
  redisTools,
  ticketTools,
  aliasAdminTools,
  fileAdminTools,
]

export function createMcpServer(scope: McpScope = 'admin'): McpServer {
  const server = new McpServer({
    name: 'app-mcp',
    version: '0.2.0',
  })

  const modules = scope === 'admin' ? ADMIN_MODULES : READONLY_MODULES
  for (const mod of modules) {
    mod.register(server)
  }

  return server
}

if (import.meta.main) {
  const scope: McpScope = process.env.MCP_SCOPE === 'readonly' ? 'readonly' : 'admin'
  const server = createMcpServer(scope)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
