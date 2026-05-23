// CLI: `envman pm <subcommand>` — process management.

import { DaemonClient, DaemonNotRunningError } from './client'
import type { ProcessSnapshot, EnvSource } from '../daemon/process-container'

interface ListResponse {
  ok: true
  processes: ProcessSnapshot[]
}

interface OneResponse {
  ok: true
  process: ProcessSnapshot
}

function formatUptime(ms: number): string {
  if (ms <= 0) return '-'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d${h % 24}h`
}

function statusColor(status: string): string {
  // ANSI color codes — minimal, no dependency
  const colors: Record<string, string> = {
    online: '\x1b[32m',       // green
    starting: '\x1b[33m',     // yellow
    stopping: '\x1b[33m',
    stopped: '\x1b[90m',      // gray
    errored: '\x1b[31m',      // red
    quarantined: '\x1b[35m',  // magenta
  }
  const reset = '\x1b[0m'
  return `${colors[status] ?? ''}${status}${reset}`
}

function printTable(processes: ProcessSnapshot[]): void {
  if (processes.length === 0) {
    console.log('No processes managed. Start one with: envman pm start "<cmd>" --name <name>')
    return
  }

  const headers = ['NAME', 'PID', 'STATUS', 'UPTIME', 'RESTARTS', 'COMMAND']
  const rows = processes.map(p => [
    p.name,
    p.pid?.toString() ?? '-',
    p.status,
    formatUptime(p.uptimeMs),
    p.restartCount.toString(),
    p.command.join(' ').slice(0, 60),
  ])

  // Hitung lebar kolom (ignore ANSI codes saat measuring)
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => r[i].length)),
  )

  const sep = '  '
  console.log(headers.map((h, i) => h.padEnd(widths[i])).join(sep))
  console.log(widths.map(w => '─'.repeat(w)).join(sep))
  for (const row of rows) {
    const cells = row.map((cell, i) => {
      // Wrap status dengan warna setelah padding
      if (i === 2) {
        const padded = cell.padEnd(widths[i])
        return statusColor(cell) + padded.slice(cell.length)
      }
      return cell.padEnd(widths[i])
    })
    console.log(cells.join(sep))
  }
}

export async function cmdPmStart(args: string[]): Promise<void> {
  // Parse: envman pm start [--name N] [--cwd path] [-e KEY=VAL]... [-s source]... -- <cmd>
  // -s source bisa berupa "project:env" (envman) atau path file
  // -e KEY=VAL adalah static env (sama dengan -e di docker run)
  let name = ''
  let cwd: string | undefined
  const staticEnv: Record<string, string> = {}
  const envSources: EnvSource[] = []
  let i = 0
  const command: string[] = []

  const sepIdx = args.indexOf('--')
  if (sepIdx === -1) {
    console.error("Missing -- separator. Usage: envman pm start --name <n> [-s project:env]... -- <cmd>")
    process.exit(1)
  }
  const flagArgs = args.slice(0, sepIdx)
  command.push(...args.slice(sepIdx + 1))

  while (i < flagArgs.length) {
    const flag = flagArgs[i]
    if (flag === '--name' || flag === '-n') {
      name = flagArgs[i + 1] ?? ''
      i += 2
    } else if (flag === '--cwd') {
      cwd = flagArgs[i + 1]
      i += 2
    } else if (flag === '-e') {
      const kv = flagArgs[i + 1] ?? ''
      const eq = kv.indexOf('=')
      if (eq === -1) {
        console.error(`Invalid -e value: "${kv}" — expected KEY=VAL`)
        process.exit(1)
      }
      staticEnv[kv.slice(0, eq)] = kv.slice(eq + 1)
      i += 2
    } else if (flag === '-s' || flag === '--source') {
      const src = flagArgs[i + 1] ?? ''
      if (!src) { console.error('-s requires a value'); process.exit(1) }
      // Format: "project:env" → envman, atau path file
      if (src.includes(':') && !src.startsWith('/') && !src.startsWith('.')) {
        envSources.push({ type: 'envman', ref: src })
      } else {
        envSources.push({ type: 'file', ref: src })
      }
      i += 2
    } else {
      console.error(`Unknown flag: ${flag}`)
      process.exit(1)
    }
  }

  if (!name) {
    console.error("--name is required. Usage: envman pm start --name <n> -- <cmd>")
    process.exit(1)
  }
  if (command.length === 0) {
    console.error("Missing command after --")
    process.exit(1)
  }

  // Kalau ada envSources, resolve dulu di CLI side (daemon nanti juga bisa resolve
  // saat sync). Kirim hasil resolve sebagai envmanEnv awal.
  let envmanEnv: Record<string, string> | undefined
  if (envSources.length > 0) {
    try {
      envmanEnv = await resolveSourcesCli(envSources)
    } catch (e: any) {
      console.error(`Env resolve failed: ${e.message}`)
      process.exit(1)
    }
  }

  const client = new DaemonClient()
  const res = await client.post<OneResponse>('/v1/process/start', {
    name,
    command,
    cwd,
    staticEnv,
    envmanEnv,
    envSources,
  })
  const p = res.process
  console.log(`Started "${p.name}" (PID ${p.pid}, status=${p.status})`)
  if (envSources.length > 0) {
    console.log(`  Env sources: ${envSources.map(s => s.ref).join(', ')}`)
    console.log(`  Use 'envman pm sync ${name}' to re-fetch env from server`)
  }
}

/**
 * Resolve env sources di CLI side (envman server perlu auth dari config.json).
 * Pakai existing apiFetch pattern.
 */
async function resolveSourcesCli(sources: EnvSource[]): Promise<Record<string, string>> {
  const { paths } = await import('../shared/paths')
  const { readFileSync, existsSync } = await import('fs')
  const p = paths()
  if (!existsSync(p.config)) {
    throw new Error('envman server not configured (run `envman login`)')
  }
  const cfg = JSON.parse(readFileSync(p.config, 'utf8'))
  if (!cfg.server || !cfg.token) throw new Error('invalid config.json')
  const server = cfg.server.replace(/\/$/, '')

  const merged: Record<string, string> = {}
  for (const src of sources) {
    if (src.type === 'envman') {
      const [project, env] = src.ref.split(':')
      const url = `${server}/api/envman/projects/${encodeURIComponent(project)}/environments/${encodeURIComponent(env)}/vars/export`
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${cfg.token}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${src.ref}`)
      const data = await res.json() as { vars: Record<string, string> }
      Object.assign(merged, data.vars)
    } else {
      const text = readFileSync(src.ref, 'utf8')
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq === -1) continue
        let key = trimmed.slice(0, eq).trim()
        if (key.startsWith('export ')) key = key.slice(7).trim()
        let value = trimmed.slice(eq + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (key !== 'ENVMAN_TOKEN' && key !== 'ENVMAN_SERVER') {
          merged[key] = value
        }
      }
    }
  }
  return merged
}

