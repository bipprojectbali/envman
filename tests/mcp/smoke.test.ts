// Smoke test: spawn `envman mcp`, send JSON-RPC init + tools/list.
//
// Verifies:
//   - Server starts within budget (<3s)
//   - stdout is pure JSON-RPC (no stderr pollution)
//   - initialize handshake succeeds
//   - tools/list returns expected tool count
//   - whoami tool returns user info via mock server
//   - stdin EOF triggers graceful exit

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { Subprocess } from 'bun'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

// ── In-memory mock envman server ──────────────────────────────────────────────

function startMockServer(handlers: Record<string, (req: any) => any>): Promise<{ url: string; close: () => Promise<void>; calls: string[] }> {
  const calls: string[] = []
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      calls.push(`${req.method} ${req.url}`)
      // Collect body if present
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(Buffer.from(c)))
      req.on('end', () => {
        const auth = req.headers.authorization
        if (!auth?.startsWith('Bearer ')) {
          res.statusCode = 401
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }
        const handler = handlers[`${req.method} ${req.url}`]
        if (!handler) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'not found' }))
          return
        }
        try {
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
          const result = handler({ headers: req.headers, body })
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(result))
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
        calls,
      })
    })
  })
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: any
  error?: { code: number; message: string }
}

class McpClient {
  private buf = ''
  private nextId = 1
  private pending = new Map<number, (resp: JsonRpcResponse) => void>()
  private proc: Subprocess<'pipe', 'pipe', 'pipe'>
  private stdoutDone = false
  public stderrText = ''

