// Daemon entry point.
//
// Dipanggil dari src/cli.ts saat user (atau spawn dari `envman daemon start`)
// menjalankan `envman daemon-internal`. Tidak boleh di-call langsung user.

import { existsSync, mkdirSync } from 'fs'
import { paths } from '../shared/paths'
import { ensureToken } from '../shared/token'
import { PidFile, getProcessStartEpoch } from './pidfile'
import { Router, okResponse } from './router'
import { Server } from './server'
import { log } from './logger'
import type { DaemonHealth } from '../shared/types'

// Bundled daemon version — separate dari CLI version supaya bisa track schema changes.
export const DAEMON_VERSION = '0.1.0'

export async function runDaemon(): Promise<void> {
  const p = paths()
  const startEpochMs = getProcessStartEpoch(process.pid) ?? Date.now()
  const startedAt = Date.now()

  // Ensure directory structure
  if (!existsSync(p.home)) mkdirSync(p.home, { recursive: true, mode: 0o700 })
  if (!existsSync(p.run)) mkdirSync(p.run, { recursive: true, mode: 0o700 })
  if (!existsSync(p.logsDir)) mkdirSync(p.logsDir, { recursive: true, mode: 0o750 })

  log.info('daemon starting', { version: DAEMON_VERSION, pid: process.pid, paths: p })

  // PID file claim — fail-fast kalau daemon lain sudah running
  const pidFile = new PidFile(p.pidfile)
  const pidStatus = pidFile.status()
  if (pidStatus === 'alive') {
    log.error('daemon already running, refusing to start')
    process.exit(2)
  }
  if (pidStatus === 'dead' || pidStatus === 'hijacked') {
    log.warn('cleaning up stale PID file', { status: pidStatus })
    pidFile.release()
  }

  try {
    pidFile.tryAcquire({ pid: process.pid, startEpochMs, socketPath: p.socket })
  } catch (e: any) {
    if (e.code === 'EEXIST') {
      // Race: daemon lain dapat lock dulu di antara status() dan tryAcquire()
      log.error('another daemon acquired lock first, exiting')
      process.exit(2)
    }
    log.error('failed to acquire PID file', { error: e.message })
    process.exit(1)
  }

  // Generate atau load auth token
  const token = ensureToken(p.token)

  // Build router + register health endpoint
  const router = new Router()
  router.add('GET', '/v1/daemon/health', (ctx) => {
    const body: Omit<DaemonHealth, 'ok'> = {
      version: DAEMON_VERSION,
      pid: process.pid,
      uptimeMs: Date.now() - startedAt,
      startedAt,
      processCount: 0,  // Phase 2+ akan update
      diskFull: false,  // Phase 3+ akan update
    }
    return okResponse(body, ctx.requestId)
  })

  // Shutdown endpoint — graceful via IPC
  router.add('POST', '/v1/daemon/shutdown', async (ctx) => {
    log.info('shutdown requested via IPC')
    // Schedule shutdown setelah response keluar
    setTimeout(() => {
      void gracefulShutdown('ipc-request', { server, pidFile })
    }, 50)
    return okResponse({ shuttingDown: true }, ctx.requestId)
  })

  // Start server
  const server = new Server({ socketPath: p.socket, token, router })
  await server.start()

  // Setup signal handlers
  let shuttingDown = false
  const handler = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      log.warn('second signal received, forcing exit', { signal })
      process.exit(1)
    }
    shuttingDown = true
    void gracefulShutdown(signal, { server, pidFile })
  }
  process.on('SIGTERM', handler)
  process.on('SIGINT', handler)
  process.on('SIGHUP', () => {
    // Ignore SIGHUP — daemon detached dari terminal
    log.info('SIGHUP received, ignoring')
  })

  // Unhandled error guards
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { error: err.message, stack: err.stack })
    void gracefulShutdown('uncaught', { server, pidFile })
  })
  process.on('unhandledRejection', (reason: any) => {
    log.error('unhandledRejection', { reason: String(reason) })
  })

  log.info('daemon ready')
}

async function gracefulShutdown(
  reason: string,
  ctx: { server: Server; pidFile: PidFile },
): Promise<void> {
  log.info('shutting down', { reason })
  try {
    await ctx.server.stop(5000)
  } catch (e: any) {
    log.error('server stop failed', { error: e.message })
  }
  try {
    ctx.pidFile.release()
  } catch (e: any) {
    log.error('pidfile release failed', { error: e.message })
  }
  log.info('shutdown complete')
  process.exit(0)
}
