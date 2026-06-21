import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cacheFileFor, pruneIfNeeded, readCache, writeCache } from '../../src/cli/response-cache'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'envman-cache-'))
})

afterAll(() => {
  // beforeEach dirs are throwaway; best-effort cleanup of the last one.
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
})

describe('cacheFileFor', () => {
  test('key deterministik untuk (server, path) sama', () => {
    expect(cacheFileFor('https://s', '/a', dir)).toBe(cacheFileFor('https://s', '/a', dir))
  })

  test('key berbeda untuk path berbeda', () => {
    expect(cacheFileFor('https://s', '/a', dir)).not.toBe(cacheFileFor('https://s', '/b', dir))
  })

  test('key berbeda untuk server berbeda', () => {
    expect(cacheFileFor('https://s1', '/a', dir)).not.toBe(cacheFileFor('https://s2', '/a', dir))
  })
})

describe('readCache / writeCache', () => {
  test('roundtrip etag + body', () => {
    const file = cacheFileFor('https://s', '/a', dir)
    writeCache(file, '"abc"', '{"x":1}')
    const got = readCache(file)
    expect(got).toEqual({ etag: '"abc"', body: '{"x":1}' })
  })

  test('readCache null untuk file tidak ada', () => {
    expect(readCache(join(dir, 'nope.json'))).toBe(null)
  })

  test('readCache null untuk JSON corrupt', () => {
    const file = join(dir, 'corrupt.json')
    writeFileSync(file, 'not json{')
    expect(readCache(file)).toBe(null)
  })

  test('readCache null untuk shape salah', () => {
    const file = join(dir, 'wrong.json')
    writeFileSync(file, JSON.stringify({ etag: 1, body: 2 }))
    expect(readCache(file)).toBe(null)
  })

  test('file ditulis dengan mode 0600', () => {
    const file = cacheFileFor('https://s', '/secret', dir)
    writeCache(file, '"e"', 'sensitive')
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  test('overwrite atomik (tidak meninggalkan tmp)', () => {
    const file = cacheFileFor('https://s', '/a', dir)
    writeCache(file, '"e1"', 'v1')
    writeCache(file, '"e2"', 'v2')
    expect(readCache(file)?.body).toBe('v2')
    expect(readdirSync(dir).some((f) => f.includes('.tmp'))).toBe(false)
  })
})

describe('pruneIfNeeded', () => {
  test('hapus entri tertua saat melebihi max', () => {
    for (let i = 0; i < 5; i++) {
      writeCache(cacheFileFor('https://s', `/p${i}`, dir), `"e${i}"`, `v${i}`)
    }
    pruneIfNeeded(dir, 3)
    expect(readdirSync(dir).filter((f) => f.endsWith('.json')).length).toBe(3)
  })

  test('no-op saat di bawah max', () => {
    writeCache(cacheFileFor('https://s', '/p0', dir), '"e"', 'v')
    pruneIfNeeded(dir, 10)
    expect(readdirSync(dir).filter((f) => f.endsWith('.json')).length).toBe(1)
  })
})
