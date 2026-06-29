import type { EnvSource } from '../daemon/process-container'
import { DaemonClient } from './client'
import { printStartUsage } from './pm-display'

interface OneResponse {
  ok: true
  process: { name: string; pid?: number | null; status: string }
}

const FLAGS_WITH_VALUE = new Set(['--name', '-n', '--cwd', '-e', '-s', '--source'])

async function resolveSourcesCli(sources: EnvSource[]): Promise<Record<string, string>> {
  const { paths } = await import('../shared/paths')
  const { readFileSync, existsSync } = await import('node:fs')
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
      const data = (await res.json()) as { vars: Record<string, string> }
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

export async function cmdPmStart(args: string[]): Promise<void> {
  let name = ''
  let cwd: string | undefined
  const staticEnv: Record<string, string> = {}
  const envSources: EnvSource[] = []
  let i = 0
  const command: string[] = []
  let flagArgs: string[]

  const sepIdx = args.indexOf('--')
  if (sepIdx !== -1) {
    flagArgs = args.slice(0, sepIdx)
    command.push(...args.slice(sepIdx + 1))
  } else {
    let positionalIdx = -1
    let j = 0
    while (j < args.length) {
      const a = args[j]
      if (a.startsWith('-')) {
        if (FLAGS_WITH_VALUE.has(a)) j += 2
        else j++
      } else {
        positionalIdx = j
        break
      }
    }
    if (positionalIdx === -1) {
      printStartUsage('No command provided')
      process.exit(1)
    }
    const cmdStr = args[positionalIdx]
    if (!cmdStr.trim()) {
      printStartUsage('Empty command string')
      process.exit(1)
    }
    command.push(...cmdStr.split(/\s+/).filter(Boolean))
    flagArgs = args.filter((_, idx) => idx !== positionalIdx)
  }

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
      if (!src) {
        console.error('-s requires a value')
        process.exit(1)
      }
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

  if (!name) { printStartUsage('--name is required'); process.exit(1) }
  if (command.length === 0) { printStartUsage('Empty command'); process.exit(1) }

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
  const res = await client.post<OneResponse>('/v1/process/start', { name, command, cwd, staticEnv, envmanEnv, envSources })
  const p = res.process
  console.log(`Started "${p.name}" (PID ${p.pid}, status=${p.status})`)
  if (envSources.length > 0) {
    console.log(`  Env sources: ${envSources.map((s) => s.ref).join(', ')}`)
    console.log(`  Use 'envman pm sync ${name}' to re-fetch env from server`)
  }
}

export async function cmdPmStop(args: string[]): Promise<void> {
  const idOrName = args[0]
  if (!idOrName) { console.error('Usage: envman pm stop <name>'); process.exit(1) }
  const client = new DaemonClient()
  const res = await client.post<OneResponse>(`/v1/process/${encodeURIComponent(idOrName)}/stop`, {})
  console.log(`Stopped "${res.process.name}"`)
}

export async function cmdPmRestart(args: string[]): Promise<void> {
  const idOrName = args[0]
  if (!idOrName) { console.error('Usage: envman pm restart <name>'); process.exit(1) }
  const client = new DaemonClient()
  const res = await client.post<OneResponse>(`/v1/process/${encodeURIComponent(idOrName)}/restart`, {})
  const p = res.process
  console.log(`Restarted "${p.name}" (PID ${p.pid}, status=${p.status})`)
}

export async function cmdPmReset(args: string[]): Promise<void> {
  const idOrName = args[0]
  if (!idOrName) { console.error('Usage: envman pm reset <name>'); process.exit(1) }
  const client = new DaemonClient()
  const res = await client.post<OneResponse>(`/v1/process/${encodeURIComponent(idOrName)}/reset`, {})
  console.log(`Reset "${res.process.name}" (status=${res.process.status})`)
}

export async function cmdPmDelete(args: string[]): Promise<void> {
  const idOrName = args[0]
  if (!idOrName) { console.error('Usage: envman pm delete <name>'); process.exit(1) }
  const client = new DaemonClient()
  await client.delete(`/v1/process/${encodeURIComponent(idOrName)}`)
  console.log(`Removed "${idOrName}"`)
}
