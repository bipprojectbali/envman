// ProcessManager — collection of ProcessContainer.
//
// Bug yang dimitigasi:
//   R1 ✓ Per-name lock untuk prevent concurrent start dengan nama sama
//   R2 ✓ State machine container handles stop-during-start

import { randomUUID } from 'crypto'
import { log } from './logger'
import { ProcessContainer, type ProcessConfig, type ProcessSnapshot } from './process-container'

export class ProcessManager {
  private byId = new Map<string, ProcessContainer>()
  private byName = new Map<string, string>()  // name → id

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
      throw new ApiError(
        'BAD_REQUEST',
        'name must be alphanumeric with - and _ only',
      )
    }

    const id = randomUUID()
    const config: ProcessConfig = { ...input, id }
    const container = new ProcessContainer(config)
    this.byId.set(id, container)
    this.byName.set(input.name, id)

    try {
      await container.start()
    } catch (e: any) {
      // Cleanup pada error
      this.byId.delete(id)
      this.byName.delete(input.name)
      throw new ApiError('INTERNAL', `Start failed: ${e.message}`)
    }

    log.info('process created', { id, name: input.name })
    return container.snapshot()
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
    return c.snapshot()
  }

  async restart(idOrName: string): Promise<ProcessSnapshot> {
    const c = this.get(idOrName)
    await c.restart()
    return c.snapshot()
  }

  async reset(idOrName: string): Promise<ProcessSnapshot> {
    const c = this.get(idOrName)
    await c.reset()
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
    log.info('process removed', { id: c.config.id, name: c.config.name })
  }

  list(): ProcessSnapshot[] {
    return [...this.byId.values()].map(c => c.snapshot())
  }

  count(): number {
    return this.byId.size
  }

  /**
   * Cleanup semua proses (saat daemon shutdown). Stop semua bersamaan.
   */
  async shutdownAll(): Promise<void> {
    const containers = [...this.byId.values()]
    log.info('shutting down all processes', { count: containers.length })
    await Promise.allSettled(containers.map(c => c.destroy()))
    this.byId.clear()
    this.byName.clear()
  }
}

/**
 * API-friendly error dengan kode + message.
 */
export class ApiError extends Error {
  constructor(public code: 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST' | 'INTERNAL', message: string) {
    super(message)
  }
}
