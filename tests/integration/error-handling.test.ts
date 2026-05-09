import { test, expect, describe } from 'bun:test'
import { createTestApp } from '../helpers'

const app = createTestApp()

describe('Error handling', () => {
  test('unknown API route returns 404', async () => {
    const res = await app.handle(new Request('http://localhost/api/nonexistent'))
    expect(res.status).toBe(404)
  })

  test('unknown nested API route returns 404', async () => {
    const res = await app.handle(new Request('http://localhost/api/foo/bar/baz'))
    expect(res.status).toBe(404)
  })

  test('wrong HTTP method returns 404', async () => {
    const res = await app.handle(new Request('http://localhost/api/hello', { method: 'DELETE' }))
    expect(res.status).toBe(404)
  })
})
