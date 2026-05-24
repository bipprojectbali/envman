// DaemonClient — HTTP-over-unix-socket client untuk CLI.
//
// Bug yang dimitigasi:
//   I2: timeout per request (CLI tidak hang kalau daemon stuck)
//   I3: structured error mapping dari daemon JSON
//   D6: pakai token dari ~/.config/envman/daemon.token

import { existsSync, readFileSync } from 'fs'
import { paths } from '../shared/paths'
import { AUTH_HEADER } from '../shared/token'
import type { ApiError } from '../shared/types'

export class DaemonNotRunningError extends Error {
  constructor() {
    super('Daemon is not running. Start with: envman pm daemon start')
  }
}

export class DaemonAuthError extends Error {
  constructor() {
    super('Daemon auth failed. Token may have been regenerated — try restarting daemon.')
  }
}

export class DaemonApiError extends Error {
  constructor(public code: string, public httpStatus: number, message: string) {
    super(message)
  }
}

export interface ClientOptions {
  timeoutMs?: number       // default 5000
  socketPath?: string      // override untuk testing
  tokenPath?: string       // override path untuk read token (untuk testing isolation)
  tokenOverride?: string   // langsung kasih token (untuk testing invalid auth)
}

export class DaemonClient {
  private readonly socketPath: string
  private readonly token: string
  private readonly timeoutMs: number

  constructor(opts: ClientOptions = {}) {
    const p = paths()
    this.socketPath = opts.socketPath ?? p.socket
    this.timeoutMs = opts.timeoutMs ?? 5000

    if (opts.tokenOverride !== undefined) {
      this.token = opts.tokenOverride
    } else {
      const tokenPath = opts.tokenPath ?? p.token
      // Token harus sudah ada — daemon yang generate. Kalau tidak ada,
      // berarti daemon belum pernah jalan / token file terhapus manual.
      if (!existsSync(tokenPath)) {
        throw new DaemonNotRunningError()
      }
      this.token = readFileSync(tokenPath, 'utf8').trim()
    }
  }

  /**
   * Cek apakah socket file ada — quick check sebelum coba connect.
   */
  isAvailable(): boolean {
    return existsSync(this.socketPath)
  }

  async request<T = any>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.isAvailable()) {
      throw new DaemonNotRunningError()
    }

    const url = `http://localhost${path}`
    const init: RequestInit = {
      method,
      headers: {
        [AUTH_HEADER]: this.token,
        'content-type': 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    }
    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
      init.body = JSON.stringify(body)
    }

    let res: Response
    try {
      res = await fetch(url, { ...init, unix: this.socketPath })
    } catch (e: any) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new Error(`Daemon request timed out after ${this.timeoutMs}ms`)
      }
      if (e.code === 'ECONNREFUSED' || e.code === 'ENOENT') {
        throw new DaemonNotRunningError()
      }
      throw new Error(`Daemon request failed: ${e.message}`)
    }

    let data: any
    try {
      data = await res.json()
    } catch {
      throw new Error(`Daemon returned non-JSON response (status ${res.status})`)
    }

    if (data?.ok === false) {
      const err = data as ApiError
      if (err.code === 'INVALID_AUTH') throw new DaemonAuthError()
      throw new DaemonApiError(err.code, res.status, err.error)
    }

    if (!res.ok) {
      throw new DaemonApiError('HTTP_ERROR', res.status, `HTTP ${res.status}`)
    }

    return data as T
  }

  get<T = any>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }
  post<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }
  delete<T = any>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }
}
