// Integration test: spawn real daemon, ping, stop.
// Pakai ENVMAN_PM_HOME override untuk isolasi per test.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { DaemonClient } from '../../src/pm/cli/client'
import type { DaemonHealth } from '../../src/pm/shared/types'

const CLI_PATH = join(import.meta.dir, '..', '..', 'src', 'cli.ts')

function runCli(args: string[], home: string, timeoutMs = 10_000): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('bun', [CLI_PATH, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ENVMAN_PM_HOME: home },
    timeout: timeoutMs,
  })
  return {
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
    status: result.status ?? -1,
  }
}

describe('daemon lifecycle', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'envman-lifecycle-'))
  })

  afterEach(async () => {
    // best-effort stop
    runCli(['daemon', 'stop'], home, 5000)
    rmSync(home, { recursive: true, force: true })
  })

  test('full cycle: start → status → stop', async () => {
    // 1. start
    const startResult = runCli(['daemon', 'start'], home)
    expect(startResult.status).toBe(0)
    expect(startResult.stdout).toContain('Daemon ready')

    // 2. files exist with correct permissions
    const sockPath = join(home, 'run', 'daemon.sock')
    const pidPath = join(home, 'run', 'daemon.pid')
    const tokenPath = join(home, 'daemon.token')

    expect(existsSync(sockPath)).toBe(true)
    expect(existsSync(pidPath)).toBe(true)
    expect(existsSync(tokenPath)).toBe(true)

    const sockMode = statSync(sockPath).mode & 0o777
    expect(sockMode).toBe(0o600)
    const tokenMode = statSync(tokenPath).mode & 0o777
    expect(tokenMode).toBe(0o600)

    // 3. status returns running
    const statusResult = runCli(['daemon', 'status'], home)
    expect(statusResult.status).toBe(0)
    expect(statusResult.stdout).toContain('Daemon: running')

    // 4. health endpoint accessible via IPC
    const client = new DaemonClient({ socketPath: sockPath, tokenPath })
    const health = await client.get<DaemonHealth>('/v1/daemon/health')
    expect(health.ok).toBe(true)
    expect(health.version).toBe('0.1.0')
    expect(health.pid).toBeGreaterThan(0)
    expect(health.uptimeMs).toBeGreaterThanOrEqual(0)
    expect(health.processCount).toBe(0)
    expect(health.diskFull).toBe(false)

    // 5. stop
    const stopResult = runCli(['daemon', 'stop'], home)
    expect(stopResult.status).toBe(0)
    expect(stopResult.stdout).toContain('Daemon stopped')

    // 6. socket file cleaned up
    expect(existsSync(sockPath)).toBe(false)
    expect(existsSync(pidPath)).toBe(false)
  })

  test('double start is idempotent', async () => {
    runCli(['daemon', 'start'], home)
    const second = runCli(['daemon', 'start'], home)
    expect(second.status).toBe(0)
    expect(second.stdout).toContain('already running')
  })

  test('status when stopped', () => {
    const result = runCli(['daemon', 'status'], home)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('stopped')
  })

  test('stop when not running', () => {
    const result = runCli(['daemon', 'stop'], home)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('not running')
  })

  test('survives kill -9 → restart cleans up stale state', async () => {
    runCli(['daemon', 'start'], home)
    // Read PID
    const fs = require('fs')
    const pid = parseInt(fs.readFileSync(join(home, 'run', 'daemon.pid'), 'utf8').split('\n')[0], 10)
    expect(pid).toBeGreaterThan(0)

    // Kill -9
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
    await new Promise(r => setTimeout(r, 200))

    // Restart should detect dead PID and clean up
    const restartResult = runCli(['daemon', 'start'], home)
    expect(restartResult.status).toBe(0)
    expect(restartResult.stdout).toContain('Daemon ready')
    expect(restartResult.stdout).toContain('Cleaning up stale')
  })

  test('rejects invalid auth token via IPC', async () => {
    runCli(['daemon', 'start'], home)
    const sockPath = join(home, 'run', 'daemon.sock')

    const client = new DaemonClient({ socketPath: sockPath, tokenOverride: 'wrong-token' })
    let err: any = null
    try {
      await client.get<DaemonHealth>('/v1/daemon/health')
    } catch (e: any) {
      err = e
    }
    expect(err).not.toBeNull()
    expect(err.message).toContain('auth')
  })

  test('rejects unknown route with 404', async () => {
    runCli(['daemon', 'start'], home)
    const sockPath = join(home, 'run', 'daemon.sock')
    const tokenPath = join(home, 'daemon.token')

    const client = new DaemonClient({ socketPath: sockPath, tokenPath })
    let err: any = null
    try {
      await client.get('/v1/no/such/path')
    } catch (e: any) {
      err = e
    }
    expect(err).not.toBeNull()
    expect(err.code).toBe('NOT_FOUND')
    expect(err.httpStatus).toBe(404)
  })
})
