import type { ProcessSnapshot } from '../daemon/process-container'
import { DaemonClient } from './client'

interface ListResponse {
  ok: true
  processes: ProcessSnapshot[]
}

interface OneResponse {
  ok: true
  process: ProcessSnapshot
}

export function formatUptime(ms: number): string {
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

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    online: '\x1b[32m',
    starting: '\x1b[33m',
    stopping: '\x1b[33m',
    stopped: '\x1b[90m',
    errored: '\x1b[31m',
    quarantined: '\x1b[35m',
  }
  const reset = '\x1b[0m'
  return `${colors[status] ?? ''}${status}${reset}`
}

export function printTable(processes: ProcessSnapshot[]): void {
  if (processes.length === 0) {
    console.log('No processes managed. Start one with:')
    console.log('  envman pm start "<cmd>" --name <name>          (PM2 style)')
    console.log('  envman pm start --name <name> -- <cmd>         (envman style)')
    console.log('Examples:')
    console.log('  envman pm start "bun index.js" --name api')
    console.log('  envman pm start --name worker -s myapp:prod -- node worker.js')
    return
  }

  const headers = ['NAME', 'PID', 'STATUS', 'UPTIME', 'RESTARTS', 'COMMAND']
  const rows = processes.map((p) => [
    p.name,
    p.pid?.toString() ?? '-',
    p.status,
    formatUptime(p.uptimeMs),
    p.restartCount.toString(),
    p.command.join(' ').slice(0, 60),
  ])

  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const sep = '  '
  console.log(headers.map((h, i) => h.padEnd(widths[i])).join(sep))
  console.log(widths.map((w) => '─'.repeat(w)).join(sep))
  for (const row of rows) {
    const cells = row.map((cell, i) => {
      if (i === 2) {
        const padded = cell.padEnd(widths[i])
        return statusColor(cell) + padded.slice(cell.length)
      }
      return cell.padEnd(widths[i])
    })
    console.log(cells.join(sep))
  }
}

export function printStartUsage(reason?: string): void {
  if (reason) {
    console.error(reason)
    console.error('')
  }
  console.error('Usage:')
  console.error('  envman pm start "<cmd args>" --name <n> [flags]       (PM2-style)')
  console.error('  envman pm start --name <n> [flags] -- <cmd> [args]    (envman-style)')
  console.error('')
  console.error('Flags:')
  console.error('  --name, -n <name>     Process name (required, unique, alphanumeric + - _)')
  console.error('  --cwd <path>          Working directory')
  console.error('  -e KEY=VAL            Static env var (repeatable)')
  console.error('  -s, --source <ref>    Env source: "project:env" (envman) or path file (repeatable)')
  console.error('')
  console.error('Examples:')
  console.error('  envman pm start "bun index.js" --name api')
  console.error('  envman pm start --name api -- bun index.js')
  console.error('  envman pm start "node server.js --port 3000" --name web --cwd /srv/app')
  console.error('  envman pm start --name worker -s myapp:prod -e LOG=debug -- bun worker.ts')
}

export async function cmdPmList(): Promise<void> {
  const client = new DaemonClient()
  const res = await client.get<ListResponse>('/v1/process')
  printTable(res.processes)
}

export async function cmdPmDescribe(args: string[]): Promise<void> {
  const idOrName = args[0]
  if (!idOrName) {
    console.error('Usage: envman pm describe <name>')
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
