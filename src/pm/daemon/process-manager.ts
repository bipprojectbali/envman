// ProcessManager — collection of ProcessContainer.
//
// Bug yang dimitigasi:
//   R1 ✓ Per-name lock untuk prevent concurrent start dengan nama sama
//   R2 ✓ State machine container handles stop-during-start

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { LogRotator } from './log-rotator'
import type { LogWriter } from './log-writer'
import { log } from './logger'
import { type ProcessConfig, ProcessContainer, type ProcessSnapshot } from './process-container'
import type { PersistedProcess, PersistedState, StateStore } from './state-store'
import { STATE_SCHEMA_VERSION } from './state-store'

export interface ProcessManagerOptions {
  /** Direktori untuk log files (~/.config/envman/run/logs) */
  logsDir: string
  /** Optional state store untuk auto-save persistence (Phase 4) */
  stateStore?: StateStore
  /** Optional audit emitter (Phase 5) — fire-and-forget */
  onAudit?: (event: { action: string; detail?: string; processName?: string; processId?: string }) => void
}

export class ProcessManager {
  private byId = new Map<string, ProcessContainer>()
  private byName = new Map<string, string>() // name → id
  private logRotator: LogRotator | null = null
  private logWriters = new Map<string, LogWriter>() // shared dengan LogRotator

  constructor(private readonly opts: ProcessManagerOptions) {
    if (!existsSync(opts.logsDir)) {
      mkdirSync(opts.logsDir, { recursive: true, mode: 0o750 })
    }
  }

  /**
   * Start periodic log rotation (Phase 3).
   */
  startRotator(): void {
    if (this.logRotator) return
    this.logRotator = new LogRotator(this.logWriters)
    this.logRotator.start()
  }

  stopRotator(): void {
    if (this.logRotator) {
      this.logRotator.stop()
      this.logRotator = null
    }
  }

  /**
   * Serialize current state untuk persistence.
   */
  getPersistedState(): PersistedState {
    const processes: PersistedProcess[] = [...this.byId.values()].map((c) => {
      const snap = c.snapshot()
      return {
        id: c.config.id,
        name: c.config.name,
        command: [...c.config.command],
        cwd: c.config.cwd,
        staticEnv: c.config.staticEnv,
        envmanEnv: c.config.envmanEnv,
        envSources: c.config.envSources,
        logOutPath: c.config.logOutPath,
        logErrPath: c.config.logErrPath,
        options: c.config.options,
        lastPid: snap.pid,
        lastStartEpochMs: snap.startedAt,
      }
    })
    return {
      version: STATE_SCHEMA_VERSION,
      savedAt: Date.now(),
      processes,
    }
  }

  /**
   * Trigger debounced state save (kalau stateStore configured).
   */
  private triggerSave(): void {
    if (this.opts.stateStore) {
      this.opts.stateStore.scheduleSave(() => this.getPersistedState())
    }
  }

  /**
   * Force flush pending saves (saat daemon shutdown).
   */
  async flushSaves(): Promise<void> {
    if (this.opts.stateStore) {
      await this.opts.stateStore.flushPending(() => this.getPersistedState())
    }
  }

  /**
   * Create + start process. Throws DuplicateNameError kalau nama sudah ada.
   */
  async start(input: Omit<ProcessConfig, 'id'>): Promise<ProcessSnapshot> {
    if (this.byName.has(input.name)) {
      throw new ApiError('CONFLICT', `Process "${input.name}" already exists`)
    }
    if (input.command.length === 0) {
      throw new ApiError('BAD_REQUEST', 'command is empty')
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(input.name)) {
      throw new ApiError('BAD_REQUEST', 'name must be alphanumeric with - and _ only')
    }

    const id = randomUUID()
    const logOutPath = input.logOutPath ?? join(this.opts.logsDir, `${input.name}-${id}.out.log`)
    const logErrPath = input.logErrPath ?? join(this.opts.logsDir, `${input.name}-${id}.err.log`)
    const config: ProcessConfig = { ...input, id, logOutPath, logErrPath }
    const container = new ProcessContainer(config)
    this.byId.set(id, container)
    this.byName.set(input.name, id)
    if (container.logWriter) {
      this.logWriters.set(id, container.logWriter)
    }

    try {
      await container.start()
    } catch (e: any) {
      // Cleanup pada error
      this.byId.delete(id)
      this.byName.delete(input.name)
      throw new ApiError('INTERNAL', `Start failed: ${e.message}`)
    }

    log.info('process created', { id, name: input.name })
    this.triggerSave()
    this.emitAudit('PM_PROCESS_STARTED', { processId: id, processName: input.name })
    return container.snapshot()
  }

  private emitAudit(action: string, info: { processId?: string; processName?: string; detail?: string }): void {
    if (!this.opts.onAudit) return
    try {
      this.opts.onAudit({ action, ...info })
    } catch {}
  }

  /**
   * Lookup by id or name. Returns null kalau tidak ditemukan.
   */
  find(idOrName: string): ProcessContainer | null {
    const direct = this.byId.get(idOrName)
    if (direct) return direct
    const id = this.byName.get(idOrName)
    if (id) return this.byId.get(id) ?? null
    return null
  }

  /**
   * Get container, throw NOT_FOUND kalau tidak ada.
   */
  get(idOrName: string): ProcessContainer {
    const found = this.find(idOrName)
    if (!found) throw new ApiError('NOT_FOUND', `Process "${idOrName}" not found`)
    return found
  }

  async stop(idOrName: string): Promise<ProcessSnapshot> {
    const c = this.get(idOrName)
    await c.stop()
    this.triggerSave()
    this.emitAudit('PM_PROCESS_STOPPED', { processId: c.config.id, processName: c.config.name })
    return c.snapshot()
  }

  async restart(idOrName: string): Promise<ProcessSnapshot> {
    const c = this.get(idOrName)
    await c.restart()
    this.triggerSave()
    this.emitAudit('PM_PROCESS_RESTARTED', { processId: c.config.id, processName: c.config.name })
    return c.snapshot()
  }

  async reset(idOrName: string): Promise<ProcessSnapshot> {
    const c = this.get(idOrName)
    await c.reset()
    this.triggerSave()
    return c.snapshot()
  }

  /**
   * Remove dari management. Stop dulu kalau masih running.
   */
  async remove(idOrName: string): Promise<void> {
    const c = this.get(idOrName)
    await c.destroy()
    this.byId.delete(c.config.id)
    this.byName.delete(c.config.name)
    this.logWriters.delete(c.config.id)
    log.info('process removed', { id: c.config.id, name: c.config.name })
    this.triggerSave()
    this.emitAudit('PM_PROCESS_DELETED', { processId: c.config.id, processName: c.config.name })
  }

  list(): ProcessSnapshot[] {
    return [...this.byId.values()].map((c) => c.snapshot())
  }

  count(): number {
    return this.byId.size
  }

  /**
   * Cleanup semua proses (saat daemon shutdown). Stop semua bersamaan.
   */
  async shutdownAll(): Promise<void> {
    this.stopRotator()
    const containers = [...this.byId.values()]
    log.info('shutting down all processes', { count: containers.length })
    await Promise.allSettled(containers.map((c) => c.destroy()))
    this.byId.clear()
    this.byName.clear()
    this.logWriters.clear()
  }
}

/**
 * API-friendly error dengan kode + message.
 */
export class ApiError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST' | 'INTERNAL',
    message: string,
  ) {
    super(message)
  }
}