export async function cmdPmStop(args: string[]): Promise<void> {
  const idOrName = args[0]
  if (!idOrName) {
    console.error("Usage: envman pm stop <name>")
    process.exit(1)
  }
  const client = new DaemonClient()
  const res = await client.post<OneResponse>(`/v1/process/${encodeURIComponent(idOrName)}/stop`, {})
  console.log(`Stopped "${res.process.name}"`)
}

export async function cmdPmRestart(args: string[]): Promise<void> {
  const idOrName = args[0]
  if (!idOrName) {
    console.error("Usage: envman pm restart <name>")
    process.exit(1)
  }
  const client = new DaemonClient()
  const res = await client.post<OneResponse>(`/v1/process/${encodeURIComponent(idOrName)}/restart`, {})
  const p = res.process
  console.log(`Restarted "${p.name}" (PID ${p.pid}, status=${p.status})`)
}

export async function cmdPmReset(args: string[]): Promise<void> {
  const idOrName = args[0]
  if (!idOrName) {
    console.error("Usage: envman pm reset <name>")
    process.exit(1)
  }
  const client = new DaemonClient()
  const res = await client.post<OneResponse>(`/v1/process/${encodeURIComponent(idOrName)}/reset`, {})
  console.log(`Reset "${res.process.name}" (status=${res.process.status})`)
}

