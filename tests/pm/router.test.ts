import { describe, test, expect } from 'bun:test'
import { Router, okResponse, errorResponse } from '../../src/pm/daemon/router'

function makeReq(method: string, path: string, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  }
  if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
    init.body = JSON.stringify(body)
  }
  return new Request(`http://localhost${path}`, init)
}

describe('Router', () => {
  test('matches simple GET route', async () => {
    const r = new Router()
    r.add('GET', '/v1/health', (ctx) => okResponse({ pong: true }, ctx.requestId))
    const res = await r.dispatch(makeReq('GET', '/v1/health'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.pong).toBe(true)
  })

  test('returns 404 for unknown path', async () => {
    const r = new Router()
    const res = await r.dispatch(makeReq('GET', '/no/such/path'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('NOT_FOUND')
  })

  test('extracts path params', async () => {
    const r = new Router()
    r.add('GET', '/v1/process/:id', (ctx, params) => okResponse({ id: params.id }, ctx.requestId))
    const res = await r.dispatch(makeReq('GET', '/v1/process/abc-123'))
    const body = await res.json()
    expect(body.id).toBe('abc-123')
  })

  test('decodes URL-encoded params', async () => {
    const r = new Router()
    r.add('GET', '/v1/process/:name', (ctx, params) =>
      okResponse({ name: params.name }, ctx.requestId),
    )
    const res = await r.dispatch(makeReq('GET', '/v1/process/hello%20world'))
    const body = await res.json()
    expect(body.name).toBe('hello world')
  })

  test('parses JSON body for POST', async () => {
    const r = new Router()
    r.add('POST', '/v1/process/start', (ctx) =>
      okResponse({ received: ctx.body }, ctx.requestId),
    )
    const res = await r.dispatch(makeReq('POST', '/v1/process/start', { name: 'foo' }))
    const body = await res.json()
    expect(body.received).toEqual({ name: 'foo' })
  })

  test('returns 400 for invalid JSON', async () => {
    const r = new Router()
    r.add('POST', '/v1/foo', (ctx) => okResponse({}, ctx.requestId))
    const req = new Request('http://localhost/v1/foo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not valid',
    })
    const res = await r.dispatch(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  test('returns 500 for handler exception', async () => {
    const r = new Router()
    r.add('GET', '/v1/boom', () => {
      throw new Error('explode')
    })
    const res = await r.dispatch(makeReq('GET', '/v1/boom'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('INTERNAL')
  })

  test('preserves requestId from header', async () => {
    const r = new Router()
    r.add('GET', '/v1/ping', (ctx) => okResponse({}, ctx.requestId))
    const req = new Request('http://localhost/v1/ping', {
      method: 'GET',
      headers: { 'x-request-id': 'fixed-id-123' },
    })
    const res = await r.dispatch(req)
    expect(res.headers.get('x-request-id')).toBe('fixed-id-123')
    const body = await res.json()
    expect(body.requestId).toBe('fixed-id-123')
  })

  test('generates requestId when not provided', async () => {
    const r = new Router()
    r.add('GET', '/v1/ping', (ctx) => okResponse({}, ctx.requestId))
    const res = await r.dispatch(makeReq('GET', '/v1/ping'))
    const id = res.headers.get('x-request-id')
    expect(id).toBeTruthy()
    expect(id!.length).toBeGreaterThan(8)
  })

  test('method mismatch returns 404', async () => {
    const r = new Router()
    r.add('POST', '/v1/foo', (ctx) => okResponse({}, ctx.requestId))
    const res = await r.dispatch(makeReq('GET', '/v1/foo'))
    expect(res.status).toBe(404)
  })

  test('exact path matching (no prefix bleed)', async () => {
    const r = new Router()
    r.add('GET', '/v1/foo', (ctx) => okResponse({ which: 'foo' }, ctx.requestId))
    const res = await r.dispatch(makeReq('GET', '/v1/foo/bar'))
    expect(res.status).toBe(404)
  })
})

describe('errorResponse', () => {
  test('returns correct status code per error code', () => {
    const res = errorResponse('NOT_FOUND', 'gone', 'req-1')
    expect(res.status).toBe(404)
  })

  test('INVALID_AUTH returns 401', () => {
    const res = errorResponse('INVALID_AUTH', 'no', 'r')
    expect(res.status).toBe(401)
  })
})
