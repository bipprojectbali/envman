// Build McpServer + register modules based on mode (readonly vs write).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext, ToolModule } from './shared'
import { metaModule } from './tools/meta'
import { log } from './logger'

export interface ServerOpts {
  /** Server name as advertised to client. */
  name: string
  version: string
}

/**
 * Build server + register modules. Caller passes ToolContext which captures
 * config, write-mode, and daemon availability — modules consult these.
 */
export function buildServer(opts: ServerOpts, ctx: ToolContext): McpServer {
  const server = new McpServer({ name: opts.name, version: opts.version })

  const modules: ToolModule[] = [metaModule]
  // Phase 1+ will append more modules conditionally based on ctx

  for (const mod of modules) {
    mod.register(server, ctx)
  }

  log.info('mcp server built', {
    name: opts.name,
    version: opts.version,
    writeEnabled: ctx.writeEnabled,
    hasDaemon: ctx.hasDaemon,
    moduleCount: modules.length,
  })

  return server
}
