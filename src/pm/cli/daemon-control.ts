// CLI: `envman daemon start | stop | status` commands.
//
// Bug yang dimitigasi:
//   D1: spawn daemon dengan detached:true (POC #37 confirmed works)
//   D2: cek existing daemon via PidFile sebelum spawn (race kemungkinan
//       masih ada tapi window kecil; daemon main akan refuse di O_EXCL)

import { existsSync, mkdirSync, openSync } from 'node:fs'
import { PidFile } from '../daemon/pidfile'
import { paths } from '../shared/paths'
import type { DaemonHealth } from '../shared/types'
import { DaemonClient, DaemonNotRunningError } from './client'

/**
 * Get command untuk re-spawn binary ini sebagai daemon.
 * Mendukung dev (bun script.ts) dan compiled binary (./envman).
 */
function getDaemonSpawnCmd(): string[] {
  const execPath = process.execPath
  const _argv0Base = (process.argv[1] ?? '').split('/').pop() ?? ''
  // Heuristik: kalau execPath include 'bun' atau argv[1] adalah .ts file,
  // berarti dev mode — perlu pass script path
  const isDev = execPath.includes('bun') && process.argv[1]?.endsWith('.ts')
  if (isDev) {
    return [execPath, process.argv[1]!, 'daemon-internal']
  }
  // Compiled binary — execPath adalah envman binary
  return [execPath, 'daemon-internal']
}

export async function cmdDaemonStart(): Promise<void> {
  const p = paths()

  // Ensure directories
  if (!existsSync(p.home)) mkdirSync(p.home, { recursive: true, mode: 0o700 })
  if (!existsSync(p.run)) mkdirSync(p.run, { recursive: true, mode: 0o700 })

  // Cek existing daemon
  const pidFile = new PidFile(p.pidfile)
  const status = pidFile.status()
  if (status === 'alive') {
    const content = pidFile.read()
    console.log(`Daemon already running (PID ${content?.pid})`)
    return
  }
  if (status === 'dead' || status === 'hijacked') {
    console.log(`Cleaning up stale PID file (${status})`)
    pidFile.release()
  }

  // Spawn daemon detached. POC #37 confirmed Bun.spawn detached:true works
  // di macOS — child reparent ke PID 1, own session, no controlling TTY.
  const logFd = openSync(p.daemonLog, 'a', 0o600)
  const cmd = getDaemonSpawnCmd()

  const child = Bun.spawn(cmd, {
    stdio: ['ignore', logFd, logFd],
    detached: true,
    env: { ...process.env },
  })
  child.unref()

  console.log(`Spawning daemon (PID ${child.pid})...`)

  // Wait for daemon ready dengan timeout 5s
  const READY_TIMEOUT_MS = 5000
  const POLL_INTERVAL_MS = 100
  const deadline = Date.now() + READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (existsSync(p.socket)) {
      // Coba ping health
      try {
        const client = new DaemonClient({ timeoutMs: 1000 })
        const health = await client.get<DaemonHealth>('/v1/daemon/health')
        console.log(`Daemon ready: version=${health.version} pid=${health.pid}`)
        return
      } catch {
        // not ready yet
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }

  console.error(`Daemon did not become ready within ${READY_TIMEOUT_MS}ms`)
  console.error(`Check log: ${p.daemonLog}`)
  process.exit(1)
}

export async function cmdDaemonStatus(): Promise<void> {
  const p = paths()
  const pidFile = new PidFile(p.pidfile)
  const status = pidFile.status()

  if (status === 'missing') {
    console.log('Daemon: stopped (no PID file)')
    return
  }
  if (status === 'dead') {
    console.log('Daemon: stopped (stale PID file)')
    return
  }
  if (status === 'hijacked') {
    console.log('Daemon: not running (PID hijacked — file is stale)')
    return
  }

  // status === 'alive' — ping untuk dapat detail
  try {
    const client = new DaemonClient({ timeoutMs: 2000 })
    const health = await client.get<DaemonHealth>('/v1/daemon/health')
    const uptimeSec = Math.floor(health.uptimeMs / 1000)
    console.log(`Daemon: running`)
    console.log(`  PID      : ${health.pid}`)
    console.log(`  Version  : ${health.version}`)
    console.log(`  Uptime   : ${formatDuration(uptimeSec)}`)
    console.log(`  Started  : ${new Date(health.startedAt).toISOString()}`)
    console.log(`  Processes: ${health.processCount}`)
    if (health.diskFull) console.log(`  ⚠ Disk full — log writes paused`)
  } catch (e: any) {
    console.error('Daemon process alive but IPC failed:', e.message)
    process.exit(1)
  }
}

export async function cmdDaemonStop(): Promise<void> {
  const p = paths()
  const pidFile = new PidFile(p.pidfile)
  const status = pidFile.status()

  if (status === 'missing' || status === 'dead' || status === 'hijacked') {
    console.log(`Daemon not running (${status})`)
    if (status !== 'missing') pidFile.release()
    return
  }

  // Graceful shutdown via IPC
  try {
    const client = new DaemonClient({ timeoutMs: 2000 })
    await client.post('/v1/daemon/shutdown', {})
    console.log('Shutdown requested...')
  } catch (e: any) {
    if (e instanceof DaemonNotRunningError) {
      console.log('Daemon already stopped')
      return
    }
    console.error('IPC shutdown failed, falling back to SIGTERM:', e.message)
    const content = pidFile.read()
    if (content) {
      try {
        process.kill(content.pid, 'SIGTERM')
      } catch {
        // already dead
      }
    }
  }

  // Wait for actual exit
  const SHUTDOWN_TIMEOUT_MS = 7000
  const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (pidFile.status() !== 'alive') {
      console.log('Daemon stopped')
      return
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  // Last resort SIGKILL
  console.error('Daemon did not stop gracefully, sending SIGKILL')
  const content = pidFile.read()
  if (content) {
    try {
      process.kill(content.pid, 'SIGKILL')
    } catch {
      // already dead
    }
  }
  pidFile.release()
}

function formatDuration(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export async function cmdDaemon(args: string[]): Promise<void> {
  const sub = args[0]
  switch (sub) {
    case 'start':
      await cmdDaemonStart()
      return
    case 'stop':
      await cmdDaemonStop()
      return
    case 'status':
      await cmdDaemonStatus()
      return
    case undefined:
    case '--help':
    case '-h':
      console.log('Usage:')
      console.log('  envman pm daemon start   Start the process manager daemon')
      console.log('  envman pm daemon stop    Stop the daemon (graceful)')
      console.log('  envman pm daemon status  Show daemon status + uptime')
      return
    default:
      console.error(`Unknown daemon subcommand: ${sub}`)
      console.error("Run 'envman pm daemon --help' for usage")
      process.exit(1)
  }
}
