// Server — Bun.serve unix socket wrapper.
//
// Bug yang dimitigasi:
//   D5: stale socket cleanup sebelum bind
//   D6: chmod 0600 segera setelah bind (default 0755 di Bun.serve)
//   I1: header token validation untuk semua request

import { existsSync, unlinkSync, chmodSync } from 'fs'
import { log } from './logger'
import { Router, errorResponse } from './router'
import { AUTH_HEADER, safeEqual } from '../shared/token'

export interface ServerOptions {
  socketPath: string
  token: string
  router: Router
}

export class Server {
  private server: ReturnType<typeof Bun.serve> | null = null
  private inflightRequests = 0
  private draining = false

  constructor(private readonly opts: ServerOptions) {}

  async start(): Promise<void> {
    // Cleanup stale socket — D5
    if (existsSync(this.opts.socketPath)) {
      log.warn('stale socket detected, unlinking', { path: this.opts.socketPath })
      unlinkSync(this.opts.socketPath)
    }

    this.server = Bun.serve({
      unix: this.opts.socketPath,
      fetch: this.handleRequest.bind(this),
      // explicit body limit untuk redundancy dengan router check
      maxRequestBodySize: 2_000_000,
    })

    // chmod 0600 segera — D6
    // Default Bun.serve mode 0755 (terbukti via POC #38)
    chmodSync(this.opts.socketPath, 0o600)
    log.info('daemon listening', { socket: this.opts.socketPath })
  }

  /**
   * Request handler dengan auth middleware.
   */
  private async handleRequest(req: Request): Promise<Response> {
    if (this.draining) {
      return errorResponse('INTERNAL', 'Daemon shutting down', req.headers.get('x-request-id') ?? '')
    }

    // Auth check — header token wajib di setiap request.
    // Sub-path bisa whitelist nanti (mis. /v1/daemon/health), tapi MVP: semua wajib auth.
    const token = req.headers.get(AUTH_HEADER) ?? ''
    if (!safeEqual(token, this.opts.token)) {
      log.warn('auth failed', { remoteAddr: 'unix-socket', path: new URL(req.url).pathname })
      return errorResponse(
        'INVALID_AUTH',
        'Missing or invalid auth token',
        req.headers.get('x-request-id') ?? '',
      )
    }

    this.inflightRequests++
    try {
      return await this.opts.router.dispatch(req)
    } finally {
      this.inflightRequests--
    }
  }

  /**
   * Graceful shutdown — stop accepting new conns, tunggu in-flight selesai,
   * lalu unlink socket file.
   */
  async stop(timeoutMs = 5000): Promise<void> {
    this.draining = true
    log.info('draining requests', { inflight: this.inflightRequests })

    const deadline = Date.now() + timeoutMs
    while (this.inflightRequests > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 50))
    }
    if (this.inflightRequests > 0) {
      log.warn('shutdown timeout, forcing close', { inflight: this.inflightRequests })
    }

    if (this.server) {
      this.server.stop(true)
      this.server = null
    }

    // Cleanup socket file
    try {
      if (existsSync(this.opts.socketPath)) unlinkSync(this.opts.socketPath)
    } catch {
      // ignore
    }
    log.info('server stopped')
  }

  getInflightCount(): number {
    return this.inflightRequests
  }
}