export async function cmdPmDelete(args: string[]): Promise<void> {
  const idOrName = args[0]
  if (!idOrName) {
    console.error("Usage: envman pm delete <name>")
    process.exit(1)
  }
  const client = new DaemonClient()
  await client.delete(`/v1/process/${encodeURIComponent(idOrName)}`)
  console.log(`Removed "${idOrName}"`)
}

export async function cmdPmList(): Promise<void> {
  const client = new DaemonClient()
  const res = await client.get<ListResponse>('/v1/process')
  printTable(res.processes)
}

export async function cmdPmSync(args: string[]): Promise<void> {
  const name = args.find(a => !a.startsWith('-'))
  const dryRun = args.includes('--dry-run')
  const client = new DaemonClient({ timeoutMs: 30_000 })  // sync bisa lambat
  const res = await client.post<{
    ok: true
    checked: number
    updated: string[]
    unchanged: string[]
    failed: { name: string; error: string }[]
  }>('/v1/sync', { name, dryRun })

  console.log(`Checked ${res.checked} process(es)${dryRun ? ' (dry-run)' : ''}`)
  if (res.updated.length > 0) {
    console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${res.updated.join(', ')}`)
  }
  if (res.unchanged.length > 0) {
    console.log(`  Unchanged: ${res.unchanged.join(', ')}`)
  }
  if (res.failed.length > 0) {
    console.error(`  Failed:`)
    for (const f of res.failed) console.error(`    ${f.name}: ${f.error}`)
  }
}

export async function cmdPmSave(): Promise<void> {
  const client = new DaemonClient()
  const res = await client.post<{ ok: true; saved: boolean; count: number }>('/v1/state/save', {})
  console.log(`Saved ${res.count} processes`)
}

export async function cmdPmLogs(args: string[]): Promise<void> {
  // Parse: envman pm logs <name> [-f|--follow] [-n|--lines N] [--err|--out]
  let target = ''
  let follow = false
  let lines = 100
  let streamFilter: 'out' | 'err' | 'both' = 'both'
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '-f' || a === '--follow') { follow = true; i++ }
    else if (a === '-n' || a === '--lines') {
      lines = parseInt(args[i + 1] ?? '100', 10)
      if (!Number.isFinite(lines) || lines < 0) { console.error('Invalid --lines'); process.exit(1) }
      i += 2
    }
    else if (a === '--out') { streamFilter = 'out'; i++ }
    else if (a === '--err') { streamFilter = 'err'; i++ }
    else if (a.startsWith('-')) { console.error(`Unknown flag: ${a}`); process.exit(1) }
    else { target = a; i++ }
  }
  if (!target) {
    console.error("Usage: envman pm logs <name> [-f] [-n 100] [--out|--err]")
    process.exit(1)
  }

  const client = new DaemonClient()

  // Snapshot tail dulu
  if (lines > 0) {
    const res = await client.get<{ ok: true; out: string[]; err: string[] }>(
      `/v1/process/${encodeURIComponent(target)}/logs/tail`,
    )
    if (streamFilter !== 'err') {
      for (const line of res.out) console.log(line)
    }
    if (streamFilter !== 'out') {
      for (const line of res.err) console.error(line)
    }
  }

  if (!follow) return

  // SSE stream — pakai fetch manual karena DaemonClient pakai JSON parse
  await streamLogs(target, streamFilter)
}

async function streamLogs(target: string, streamFilter: 'out' | 'err' | 'both'): Promise<void> {
  const { paths } = await import('../shared/paths')
  const { readFileSync } = await import('fs')
  const { AUTH_HEADER } = await import('../shared/token')
  const p = paths()
  const token = readFileSync(p.token, 'utf8').trim()

  // Setup abort untuk Ctrl+C
  const abort = new AbortController()
  const onSig = () => { abort.abort(); process.exit(0) }
  process.on('SIGINT', onSig)
  process.on('SIGTERM', onSig)

  const url = `http://localhost/v1/process/${encodeURIComponent(target)}/logs/stream`
  const res = await fetch(url, {
    unix: p.socket,
    headers: { [AUTH_HEADER]: token },
    signal: abort.signal,
  })

  if (!res.ok || !res.body) {
    console.error(`Stream failed: HTTP ${res.status}`)
    process.exit(1)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      // Parse SSE — events terpisah dengan \n\n
      let idx
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const ev = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        for (const line of ev.split('\n')) {
          if (line.startsWith(': ')) continue  // keep-alive ping
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.stream === 'out' && streamFilter !== 'err') console.log(data.line)
              else if (data.stream === 'err' && streamFilter !== 'out') console.error(data.line)
            } catch {
              // ignore parse error
            }
          }
        }
      }
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      console.error(`Stream error: ${e.message}`)
      process.exit(1)
    }
  }
}

