import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ensureToken, safeEqual } from '../../src/pm/shared/token'

describe('ensureToken', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-token-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('generates new token when file does not exist', () => {
    const path = join(tmpDir, 'daemon.token')
    const token = ensureToken(path)
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(/^[a-f0-9]+$/.test(token)).toBe(true)
  })

  test('persisted token has mode 0600', () => {
    const path = join(tmpDir, 'daemon.token')
    ensureToken(path)
    const mode = statSync(path).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('returns existing token when file exists', () => {
    const path = join(tmpDir, 'daemon.token')
    const t1 = ensureToken(path)
    const t2 = ensureToken(path)
    expect(t1).toBe(t2)
  })

  test('creates parent directory if missing', () => {
    const path = join(tmpDir, 'nested', 'dir', 'daemon.token')
    const token = ensureToken(path)
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(readFileSync(path, 'utf8').trim()).toBe(token)
  })

  test('regenerates if existing file is corrupt (too short)', () => {
    const path = join(tmpDir, 'daemon.token')
    writeFileSync(path, 'short')
    const token = ensureToken(path)
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(token).not.toBe('short')
  })
})

describe('safeEqual', () => {
  test('equal strings return true', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true)
  })

  test('different strings return false', () => {
    expect(safeEqual('abc123', 'def456')).toBe(false)
  })

  test('different length return false', () => {
    expect(safeEqual('abc', 'abc123')).toBe(false)
  })

  test('empty strings are equal', () => {
    expect(safeEqual('', '')).toBe(true)
  })

  test('one empty one non-empty return false', () => {
    expect(safeEqual('', 'abc')).toBe(false)
  })
})
