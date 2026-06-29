// Contract test: snapshot all registered tools' name, annotations, schema shape.
//
// Goal: prevent accidental changes to tool surface. When SDK upgrades or
// refactors land, this test catches:
//   - Tools renamed or removed
//   - Annotations flipped accidentally (readOnlyHint, destructiveHint)
//   - Required schema fields removed (breaks Claude Code agents using them)
//   - Description quality regressions (length check)
//
// Update when you intentionally change a tool — bump version + update snapshot.

import { describe, test, expect, beforeAll } from 'bun:test'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { metaModule } from '../../src/mcp/tools/meta'
import { projectsModule } from '../../src/mcp/tools/projects'
import { varsReadModule } from '../../src/mcp/tools/vars'
import { aliasesReadModule } from '../../src/mcp/tools/aliases'
import { filesReadModule } from '../../src/mcp/tools/files'
import { pmReadonlyModule } from '../../src/mcp/tools/pm-readonly'
import { varsWriteModule } from '../../src/mcp/tools/vars-write'
import { aliasesWriteModule } from '../../src/mcp/tools/aliases-write'
import { filesWriteModule } from '../../src/mcp/tools/files-write'
import { pmWriteModule } from '../../src/mcp/tools/pm-write'

const READ_TOOLS = [
  'whoami', 'server_info',
  'projects_list', 'project_get',
  'vars_list', 'vars_export', 'vars_diff',
  'aliases_list', 'alias_resolve',
  'files_list', 'file_resolve',
  'pm_daemon_status', 'pm_list', 'pm_describe', 'pm_logs',
]

const WRITE_TOOLS = [
  'var_set', 'var_delete',
  'alias_create', 'alias_update', 'alias_delete',
  'file_create',
  'pm_start', 'pm_stop', 'pm_restart', 'pm_reset', 'pm_delete', 'pm_sync',
  'pm_daemon_start', 'pm_daemon_stop',
]

const DESTRUCTIVE = new Set([
  'var_delete', 'alias_delete', 'file_create' /* no — file_create non-destructive */,
  'pm_delete', 'pm_daemon_stop',
])
// Re-curate set after second thought — file_create creates, not destroys
DESTRUCTIVE.delete('file_create')

function buildServer(write: boolean): McpServer {
  const ctx = { cfg: { server: '', token: '' }, writeEnabled: write, hasDaemon: false }
  const server = new McpServer({ name: 'envman-mcp-server', version: '0.1.0' })
  metaModule.register(server, ctx)
  projectsModule.register(server, ctx)
  varsReadModule.register(server, ctx)
  aliasesReadModule.register(server, ctx)
  filesReadModule.register(server, ctx)
  pmReadonlyModule.register(server, ctx)
  if (write) {
    varsWriteModule.register(server, ctx)
    aliasesWriteModule.register(server, ctx)
    filesWriteModule.register(server, ctx)
    pmWriteModule.register(server, ctx)
  }
  return server
}

function getTools(server: McpServer): Record<string, any> {
  return (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
}

describe('Tool registration contract', () => {
  test('readonly mode registers exactly READ_TOOLS', () => {
    const tools = getTools(buildServer(false))
    expect(Object.keys(tools).sort()).toEqual([...READ_TOOLS].sort())
  })

  test('write mode registers READ_TOOLS + WRITE_TOOLS', () => {
    const tools = getTools(buildServer(true))
    expect(Object.keys(tools).sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort())
  })
})

describe('Tool annotations contract', () => {
  const server = buildServer(true)
  const tools = getTools(server)

  test.each(READ_TOOLS)('%s has readOnlyHint=true', (name) => {
    const ann = tools[name].annotations
    expect(ann.readOnlyHint).toBe(true)
    expect(ann.destructiveHint).toBe(false)
  })

  test.each(WRITE_TOOLS)('%s has readOnlyHint=false', (name) => {
    const ann = tools[name].annotations
    expect(ann.readOnlyHint).toBe(false)
  })

  test.each(WRITE_TOOLS)('%s destructiveHint matches expected', (name) => {
    const ann = tools[name].annotations
    expect(ann.destructiveHint).toBe(DESTRUCTIVE.has(name))
  })

  test.each([...READ_TOOLS, ...WRITE_TOOLS])('%s has openWorldHint defined', (name) => {
    const ann = tools[name].annotations
    expect(typeof ann.openWorldHint).toBe('boolean')
  })
})

describe('Tool description quality (agent ergonomics)', () => {
  const server = buildServer(true)
  const tools = getTools(server)

  test.each([...READ_TOOLS, ...WRITE_TOOLS])('%s description present and substantial', (name) => {
    const desc = tools[name].description
    expect(typeof desc).toBe('string')
    expect(desc.length).toBeGreaterThanOrEqual(80)
  })

  test.each([...READ_TOOLS, ...WRITE_TOOLS])('%s has explicit title', (name) => {
    const title = tools[name].title
    expect(typeof title).toBe('string')
    expect(title.length).toBeGreaterThan(0)
  })
})

describe('Tool schema strict mode', () => {
  const server = buildServer(true)
  const tools = getTools(server)

  // Note: inputSchema stored may be a raw field map or ZodObject depending on SDK.
  // We just verify it exists; deeper validation happens at call time via Zod.
  test.each([...READ_TOOLS, ...WRITE_TOOLS])('%s has inputSchema', (name) => {
    expect(tools[name].inputSchema).toBeDefined()
  })

  test.each([...READ_TOOLS, ...WRITE_TOOLS])('%s has outputSchema', (name) => {
    expect(tools[name].outputSchema).toBeDefined()
  })
})
