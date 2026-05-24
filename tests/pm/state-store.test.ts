import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { StateStore, StateStoreCorruptError, STATE_SCHEMA_VERSION, type PersistedState } from '../../src/pm/daemon/state-store'

describe('StateStore', () => {
  let tmpDir: string
  let mainPath: string
  let backupPath: string
  let store: StateStore

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'envman-state-'))
    mainPath = join(tmpDir, 'processes.json')
    backupPath = join(tmpDir, 'processes.json.bak')
    store = new StateStore(mainPath, backupPath, 50)  // 50ms debounce untuk fast test
  })

  afterEach(async () => {
    await store.flushPending(() => ({ version: 1, savedAt: 0, processes: [] }))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('load empty when file missing', () => {
    const state = store.load()
    expect(state.processes).toEqual([])
    expect(state.version).toBe(STATE_SCHEMA_VERSION)
  })

  test('saveSync writes valid JSON', () => {
    const state: PersistedState = {
      version: 1,
      savedAt: 0,
      processes: [{
        id: 'p1', name: 'foo', command: ['sleep', '10'],
        lastPid: null, lastStartEpochMs: null,
      }],
    }
    store.saveSync(state)
    expect(existsSync(mainPath)).toBe(true)
    const content = JSON.parse(readFileSync(mainPath, 'utf8'))
    expect(content.processes).toHaveLength(1)
    expect(content.processes[0].name).toBe('foo')
  })

  test('saveSync sets mode 0600', () => {
    store.saveSync({ version: 1, savedAt: 0, processes: [] })
    const mode = statSync(mainPath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('saveSync backups previous file to .bak', () => {
    // First save
    store.saveSync({
      version: 1, savedAt: 1,
      processes: [{ id: 'p1', name: 'first', command: ['a'], lastPid: null, lastStartEpochMs: null }],
    })
    // Second save
    store.saveSync({
      version: 1, savedAt: 2,
      processes: [{ id: 'p2', name: 'second', command: ['b'], lastPid: null, lastStartEpochMs: null }],
    })
    expect(existsSync(backupPath)).toBe(true)
    const backup = JSON.parse(readFileSync(backupPath, 'utf8'))
    expect(backup.processes[0].name).toBe('first')
    const main = JSON.parse(readFileSync(mainPath, 'utf8'))
    expect(main.processes[0].name).toBe('second')
  })

  test('load returns correct state after save', () => {
    const original: PersistedState = {
      version: 1, savedAt: 0,
      processes: [{
        id: 'p1', name: 'app', command: ['bun', 'index.js'],
        cwd: '/tmp', staticEnv: { K: 'V' },
        lastPid: 1234, lastStartEpochMs: 5678,
      }],
    }
    store.saveSync(original)
    const loaded = store.load()
    expect(loaded.processes).toHaveLength(1)
    expect(loaded.processes[0].id).toBe('p1')
    expect(loaded.processes[0].command).toEqual(['bun', 'index.js'])
    expect(loaded.processes[0].lastPid).toBe(1234)
  })

  test('load falls back to backup if main corrupt', () => {
    // Save valid first → creates main + (no .bak yet)
    store.saveSync({
      version: 1, savedAt: 0,
      processes: [{ id: 'p1', name: 'valid', command: ['a'], lastPid: null, lastStartEpochMs: null }],
    })
    // Save again → moves valid to .bak, writes new main
    store.saveSync({
      version: 1, savedAt: 1,
      processes: [{ id: 'p2', name: 'newer', command: ['b'], lastPid: null, lastStartEpochMs: null }],
    })
    // Corrupt main
    writeFileSync(mainPath, '{garbage')
    // Load should fall back to .bak ('valid' content kept in earlier rotation? actually backup is now 'valid' content)
    const loaded = store.load()
    expect(loaded.processes).toHaveLength(1)
    // The backup should hold the previous (1st save) state
    expect(loaded.processes[0].name).toBe('valid')
  })

  test('load throws StateStoreCorruptError when both main and backup corrupt', () => {
    writeFileSync(mainPath, '{garbage')
    writeFileSync(backupPath, 'also garbage')
    expect(() => store.load()).toThrow(StateStoreCorruptError)
  })

  test('load throws when version > supported', () => {
    writeFileSync(mainPath, JSON.stringify({ version: 999, processes: [] }))
    expect(() => store.load()).toThrow(/version 999/)
  })

  test('load rejects malformed process record', () => {
    writeFileSync(mainPath, JSON.stringify({ version: 1, processes: [{ id: 'no-name' }] }))
    expect(() => store.load()).toThrow()
  })

  test('scheduleSave debounces multiple calls into one write', async () => {
    const getState = () => ({
      version: 1, savedAt: 0,
      processes: [{ id: 'p', name: 'x', command: ['a'], lastPid: null, lastStartEpochMs: null }],
    }) as PersistedState

    // Multiple schedules within window
    store.scheduleSave(getState)
    store.scheduleSave(getState)
    store.scheduleSave(getState)

    expect(existsSync(mainPath)).toBe(false)
    await new Promise(r => setTimeout(r, 150))
    expect(existsSync(mainPath)).toBe(true)
  })

  test('flushPending writes immediately', async () => {
    const getState = () => ({
      version: 1, savedAt: 0,
      processes: [{ id: 'p', name: 'x', command: ['a'], lastPid: null, lastStartEpochMs: null }],
    }) as PersistedState

    store.scheduleSave(getState)
    expect(existsSync(mainPath)).toBe(false)
    await store.flushPending(getState)
    expect(existsSync(mainPath)).toBe(true)
  })

  test('atomic write — tmp file cleaned up after success', () => {
    store.saveSync({ version: 1, savedAt: 0, processes: [] })
    expect(existsSync(`${mainPath}.tmp`)).toBe(false)
  })
})
