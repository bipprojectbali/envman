// ProcessContainer — single child process wrapper dengan state machine + supervisor.
//
// Bug yang dimitigasi:
//   P1 ✓ Exponential backoff (lihat backoff.ts)
//   P2 ✓ Sliding window crash-loop quarantine
//   P3 ✓ Pakai Bun.Subprocess reference, bukan PID number, untuk signal
//   P5 ✓ Env allowlist via resolveChildEnv (lihat env-resolver.ts)
//   P6 ✓ Force kill timeout race antara process.exited dan setTimeout
//   E5 ✓ State machine lock untuk prevent stop-during-start race

import { log } from './logger'
import { resolveChildEnv, hashEnv } from './env-resolver'
import {
  newBackoffState,
  recordExit,
  computeDelayMs,
  resetBackoff,
  type BackoffState,
  type BackoffConfig,
  DEFAULT_BACKOFF,
} from './backoff'
import { LogWriter } from './log-writer'
import { LogTailer } from './log-tailer'

export type ProcessStatus =
  | 'starting'      // proses sedang spawn / belum minUptime
  | 'online'        // proses jalan stabil
  | 'stopping'      // SIGTERM dikirim, tunggu exit
  | 'stopped'       // user-requested stop, tidak akan auto-restart
  | 'errored'       // exit dengan non-zero code, autorestart=false
  | 'quarantined'   // crash-loop terdeteksi, paused

export interface ProcessOptions {
  autorestart: boolean
  killTimeoutMs: number     // default 5000
  backoff?: BackoffConfig   // default DEFAULT_BACKOFF
}

export const DEFAULT_PROCESS_OPTIONS: ProcessOptions = {
  autorestart: true,
  killTimeoutMs: 5000,
  backoff: DEFAULT_BACKOFF,
}

export interface EnvSource {
  type: 'envman' | 'file'
  ref: string  // "myapp:dev" atau "/path/.env"
}

export interface ProcessConfig {
  id: string
  name: string
  command: string[]
  cwd?: string
  /** Static env dari user (CLI), bukan dari envman server */
  staticEnv?: Record<string, string>
  /** Env dari envman server resolve (Phase 5+ akan populate) */
  envmanEnv?: Record<string, string>
  /** Sources untuk pm sync — dipakai untuk re-fetch env dari server */
  envSources?: EnvSource[]
  /** Path untuk log files (out/err). Phase 3+ — required. */
  logOutPath?: string
  logErrPath?: string
  options?: Partial<ProcessOptions>
}

export interface ProcessSnapshot {
  id: string
  name: string
  command: string[]
  cwd: string
  pid: number | null
  status: ProcessStatus
  startedAt: number | null     // epoch ms, null kalau belum pernah start
  uptimeMs: number              // 0 kalau tidak running
  restartCount: number
  lastExitCode: number | null
  lastError: string | null
  envHash: string
  createdAt: number
}

export class ProcessContainer {
  private subprocess: Bun.Subprocess | null = null
  private status: ProcessStatus = 'stopped'
  private startedAt: number | null = null
  private lastExitCode: number | null = null
  private lastError: string | null = null
  private readonly backoffState: BackoffState = newBackoffState()
  private readonly options: ProcessOptions
  private readonly createdAt: number = Date.now()
  private restartTimer: NodeJS.Timeout | null = null
  /** Locks parallel state-changing operations (start/stop/restart) */
  private opLock: Promise<void> = Promise.resolve()
  /** Cached env hash — bisa berubah saat Phase 5 sync update envmanEnv */
  private envHash: string
  /** Log writer (Phase 3) — null kalau no log paths configured */
  public readonly logWriter: LogWriter | null
  /** Log tailer untuk multi-subscriber SSE */
  public readonly logTailer: LogTailer = new LogTailer()

  constructor(public readonly config: ProcessConfig) {
    this.options = { ...DEFAULT_PROCESS_OPTIONS, ...(config.options ?? {}) }
    this.envHash = hashEnv(this.buildEnv())
    if (config.logOutPath && config.logErrPath) {
      this.logWriter = new LogWriter({
        outPath: config.logOutPath,
        errPath: config.logErrPath,
        onOutLine: this.logTailer.onOutLine,
        onErrLine: this.logTailer.onErrLine,
      })
    } else {
      this.logWriter = null
    }
  }

