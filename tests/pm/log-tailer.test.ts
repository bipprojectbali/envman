import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { LogTailer, tailFile } from '../../src/pm/daemon/log-tailer'

describe('LogTailer', () => {
  test('broadcast to multiple subscribers', async () => {
    const tailer = new LogTailer()
    const received1: string[] = []
    const received2: string[] = []

    const s1 = tailer.subscribeSSE()
    const s2 = tailer.subscribeSSE()
    const reader1 = s1.getReader()
    const reader2 = s2.getReader()

    // Setup reader collectors (async)
    const decode = new TextDecoder()
    const collect = async (reader: ReadableStreamDefaultReader<Uint8Array>, target: string[]) => {
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          target.push(decode.decode(value))
          if (target.length >= 5) break  // safety
        }
      } catch {}
    }

    const p1 = collect(reader1, received1)
    const p2 = collect(reader2, received2)

    // Wait subscriber registered
    await new Promise(r => setTimeout(r, 50))
    expect(tailer.subscriberCount()).toBe(2)

    tailer.onOutLine('hello')
    await new Promise(r => setTimeout(r, 50))

    reader1.cancel()
    reader2.cancel()
    await p1
    await p2

    // Both received the line (SSE format: "data: {...}\n\n")
    expect(received1.join('')).toContain('"line":"hello"')
    expect(received2.join('')).toContain('"line":"hello"')
  })

  test('subscriber count tracks adds/removes', async () => {
    const tailer = new LogTailer()
    expect(tailer.subscriberCount()).toBe(0)

    const s = tailer.subscribeSSE()
    await new Promise(r => setTimeout(r, 30))
    expect(tailer.subscriberCount()).toBe(1)

    // cancel via reader
    const reader = s.getReader()
    reader.cancel()
    await new Promise(r => setTimeout(r, 50))
    expect(tailer.subscriberCount()).toBe(0)
  })

  test('subscriber unsubscribes on abort signal', async () => {
    const tailer = new LogTailer()
    const abort = new AbortController()
    const stream = tailer.subscribeSSE(abort.signal)
    await new Promise(r => setTimeout(r, 30))
    expect(tailer.subscriberCount()).toBe(1)

    abort.abort()
    await new Promise(r => setTimeout(r, 50))
    expect(tailer.subscriberCount()).toBe(0)

    // Consume to allow GC
    const reader = stream.getReader()
    reader.cancel()
  })

  test('closeAll removes all subscribers', () => {
    const tailer = new LogTailer()
    tailer.subscribeSSE()
    tailer.subscribeSSE()
    tailer.subscribeSSE()
    tailer.closeAll()
    expect(tailer.subscriberCount()).toBe(0)
  })
})

describe('tailFile', () => {
  let tmpDir: string
  let path: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-tail-'))
    path = join(tmpDir, 'test.log')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns empty for missing file', async () => {
    const lines = await tailFile(join(tmpDir, 'missing.log'), 10)
    expect(lines).toEqual([])
  })

  test('returns empty for empty file', async () => {
    writeFileSync(path, '')
    const lines = await tailFile(path, 10)
    expect(lines).toEqual([])
  })

  test('returns all lines if file smaller than N', async () => {
    writeFileSync(path, 'a\nb\nc\n')
    const lines = await tailFile(path, 100)
    expect(lines).toEqual(['a', 'b', 'c'])
  })

  test('returns last N lines', async () => {
    writeFileSync(path, 'a\nb\nc\nd\ne\n')
    const lines = await tailFile(path, 3)
    expect(lines).toEqual(['c', 'd', 'e'])
  })

  test('handles large file across multiple chunks', async () => {
    // Generate 1000 lines @ ~20 chars each = ~20KB, more than single chunk
    let content = ''
    for (let i = 0; i < 1000; i++) content += `line-${i.toString().padStart(10, '0')}\n`
    writeFileSync(path, content)

    const last10 = await tailFile(path, 10)
    expect(last10).toHaveLength(10)
    expect(last10[9]).toBe('line-0000000999')
    expect(last10[0]).toBe('line-0000000990')
  })

  test('handles file without trailing newline', async () => {
    writeFileSync(path, 'a\nb\nc')  // no final \n
    const lines = await tailFile(path, 10)
    expect(lines).toEqual(['a', 'b', 'c'])
  })
})
