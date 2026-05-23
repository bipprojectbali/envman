// Test ProcessManager + ProcessContainer in-process (tanpa daemon spawn).
// Tujuan: verifikasi state machine, lock, lifecycle tanpa overhead IPC.

import { describe, test, expect, afterEach } from 'bun:test'
import { ProcessManager, ApiError } from '../../src/pm/daemon/process-manager'

describe('ProcessManager', () => {
  let pm: ProcessManager

  afterEach(async () => {
    if (pm) await pm.shutdownAll()
  })

  test('start + list', async () => {
    pm = new ProcessManager()
    const snap = await pm.start({
      name: 'sleeper-1',
      command: ['sleep', '30'],
    })
    expect(snap.name).toBe('sleeper-1')
    expect(snap.id).toBeTruthy()
    expect(['starting', 'online']).toContain(snap.status)

    const list = pm.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('sleeper-1')
  })

  test('duplicate name throws CONFLICT', async () => {
    pm = new ProcessManager()
    await pm.start({ name: 'dup-test', command: ['sleep', '30'] })
    let err: any = null
    try {
      await pm.start({ name: 'dup-test', command: ['sleep', '30'] })
    } catch (e: any) {
      err = e
    }
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('CONFLICT')
  })

  test('empty command throws BAD_REQUEST', async () => {
    pm = new ProcessManager()
    let err: any = null
    try {
      await pm.start({ name: 'empty', command: [] })
    } catch (e: any) {
      err = e
    }
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('BAD_REQUEST')
  })

  test('invalid name format throws BAD_REQUEST', async () => {
    pm = new ProcessManager()
    let err: any = null
    try {
      await pm.start({ name: 'bad name with spaces', command: ['sleep', '30'] })
    } catch (e: any) {
      err = e
    }
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('BAD_REQUEST')
  })

  test('find by name and id', async () => {
    pm = new ProcessManager()
    const snap = await pm.start({ name: 'findable', command: ['sleep', '30'] })
    expect(pm.find('findable')).not.toBeNull()
    expect(pm.find(snap.id)).not.toBeNull()
    expect(pm.find('non-existent')).toBeNull()
  })

  test('get throws NOT_FOUND for missing', () => {
    pm = new ProcessManager()
    let err: any = null
    try {
      pm.get('nope')
    } catch (e: any) {
      err = e
    }
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('NOT_FOUND')
  })

  test('stop and restart', async () => {
    pm = new ProcessManager()
    await pm.start({ name: 'restartable', command: ['sleep', '30'] })
    const stopped = await pm.stop('restartable')
    expect(stopped.status).toBe('stopped')
    const restarted = await pm.restart('restartable')
    expect(['starting', 'online']).toContain(restarted.status)
  })

  test('remove deletes from manager', async () => {
    pm = new ProcessManager()
    await pm.start({ name: 'removable', command: ['sleep', '30'] })
    await pm.remove('removable')
    expect(pm.find('removable')).toBeNull()
    expect(pm.count()).toBe(0)
  })

  test('shutdownAll stops everything', async () => {
    pm = new ProcessManager()
    await pm.start({ name: 'a', command: ['sleep', '30'] })
    await pm.start({ name: 'b', command: ['sleep', '30'] })
    await pm.start({ name: 'c', command: ['sleep', '30'] })
    expect(pm.count()).toBe(3)
    await pm.shutdownAll()
    expect(pm.count()).toBe(0)
  })

  test('autorestart triggers after crash', async () => {
    pm = new ProcessManager()
    // Process exits immediately
    const snap = await pm.start({
      name: 'crash',
      command: ['bash', '-c', 'exit 1'],
      options: {
        backoff: {
          baseDelayMs: 50,
          capDelayMs: 200,
          minUptimeMs: 100,
          resetThresholdMs: 1000,
          windowDurationMs: 60_000,
          maxRestartsInWindow: 5,
        },
      },
    })
    // Tunggu beberapa restart
    await new Promise(r => setTimeout(r, 600))
    const after = pm.find('crash')!.snapshot()
    expect(after.restartCount).toBeGreaterThan(0)
  }, 5000)

  test('quarantine after 5 quick crashes', async () => {
    pm = new ProcessManager()
    await pm.start({
      name: 'quaranteen',
      command: ['bash', '-c', 'exit 1'],
      options: {
        backoff: {
          baseDelayMs: 10,
          capDelayMs: 100,
          minUptimeMs: 100,
          resetThresholdMs: 1000,
          windowDurationMs: 60_000,
          maxRestartsInWindow: 5,
        },
      },
    })
    // Tunggu sampai quarantine (5 crashes with backoff ~10+20+40+80+160 = ~310ms)
    await new Promise(r => setTimeout(r, 2000))
    const after = pm.find('quaranteen')!.snapshot()
    expect(after.status).toBe('quarantined')
  }, 5000)
})
