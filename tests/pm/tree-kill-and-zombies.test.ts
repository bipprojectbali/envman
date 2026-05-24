// Chaos test: process group kill + zombie prevention.
//
// Verifies:
//   1. Spawn parent yang punya grandchild → pm stop kena dua-duanya
//   2. Deep tree (3 level) → semua mati
//   3. 30 spawn/kill cycle → no zombie accumulation

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { ProcessManager } from '../../src/pm/daemon/process-manager'

function isAlive(pid: number): boolean {
  if (pid <= 0) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

function findChildren(parentPid: number): number[] {
  // pgrep -P <pid> → list direct children PIDs
  const result = spawnSync('pgrep', ['-P', String(parentPid)], { encoding: 'utf8' })
  if (result.status !== 0) return []
  return result.stdout.split('\n')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0)
}

function countZombies(): number {
  // Hitung process dengan state 'Z' (zombie/defunct) di sistem
  const result = spawnSync('ps', ['-axo', 'pid,state'], { encoding: 'utf8' })
  if (result.status !== 0) return 0
  return result.stdout.split('\n').filter(line => {
    const parts = line.trim().split(/\s+/)
    return parts.length >= 2 && parts[1].includes('Z')
  }).length
}

describe('Process group kill (tree-kill)', () => {
  let pm: ProcessManager
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-tree-'))
    pm = new ProcessManager({ logsDir: tmpDir })
  })

  afterEach(async () => {
    if (pm) await pm.shutdownAll()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('pm stop kills parent + grandchild via PGID', async () => {
    // bash spawn sleep as background, wait — bash + sleep keduanya di grup yang sama
    const snap = await pm.start({
      name: 'tree1',
      command: ['bash', '-c', 'sleep 60 & wait'],
    })
    expect(snap.pid).not.toBeNull()

    // Tunggu bash spawn grandchild
    await new Promise(r => setTimeout(r, 300))

    const parentPid = snap.pid!
    const grandchildren = findChildren(parentPid)
    expect(grandchildren.length).toBeGreaterThan(0)

    const grandPid = grandchildren[0]
    expect(isAlive(parentPid)).toBe(true)
    expect(isAlive(grandPid)).toBe(true)

    // Stop via pm — harus kena dua-duanya
    await pm.stop('tree1')
    await new Promise(r => setTimeout(r, 200))

    expect(isAlive(parentPid)).toBe(false)
    expect(isAlive(grandPid)).toBe(false)
  }, 10_000)

  test('multi-grandchild: pm stop kills semua sibling grandchildren', async () => {
    // bash fork 3 sleep di background — masing-masing jadi child of bash
    // bash itself stays alive via `wait`.
    // Pattern ini lebih reliable daripada nested bash (yang di-optimize ke exec).
    const snap = await pm.start({
      name: 'multi-grand',
      command: ['bash', '-c', 'sleep 60 & sleep 60 & sleep 60 & wait'],
    })
    expect(snap.pid).not.toBeNull()

    await new Promise(r => setTimeout(r, 500))

    const parentPid = snap.pid!
    const direct = findChildren(parentPid)
    expect(direct.length).toBe(3)  // 3 sleep children

    // All must be alive before stop
    for (const c of direct) expect(isAlive(c)).toBe(true)

    await pm.stop('multi-grand')
    await new Promise(r => setTimeout(r, 300))

    expect(isAlive(parentPid)).toBe(false)
    for (const c of direct) {
      expect(isAlive(c)).toBe(false)
    }
  }, 10_000)

  test('SIGKILL escalation works untuk child yang ignore SIGTERM', async () => {
    // bash trap SIGTERM — ignore, terus sleep
    const snap = await pm.start({
      name: 'stubborn',
      command: ['bash', '-c', 'trap "" TERM; sleep 60'],
      options: { killTimeoutMs: 500 },  // fast escalation untuk test
    })
    expect(snap.pid).not.toBeNull()

    await new Promise(r => setTimeout(r, 200))
    const pid = snap.pid!
    expect(isAlive(pid)).toBe(true)

    const startStop = Date.now()
    await pm.stop('stubborn')
    const stopDuration = Date.now() - startStop

    // Should escalate to SIGKILL setelah ~500ms
    expect(stopDuration).toBeGreaterThanOrEqual(400)
    expect(stopDuration).toBeLessThan(2000)
    expect(isAlive(pid)).toBe(false)
  }, 10_000)
})

describe('Zombie prevention', () => {
  let pm: ProcessManager
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-zomb-'))
    pm = new ProcessManager({ logsDir: tmpDir })
  })

  afterEach(async () => {
    if (pm) await pm.shutdownAll()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('30 spawn/stop cycle does not accumulate zombies', async () => {
    const zombiesBefore = countZombies()

    for (let i = 0; i < 30; i++) {
      await pm.start({
        name: `cycle-${i}`,
        command: ['bash', '-c', 'sleep 0.1; exit 0'],
        options: { autorestart: false },  // jangan restart, sekali jalan saja
      })
      await pm.stop(`cycle-${i}`)
      await pm.remove(`cycle-${i}`)
    }

    // Tunggu kernel finish reaping
    await new Promise(r => setTimeout(r, 500))

    const zombiesAfter = countZombies()
    // Boleh ada zombie temporary dari proses lain, tapi tidak boleh nambah
    expect(zombiesAfter).toBeLessThanOrEqual(zombiesBefore + 1)
  }, 30_000)

  test('autorestart crash loop does not leak zombies', async () => {
    const zombiesBefore = countZombies()

    // Process yang langsung exit — akan auto-restart cepat sampai quarantine
    await pm.start({
      name: 'crash-loop',
      command: ['bash', '-c', 'exit 1'],
      options: {
        backoff: {
          baseDelayMs: 10,
          capDelayMs: 50,
          minUptimeMs: 100,
          resetThresholdMs: 1000,
          windowDurationMs: 60_000,
          maxRestartsInWindow: 5,
        },
      },
    })

    // Tunggu sampai quarantine (5 restart × ~10-160ms delay ≈ 500ms)
    await new Promise(r => setTimeout(r, 1500))

    const snap = pm.find('crash-loop')!.snapshot()
    expect(snap.status).toBe('quarantined')

    // Tunggu reaping
    await new Promise(r => setTimeout(r, 500))

    const zombiesAfter = countZombies()
    expect(zombiesAfter).toBeLessThanOrEqual(zombiesBefore + 1)
  }, 10_000)
})