  /** Get current snapshot — safe to call any time, no side effects. */
  snapshot(): ProcessSnapshot {
    return {
      id: this.config.id,
      name: this.config.name,
      command: [...this.config.command],
      cwd: this.config.cwd ?? process.cwd(),
      pid: this.subprocess?.pid ?? null,
      status: this.status,
      startedAt: this.startedAt,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
      restartCount: this.backoffState.restartCount,
      lastExitCode: this.lastExitCode,
      lastError: this.lastError,
      envHash: this.envHash,
      createdAt: this.createdAt,
    }
  }

  /**
   * Spawn child process. Idempotent — kalau sudah online/starting, return.
   * Throws kalau status quarantined (user harus reset dulu).
   */
  async start(): Promise<void> {
    await this.runOp(async () => {
      if (this.status === 'online' || this.status === 'starting') {
        log.debug('start no-op', { name: this.config.name, status: this.status })
        return
      }
      if (this.status === 'quarantined') {
        throw new Error(`Process "${this.config.name}" is quarantined. Use 'pm reset' first.`)
      }
      this.doSpawn()
    })
  }

  /**
   * Stop child process. SIGTERM dulu, escalate ke SIGKILL setelah killTimeoutMs.
   * Sets status='stopped', autorestart disabled untuk panggilan stop ini.
   */
  async stop(reason: string = 'user-requested'): Promise<void> {
    await this.runOp(async () => {
      if (this.status === 'stopped' || this.status === 'errored') return
      if (this.status === 'quarantined') {
        this.status = 'stopped'
        return
      }

      // Cancel pending restart timer
      if (this.restartTimer) {
        clearTimeout(this.restartTimer)
        this.restartTimer = null
      }

      this.status = 'stopping'
      log.info('stopping process', { name: this.config.name, pid: this.subprocess?.pid, reason })

      const proc = this.subprocess
      if (!proc) {
        this.status = 'stopped'
        return
      }

      // Kirim SIGTERM, race dengan timeout
      try {
        proc.kill('SIGTERM')
      } catch {
        // process mungkin sudah mati
      }

      const timeoutP = new Promise<'timeout'>(r => setTimeout(() => r('timeout'), this.options.killTimeoutMs))
      const exitedP = proc.exited.then(() => 'exited' as const)
      const winner = await Promise.race([exitedP, timeoutP])

      if (winner === 'timeout') {
        log.warn('SIGTERM timeout, sending SIGKILL', {
          name: this.config.name,
          pid: proc.pid,
          timeoutMs: this.options.killTimeoutMs,
        })
        try {
          proc.kill('SIGKILL')
        } catch {
          // ignore
        }
        // Wait briefly for kernel to reap
        await Promise.race([proc.exited, new Promise(r => setTimeout(r, 500))])
      }

      this.subprocess = null
      this.startedAt = null
      this.status = 'stopped'
      log.info('process stopped', { name: this.config.name })
    })
  }

  /**
   * Stop + start atomically.
   */
  async restart(): Promise<void> {
    await this.stop('restart')
    await this.start()
  }

  /**
   * Reset quarantine — user-explicit recovery dari crash loop.
   */
  async reset(): Promise<void> {
    await this.runOp(async () => {
      resetBackoff(this.backoffState)
      this.status = 'stopped'
      this.lastError = null
      log.info('process reset', { name: this.config.name })
    })
  }

  /**
   * Update env (Phase 5 sync). Returns true kalau env hash berubah.
   * Caller boleh restart kalau true.
   */
  updateEnvmanEnv(newEnv: Record<string, string>): boolean {
    this.config.envmanEnv = newEnv
    const newHash = hashEnv(this.buildEnv())
    if (newHash === this.envHash) return false
    this.envHash = newHash
    return true
  }

