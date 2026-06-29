// Request router untuk daemon.
//
// Bug yang dimitigasi:
//   I5: body size limit 1MB (cegah OOM dari corrupt JSON)
//   I3: error responses selalu structured JSON (CLI tidak hang on undefined)

import { type ApiError, ERROR_CODES, type ErrorCode } from '../shared/types'
import { log } from './logger'

const MAX_BODY_SIZE = 1_000_000 // 1MB

export type HandlerCtx = {
  requestId: string
  body: any // parsed JSON, atau null kalau GET/DELETE
  signal?: AbortSignal // request abort signal (untuk SSE cleanup)
  url: URL // parsed URL (untuk query params)
}

export type Handler = (ctx: HandlerCtx) => Promise<Response> | Response

interface Route {
  method: string
  pattern: RegExp
  paramNames: string[]
  handler: (ctx: HandlerCtx, params: Record<string, string>) => Promise<Response> | Response
}

export class Router {
  private routes: Route[] = []

  add(
    method: string,
    pattern: string,
    handler: (ctx: HandlerCtx, params: Record<string, string>) => Promise<Response> | Response,
  ): void {
    // Convert "/v1/process/:id/logs" → regex + paramNames
    const paramNames: string[] = []
    const regexSrc = pattern
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) {
          paramNames.push(seg.slice(1))
          return '([^/]+)'
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      })
      .join('/')
    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${regexSrc}$`),
      paramNames,
      handler,
    })
  }

  async dispatch(req: Request): Promise<Response> {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()
    const url = new URL(req.url)
    const path = url.pathname

    const route = this.routes.find((r) => r.method === req.method.toUpperCase() && r.pattern.test(path))
    if (!route) {
      return errorResponse('NOT_FOUND', `No route for ${req.method} ${path}`, requestId)
    }

    const match = route.pattern.exec(path)!
    const params: Record<string, string> = {}
    route.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1] ?? '')
    })

    let body: any = null
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      const contentLength = Number(req.headers.get('content-length') ?? '0')
      if (contentLength > MAX_BODY_SIZE) {
        return errorResponse('PAYLOAD_TOO_LARGE', `Request body exceeds ${MAX_BODY_SIZE} bytes`, requestId)
      }
      try {
        const text = await req.text()
        if (text.length > MAX_BODY_SIZE) {
          return errorResponse('PAYLOAD_TOO_LARGE', `Request body exceeds ${MAX_BODY_SIZE} bytes`, requestId)
        }
        body = text ? JSON.parse(text) : null
      } catch (e: any) {
        return errorResponse('BAD_REQUEST', `Invalid JSON: ${e.message}`, requestId)
      }
    }

    try {
      return await route.handler({ requestId, body, signal: req.signal, url }, params)
    } catch (e: any) {
      log.error('handler threw', { path, error: e.message, stack: e.stack })
      return errorResponse('INTERNAL', e.message ?? 'Internal error', requestId)
    }
  }
}

export function okResponse(data: object, requestId: string): Response {
  return Response.json({ ok: true, requestId, ...data }, { headers: { 'x-request-id': requestId } })
}

export function errorResponse(code: ErrorCode, message: string, requestId: string): Response {
  const body: ApiError = { ok: false, code, error: message, requestId }
  return Response.json(body, {
    status: ERROR_CODES[code],
    headers: { 'x-request-id': requestId },
  })
}
