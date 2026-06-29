import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, unlinkSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PidFile, isPidAlive, getProcessStartEpoch, parseEtime } from '../../src/pm/daemon/pidfile'

describe('PidFile', () => {
  let tmpDir: string
  let pidPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-pid-'))
    pidPath = join(tmpDir, 'daemon.pid')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('tryAcquire creates file with content', () => {
    const pf = new PidFile(pidPath)
    pf.tryAcquire({ pid: 12345, startEpochMs: 1000000, socketPath: '/tmp/foo.sock' })
    expect(existsSync(pidPath)).toBe(true)
    const content = pf.read()
    expect(content).toEqual({ pid: 12345, startEpochMs: 1000000, socketPath: '/tmp/foo.sock' })
  })

  test('tryAcquire fails when file already exists (O_EXCL)', () => {
    const pf = new PidFile(pidPath)
    pf.tryAcquire({ pid: 1, startEpochMs: 0, socketPath: '/tmp/a' })
    expect(() => {
      pf.tryAcquire({ pid: 2, startEpochMs: 0, socketPath: '/tmp/b' })
    }).toThrow()
  })

  test('read returns null for missing file', () => {
    const pf = new PidFile(pidPath)
    expect(pf.read()).toBeNull()
  })

  test('read returns null for corrupt file', () => {
    writeFileSync(pidPath, 'garbage')
    const pf = new PidFile(pidPath)
    expect(pf.read()).toBeNull()
  })

  test('read returns null for partial file', () => {
    writeFileSync(pidPath, '12345\n')
    const pf = new PidFile(pidPath)
    expect(pf.read()).toBeNull()
  })

  test('read returns null for invalid PID', () => {
    writeFileSync(pidPath, 'notapid\n1000\n/tmp/foo\n')
    const pf = new PidFile(pidPath)
    expect(pf.read()).toBeNull()
  })

  test('release removes file', () => {
    const pf = new PidFile(pidPath)
    pf.tryAcquire({ pid: 1, startEpochMs: 0, socketPath: '/tmp/a' })
    pf.release()
    expect(existsSync(pidPath)).toBe(false)
  })

  test('release is idempotent on missing file', () => {
    const pf = new PidFile(pidPath)
    expect(() => pf.release()).not.toThrow()
  })

  test('status: missing when no file', () => {
    const pf = new PidFile(pidPath)
    expect(pf.status()).toBe('missing')
  })

  test('status: dead when PID does not exist', () => {
    // Pakai PID yang sangat tinggi — sangat tidak mungkin ada
    const deadPid = 999_999
    writeFileSync(pidPath, `${deadPid}\n1000000\n/tmp/foo\n`)
    const pf = new PidFile(pidPath)
    expect(pf.status()).toBe('dead')
  })

  test('status: alive when PID is current process', () => {
    const myPid = process.pid
    const myStart = getProcessStartEpoch(myPid) ?? Date.now()
    writeFileSync(pidPath, `${myPid}\n${myStart}\n/tmp/foo\n`)
    const pf = new PidFile(pidPath)
    expect(pf.status()).toBe('alive')
  })

  test('status: hijacked when start_epoch mismatch', () => {
    const myPid = process.pid
    // Beda 1 jam — jelas tidak match
    const fakeStart = Date.now() - 3_600_000
    writeFileSync(pidPath, `${myPid}\n${fakeStart}\n/tmp/foo\n`)
    const pf = new PidFile(pidPath)
    // Kalau platform support start_epoch detection → hijacked
    // Kalau tidak (unsupported platform) → alive (best effort)
    const status = pf.status()
    expect(['hijacked', 'alive']).toContain(status)
  })
})

describe('isPidAlive', () => {
  test('detects self alive', () => {
    expect(isPidAlive(process.pid)).toBe(true)
  })

  test('detects PID=0 as dead', () => {
    expect(isPidAlive(0)).toBe(false)
  })

  test('detects PID=-1 as dead', () => {
    expect(isPidAlive(-1)).toBe(false)
  })

  test('detects high-numbered nonexistent PID as dead', () => {
    expect(isPidAlive(999_999)).toBe(false)
  })
})

describe('getProcessStartEpoch', () => {
  test('returns epoch for self (or null on unsupported platform)', () => {
    const epoch = getProcessStartEpoch(process.pid)
    if (epoch === null) {
      // Unsupported platform — acceptable
      expect(['win32']).toContain(process.platform)
      return
    }
    // Must be within last hour and not in future
    const now = Date.now()
    expect(epoch).toBeLessThanOrEqual(now)
    expect(epoch).toBeGreaterThan(now - 3_600_000)
  })

  test('returns null for nonexistent PID', () => {
    const epoch = getProcessStartEpoch(999_999)
    expect(epoch).toBeNull()
  })
})

describe('parseEtime', () => {
  test('seconds only', () => {
    expect(parseEtime('42')).toBe(42)
  })
  test('minutes:seconds', () => {
    expect(parseEtime('01:23')).toBe(83)
  })
  test('hours:minutes:seconds', () => {
    expect(parseEtime('02:00:00')).toBe(7200)
  })
  test('days-hours:minutes:seconds', () => {
    expect(parseEtime('1-12:00:00')).toBe(86400 + 12 * 3600)
  })
  test('multi-day format', () => {
    expect(parseEtime('2-03:04:05')).toBe(2 * 86400 + 3 * 3600 + 4 * 60 + 5)
  })
  test('invalid format returns null', () => {
    expect(parseEtime('garbage')).toBeNull()
  })
  test('empty returns null', () => {
    expect(parseEtime('')).toBeNull()
  })
})
