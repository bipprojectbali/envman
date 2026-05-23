// EnvmanServerClient — HTTP client dari daemon ke envman server.
//
// Bug yang dimitigasi:
//   E1 ✓ Token expired → tandai tokenInvalid, broadcast event, jangan ganggu proses jalan
//   E2 ✓ Server unreachable → retry exponential, fallback graceful
//   E4 ✓ Semua HTTP call pakai AbortSignal.timeout, async non-blocking

import { existsSync, readFileSync } from 'fs'
import { log } from './logger'
import { paths } from '../shared/paths'

export interface ServerConfig {
  server: string  // base URL, e.g. "https://envman.example.com"
  token: string   // API token
}

export class ServerNotConfiguredError extends Error {
  constructor() {
    super('envman server config not found. Run `envman login` first.')
  }
}

export class ServerUnreachableError extends Error {
  constructor(public readonly cause: string) {
    super(`envman server unreachable: ${cause}`)
  }
}

export class ServerAuthError extends Error {
  constructor() {
    super('envman server auth failed (401). Token may be expired/revoked.')
  }
}

export interface EnvVar {
  key: string
  value: string
  isSecret: boolean
}

export interface EnvSourceData {
  vars: Record<string, string>  // resolved KEY=VALUE
}

export interface AliasResolveData {
  args: string  // raw alias args string, mis. "-e myapp:dev -- bun index.js"
  project: { slug: string; name: string }
  alias: { name: string; description: string | null; tags: string[] }
}

/**
 * Read server config dari ~/.config/envman/config.json (saved by `envman login`).
 * Throws ServerNotConfiguredError kalau file tidak ada atau invalid.
 */
export function readServerConfig(configPath?: string): ServerConfig {
  const path = configPath ?? paths().config
  if (!existsSync(path)) throw new ServerNotConfiguredError()
  try {
    const content = readFileSync(path, 'utf8')
    const data = JSON.parse(content)
    if (!data.server || !data.token) throw new ServerNotConfiguredError()
    return { server: data.server.replace(/\/$/, ''), token: data.token }
  } catch (e: any) {
    if (e instanceof ServerNotConfiguredError) throw e
    throw new ServerNotConfiguredError()
  }
}

export interface ClientOptions {
  config?: ServerConfig
  timeoutMs?: number      // default 10_000
  maxRetries?: number     // default 3
}

export class EnvmanServerClient {
  private readonly config: ServerConfig
  private readonly timeoutMs: number
  private readonly maxRetries: number
  /** Flag dipakai untuk skip operations setelah 401 sampai user refresh token */
  public tokenInvalid = false

  constructor(opts: ClientOptions = {}) {
    this.config = opts.config ?? readServerConfig()
    this.timeoutMs = opts.timeoutMs ?? 10_000
    this.maxRetries = opts.maxRetries ?? 3
  }

  /**
   * Fetch resolved env untuk project:env source.
   * Returns map KEY=VALUE dengan secret sudah di-decrypt server-side.
   */
  async fetchProjectEnv(projectSlug: string, envName: string): Promise<EnvSourceData> {
    if (this.tokenInvalid) throw new ServerAuthError()
    const path = `/api/envman/projects/${encodeURIComponent(projectSlug)}/environments/${encodeURIComponent(envName)}/vars/export`
    const data = await this.request<{ vars: Record<string, string> }>('GET', path)
    return { vars: data.vars ?? {} }
  }

  /**
   * Resolve alias ke command line args.
   */
  async resolveAlias(ref: string): Promise<AliasResolveData> {
    if (this.tokenInvalid) throw new ServerAuthError()
    const path = `/api/envman/aliases/resolve/${encodeURIComponent(ref)}`
    return await this.request<AliasResolveData>('GET', path)
  }

  /**
   * Post audit event ke server (Phase 5 — endpoint baru di server).
   * Fire-and-forget — kegagalan tidak menghentikan proses lifecycle.
   */
  async postAudit(event: {
    action: string
    detail?: string
    processName?: string
    processId?: string
  }): Promise<void> {
    if (this.tokenInvalid) return  // skip silently kalau token mati
    try {
      await this.request<{ ok: true }>('POST', '/api/envman/pm/audit', event)
    } catch (e: any) {
      // Tidak throw — audit failure shouldn't break process management
      log.warn('audit post failed', { action: event.action, error: e.message })
    }
  }

  /**
   * Internal: HTTP request dengan retry exponential.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.server}${path}`
    let lastError: Error | null = null
    let delayMs = 1000

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'authorization': `Bearer ${this.config.token}`,
            'content-type': 'application/json',
            'user-agent': 'envman-pm-daemon',
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        })

        if (res.status === 401) {
          this.tokenInvalid = true
          throw new ServerAuthError()
        }

        if (!res.ok) {
          let errText = `HTTP ${res.status}`
          try {
            const errBody = await res.json() as any
            if (errBody.error) errText = `${errText}: ${errBody.error}`
          } catch {}
          // 4xx (kecuali 401) tidak di-retry — itu request error
          if (res.status >= 400 && res.status < 500) {
            throw new Error(errText)
          }
          // 5xx — retry-able
          throw new Error(errText)
        }

        return await res.json() as T
      } catch (e: any) {
        if (e instanceof ServerAuthError) throw e
        lastError = e
        const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError'
        const isNetErr = e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'ETIMEDOUT'

        if (attempt < this.maxRetries && (isTimeout || isNetErr || e.message.startsWith('HTTP 5'))) {
          log.warn('envman server retry', { attempt, delayMs, error: e.message })
          await new Promise(r => setTimeout(r, delayMs))
          delayMs = Math.min(delayMs * 2, 8000)
          continue
        }
        break
      }
    }

    if (lastError) {
      throw new ServerUnreachableError(lastError.message)
    }
    throw new Error('exhausted retries')
  }
}
