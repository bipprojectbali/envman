// Non-exiting API client. Variant of CLI's apiFetch — but never calls process.exit.
// Bug A1 mitigation: 401 must not kill the MCP server process.

import { HTTP_TIMEOUT_READ_MS, HTTP_TIMEOUT_WRITE_MS } from './constants'
import { mapHttpError, NetworkError } from './errors'

export interface Config {
  server: string
  token: string
}

export interface ApiCallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  /** Resource label for error messages (e.g. "Project 'myapp'") */
  resource?: string
  /** Hint to include in 404 message (e.g. "Use projects_list to see available slugs.") */
  notFoundHint?: string
}

/**
 * Call envman server HTTP API. Throws typed errors on failure.
 *
 * Differences from src/cli.ts apiFetch:
 * - Never calls process.exit() — throws instead
 * - Configurable timeout (default 15s read, 30s write)
 * - Typed error mapping per HTTP status
 * - Catches AbortError + TypeError (network) separately
 */
export async function apiCall<T = unknown>(cfg: Config, path: string, opts: ApiCallOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const isWrite = method !== 'GET'
  const timeoutMs = opts.timeoutMs ?? (isWrite ? HTTP_TIMEOUT_WRITE_MS : HTTP_TIMEOUT_READ_MS)
  const url = `${cfg.server.replace(/\/$/, '')}${path}`

  const headers: Record<string, string> = {
    authorization: `Bearer ${cfg.token}`,
    accept: 'application/json',
  }
  let bodyStr: string | undefined
  if (opts.body !== undefined) {
    bodyStr = JSON.stringify(opts.body)
    headers['content-type'] = 'application/json'
  }

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new NetworkError(`${cfg.server} (timed out after ${timeoutMs}ms)`)
      }
      if (e.name === 'TypeError') {
        throw new NetworkError(cfg.server)
      }
    }
    throw e
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw mapHttpError(res.status, body, opts.resource, opts.notFoundHint)
  }

  // Some endpoints (DELETE) return empty body
  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Invalid JSON response from ${url}`)
  }
}
