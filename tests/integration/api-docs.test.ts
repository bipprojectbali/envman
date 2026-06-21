import { test, expect, describe, afterAll } from 'bun:test'
import { createTestApp, prisma } from '../helpers'

const app = createTestApp()

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/docs.md conditional caching', () => {
  const url = 'http://localhost/api/docs.md'

  test('GET pertama kirim markdown + ETag + public cache-control', async () => {
    const res = await app.handle(new Request(url))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(res.headers.get('etag')).toStartWith('"')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect((await res.text()).length).toBeGreaterThan(0)
  })

  test('If-None-Match cocok → 304 tanpa body', async () => {
    const first = await app.handle(new Request(url))
    const etag = first.headers.get('etag') ?? ''
    const res = await app.handle(new Request(url, { headers: { 'If-None-Match': etag } }))
    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
    expect(res.headers.get('etag')).toBe(etag)
  })

  test('If-None-Match tidak cocok → 200 + body penuh', async () => {
    const res = await app.handle(new Request(url, { headers: { 'If-None-Match': '"stale"' } }))
    expect(res.status).toBe(200)
    expect((await res.text()).length).toBeGreaterThan(0)
  })
})
