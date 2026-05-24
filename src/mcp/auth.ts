// Auth resolution for MCP server.
// Reuses CLI's resolveAuth chain (local env → process.env → config.json)
// but does NOT call process.exit on missing — throws instead.

import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { apiCall, type Config } from './api-client'
import { WHOAMI_CACHE_TTL_MS } from './constants'
import { AuthError } from './errors'

const CONFIG_FILE = join(homedir(), '.config', 'envman', 'config.json')

export interface WhoamiResult {
  user: { id: string; name: string; email: string; role: string }
  tokenName?: string
  canWrite: boolean
  scopes: string[]
}

export class MissingAuthError extends Error {
  constructor() {
    super(
      'No envman credentials found. Either:\n' +
      '  1. Run `envman login <server-url> --token <token>`, or\n' +
      '  2. Set ENVMAN_SERVER + ENVMAN_TOKEN environment variables.',
    )
  }
}

/**
 * Resolve auth from (in priority order):
 *   1. process.env.ENVMAN_SERVER + process.env.ENVMAN_TOKEN
 *   2. ~/.config/envman/config.json
 *
 * Throws MissingAuthError if neither source has both values.
 *
 * Note: unlike CLI's resolveAuth, this does NOT support per-call -e file
 * sources — MCP server is long-lived, config baked at startup.
 */
export function resolveMcpAuth(): Config {
  if (process.env.ENVMAN_SERVER && process.env.ENVMAN_TOKEN) {
    return { server: process.env.ENVMAN_SERVER, token: process.env.ENVMAN_TOKEN }
  }
  if (existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Partial<Config>
      if (cfg.server && cfg.token) return { server: cfg.server, token: cfg.token }
    } catch {
      // fall through
    }
  }
  throw new MissingAuthError()
}

// ─── whoami cache ─────────────────────────────────────────────────────────────

let whoamiCache: { value: WhoamiResult; expiresAt: number } | null = null

export async function fetchWhoami(cfg: Config): Promise<WhoamiResult> {
  const now = Date.now()
  if (whoamiCache && whoamiCache.expiresAt > now) return whoamiCache.value
  try {
    const result = await apiCall<WhoamiResult>(cfg, '/api/envman/whoami', { resource: 'whoami' })
    whoamiCache = { value: result, expiresAt: now + WHOAMI_CACHE_TTL_MS }
    return result
  } catch (e) {
    if (e instanceof AuthError) whoamiCache = null
    throw e
  }
}

export function invalidateWhoamiCache(): void {
  whoamiCache = null
}