  /**
   * Cleanup — dipanggil saat process di-delete dari manager.
   */
  async destroy(): Promise<void> {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.status !== 'stopped' && this.status !== 'errored') {
      await this.stop('destroy')
    }
    // Cleanup log resources (RL1)
    this.logTailer.closeAll()
    if (this.logWriter) this.logWriter.close()
  }

  // ─── private ─────────────────────────────────────────────────────────────

  private buildEnv(): Record<string, string> {
    return resolveChildEnv({
      processId: this.config.id,
      processName: this.config.name,
      userEnv: this.config.staticEnv,
      envmanEnv: this.config.envmanEnv,
      daemonEnv: process.env,
    })
  }

  private doSpawn(): void {
    if (this.config.command.length === 0) {
      this.status = 'errored'
      this.lastError = 'empty command'
      return
    }

    this.status = 'starting'
    this.startedAt = Date.now()
    this.lastExitCode = null
    this.lastError = null

    const env = this.buildEnv()

    log.info('spawning process', {
      name: this.config.name,
      command: this.config.command,
      cwd: this.config.cwd ?? process.cwd(),
    })

    try {
      this.subprocess = Bun.spawn(this.config.command, {
        cwd: this.config.cwd,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      })
    } catch (e: any) {
      this.status = 'errored'
      this.lastError = `spawn failed: ${e.message}`
      this.startedAt = null
      log.error('spawn failed', { name: this.config.name, error: e.message })
      return
    }

    // Mark online setelah minUptime — simplified untuk MVP, tidak ada port readiness check
    const minUptime = this.options.backoff?.minUptimeMs ?? 1000
    setTimeout(() => {
      if (this.status === 'starting' && this.subprocess && !this.subprocess.killed) {
        this.status = 'online'
        log.info('process online', { name: this.config.name, pid: this.subprocess.pid })
      }
    }, minUptime)

    // Monitor exit
    this.subprocess.exited.then((code) => {
      this.handleExit(code)
    }).catch((e) => {
      log.error('exited promise rejected', { name: this.config.name, error: e.message })
    })

    // Pipe stdout/stderr ke LogWriter (Phase 3)
    if (this.logWriter) {
      this.pipeToLog(this.subprocess.stdout, 'out')
      this.pipeToLog(this.subprocess.stderr, 'err')
    } else {
      // No log writer — drain agar tidak deadlock di pipe
      this.consumeStream(this.subprocess.stdout)
      this.consumeStream(this.subprocess.stderr)
    }
  }

  private async pipeToLog(
    stream: ReadableStream<Uint8Array> | undefined | number,
    which: 'out' | 'err',
  ): Promise<void> {
    if (!stream || typeof stream === 'number') return
    if (!this.logWriter) return
    const decoder = new TextDecoder('utf-8')
    try {
      const reader = stream.getReader()
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          // stream:true untuk handle multibyte UTF-8 boundary di tengah chunk
          const chunk = decoder.decode(value, { stream: true })
          if (which === 'out') this.logWriter.writeOut(chunk)
          else this.logWriter.writeErr(chunk)
        }
        // Flush final partial chunk
        const tail = decoder.decode()
        if (tail) {
          if (which === 'out') this.logWriter.writeOut(tail)
          else this.logWriter.writeErr(tail)
        }
        this.logWriter.flushRemainder()
      } finally {
        reader.releaseLock()
      }
    } catch (e: any) {
      log.warn('log pipe error', { name: this.config.name, which, error: e.message })
    }
  }

  private async consumeStream(stream: ReadableStream<Uint8Array> | undefined | number): Promise<void> {
    if (!stream || typeof stream === 'number') return
    try {
      const reader = stream.getReader()
      try {
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      } finally {
        reader.releaseLock()
      }
    } catch {
      // ignore
    }
  }

  private handleExit(code: number | null): void {
    const exitCode = code ?? -1
    this.lastExitCode = exitCode

    // Hindari race: kalau stop() yang trigger exit, status sudah 'stopping' atau 'stopped'.
    if (this.status === 'stopping' || this.status === 'stopped') {
      log.debug('exit during stop, ignoring autorestart', {
        name: this.config.name,
        code: exitCode,
      })
      return
    }

    const uptimeMs = this.startedAt ? Date.now() - this.startedAt : 0
    log.info('process exited', {
      name: this.config.name,
      code: exitCode,
      uptimeMs,
    })

    this.subprocess = null
    this.startedAt = null

    if (!this.options.autorestart) {
      this.status = exitCode === 0 ? 'stopped' : 'errored'
      return
    }

    // Decide autorestart vs quarantine
    const action = recordExit(this.backoffState, uptimeMs, Date.now(), this.options.backoff)
    if (action === 'quarantine') {
      this.status = 'quarantined'
      this.lastError = `Quarantined: ${this.backoffState.restartWindow.length} restarts in window`
      log.warn('process quarantined', {
        name: this.config.name,
        restarts: this.backoffState.restartCount,
      })
      return
    }

    const delayMs = computeDelayMs(this.backoffState.restartCount, this.options.backoff)
    log.info('scheduling restart', {
      name: this.config.name,
      delayMs,
      restartCount: this.backoffState.restartCount,
    })
    this.status = 'starting'  // optimistik — actual spawn setelah delay
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      this.doSpawn()
    }, delayMs)
  }

  /**
   * Serial-execute operasi (start/stop/restart) untuk avoid race condition.
   */
  private async runOp<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.opLock
    let resolve: () => void
    this.opLock = new Promise(r => { resolve = r })
    try {
      await previous
      return await fn()
    } finally {
      resolve!()
    }
  }
}
