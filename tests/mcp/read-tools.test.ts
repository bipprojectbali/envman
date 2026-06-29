// Integration tests for Phase 1 read tools.
//
// Strategy: directly invoke handlers via McpServer (no transport).
// For pure unit-style coverage of each tool's logic.

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { projectsModule } from '../../src/mcp/tools/projects'
import { varsReadModule } from '../../src/mcp/tools/vars'
import { aliasesReadModule } from '../../src/mcp/tools/aliases'
import { filesReadModule } from '../../src/mcp/tools/files'
import { metaModule } from '../../src/mcp/tools/meta'
import { invalidateWhoamiCache } from '../../src/mcp/auth'

// ── Minimal mock server ───────────────────────────────────────────────────────

interface MockState {
  url: string
  close: () => Promise<void>
  setHandler: (key: string, fn: (req: { body?: any }) => any) => void
  unsetHandler: (key: string) => void
  calls: Array<{ method: string; url: string; body: any }>
}

function startMockServer(): Promise<MockState> {
  const handlers = new Map<string, (req: { body?: any }) => any>()
  const calls: MockState['calls'] = []
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(Buffer.from(c)))
      req.on('end', () => {
        const auth = req.headers.authorization
        if (!auth?.startsWith('Bearer ')) {
          res.statusCode = 401
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
        calls.push({ method: req.method!, url: req.url!, body })
        const key = `${req.method} ${req.url}`
        const handler = handlers.get(key)
        if (!handler) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'mock not configured for ' + key }))
          return
        }
        try {
          const result = handler({ body })
          if (result && typeof result === 'object' && '__status' in result) {
            res.statusCode = result.__status as number
            const { __status, ...rest } = result
            void __status
            res.end(JSON.stringify(rest))
          } else {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          }
        } catch (e: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: e.message }))
        }
      })
    })
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => srv.close(() => r())),
        setHandler: (k, fn) => handlers.set(k, fn),
        unsetHandler: (k) => handlers.delete(k),
        calls,
      })
    })
  })
}

// ── Helper: build server + call tool via internal API ─────────────────────────

interface RegisteredTool {
  handler: ((args: any, extra?: any) => Promise<any>) | { createTask: any }
  inputSchema?: any
}

function getTool(server: McpServer, name: string): RegisteredTool {
  // Access private tool registry — public API doesn't expose direct invocation.
  const internal = server as unknown as { _registeredTools: Record<string, RegisteredTool> }
  const tool = internal._registeredTools[name]
  if (!tool) throw new Error(`Tool not registered: ${name}`)
  return tool
}

