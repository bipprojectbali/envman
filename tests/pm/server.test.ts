import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import { Server } from '../../src/pm/daemon/server'
import { Router, okResponse } from '../../src/pm/daemon/router'
import { AUTH_HEADER } from '../../src/pm/shared/token'

const newToken = () => randomBytes(32).toString('hex')

describe('Server', () => {
  let tmpDir: string
  let socketPath: string
  let server: Server | null = null
  let token: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-srv-'))
    socketPath = join(tmpDir, 'daemon.sock')
    token = newToken()
  })

  afterEach(async () => {
    if (server) {
      await server.stop(1000)
      server = null
    }
    rmSync(tmpDir, { recursive: true, force: true })
  })

  async function fetchSocket(path: string, opts: RequestInit = {}): Promise<Response> {
    return fetch(`http://localhost${path}`, { ...opts, unix: socketPath })
  }

  test('binds socket and sets mode 0600', async () => {
    const router = new Router()
    router.add('GET', '/ping', (ctx) => okResponse({ pong: true }, ctx.requestId))
    server = new Server({ socketPath, token, router })
    await server.start()

    expect(existsSync(socketPath)).toBe(true)
    const mode = statSync(socketPath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('rejects request without auth header', async () => {
    const router = new Router()
    router.add('GET', '/ping', (ctx) => okResponse({}, ctx.requestId))
    server = new Server({ socketPath, token, router })
    await server.start()

    const res = await fetchSocket('/ping')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('INVALID_AUTH')
  })

  test('rejects wrong auth token', async () => {
    const router = new Router()
    router.add('GET', '/ping', (ctx) => okResponse({}, ctx.requestId))
    server = new Server({ socketPath, token, router })
    await server.start()

    const res = await fetchSocket('/ping', {
      headers: { [AUTH_HEADER]: newToken() },
    })
    expect(res.status).toBe(401)
  })

  test('accepts correct auth token', async () => {
    const router = new Router()
    router.add('GET', '/ping', (ctx) => okResponse({ pong: true }, ctx.requestId))
    server = new Server({ socketPath, token, router })
    await server.start()

    const res = await fetchSocket('/ping', {
      headers: { [AUTH_HEADER]: token },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pong).toBe(true)
  })

  test('cleans up stale socket on start', async () => {
    // Buat file "stale" di socket path
    require('fs').writeFileSync(socketPath, 'fake')
    expect(existsSync(socketPath)).toBe(true)

    const router = new Router()
    router.add('GET', '/ping', (ctx) => okResponse({}, ctx.requestId))
    server = new Server({ socketPath, token, router })
    await server.start()

    // Server harus replace file dengan socket beneran
    expect(existsSync(socketPath)).toBe(true)
    const mode = statSync(socketPath).mode & 0o777
    expect(mode).toBe(0o600)
    // Socket must be functional
    const res = await fetchSocket('/ping', {
      headers: { [AUTH_HEADER]: token },
    })
    expect(res.status).toBe(200)
  })

  test('stop removes socket file', async () => {
    const router = new Router()
    server = new Server({ socketPath, token, router })
    await server.start()
    await server.stop(1000)
    server = null
    expect(existsSync(socketPath)).toBe(false)
  })
})
