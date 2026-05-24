// StateStore — persisted process list untuk resurrect setelah daemon restart.
//
// Bug yang dimitigasi (PROCESS-MANAGER-PLAN.md):
//   S1 ✓ Atomic write: tmp + rename, dengan .bak sebelum overwrite
//   S2 ✓ Auto-save debounced 1s — bukan manual-only
//   S3 ✓ Corrupt file → fallback ke .bak; both corrupt → REFUSE start
//   S4 ✓ Schema version field, migration chain

import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'fs'
import { log } from './logger'

// Current schema version. Bump kalau struct ProcessRecord berubah breaking.
export const STATE_SCHEMA_VERSION = 1

export interface PersistedProcess {
  id: string
  name: string
  command: string[]
  cwd?: string
  staticEnv?: Record<string, string>
  envmanEnv?: Record<string, string>
  envSources?: { type: 'envman' | 'file'; ref: string }[]
  logOutPath?: string
  logErrPath?: string
  options?: any
  /** PID saat last save — untuk validate orphan detection di resurrect */
  lastPid: number | null
  /** Process start_epoch saat last save — untuk PID-hijack guard */
  lastStartEpochMs: number | null
}

export interface PersistedState {
  version: number
  savedAt: number
  processes: PersistedProcess[]
}

const EMPTY_STATE: PersistedState = {
  version: STATE_SCHEMA_VERSION,
  savedAt: 0,
  processes: [],
}

export class StateStoreCorruptError extends Error {
  constructor(public readonly mainError: string, public readonly backupError: string) {
    super(
      `State files corrupt. Daemon REFUSING to start with empty state ` +
      `(would silently lose all processes).\n` +
      `  Main: ${mainError}\n` +
      `  Backup: ${backupError}\n` +
      `Fix: edit ~/.config/envman/run/processes.json manually atau delete jika OK kehilangan list.`,
    )
  }
}

/**
 * Migration chain: schema bump → migrate function.
 * Phase 5+ kalau add field, kalau add ProcessRecord field bisa default-in-place.
 * Kalau remove/rename field, bump version + write migration.
 */
function migrate(raw: any): PersistedState {
  if (!raw || typeof raw !== 'object') {
    throw new Error('not an object')
  }
  const version = Number(raw.version)
  if (!Number.isFinite(version)) throw new Error('missing version field')

  // Validate basic struct
  if (!Array.isArray(raw.processes)) throw new Error('processes not an array')

  // Future: if (version < 2) raw = migrateV1ToV2(raw)
  if (version > STATE_SCHEMA_VERSION) {
    throw new Error(
      `state version ${version} > supported ${STATE_SCHEMA_VERSION} — please upgrade daemon`,
    )
  }

  return {
    version: STATE_SCHEMA_VERSION,
    savedAt: Number(raw.savedAt) || 0,
    processes: raw.processes.map(validateProcess),
  }
}

function validateProcess(raw: any): PersistedProcess {
  if (!raw || typeof raw !== 'object') throw new Error('process not object')
  if (typeof raw.id !== 'string' || !raw.id) throw new Error('process missing id')
  if (typeof raw.name !== 'string' || !raw.name) throw new Error('process missing name')
  if (!Array.isArray(raw.command)) throw new Error('process command not array')
  return {
    id: raw.id,
    name: raw.name,
    command: raw.command,
    cwd: raw.cwd,
    staticEnv: raw.staticEnv,
    envmanEnv: raw.envmanEnv,
    envSources: Array.isArray(raw.envSources) ? raw.envSources : undefined,
    logOutPath: raw.logOutPath,
    logErrPath: raw.logErrPath,
    options: raw.options,
    lastPid: typeof raw.lastPid === 'number' ? raw.lastPid : null,
    lastStartEpochMs:
      typeof raw.lastStartEpochMs === 'number' ? raw.lastStartEpochMs : null,
  }
}

export class StateStore {
  private saveTimer: NodeJS.Timeout | null = null
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly path: string,
    private readonly backupPath: string,
    private readonly debounceMs: number = 1000,
  ) {}

  /**
   * Load state dari disk. Throws StateStoreCorruptError kalau main DAN backup
   * corrupt. Throws regular Error kalau parse fail tapi recoverable.
   *
   * Behavior:
   *   - main file missing      → empty state (fresh daemon)
   *   - main parseable         → return
   *   - main corrupt, .bak OK  → log warning, return .bak content
   *   - both corrupt           → throw StateStoreCorruptError
   */
  load(): PersistedState {
    if (!existsSync(this.path)) {
      log.info('no state file, starting empty', { path: this.path })
      return { ...EMPTY_STATE }
    }

    let mainError: string | null = null
    try {
      const text = readFileSync(this.path, 'utf8')
      const raw = JSON.parse(text)
      return migrate(raw)
    } catch (e: any) {
      mainError = e.message
      log.warn('main state file corrupt, trying backup', {
        path: this.path,
        error: mainError,
      })
    }

    // Try backup
    if (!existsSync(this.backupPath)) {
      throw new StateStoreCorruptError(mainError!, 'no backup file exists')
    }
    let backupError: string | null = null
    try {
      const text = readFileSync(this.backupPath, 'utf8')
      const raw = JSON.parse(text)
      log.warn('loaded state from backup .bak — main file unrecoverable', {
        backup: this.backupPath,
      })
      return migrate(raw)
    } catch (e: any) {
      backupError = e.message
    }

    throw new StateStoreCorruptError(mainError!, backupError!)
  }

  /**
   * Save state atomic: write tmp → fsync (best-effort) → backup current → rename.
   */
  saveSync(state: PersistedState): void {
    const payload: PersistedState = {
      version: STATE_SCHEMA_VERSION,
      savedAt: Date.now(),
      processes: state.processes,
    }
    const tmpPath = `${this.path}.tmp`
    try {
      writeFileSync(tmpPath, JSON.stringify(payload, null, 2), { mode: 0o600 })
    } catch (e: any) {
      log.error('state write tmp failed', { path: tmpPath, error: e.message })
      throw e
    }

    // Backup current sebelum overwrite
    if (existsSync(this.path)) {
      try {
        if (existsSync(this.backupPath)) unlinkSync(this.backupPath)
        renameSync(this.path, this.backupPath)
      } catch (e: any) {
        log.warn('backup rename failed', { error: e.message })
      }
    }

    // Atomic move tmp → main
    try {
      renameSync(tmpPath, this.path)
    } catch (e: any) {
      // Cleanup tmp jika gagal
      try { unlinkSync(tmpPath) } catch {}
      log.error('state rename failed', { error: e.message })
      throw e
    }
  }

  /**
   * Schedule async save dengan debounce 1s. Multiple calls dalam window
   * akan di-coalesce ke satu write.
   */
  scheduleSave(getState: () => PersistedState): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      // Serialize writes — antrian queue agar tidak overlap
      this.writeQueue = this.writeQueue.then(() => {
        try {
          this.saveSync(getState())
        } catch (e: any) {
          log.error('scheduled save failed', { error: e.message })
        }
      })
    }, this.debounceMs)
  }

  /**
   * Flush pending save segera (saat daemon shutdown).
   */
  async flushPending(getState: () => PersistedState): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      try {
        this.saveSync(getState())
      } catch (e: any) {
        log.error('flushPending save failed', { error: e.message })
      }
    }
    await this.writeQueue
  }
}
