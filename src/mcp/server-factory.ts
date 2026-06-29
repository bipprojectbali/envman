// Build McpServer + register modules based on mode (readonly vs write).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { log } from './logger'
import type { ToolContext, ToolModule } from './shared'
import { aliasesReadModule } from './tools/aliases'
import { aliasesWriteModule } from './tools/aliases-write'
import { filesReadModule } from './tools/files'
import { filesWriteModule } from './tools/files-write'
import { metaModule } from './tools/meta'
import { pmReadonlyModule } from './tools/pm-readonly'
import { pmWriteModule } from './tools/pm-write'
import { projectsModule } from './tools/projects'
import { varsReadModule } from './tools/vars'
import { varsWriteModule } from './tools/vars-write'

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

  const modules: ToolModule[] = [
    metaModule,
    projectsModule,
    varsReadModule,
    aliasesReadModule,
    filesReadModule,
    pmReadonlyModule,
  ]
  if (ctx.writeEnabled) {
    modules.push(varsWriteModule, aliasesWriteModule, filesWriteModule, pmWriteModule)
  }

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
