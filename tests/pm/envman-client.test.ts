import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  readServerConfig,
  EnvmanServerClient,
  ServerNotConfiguredError,
  ServerAuthError,
  ServerUnreachableError,
} from '../../src/pm/daemon/envman-client'

describe('readServerConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-cfg-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('throws ServerNotConfiguredError when file missing', () => {
    expect(() => readServerConfig(join(tmpDir, 'missing.json'))).toThrow(ServerNotConfiguredError)
  })

  test('throws when file malformed', () => {
    const path = join(tmpDir, 'bad.json')
    writeFileSync(path, '{ not json')
    expect(() => readServerConfig(path)).toThrow(ServerNotConfiguredError)
  })

  test('throws when missing required fields', () => {
    const path = join(tmpDir, 'partial.json')
    writeFileSync(path, JSON.stringify({ server: 'https://x' }))
    expect(() => readServerConfig(path)).toThrow(ServerNotConfiguredError)
  })

  test('returns config when valid', () => {
    const path = join(tmpDir, 'valid.json')
    writeFileSync(path, JSON.stringify({ server: 'https://envman.example.com/', token: 'abc123' }))
    const cfg = readServerConfig(path)
    expect(cfg.server).toBe('https://envman.example.com')  // trailing slash stripped
    expect(cfg.token).toBe('abc123')
  })
})

describe('EnvmanServerClient', () => {
  // Mock server via Bun.serve untuk integration test
  let port: number
  let server: ReturnType<typeof Bun.serve>
  let requestLog: { method: string; path: string; auth: string | null }[] = []
  let nextResponse: { status: number; body: any } = { status: 200, body: {} }

  beforeEach(() => {
    requestLog = []
    nextResponse = { status: 200, body: {} }
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        requestLog.push({
          method: req.method,
          path: url.pathname,
          auth: req.headers.get('authorization'),
        })
        return new Response(JSON.stringify(nextResponse.body), {
          status: nextResponse.status,
          headers: { 'content-type': 'application/json' },
        })
      },
    })
    port = server.port
  })

  afterEach(() => {
    server.stop(true)
  })

  test('fetchProjectEnv sends Bearer auth + returns vars', async () => {
    nextResponse = { status: 200, body: { vars: { FOO: 'bar', BAZ: 'qux' } } }
    const client = new EnvmanServerClient({
      config: { server: `http://localhost:${port}`, token: 'tok-1' },
    })
    const data = await client.fetchProjectEnv('myapp', 'prod')
    expect(data.vars).toEqual({ FOO: 'bar', BAZ: 'qux' })
    expect(requestLog).toHaveLength(1)
    expect(requestLog[0].auth).toBe('Bearer tok-1')
    expect(requestLog[0].path).toBe('/api/envman/projects/myapp/environments/prod/vars/export')
  })

  test('401 → ServerAuthError + tokenInvalid set', async () => {
    nextResponse = { status: 401, body: { error: 'expired' } }
    const client = new EnvmanServerClient({
      config: { server: `http://localhost:${port}`, token: 'bad' },
      maxRetries: 1,
    })
    let err: any = null
    try {
      await client.fetchProjectEnv('a', 'b')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ServerAuthError)
    expect(client.tokenInvalid).toBe(true)
  })

  test('subsequent calls skip when tokenInvalid', async () => {
    const client = new EnvmanServerClient({
      config: { server: `http://localhost:${port}`, token: 'x' },
    })
    client.tokenInvalid = true
    let err: any = null
    try {
      await client.fetchProjectEnv('a', 'b')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ServerAuthError)
    expect(requestLog).toHaveLength(0)  // no actual HTTP call
  })

  test('500 retries with exponential backoff', async () => {
    nextResponse = { status: 503, body: { error: 'down' } }
    const client = new EnvmanServerClient({
      config: { server: `http://localhost:${port}`, token: 'x' },
      maxRetries: 3,
      timeoutMs: 2000,
    })
    let err: any = null
    try {
      await client.fetchProjectEnv('a', 'b')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ServerUnreachableError)
    expect(requestLog.length).toBe(3)
  }, 10_000)

  test('400 errors do not retry', async () => {
    nextResponse = { status: 400, body: { error: 'bad input' } }
    const client = new EnvmanServerClient({
      config: { server: `http://localhost:${port}`, token: 'x' },
      maxRetries: 3,
    })
    let err: any = null
    try {
      await client.fetchProjectEnv('a', 'b')
    } catch (e) {
      err = e
    }
    expect(err).not.toBeNull()
    expect(requestLog.length).toBe(1)  // no retry
  })

  test('resolveAlias hits correct endpoint', async () => {
    nextResponse = {
      status: 200,
      body: { args: '-e foo:bar -- bun', project: { slug: 'foo', name: 'Foo' }, alias: { name: 'b', description: null, tags: [] } },
    }
    const client = new EnvmanServerClient({
      config: { server: `http://localhost:${port}`, token: 'x' },
    })
    const data = await client.resolveAlias('foo:bar')
    expect(data.args).toContain('foo:bar')
    expect(requestLog[0].path).toBe('/api/envman/aliases/resolve/foo%3Abar')
  })

  test('postAudit fire-and-forget — does not throw on error', async () => {
    nextResponse = { status: 500, body: { error: 'down' } }
    const client = new EnvmanServerClient({
      config: { server: `http://localhost:${port}`, token: 'x' },
      maxRetries: 1,
    })
    // Should NOT throw
    await client.postAudit({ action: 'PM_PROCESS_STARTED' })
    expect(true).toBe(true)  // reached here = pass
  })

  test('postAudit sends body with action', async () => {
    nextResponse = { status: 200, body: { ok: true } }
    const client = new EnvmanServerClient({
      config: { server: `http://localhost:${port}`, token: 'x' },
    })
    await client.postAudit({ action: 'PM_PROCESS_STOPPED', processName: 'foo' })
    expect(requestLog[0].path).toBe('/api/envman/pm/audit')
    expect(requestLog[0].method).toBe('POST')
  })
})
