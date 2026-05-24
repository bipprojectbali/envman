// LogWriter tests — KRITIS: remainder buffer logic (bm2 punya bug di sini).

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { LogWriter } from '../../src/pm/daemon/log-writer'

describe('LogWriter', () => {
  let tmpDir: string
  let writer: LogWriter

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-lw-'))
    writer = new LogWriter({
      outPath: join(tmpDir, 'app.out.log'),
      errPath: join(tmpDir, 'app.err.log'),
    })
  })

  afterEach(() => {
    if (writer) writer.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('writes complete lines to file', () => {
    writer.writeOut('hello\nworld\n')
    writer.close()
    const content = readFileSync(join(tmpDir, 'app.out.log'), 'utf8')
    expect(content).toBe('hello\nworld\n')
  })

  test('CRITICAL: chunk boundary mid-line preserves single line (bm2 L2 bug)', () => {
    // bm2 punya bug: chunk "hel" + chunk "lo\n" jadi 2 entry, padahal harus 1.
    writer.writeOut('hel')
    writer.writeOut('lo\n')
    writer.close()
    const content = readFileSync(join(tmpDir, 'app.out.log'), 'utf8')
    expect(content).toBe('hello\n')
  })

  test('multiple chunks with mixed boundaries', () => {
    // "line1\nlin" + "e2\nline3\n" + "trail" (no newline)
    writer.writeOut('line1\nlin')
    writer.writeOut('e2\nline3\n')
    writer.writeOut('trail')
    writer.close()
    const content = readFileSync(join(tmpDir, 'app.out.log'), 'utf8')
    // close() should call flushRemainder() → trail di-write dengan \n
    expect(content).toBe('line1\nline2\nline3\ntrail\n')
  })

  test('flushRemainder writes partial as line', () => {
    writer.writeOut('partial')
    writer.flushRemainder()
    writer.close()
    const content = readFileSync(join(tmpDir, 'app.out.log'), 'utf8')
    expect(content).toBe('partial\n')
  })

  test('out and err written to separate files', () => {
    writer.writeOut('to-out\n')
    writer.writeErr('to-err\n')
    writer.close()
    expect(readFileSync(join(tmpDir, 'app.out.log'), 'utf8')).toBe('to-out\n')
    expect(readFileSync(join(tmpDir, 'app.err.log'), 'utf8')).toBe('to-err\n')
  })

  test('onOutLine hook fires per complete line', () => {
    const captured: string[] = []
    const w2 = new LogWriter({
      outPath: join(tmpDir, 'a.out.log'),
      errPath: join(tmpDir, 'a.err.log'),
      onOutLine: (line) => captured.push(line),
    })
    w2.writeOut('one\ntw')
    w2.writeOut('o\nthree\n')
    w2.close()
    expect(captured).toEqual(['one', 'two', 'three'])
  })

  test('hook fires per line even with chunk boundary', () => {
    const captured: string[] = []
    const w2 = new LogWriter({
      outPath: join(tmpDir, 'a.out.log'),
      errPath: join(tmpDir, 'a.err.log'),
      onOutLine: (line) => captured.push(line),
    })
    w2.writeOut('chunk1')
    w2.writeOut('chunk2\n')
    w2.close()
    expect(captured).toEqual(['chunk1chunk2'])
  })

  test('append mode preserves existing content across reopen', () => {
    writer.writeOut('first\n')
    writer.closeFdsForRotation()
    writer.reopenFds()
    writer.writeOut('second\n')
    writer.close()
    const content = readFileSync(join(tmpDir, 'app.out.log'), 'utf8')
    expect(content).toBe('first\nsecond\n')
  })

  test('getSizes returns current file sizes', () => {
    writer.writeOut('1234567890\n')
    writer.writeErr('abc\n')
    const sizes = writer.getSizes()
    expect(sizes.out).toBeGreaterThan(0)
    expect(sizes.err).toBeGreaterThan(0)
    expect(sizes.out).toBeGreaterThan(sizes.err)
  })

  test('writes after close are no-op (no error)', () => {
    writer.close()
    expect(() => writer.writeOut('after close')).not.toThrow()
    // file should not have content beyond close — flushRemainder was empty
  })

  test('write empty string does nothing', () => {
    writer.writeOut('')
    writer.close()
    const content = existsSync(join(tmpDir, 'app.out.log'))
      ? readFileSync(join(tmpDir, 'app.out.log'), 'utf8') : ''
    expect(content).toBe('')
  })

  test('multibyte UTF-8 across chunk boundary (not split)', () => {
    // "héllo" in UTF-8 = 'h', 'é' (0xC3 0xA9), 'l', 'l', 'o'
    // Kalau split di tengah byte multibyte, decoder seharusnya handle via stream:true.
    // LogWriter terima string sudah decoded — TextDecoder di pipeToLog handle boundary.
    // Test di sini: pastikan string input passthrough utuh.
    writer.writeOut('héllo\nwörld\n')
    writer.close()
    const content = readFileSync(join(tmpDir, 'app.out.log'), 'utf8')
    expect(content).toBe('héllo\nwörld\n')
  })
})