export async function cmdPmDescribe(args: string[]): Promise<void> {
  const idOrName = args[0]
  if (!idOrName) {
    console.error("Usage: envman pm describe <name>")
    process.exit(1)
  }
  const client = new DaemonClient()
  const res = await client.get<OneResponse>(`/v1/process/${encodeURIComponent(idOrName)}`)
  const p = res.process
  console.log(`Name      : ${p.name}`)
  console.log(`ID        : ${p.id}`)
  console.log(`Status    : ${p.status}`)
  console.log(`PID       : ${p.pid ?? '-'}`)
  console.log(`Uptime    : ${formatUptime(p.uptimeMs)}`)
  console.log(`Restarts  : ${p.restartCount}`)
  console.log(`Command   : ${p.command.join(' ')}`)
  console.log(`CWD       : ${p.cwd}`)
  console.log(`Started   : ${p.startedAt ? new Date(p.startedAt).toISOString() : '-'}`)
  console.log(`Last exit : ${p.lastExitCode ?? '-'}`)
  if (p.lastError) console.log(`Last error: ${p.lastError}`)
}

export async function cmdPm(args: string[]): Promise<void> {
  const sub = args[0]
  try {
    switch (sub) {
      case 'start':    await cmdPmStart(args.slice(1)); return
      case 'stop':     await cmdPmStop(args.slice(1)); return
      case 'restart':  await cmdPmRestart(args.slice(1)); return
      case 'reset':    await cmdPmReset(args.slice(1)); return
      case 'delete':
      case 'rm':       await cmdPmDelete(args.slice(1)); return
      case 'ls':
      case 'list':     await cmdPmList(); return
      case 'describe':
      case 'show':     await cmdPmDescribe(args.slice(1)); return
      case 'logs':     await cmdPmLogs(args.slice(1)); return
      case 'save':     await cmdPmSave(); return
      case 'sync':     await cmdPmSync(args.slice(1)); return
      case undefined:
      case '--help':
      case '-h':
        console.log('Usage:')
        console.log('  envman pm start --name <n> -- <cmd> [arg...]   Start a new managed process')
        console.log('  envman pm ls                                    List all managed processes')
        console.log('  envman pm describe <name>                       Show process detail')
        console.log('  envman pm logs <name> [-f] [-n N] [--out|--err]  Tail process logs')
        console.log('  envman pm save                                   Force persist state to disk')
        console.log('  envman pm sync [name] [--dry-run]                Re-fetch env from server + restart changed')
        console.log('  envman pm stop <name>                           Stop a process')
        console.log('  envman pm restart <name>                        Restart a process')
        console.log('  envman pm reset <name>                          Reset quarantined process')
        console.log('  envman pm delete <name>                         Stop + remove from management')
        console.log('')
        console.log('Options for start:')
        console.log('  --name, -n <name>     Process name (required, unique, alphanumeric/-_)')
        console.log('  --cwd <path>          Working directory')
        console.log('  -e KEY=VAL            Static env var (repeatable)')
        return
      default:
        console.error(`Unknown pm subcommand: ${sub}`)
        console.error("Run 'envman pm --help' for usage")
        process.exit(1)
    }
  } catch (e: any) {
    if (e instanceof DaemonNotRunningError) {
      console.error(e.message)
      process.exit(1)
    }
    console.error(`Error: ${e.message}`)
    process.exit(1)
  }
}
