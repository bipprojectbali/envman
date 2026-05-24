// LogRotator — size-based log rotation dengan atomic gzip.
//
// Bug yang dimitigasi (PROCESS-MANAGER-PLAN.md):
//   L3 ✓ Inode race: close fd, rename, reopen — buffered writes ditahan.
//   L4 ✓ Gzip atomic: rename ke .tmp.gz, gzip in-place, rename ke .gz final.
//
// Rotate scheme N-shifting:
//   file.log     → file.log.1 (uncompressed, fresh rotation)
//   file.log.1   → file.log.2 (becomes .gz in background, see compressInBackground)
//   file.log.5   → DELETE (oldest, beyond cap)

import { existsSync, renameSync, unlinkSync, statSync } from 'fs'
import { log } from './logger'
import type { LogWriter } from './log-writer'

export interface RotatorOptions {
  maxSizeBytes: number          // default 10 * 1024 * 1024
  maxFiles: number              // default 5
  checkIntervalMs: number       // default 60_000
}

export const DEFAULT_ROTATOR: RotatorOptions = {
  maxSizeBytes: 10 * 1024 * 1024,
  maxFiles: 5,
  checkIntervalMs: 60_000,
}

export class LogRotator {
  private interval: NodeJS.Timeout | null = null
  /** Set of paths yang ada gzip job berjalan (avoid double-gzip race) */
  private compressing = new Set<string>()

  constructor(
    private readonly writers: Map<string, LogWriter>,
    private readonly opts: RotatorOptions = DEFAULT_ROTATOR,
  ) {}

  /**
   * Start periodic rotation check. Idempotent.
   */
  start(): void {
    if (this.interval) return
    this.interval = setInterval(() => {
      this.checkAndRotate().catch(e => log.error('rotation check failed', { error: e.message }))
    }, this.opts.checkIntervalMs)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  /**
   * Public method untuk force check (test atau saat process exit untuk safety).
   */
  async checkAndRotate(): Promise<void> {
    for (const [id, writer] of this.writers) {
      const { out, err } = writer.getSizes()
      const needRotateOut = out >= this.opts.maxSizeBytes
      const needRotateErr = err >= this.opts.maxSizeBytes
      if (!needRotateOut && !needRotateErr) continue

      // Close fd dulu sebelum rename, reopen setelah
      writer.closeFdsForRotation()
      try {
        if (needRotateOut) this.rotateFile(writer.getOutPath())
        if (needRotateErr) this.rotateFile(writer.getErrPath())
      } catch (e: any) {
        log.error('rotate failed', { id, error: e.message })
      } finally {
        // Selalu reopen — biar daemon tidak kehilangan log fd
        writer.reopenFds()
      }
    }
  }

  /**
   * Rotate satu file dengan N-shifting + background gzip.
   *
   * Step:
   *   1. Hapus file.log.N (paling lama) kalau ada
   *   2. Shift: file.log.{N-1} → file.log.N (.gz dan non-gz)
   *   ...
   *   3. file.log → file.log.1 (uncompressed)
   *   4. Schedule gzip background: file.log.1 → file.log.1.gz (atomic via tmp+rename)
   */
  private rotateFile(path: string): void {
    if (!existsSync(path)) return

    const maxFiles = this.opts.maxFiles

    // Step 1: hapus paling lama (uncompressed + gz variant)
    const oldest = `${path}.${maxFiles}`
    if (existsSync(oldest)) { try { unlinkSync(oldest) } catch {} }
    if (existsSync(`${oldest}.gz`)) { try { unlinkSync(`${oldest}.gz`) } catch {} }

    // Step 2: shift dari N-1 ke N
    for (let i = maxFiles - 1; i >= 1; i--) {
      const from = `${path}.${i}`
      const to = `${path}.${i + 1}`
      try {
        if (existsSync(from)) renameSync(from, to)
      } catch (e: any) {
        log.warn('rotate shift failed', { from, to, error: e.message })
      }
      // Shift .gz variants too
      const fromGz = `${from}.gz`
      const toGz = `${to}.gz`
      try {
        if (existsSync(fromGz)) renameSync(fromGz, toGz)
      } catch (e: any) {
        log.warn('rotate gz shift failed', { from: fromGz, to: toGz, error: e.message })
      }
    }

    // Step 3: current → .1 (uncompressed initially)
    const target = `${path}.1`
    try {
      renameSync(path, target)
    } catch (e: any) {
      log.error('rotate current rename failed', { path, target, error: e.message })
      return
    }

    // Step 4: background gzip (atomic tmp + rename)
    this.compressInBackground(target)
  }

  /**
   * Compress file di background pakai system gzip binary.
   * Atomic: gzip ke tmp.gz, rename ke final.gz.
   */
  private compressInBackground(path: string): void {
    if (this.compressing.has(path)) return
    this.compressing.add(path)

    const tmpPath = `${path}.tmp`
    const finalPath = `${path}.gz`

    // Step 1: rename source → tmp (untuk avoid race kalau ada rotate berikutnya)
    try {
      renameSync(path, tmpPath)
    } catch (e: any) {
      log.warn('rename to tmp failed', { path, error: e.message })
      this.compressing.delete(path)
      return
    }

    // Step 2: spawn gzip — fire and forget
    try {
      const proc = Bun.spawn(['gzip', '-f', tmpPath], {
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      proc.exited.then((code) => {
        this.compressing.delete(path)
        if (code !== 0) {
          log.warn('gzip exited with non-zero', { path, code })
          // Cleanup tmp kalau gagal
          if (existsSync(tmpPath)) { try { unlinkSync(tmpPath) } catch {} }
          return
        }
        // gzip menambah .gz ke nama: tmp → tmp.gz
        const gzTmp = `${tmpPath}.gz`
        if (!existsSync(gzTmp)) {
          log.warn('gzip output missing', { gzTmp })
          return
        }
        // Step 3: rename ke final (atomic)
        try {
          renameSync(gzTmp, finalPath)
        } catch (e: any) {
          log.warn('rename gz to final failed', { gzTmp, finalPath, error: e.message })
        }
      }).catch((e) => {
        log.warn('gzip await failed', { path, error: e.message })
        this.compressing.delete(path)
      })
    } catch (e: any) {
      // gzip binary not found atau spawn error
      log.warn('gzip spawn failed', { path, error: e.message })
      this.compressing.delete(path)
      // Restore: tmp back to .1 (uncompressed)
      try { renameSync(tmpPath, path) } catch {}
    }
  }
}
