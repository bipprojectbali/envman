// EnvSyncer — fetch env dari sources (envman server atau file), compute diff,
// trigger restart untuk process yang env-nya berubah.
//
// Bug yang dimitigasi:
//   E2 ✓ Server unreachable → retry di EnvmanServerClient; di sini: tidak
//        restart proses kalau fetch gagal. Tetap jalan dengan env lama.
//   E5 ✓ Restart via ProcessContainer state machine — locked per container
//   E6 ✓ Hash canonical (lihat env-resolver.ts hashEnv) avoid key-order false diff

import { existsSync, readFileSync } from 'node:fs'
import type { EnvmanServerClient } from './envman-client'
import { ServerAuthError, ServerUnreachableError } from './envman-client'
import { log } from './logger'
import type { EnvSource, ProcessContainer } from './process-container'

export type { EnvSource }

/**
 * Resolve list sources ke merged env map.
 * Order = later overrides earlier (sama dengan CLI behavior).
 */
export async function resolveEnvSources(
  sources: EnvSource[],
  client: EnvmanServerClient,
): Promise<Record<string, string>> {
  const merged: Record<string, string> = {}
  for (const src of sources) {
    if (src.type === 'envman') {
      const [projectSlug, envName] = src.ref.split(':')
      if (!projectSlug || !envName) {
        log.warn('invalid envman source ref', { ref: src.ref })
        continue
      }
      const data = await client.fetchProjectEnv(projectSlug, envName)
      Object.assign(merged, data.vars)
    } else if (src.type === 'file') {
      const vars = parseEnvFile(src.ref)
      // Strip ENVMAN_TOKEN/SERVER kalau accidentally ada di .env
      delete vars.ENVMAN_TOKEN
      delete vars.ENVMAN_SERVER
      Object.assign(merged, vars)
    }
  }
  return merged
}

/**
 * Parse .env file → key/value map. Format compatible with cli.ts parseEnvFile.
 */
function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {}
  const content = readFileSync(filePath, 'utf8')
  const result: Record<string, string> = {}
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // Strip optional `export ` prefix
    if (key.startsWith('export ')) key = key.slice(7).trim()
    // Strip matching quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

export interface SyncOptions {
  /** Hanya proses dengan envSources non-empty yang di-sync */
  containers: ProcessContainer[]
  client: EnvmanServerClient
  /** Kalau true: tidak restart, hanya report apa yang akan berubah */
  dryRun?: boolean
}

export interface SyncResult {
  checked: number
  updated: string[] // names of restarted processes
  unchanged: string[]
  failed: { name: string; error: string }[]
}

/**
 * Sync semua container dengan envSources non-empty. Compute new env hash,
 * compare dengan envHash existing, restart kalau berbeda.
 */
export async function syncContainers(opts: SyncOptions): Promise<SyncResult> {
  const result: SyncResult = {
    checked: 0,
    updated: [],
    unchanged: [],
    failed: [],
  }

  for (const c of opts.containers) {
    const sources = c.config.envSources ?? []
    if (sources.length === 0) continue
    result.checked++

    try {
      const newEnv = await resolveEnvSources(sources, opts.client)
      const changed = c.updateEnvmanEnv(newEnv)
      if (!changed) {
        result.unchanged.push(c.config.name)
        continue
      }

      if (opts.dryRun) {
        result.updated.push(c.config.name)
        continue
      }

      log.info('env changed, restarting', { name: c.config.name })
      await c.restart()
      result.updated.push(c.config.name)
    } catch (e: any) {
      if (e instanceof ServerAuthError) {
        log.warn('sync aborted: token invalid')
        // Re-throw — caller should stop syncing all processes
        throw e
      }
      if (e instanceof ServerUnreachableError) {
        // Soft fail per container — tidak restart, log warning
        result.failed.push({ name: c.config.name, error: e.message })
        continue
      }
      result.failed.push({ name: c.config.name, error: e.message ?? String(e) })
    }
  }

  return result
}
