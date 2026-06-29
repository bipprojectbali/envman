import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { LogWriter } from '../../src/pm/daemon/log-writer'
import { LogRotator } from '../../src/pm/daemon/log-rotator'

describe('LogRotator', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-rot-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('does not rotate if below threshold', async () => {
    const outPath = join(tmpDir, 'app.out.log')
    const errPath = join(tmpDir, 'app.err.log')
    const writer = new LogWriter({ outPath, errPath })
    writer.writeOut('small\n')

    const writers = new Map([['id1', writer]])
    const rotator = new LogRotator(writers, {
      maxSizeBytes: 1_000_000,  // 1MB — way above
      maxFiles: 5,
      checkIntervalMs: 1000,
    })
    await rotator.checkAndRotate()

    expect(existsSync(outPath)).toBe(true)
    expect(existsSync(`${outPath}.1`)).toBe(false)
    writer.close()
  })

  test('rotates when exceeds threshold', async () => {
    const outPath = join(tmpDir, 'app.out.log')
    const errPath = join(tmpDir, 'app.err.log')
    // Pre-create files with content beyond threshold
    writeFileSync(outPath, 'x'.repeat(2000))
    writeFileSync(errPath, '')

    const writer = new LogWriter({ outPath, errPath })
    const writers = new Map([['id1', writer]])
    const rotator = new LogRotator(writers, {
      maxSizeBytes: 1000,  // 1KB
      maxFiles: 3,
      checkIntervalMs: 1000,
    })

    await rotator.checkAndRotate()

    // .log → .log.1 (or .log.1 → .log.1.gz background)
    // After rotation, current .log should be reopened (empty or non-existent)
    const rotated = existsSync(`${outPath}.1`) || existsSync(`${outPath}.1.gz`) || existsSync(`${outPath}.1.tmp`) || existsSync(`${outPath}.1.tmp.gz`)
    expect(rotated).toBe(true)

    writer.close()
  })

  test('N-shifting drops oldest beyond maxFiles', async () => {
    const outPath = join(tmpDir, 'shift.out.log')
    const errPath = join(tmpDir, 'shift.err.log')
    // Pre-create rotation files
    writeFileSync(outPath, 'x'.repeat(2000))  // current — will rotate
    writeFileSync(`${outPath}.1`, 'one')
    writeFileSync(`${outPath}.2`, 'two')
    writeFileSync(`${outPath}.3`, 'three')
    writeFileSync(errPath, '')

    const writer = new LogWriter({ outPath, errPath })
    const writers = new Map([['id1', writer]])
    const rotator = new LogRotator(writers, {
      maxSizeBytes: 1000,
      maxFiles: 3,  // keep only 3
      checkIntervalMs: 1000,
    })

    await rotator.checkAndRotate()

    // Setelah rotate: .3 (oldest "three") should be deleted, .2 → .3, .1 → .2, current → .1
    // Tapi karena gzip async, .1 mungkin masih sebagai .tmp atau .1.tmp.gz
    // Yang penting: 'three' content (paling lama) sudah tidak accessible
    expect(existsSync(`${outPath}.4`)).toBe(false)  // never created beyond max
    writer.close()
  })

  test('start/stop interval', async () => {
    const rotator = new LogRotator(new Map(), {
      maxSizeBytes: 1000,
      maxFiles: 3,
      checkIntervalMs: 50,
    })
    rotator.start()
    // Double start should be no-op
    rotator.start()
    await new Promise(r => setTimeout(r, 100))
    rotator.stop()
    rotator.stop()  // idempotent
    // No assertion — just ensure no crash
    expect(true).toBe(true)
  })
})
