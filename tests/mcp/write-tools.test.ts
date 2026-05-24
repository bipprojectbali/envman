// Integration tests for Phase 2 write tools.
// Mock HTTP server captures calls + asserts audit emission.

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { varsWriteModule } from '../../src/mcp/tools/vars-write'
import { aliasesWriteModule } from '../../src/mcp/tools/aliases-write'
import { filesWriteModule } from '../../src/mcp/tools/files-write'

interface MockState {
  url: string
  close: () => Promise<void>
  setHandler: (key: string, fn: (req: { body?: any }) => any) => void
  calls: Array<{ method: string; url: string; body: any }>
  auditCalls: Array<any>
}

function startMockServer(): Promise<MockState> {
  const handlers = new Map<string, (req: { body?: any }) => any>()
  const calls: MockState['calls'] = []
  const auditCalls: any[] = []
  // Default audit handler — capture and return 200
  handlers.set('POST /api/envman/mcp/audit', ({ body }) => {
    auditCalls.push(body)
    return { ok: true }
  })
  return new Promise((resolve) => {
    const srv = createServer((req: IncomingMessage, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(Buffer.from(c)))
      req.on('end', () => {
        const auth = req.headers.authorization
        if (!auth?.startsWith('Bearer ')) { res.statusCode = 401; res.end('{}'); return }
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
        calls.push({ method: req.method!, url: req.url!, body })
        const key = `${req.method} ${req.url}`
        const handler = handlers.get(key)
        if (!handler) { res.statusCode = 404; res.end(JSON.stringify({ error: 'no mock for ' + key })); return }
        try {
          const result = handler({ body })
          if (result && typeof result === 'object' && '__status' in result) {
            res.statusCode = result.__status as number
            const { __status, ...rest } = result; void __status
            res.end(JSON.stringify(rest))
          } else {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          }
        } catch (e: any) {
          res.statusCode = 500; res.end(JSON.stringify({ error: e.message }))
        }
      })
    })
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => srv.close(() => r())),
        setHandler: (k, fn) => handlers.set(k, fn),
        calls,
        auditCalls,
      })
    })
  })
}

interface RegisteredTool { handler: (a: any, e?: any) => Promise<any> }
function callTool(server: McpServer, name: string, args: unknown = {}): Promise<any> {
  const r = server as unknown as { _registeredTools: Record<string, RegisteredTool> }
  return r._registeredTools[name].handler(args, {} as any)
}

let mock: MockState
let server: McpServer
const ctx = { cfg: { server: '', token: 'tok' }, writeEnabled: true, hasDaemon: false }

beforeAll(async () => {
  mock = await startMockServer()
  ctx.cfg.server = mock.url
})

afterAll(async () => {
  await mock.close()
})

beforeEach(() => {
  server = new McpServer({ name: 't', version: '0' })
  varsWriteModule.register(server, ctx)
  aliasesWriteModule.register(server, ctx)
  filesWriteModule.register(server, ctx)
  mock.auditCalls.length = 0
})

async function waitForAudit(action: string, timeoutMs = 1000): Promise<any> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const found = mock.auditCalls.find((c) => c.action === action)
    if (found) return found
    await new Promise((r) => setTimeout(r, 10))
  }
  return null
}

describe('var_set', () => {
  test('upserts var + emits audit', async () => {
    mock.setHandler('POST /api/envman/projects/myapp/environments/prod/vars', ({ body }) => ({
      var: { id: 'v1', key: body.key, isSecret: body.isSecret },
    }))
    const res = await callTool(server, 'var_set', {
      slug: 'myapp', env: 'prod', key: 'PORT', value: '3000', isSecret: false,
    })
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.ok).toBe(true)
    expect(res.structuredContent.key).toBe('PORT')

    const audit = await waitForAudit('MCP_VAR_SET')
    expect(audit).toBeTruthy()
    expect(audit.slug).toBe('myapp')
    expect(audit.env).toBe('prod')
  })

  test('invalid key (lowercase) → zod error', async () => {
    const res = await callTool(server, 'var_set', { slug: 'myapp', env: 'prod', key: 'lowercase', value: 'x' })
    expect(res.isError).toBe(true)
  })

  test('403 from server → user-facing error', async () => {
    mock.setHandler('POST /api/envman/projects/myapp/environments/prod/vars', () => ({
      __status: 403, error: 'Token is read-only',
    }))
    const res = await callTool(server, 'var_set', {
      slug: 'myapp', env: 'prod', key: 'PORT', value: '3000',
    })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('Permission denied')
  })
})

