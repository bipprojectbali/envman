// LogWriter — per-process file writer untuk child stdout/stderr.
//
// Bug yang dimitigasi (PROCESS-MANAGER-PLAN.md):
//   L1 ✓ Pakai fs.appendFile O_APPEND (bukan Bun.write read+rewrite)
//        + persistent fd reuse antar flush untuk hindari open/close 100ms.
//   L2 ✓ Remainder buffer YANG BENAR untuk chunk boundary di tengah baris
//        (bm2 punya bug di sini — komentar bagus, impl salah).
//   L7 ✓ Mode 0640 saat create (owner rw, group r).
//   L6 ✓ ENOSPC detection — set disk full flag, hentikan write.

import { closeSync, existsSync, openSync, statSync, writeSync } from 'node:fs'
import { log } from './logger'

/** Callback dipanggil setiap line BARU di-write ke disk (untuk tailer). */
export type LineHook = (line: string) => void

export interface LogWriterOptions {
  outPath: string // ~/.config/envman/run/logs/<name>-<id>.out.log
  errPath: string // dan .err.log
  /** Callback per-line untuk subscribe (tailer); optional */
  onOutLine?: LineHook
  onErrLine?: LineHook
  /** Callback saat disk penuh — daemon health akan flag */
  onDiskFull?: () => void
}

export class LogWriter {
  private outFd: number | null = null
  private errFd: number | null = null
  private outRemainder = ''
  private errRemainder = ''
  private closed = false
  private diskFull = false

  constructor(private readonly opts: LogWriterOptions) {
    this.openFds()
  }

  private openFds(): void {
    try {
      // O_APPEND: kernel guarantee atomic append (race-safe antar fd)
      // Mode 0640: owner rw, group r, other none
      this.outFd = openSync(this.opts.outPath, 'a', 0o640)
      this.errFd = openSync(this.opts.errPath, 'a', 0o640)
    } catch (e: any) {
      log.error('failed to open log files', {
        out: this.opts.outPath,
        err: this.opts.errPath,
        error: e.message,
      })
    }
  }

  /**
   * Write chunk dari stdout. Line-splitting dengan remainder buffer.
   *
   * IMPORTANT (bm2 bug L2 mitigation):
   *   Chunk bisa berakhir di tengah baris. Strategi:
   *     (remainder + chunk).split('\n')
   *     last element = new remainder (mungkin partial)
   *     elements lain = lines lengkap (di-write + dikirim ke hook)
   */
  writeOut(chunk: string): void {
    this.writeChunk(chunk, 'out')
  }

  writeErr(chunk: string): void {
    this.writeChunk(chunk, 'err')
  }

  private writeChunk(chunk: string, stream: 'out' | 'err'): void {
    if (this.closed || this.diskFull) return
    const fd = stream === 'out' ? this.outFd : this.errFd
    if (fd === null) return

    // Append to remainder, split by \n
    const combined = (stream === 'out' ? this.outRemainder : this.errRemainder) + chunk
    const parts = combined.split('\n')
    const newRemainder = parts.pop() ?? '' // last element = partial atau ''
    if (stream === 'out') this.outRemainder = newRemainder
    else this.errRemainder = newRemainder

    // Write lengkap lines (each ends with \n in original)
    if (parts.length === 0) return

    const hook = stream === 'out' ? this.opts.onOutLine : this.opts.onErrLine
    for (const line of parts) {
      try {
        writeSync(fd, `${line}\n`)
        if (hook) hook(line)
      } catch (e: any) {
        if (e.code === 'ENOSPC') {
          this.diskFull = true
          log.error('disk full, pausing log writes', { stream })
          if (this.opts.onDiskFull) this.opts.onDiskFull()
          return
        }
        // EBADF — fd ditutup, EIO — IO error
        log.warn('log write error', { stream, error: e.message })
        return
      }
    }
  }

  /**
   * Flush remainder partial line ke file (saat process exit untuk avoid
   * data hilang). Hanya panggil saat ProcessContainer tahu stream selesai.
   */
  flushRemainder(): void {
    if (this.closed) return
    if (this.outRemainder.length > 0 && this.outFd !== null) {
      try {
        writeSync(this.outFd, `${this.outRemainder}\n`)
        if (this.opts.onOutLine) this.opts.onOutLine(this.outRemainder)
      } catch {}
      this.outRemainder = ''
    }
    if (this.errRemainder.length > 0 && this.errFd !== null) {
      try {
        writeSync(this.errFd, `${this.errRemainder}\n`)
        if (this.opts.onErrLine) this.opts.onErrLine(this.errRemainder)
      } catch {}
      this.errRemainder = ''
    }
  }

  /**
   * Close file descriptors. Dipanggil saat ProcessContainer di-delete.
   */
  close(): void {
    if (this.closed) return
    // Flush dulu sebelum set closed flag — flushRemainder check `closed`
    this.flushRemainder()
    this.closed = true
    if (this.outFd !== null) {
      try {
        closeSync(this.outFd)
      } catch {}
      this.outFd = null
    }
    if (this.errFd !== null) {
      try {
        closeSync(this.errFd)
      } catch {}
      this.errFd = null
    }
  }

  /**
   * Untuk rotator: close current fd, akan dipanggil reopen() setelah rename.
   */
  closeFdsForRotation(): void {
    this.flushRemainder()
    if (this.outFd !== null) {
      try {
        closeSync(this.outFd)
      } catch {}
      this.outFd = null
    }
    if (this.errFd !== null) {
      try {
        closeSync(this.errFd)
      } catch {}
      this.errFd = null
    }
  }

  /**
   * Untuk rotator: reopen fd setelah rename — file di path lama sekarang
   * adalah file baru.
   */
  reopenFds(): void {
    this.openFds()
  }

  isOpen(): boolean {
    return !this.closed
  }

  getOutPath(): string {
    return this.opts.outPath
  }

  getErrPath(): string {
    return this.opts.errPath
  }

  /**
   * Ukuran file out + err saat ini. Untuk rotator size check.
   */
  getSizes(): { out: number; err: number } {
    let outSize = 0,
      errSize = 0
    try {
      if (existsSync(this.opts.outPath)) outSize = statSync(this.opts.outPath).size
    } catch {}
    try {
      if (existsSync(this.opts.errPath)) errSize = statSync(this.opts.errPath).size
    } catch {}
    return { out: outSize, err: errSize }
  }
}