async function callTool(server: McpServer, name: string, args: unknown = {}): Promise<any> {
  const tool = getTool(server, name)
  if (typeof tool.handler !== 'function') throw new Error(`Tool ${name} has task handler, not supported in test helper`)
  return await tool.handler(args, {} as any)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let mock: MockState
let server: McpServer
const ctx = {
  cfg: { server: '', token: randomBytes(16).toString('hex') },
  writeEnabled: false,
  hasDaemon: false,
}

beforeAll(async () => {
  mock = await startMockServer()
  ctx.cfg.server = mock.url
})

afterAll(async () => {
  await mock.close()
})

beforeEach(() => {
  invalidateWhoamiCache()
  server = new McpServer({ name: 'test-server', version: '0.0.1' })
  metaModule.register(server, ctx)
  projectsModule.register(server, ctx)
  varsReadModule.register(server, ctx)
  aliasesReadModule.register(server, ctx)
  filesReadModule.register(server, ctx)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('whoami', () => {
  test('returns user info on success', async () => {
    mock.setHandler('GET /api/envman/whoami', () => ({
      user: { id: 'u1', name: 'Test', email: 't@x.com', role: 'ADMIN' },
      canWrite: true, scopes: [],
    }))
    const res = await callTool(server, 'whoami')
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.user.email).toBe('t@x.com')
    expect(res.structuredContent.canWrite).toBe(true)
  })

  test('401 → isError with helpful text', async () => {
    mock.setHandler('GET /api/envman/whoami', () => ({ __status: 401, error: 'invalid token' }))
    const res = await callTool(server, 'whoami')
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('Token invalid')
  })
})

describe('projects_list', () => {
  test('returns projects + count', async () => {
    mock.setHandler('GET /api/envman/projects', () => ({
      projects: [
        { id: 'p1', slug: 'a', name: 'A', tags: [] },
        { id: 'p2', slug: 'b', name: 'B', tags: ['web'] },
      ],
    }))
    const res = await callTool(server, 'projects_list')
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.count).toBe(2)
    expect((res.structuredContent.projects as any[])[0].slug).toBe('a')
  })
})

describe('project_get', () => {
  test('returns project detail', async () => {
    mock.setHandler('GET /api/envman/projects/myapp', () => ({
      project: { id: 'p1', slug: 'myapp', name: 'X', tags: [] },
    }))
    const res = await callTool(server, 'project_get', { slug: 'myapp' })
    expect(res.isError).toBeFalsy()
    expect((res.structuredContent.project as any).slug).toBe('myapp')
  })

  test('404 → helpful error with hint', async () => {
    mock.setHandler('GET /api/envman/projects/nope', () => ({ __status: 404, error: 'not found' }))
    const res = await callTool(server, 'project_get', { slug: 'nope' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('not found')
    expect(res.content[0].text).toContain('projects_list')
  })

  test('invalid slug → zod error in response', async () => {
    const res = await callTool(server, 'project_get', { slug: 'Bad Slug!' })
    expect(res.isError).toBe(true)
  })
})

describe('vars_list', () => {
  test('returns vars + pagination meta', async () => {
    mock.setHandler('GET /api/envman/projects/myapp/environments/dev/vars?limit=50&offset=0', () => ({
      vars: [{ id: 'v1', key: 'PORT', value: '3000', isSecret: false, isDisabled: false, updatedAt: 'x' }],
      total: 1, limit: 50, offset: 0, hasMore: false,
    }))
    const res = await callTool(server, 'vars_list', { slug: 'myapp', env: 'dev' })
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.total).toBe(1)
    expect((res.structuredContent.vars as any[])[0].key).toBe('PORT')
  })

  test('search param forwarded', async () => {
    mock.setHandler('GET /api/envman/projects/myapp/environments/dev/vars?limit=50&offset=0&search=DB', () => ({
      vars: [], total: 0, limit: 50, offset: 0, hasMore: false,
    }))
    const res = await callTool(server, 'vars_list', { slug: 'myapp', env: 'dev', search: 'DB' })
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.total).toBe(0)
  })
})

describe('vars_export', () => {
  test('default revealSecrets=false', async () => {
    mock.setHandler('GET /api/envman/projects/myapp/environments/prod/vars/export', () => ({
      vars: { PORT: '3000', SECRET: '***' },
    }))
    const res = await callTool(server, 'vars_export', { slug: 'myapp', env: 'prod' })
    expect(res.isError).toBeFalsy()
    expect((res.structuredContent.vars as any).SECRET).toBe('***')
    expect(res.structuredContent.secretsRevealed).toBe(false)
  })

  test('reveal request honored when role allows', async () => {
    mock.setHandler('GET /api/envman/projects/myapp/environments/prod/vars/export', () => ({
      vars: { PORT: '3000', SECRET: 'real-value' },
    }))
    const res = await callTool(server, 'vars_export', { slug: 'myapp', env: 'prod', revealSecrets: true })
    expect(res.isError).toBeFalsy()
    expect((res.structuredContent.vars as any).SECRET).toBe('real-value')
    expect(res.structuredContent.secretsRevealed).toBe(true)
  })

  test('reveal request not honored when server still masks', async () => {
    mock.setHandler('GET /api/envman/projects/myapp/environments/prod/vars/export', () => ({
      vars: { PORT: '3000', SECRET: '***' },  // role insufficient — server still masks
    }))
    const res = await callTool(server, 'vars_export', { slug: 'myapp', env: 'prod', revealSecrets: true })
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.secretsRevealed).toBe(false)
  })
})

describe('aliases_list', () => {
  test('returns aliases', async () => {
    mock.setHandler('GET /api/envman/projects/myapp/aliases', () => ({
      aliases: [{ id: 'a1', name: 'deploy', args: '-- bash deploy.sh', tags: [] }],
    }))
    const res = await callTool(server, 'aliases_list', { slug: 'myapp' })
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.count).toBe(1)
  })
})

describe('alias_resolve', () => {
  test('returns expanded args', async () => {
    mock.setHandler('GET /api/envman/aliases/resolve/myapp%3Adeploy', () => ({
      args: '-e myapp:prod -- bash deploy.sh', project: 'myapp', alias: 'deploy',
    }))
    const res = await callTool(server, 'alias_resolve', { ref: 'myapp:deploy' })
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.args).toContain('deploy.sh')
  })

  test('invalid ref → zod error', async () => {
    const res = await callTool(server, 'alias_resolve', { ref: 'noColon' })
    expect(res.isError).toBe(true)
  })
})

describe('files_list', () => {
  test('returns files', async () => {
    mock.setHandler('GET /api/envman/projects/myapp/files', () => ({
      files: [{ id: 'f1', title: 'Deploy', prefix: 'deploy', tags: [], files: [{ filename: 'deploy.sh' }] }],
    }))
    const res = await callTool(server, 'files_list', { slug: 'myapp' })
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.count).toBe(1)
  })
})

describe('file_resolve', () => {
  test('returns content + metadata', async () => {
    mock.setHandler('GET /api/envman/projects/myapp/files/resolve?prefix=deploy', () => ({
      content: '#!/bin/bash\necho hi', filename: 'deploy.sh', language: 'bash', entryTitle: 'Deploy',
    }))
    const res = await callTool(server, 'file_resolve', { slug: 'myapp', prefix: 'deploy' })
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent.content).toContain('echo hi')
    expect(res.structuredContent.filename).toBe('deploy.sh')
  })

  test('multi-file entry needs filename → 400', async () => {
    mock.setHandler('GET /api/envman/projects/myapp/files/resolve?prefix=multi', () => ({
      __status: 400, error: 'multiple files — specify filename',
    }))
    const res = await callTool(server, 'file_resolve', { slug: 'myapp', prefix: 'multi' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('Bad request')
  })
})