describe('var_delete', () => {
  test('deletes + audit', async () => {
    mock.setHandler('DELETE /api/envman/projects/myapp/environments/prod/vars/OLD', () => ({ ok: true }))
    const res = await callTool(server, 'var_delete', { slug: 'myapp', env: 'prod', key: 'OLD' })
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.key).toBe('OLD')
    const audit = await waitForAudit('MCP_VAR_DELETED')
    expect(audit).toBeTruthy()
  })

  test('404 → helpful error', async () => {
    mock.setHandler('DELETE /api/envman/projects/myapp/environments/prod/vars/MISSING', () => ({
      __status: 404, error: 'not found',
    }))
    const res = await callTool(server, 'var_delete', { slug: 'myapp', env: 'prod', key: 'MISSING' })
    expect(res.isError).toBe(true)
  })
})

describe('alias_create', () => {
  test('creates alias + audit', async () => {
    mock.setHandler('POST /api/envman/projects/myapp/aliases', ({ body }) => ({
      alias: { id: 'a1', name: body.name, args: body.args, description: null, tags: [] },
    }))
    const res = await callTool(server, 'alias_create', {
      slug: 'myapp', name: 'deploy', args: '-e myapp:prod -- bash deploy.sh',
    })
    expect(res.isError).toBeFalsy()
    expect((res.structuredContent.alias as any).name).toBe('deploy')
    const audit = await waitForAudit('MCP_ALIAS_CREATED')
    expect(audit).toBeTruthy()
  })

  test('409 conflict → error', async () => {
    mock.setHandler('POST /api/envman/projects/myapp/aliases', () => ({
      __status: 409, error: 'duplicate',
    }))
    const res = await callTool(server, 'alias_create', {
      slug: 'myapp', name: 'deploy', args: '-- echo',
    })
    expect(res.isError).toBe(true)
  })
})

describe('alias_update', () => {
  test('partial update', async () => {
    mock.setHandler('PATCH /api/envman/projects/myapp/aliases/deploy', ({ body }) => ({
      alias: { id: 'a1', name: 'deploy', args: body.args ?? 'old', description: null, tags: [] },
    }))
    const res = await callTool(server, 'alias_update', {
      slug: 'myapp', name: 'deploy', args: '-- new-command',
    })
    expect(res.isError).toBeFalsy()
    expect((res.structuredContent.alias as any).args).toBe('-- new-command')
    const audit = await waitForAudit('MCP_ALIAS_UPDATED')
    expect(audit).toBeTruthy()
  })
})

describe('alias_delete', () => {
  test('deletes + audit', async () => {
    mock.setHandler('DELETE /api/envman/projects/myapp/aliases/deploy', () => ({ ok: true }))
    const res = await callTool(server, 'alias_delete', { slug: 'myapp', name: 'deploy' })
    expect(res.isError).toBeFalsy()
    const audit = await waitForAudit('MCP_ALIAS_DELETED')
    expect(audit).toBeTruthy()
  })
})

describe('file_create', () => {
  test('creates entry with single file + audit', async () => {
    mock.setHandler('POST /api/envman/projects/myapp/files', ({ body }) => ({
      file: { id: 'f1', title: body.title, prefix: body.prefix ?? null },
    }))
    const res = await callTool(server, 'file_create', {
      slug: 'myapp',
      title: 'Deploy',
      prefix: 'deploy',
      files: [{ filename: 'deploy.sh', content: '#!/bin/bash\necho hi', language: 'bash' }],
    })
    expect(res.isError).toBeFalsy()
    expect((res.structuredContent.file as any).id).toBe('f1')
    const audit = await waitForAudit('MCP_FILE_CREATED')
    expect(audit).toBeTruthy()
  })

  test('empty files array → zod error', async () => {
    const res = await callTool(server, 'file_create', {
      slug: 'myapp', title: 'Empty', files: [],
    })
    expect(res.isError).toBe(true)
  })

  test('prefix duplicate → 400 from server', async () => {
    mock.setHandler('POST /api/envman/projects/myapp/files', () => ({
      __status: 400, error: 'Prefix sudah dipakai',
    }))
    const res = await callTool(server, 'file_create', {
      slug: 'myapp', title: 'X', prefix: 'dup',
      files: [{ filename: 'a.sh', content: 'x' }],
    })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('Bad request')
  })
})
