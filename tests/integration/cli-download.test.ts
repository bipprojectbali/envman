import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { mkdirSync, writeFileSync, existsSync, unlinkSync, rmdirSync } from 'fs'
import { gzipSync } from 'zlib'
import { createTestApp } from '../helpers'

const CLI_DIR = `${process.cwd()}/dist/cli-test`
const TEST_PLATFORM = 'darwin-arm64'
const BIN_PATH = `${CLI_DIR}/envman-${TEST_PLATFORM}`
const GZ_PATH = `${BIN_PATH}.gz`
const TEST_BINARY = Buffer.from('FAKE_BINARY_CONTENT_FOR_TESTING_ONLY_NOT_AN_ACTUAL_ELF_BINARY'.repeat(50))

const ORIGINAL_CLI_DATA_DIR = process.env.CLI_DATA_DIR
process.env.CLI_DATA_DIR = CLI_DIR

const app = createTestApp()

beforeAll(() => {
  mkdirSync(CLI_DIR, { recursive: true })
  writeFileSync(BIN_PATH, TEST_BINARY)
  writeFileSync(GZ_PATH, gzipSync(TEST_BINARY, { level: 9 }))
})

afterAll(() => {
  if (existsSync(BIN_PATH)) unlinkSync(BIN_PATH)
  if (existsSync(GZ_PATH)) unlinkSync(GZ_PATH)
  try {
    rmdirSync(CLI_DIR)
  } catch {}
  if (ORIGINAL_CLI_DATA_DIR === undefined) delete process.env.CLI_DATA_DIR
  else process.env.CLI_DATA_DIR = ORIGINAL_CLI_DATA_DIR
})

describe('GET /install', () => {
  test('returns shell script with retry + compressed flags', async () => {
    const res = await app.handle(new Request('http://localhost/install'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const body = await res.text()
    expect(body).toContain('#!/bin/sh')
    expect(body).toContain('--compressed')
    expect(body).toContain('--retry')
    expect(body).toContain('PLATFORM=')
  })
})

describe('GET /download/cli/:platform', () => {
  test('unknown platform returns 404', async () => {
    const res = await app.handle(new Request('http://localhost/download/cli/unknown-arch'))
    expect(res.status).toBe(404)
  })

  test('without Accept-Encoding returns plain binary', async () => {
    const res = await app.handle(new Request(`http://localhost/download/cli/${TEST_PLATFORM}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('content-disposition')).toContain(`envman-${TEST_PLATFORM}`)
    const body = await res.arrayBuffer()
    expect(new Uint8Array(body)).toEqual(new Uint8Array(TEST_BINARY))
  })

  test('with Accept-Encoding: gzip returns gzipped binary', async () => {
    const res = await app.handle(new Request(`http://localhost/download/cli/${TEST_PLATFORM}`, {
      headers: { 'accept-encoding': 'gzip, deflate' },
    }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBe('gzip')
    expect(res.headers.get('vary')).toContain('Accept-Encoding')
    const body = await res.arrayBuffer()
    // Verify gz magic bytes (1f 8b)
    const bytes = new Uint8Array(body)
    expect(bytes[0]).toBe(0x1f)
    expect(bytes[1]).toBe(0x8b)
    // Gzipped should be smaller than plain (our test fixture compresses well)
    expect(body.byteLength).toBeLessThan(TEST_BINARY.length)
  })
})