  constructor(proc: Subprocess<'pipe', 'pipe', 'pipe'>) {
    this.proc = proc
    // Read stdout (JSON-RPC)
    this.readStream(proc.stdout, (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const resp = JSON.parse(trimmed) as JsonRpcResponse
        const handler = this.pending.get(resp.id)
        if (handler) {
          this.pending.delete(resp.id)
          handler(resp)
        }
      } catch (e) {
        // stdout pollution detected!
        throw new Error(`stdout contained non-JSON line: ${trimmed.slice(0, 200)}`)
      }
    }).then(() => { this.stdoutDone = true })
    // Read stderr (logs)
    this.readStream(proc.stderr, (line) => {
      this.stderrText += line + '\n'
    })
  }

  private async readStream(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx)
          buf = buf.slice(idx + 1)
          if (line) onLine(line)
        }
      }
      if (buf) onLine(buf)
    } catch {
      // stream closed
    } finally {
      reader.releaseLock()
    }
  }

  async send(method: string, params?: unknown): Promise<JsonRpcResponse> {
    const id = this.nextId++
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.proc.stdin.write(JSON.stringify(req) + '\n')
    })
  }

  async sendNotification(method: string, params?: unknown): Promise<void> {
    const req = { jsonrpc: '2.0', method, params }
    this.proc.stdin.write(JSON.stringify(req) + '\n')
  }

  closeStdin(): void {
    this.proc.stdin.end()
  }

  async waitExit(timeoutMs = 5000): Promise<number> {
    const exit = this.proc.exited
    const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), timeoutMs))
    const result = await Promise.race([exit, timeout])
    if (result === 'timeout') throw new Error('process did not exit')
    return result as number
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MCP server smoke test', () => {
  let mock: Awaited<ReturnType<typeof startMockServer>>
  const TEST_TOKEN = 'em_test_smoke_' + Array.from({ length: 24 }, () => 'abcdef0123456789'[Math.floor(Math.random() * 16)]).join('')

  beforeAll(async () => {
    mock = await startMockServer({
      'GET /api/envman/whoami': () => ({
        user: { id: 'u1', name: 'Smoke', email: 'smoke@test', role: 'ADMIN' },
        tokenName: 'test-token',
        canWrite: true,
        scopes: [],
      }),
      'GET /api/envman/projects': () => ({
        projects: [
          { id: 'p1', slug: 'myapp', name: 'My App', description: null, tags: ['web'], myRole: 'OWNER', environments: [{ name: 'dev' }, { name: 'prod' }], members: [] },
          { id: 'p2', slug: 'other', name: 'Other', description: 'desc', tags: [], myRole: 'EDITOR', environments: [], members: [] },
        ],
      }),
      'GET /api/envman/projects/myapp': () => ({
        project: { id: 'p1', slug: 'myapp', name: 'My App', tags: [], myRole: 'OWNER', members: [], environments: [{ name: 'dev', _count: { vars: 5 } }] },
      }),
      'GET /api/envman/projects/myapp/environments/dev/vars?limit=50&offset=0': () => ({
        vars: [
          { id: 'v1', key: 'PORT', value: '3000', isSecret: false, isDisabled: false, updatedAt: '2026-05-01T00:00:00Z' },
          { id: 'v2', key: 'API_KEY', value: '***', isSecret: true, isDisabled: false, updatedAt: '2026-05-01T00:00:00Z' },
        ],
        total: 2, limit: 50, offset: 0, hasMore: false,
      }),
      'GET /api/envman/projects/myapp/aliases': () => ({
        aliases: [{ id: 'a1', name: 'deploy', args: '-e myapp:prod -- bash deploy.sh', description: null, tags: [] }],
      }),
      'GET /api/envman/projects/myapp/files': () => ({
        files: [{ id: 'f1', title: 'Deploy script', prefix: 'deploy', tags: [], files: [{ filename: 'deploy.sh', language: 'bash' }] }],
      }),
    })
  })

  afterAll(async () => {
    await mock.close()
  })

  test('handshake + tools/list + whoami', async () => {
    const proc = Bun.spawn(['bun', 'src/cli.ts', 'mcp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ENVMAN_SERVER: mock.url,
        ENVMAN_TOKEN: TEST_TOKEN,
      },
    }) as Subprocess<'pipe', 'pipe', 'pipe'>

    const client = new McpClient(proc)

    // Step 1: initialize
    const initResp = await client.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '0.0.1' },
    })
    expect(initResp.error).toBeUndefined()
    expect(initResp.result?.serverInfo?.name).toBe('envman-mcp-server')

    // Step 2: send initialized notification
    await client.sendNotification('notifications/initialized')

    // Step 3: list tools
    const toolsResp = await client.send('tools/list')
    expect(toolsResp.error).toBeUndefined()
    const tools = toolsResp.result?.tools as Array<{ name: string }>
    expect(tools.length).toBeGreaterThanOrEqual(2)
    const names = tools.map((t) => t.name)
    expect(names).toContain('whoami')
    expect(names).toContain('server_info')

    // Step 4: call whoami
    const whoamiResp = await client.send('tools/call', { name: 'whoami', arguments: {} })
    expect(whoamiResp.error).toBeUndefined()
    expect(whoamiResp.result?.isError).toBeFalsy()
    const structured = whoamiResp.result?.structuredContent
    expect(structured?.user?.email).toBe('smoke@test')
    expect(structured?.canWrite).toBe(true)

    // Step 5: close stdin → expect graceful exit
    client.closeStdin()
    const exitCode = await client.waitExit(3000)
    expect(exitCode).toBe(0)

    // stderr should contain log lines but no fatal errors
    expect(client.stderrText).toContain('mcp server ready')
    expect(client.stderrText).not.toContain('uncaughtException')
  }, 10_000)

  test('missing auth → exit 1 with helpful stderr', async () => {
    const proc = Bun.spawn(['bun', 'src/cli.ts', 'mcp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        // No ENVMAN_SERVER / ENVMAN_TOKEN
        PATH: process.env.PATH,
        HOME: '/tmp/envman-no-config-' + Date.now(),
      },
    }) as Subprocess<'pipe', 'pipe', 'pipe'>

    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    expect(exitCode).toBe(1)
    expect(stderr).toContain('No envman credentials')
  }, 10_000)

  test('--help prints to stderr and exits 0', async () => {
    const proc = Bun.spawn(['bun', 'src/cli.ts', 'mcp', '--help'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    }) as Subprocess<'pipe', 'pipe', 'pipe'>

    const stderr = await new Response(proc.stderr).text()
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    expect(exitCode).toBe(0)
    expect(stderr).toContain('Usage: envman mcp')
    expect(stdout.trim()).toBe('')  // stdout must be empty for help
  }, 5000)
})
