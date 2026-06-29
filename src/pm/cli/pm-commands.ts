// CLI: `envman pm <subcommand>` — process management.

import { DaemonClient, DaemonNotRunningError } from './client'
import { cmdPmDescribe, cmdPmList } from './pm-display'
import { cmdPmDelete, cmdPmReset, cmdPmRestart, cmdPmStart, cmdPmStop } from './pm-lifecycle'

export { cmdPmList, cmdPmDescribe }

export async function cmdPmSave(): Promise<void> {
  const client = new DaemonClient()
  const res = await client.post<{ ok: true; saved: boolean; count: number }>('/v1/state/save', {})
  console.log(`Saved ${res.count} processes`)
}

export async function cmdPmSync(args: string[]): Promise<void> {
  const name = args.find((a) => !a.startsWith('-'))
  const dryRun = args.includes('--dry-run')
  const client = new DaemonClient({ timeoutMs: 30_000 })
  const res = await client.post<{
    ok: true
    checked: number
    updated: string[]
    unchanged: string[]
    failed: { name: string; error: string }[]
  }>('/v1/sync', { name, dryRun })

  console.log(`Checked ${res.checked} process(es)${dryRun ? ' (dry-run)' : ''}`)
  if (res.updated.length > 0) console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${res.updated.join(', ')}`)
  if (res.unchanged.length > 0) console.log(`  Unchanged: ${res.unchanged.join(', ')}`)
  if (res.failed.length > 0) {
    console.error('  Failed:')
    for (const f of res.failed) console.error(`    ${f.name}: ${f.error}`)
  }
}

export async function cmdPmLogs(args: string[]): Promise<void> {
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
    } else if (a === '--out') { streamFilter = 'out'; i++ }
    else if (a === '--err') { streamFilter = 'err'; i++ }
    else if (a.startsWith('-')) { console.error(`Unknown flag: ${a}`); process.exit(1) }
    else { target = a; i++ }
  }
  if (!target) {
    console.error('Usage: envman pm logs <name> [-f] [-n 100] [--out|--err]')
    process.exit(1)
  }

  const client = new DaemonClient()
  if (lines > 0) {
    const res = await client.get<{ ok: true; out: string[]; err: string[] }>(
      `/v1/process/${encodeURIComponent(target)}/logs/tail`,
    )
    if (streamFilter !== 'err') for (const line of res.out) console.log(line)
    if (streamFilter !== 'out') for (const line of res.err) console.error(line)
  }

  if (!follow) return
  await streamLogs(target, streamFilter)
}

async function streamLogs(target: string, streamFilter: 'out' | 'err' | 'both'): Promise<void> {
  const { paths } = await import('../shared/paths')
  const { readFileSync } = await import('node:fs')
  const { AUTH_HEADER } = await import('../shared/token')
  const p = paths()
  const token = readFileSync(p.token, 'utf8').trim()

  const abort = new AbortController()
  const onSig = () => { abort.abort(); process.exit(0) }
  process.on('SIGINT', onSig)
  process.on('SIGTERM', onSig)

  const url = `http://localhost/v1/process/${encodeURIComponent(target)}/logs/stream`
  const res = await fetch(url, { unix: p.socket, headers: { [AUTH_HEADER]: token }, signal: abort.signal })

  if (!res.ok || !res.body) { console.error(`Stream failed: HTTP ${res.status}`); process.exit(1) }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx: number = buf.indexOf('\n\n')
      while (idx !== -1) {
        const ev = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        idx = buf.indexOf('\n\n')
        for (const line of ev.split('\n')) {
          if (line.startsWith(': ')) continue
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.stream === 'out' && streamFilter !== 'err') console.log(data.line)
              else if (data.stream === 'err' && streamFilter !== 'out') console.error(data.line)
            } catch {
              // ignore malformed SSE frame
            }
          }
        }
      }
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') { console.error(`Stream error: ${e.message}`); process.exit(1) }
  }
}

export async function cmdPm(args: string[]): Promise<void> {
  const sub = args[0]
  try {
    switch (sub) {
      case 'daemon': {
        const { cmdDaemon } = await import('./daemon-control')
        await cmdDaemon(args.slice(1))
        return
      }
      case 'start': await cmdPmStart(args.slice(1)); return
      case 'stop': await cmdPmStop(args.slice(1)); return
      case 'restart': await cmdPmRestart(args.slice(1)); return
      case 'reset': await cmdPmReset(args.slice(1)); return
      case 'delete':
      case 'rm': await cmdPmDelete(args.slice(1)); return
      case 'ls':
      case 'list': await cmdPmList(); return
      case 'describe':
      case 'show': await cmdPmDescribe(args.slice(1)); return
      case 'logs': await cmdPmLogs(args.slice(1)); return
      case 'save': await cmdPmSave(); return
      case 'sync': await cmdPmSync(args.slice(1)); return
      case undefined:
      case '--help':
      case '-h':
        console.log('Usage:')
        console.log('  envman pm daemon <start|stop|status>            Manage the pm daemon')
        console.log('')
        console.log('  envman pm start "<cmd>" --name <n>              Start (PM2 style)')
        console.log('  envman pm start --name <n> -- <cmd> [args]      Start (envman style)')
        console.log('  envman pm ls                                     List all managed processes')
        console.log('  envman pm describe <name>                        Show process detail')
        console.log('  envman pm logs <name> [-f] [-n N] [--out|--err] Tail process logs')
        console.log('  envman pm save                                   Force persist state to disk')
        console.log('  envman pm sync [name] [--dry-run]               Re-fetch env from server + restart changed')
        console.log('  envman pm stop <name>                            Stop a process')
        console.log('  envman pm restart <name>                         Restart a process')
        console.log('  envman pm reset <name>                           Reset quarantined process')
        console.log('  envman pm delete <name>                          Stop + remove from management')
        return
      default:
        console.error(`Unknown pm subcommand: ${sub}`)
        console.error("Run 'envman pm --help' for usage")
        process.exit(1)
    }
  } catch (e: any) {
    if (e instanceof DaemonNotRunningError) { console.error(e.message); process.exit(1) }
    console.error(`Error: ${e.message}`)
    process.exit(1)
  }
}
