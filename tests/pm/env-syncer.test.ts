import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { resolveEnvSources, syncContainers, type EnvSource } from '../../src/pm/daemon/env-syncer'
import { EnvmanServerClient } from '../../src/pm/daemon/envman-client'
import { ProcessManager } from '../../src/pm/daemon/process-manager'

describe('resolveEnvSources', () => {
  let tmpDir: string
  let server: ReturnType<typeof Bun.serve>
  let port: number
  let serverEnv: Record<string, string> = {}

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-syncer-'))
    serverEnv = {}
    server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({ vars: serverEnv })
      },
    })
    port = server.port
  })

  afterEach(() => {
    server.stop(true)
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('resolves single envman source', async () => {
    serverEnv = { FOO: 'bar' }
    const client = new EnvmanServerClient({ config: { server: `http://localhost:${port}`, token: 'x' } })
    const result = await resolveEnvSources(
      [{ type: 'envman', ref: 'myapp:prod' }],
      client,
    )
    expect(result).toEqual({ FOO: 'bar' })
  })

  test('resolves single file source', async () => {
    const envPath = join(tmpDir, '.env')
    writeFileSync(envPath, 'A=1\nB=2\n# comment\nC = 3\n')
    const client = new EnvmanServerClient({ config: { server: `http://localhost:${port}`, token: 'x' } })
    const result = await resolveEnvSources(
      [{ type: 'file', ref: envPath }],
      client,
    )
    expect(result).toEqual({ A: '1', B: '2', C: '3' })
  })

  test('strips ENVMAN_TOKEN/SERVER from file source', async () => {
    const envPath = join(tmpDir, '.env')
    writeFileSync(envPath, 'ENVMAN_TOKEN=leaked\nENVMAN_SERVER=https://x\nFOO=bar\n')
    const client = new EnvmanServerClient({ config: { server: `http://localhost:${port}`, token: 'x' } })
    const result = await resolveEnvSources([{ type: 'file', ref: envPath }], client)
    expect(result.ENVMAN_TOKEN).toBeUndefined()
    expect(result.ENVMAN_SERVER).toBeUndefined()
    expect(result.FOO).toBe('bar')
  })

  test('multiple sources merge — later wins', async () => {
    serverEnv = { K: 'from-server' }
    const filePath = join(tmpDir, '.env')
    writeFileSync(filePath, 'K=from-file\n')
    const client = new EnvmanServerClient({ config: { server: `http://localhost:${port}`, token: 'x' } })

    // server first, file later → file wins
    const result1 = await resolveEnvSources([
      { type: 'envman', ref: 'a:b' },
      { type: 'file', ref: filePath },
    ], client)
    expect(result1.K).toBe('from-file')

    // file first, server later → server wins
    const result2 = await resolveEnvSources([
      { type: 'file', ref: filePath },
      { type: 'envman', ref: 'a:b' },
    ], client)
    expect(result2.K).toBe('from-server')
  })

  test('handles quoted values in .env file', async () => {
    const envPath = join(tmpDir, '.env')
    writeFileSync(envPath, `A="with space"\nB='single quoted'\n`)
    const client = new EnvmanServerClient({ config: { server: `http://localhost:${port}`, token: 'x' } })
    const result = await resolveEnvSources([{ type: 'file', ref: envPath }], client)
    expect(result.A).toBe('with space')
    expect(result.B).toBe('single quoted')
  })

  test('strips "export" prefix', async () => {
    const envPath = join(tmpDir, '.env')
    writeFileSync(envPath, 'export FOO=bar\n')
    const client = new EnvmanServerClient({ config: { server: `http://localhost:${port}`, token: 'x' } })
    const result = await resolveEnvSources([{ type: 'file', ref: envPath }], client)
    expect(result.FOO).toBe('bar')
  })
})

describe('syncContainers', () => {
  let tmpDir: string
  let server: ReturnType<typeof Bun.serve>
  let port: number
  let serverEnv: Record<string, string> = {}
  let pm: ProcessManager
  let client: EnvmanServerClient

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-sync-'))
    serverEnv = { K: 'v1' }
    server = Bun.serve({
      port: 0,
      fetch() { return Response.json({ vars: serverEnv }) },
    })
    port = server.port
    pm = new ProcessManager({ logsDir: tmpDir })
    client = new EnvmanServerClient({ config: { server: `http://localhost:${port}`, token: 'x' } })
  })

  afterEach(async () => {
    await pm.shutdownAll()
    server.stop(true)
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('no change → unchanged list', async () => {
    await pm.start({
      name: 'p1',
      command: ['sleep', '60'],
      envSources: [{ type: 'envman', ref: 'a:b' }],
      envmanEnv: { K: 'v1' },  // pre-populate same as server
    })
    const result = await syncContainers({
      containers: [pm.get('p1')],
      client,
    })
    expect(result.unchanged).toContain('p1')
    expect(result.updated).toHaveLength(0)
  }, 5000)

  test('env changes → process restarted', async () => {
    await pm.start({
      name: 'p1',
      command: ['sleep', '60'],
      envSources: [{ type: 'envman', ref: 'a:b' }],
      envmanEnv: { K: 'OLD' },
    })
    serverEnv = { K: 'NEW' }
    const result = await syncContainers({
      containers: [pm.get('p1')],
      client,
    })
    expect(result.updated).toContain('p1')
    expect(result.unchanged).toHaveLength(0)
  }, 5000)

  test('dry run reports diff but does not restart', async () => {
    await pm.start({
      name: 'p1',
      command: ['sleep', '60'],
      envSources: [{ type: 'envman', ref: 'a:b' }],
      envmanEnv: { K: 'OLD' },
    })
    serverEnv = { K: 'NEW' }
    const result = await syncContainers({
      containers: [pm.get('p1')],
      client,
      dryRun: true,
    })
    expect(result.updated).toContain('p1')
    // No actual restart happened — process should still be in original state
  }, 5000)

  test('containers without envSources are skipped', async () => {
    await pm.start({
      name: 'no-source',
      command: ['sleep', '60'],
    })
    const result = await syncContainers({
      containers: [pm.get('no-source')],
      client,
    })
    expect(result.checked).toBe(0)
  }, 5000)
})
