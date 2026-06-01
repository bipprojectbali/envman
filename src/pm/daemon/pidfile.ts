// PidFile — single-instance lock untuk daemon.
//
// Bug yang dimitigasi (lihat PROCESS-MANAGER-PLAN.md):
//   D2: race condition saat dua daemon spawn paralel
//        → O_EXCL atomic create, hanya 1 yang sukses.
//   D3: PID hijack (PID di-recycle untuk proses random)
//        → simpan (pid, start_epoch), validate dua-duanya.
//   D5: stale socket setelah daemon crash
//        → kalau PID file ada tapi proses mati, cleanup PID file + socket
//          sebelum bind baru.

import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, constants as fsConstants, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs'

export interface PidFileContent {
  pid: number
  startEpochMs: number // process start time, untuk PID-hijack guard
  socketPath: string
}

/**
 * Baca start time process dari OS (untuk PID-hijack guard).
 *
 * Pendekatan portable: `ps -o etime= -p <pid>` → elapsed time sejak start.
 * `start_epoch = Date.now() - elapsed_ms`. Timezone-safe karena pakai elapsed,
 * bukan absolute date string yang bisa ambiguous.
 *
 * Format etime: `SS`, `MM:SS`, `HH:MM:SS`, atau `DD-HH:MM:SS`.
 *
 * Returns null kalau proses tidak ditemukan atau parse gagal.
 */
export function getProcessStartEpoch(pid: number): number | null {
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    // Unsupported platform — return null (caller treat as alive, skip hijack guard)
    return null
  }

  try {
    const result = spawnSync('ps', ['-o', 'etime=', '-p', String(pid)], {
      encoding: 'utf8',
    })
    if (result.status !== 0) return null
    const etime = result.stdout.trim()
    if (!etime) return null

    const elapsedSec = parseEtime(etime)
    if (elapsedSec === null) return null

    return Date.now() - elapsedSec * 1000
  } catch {
    return null
  }
}

/**
 * Parse `ps -o etime=` output ke total seconds.
 * Supported formats:
 *   "12"           = 12 sec
 *   "01:23"        = 1 min 23 sec
 *   "12:34:56"     = 12 hr 34 min 56 sec
 *   "2-12:34:56"   = 2 days 12 hr 34 min 56 sec
 */
export function parseEtime(etime: string): number | null {
  let days = 0
  let rest = etime
  const dayMatch = /^(\d+)-(.+)$/.exec(etime)
  if (dayMatch) {
    days = parseInt(dayMatch[1], 10)
    rest = dayMatch[2]
  }
  const parts = rest.split(':').map((s) => parseInt(s, 10))
  if (parts.some((p) => !Number.isFinite(p))) return null

  let hh = 0,
    mm = 0,
    ss = 0
  if (parts.length === 1) {
    ss = parts[0]
  } else if (parts.length === 2) {
    mm = parts[0]
    ss = parts[1]
  } else if (parts.length === 3) {
    hh = parts[0]
    mm = parts[1]
    ss = parts[2]
  } else {
    return null
  }

  return days * 86400 + hh * 3600 + mm * 60 + ss
}

/**
 * Cek apakah PID hidup. Pakai kill(pid, 0) — kirim signal nol = no-op tapi
 * trigger permission check. ESRCH = process dead, EPERM = process exists tapi
 * tidak boleh signal (treat as alive).
 */
export function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e: any) {
    if (e.code === 'EPERM') return true
    return false // ESRCH atau errno lain
  }
}

export class PidFile {
  constructor(private readonly path: string) {}

  /**
   * Atomic create dengan O_EXCL. Gagal kalau file sudah ada.
   * Throws Error dengan kode khusus:
   *   - 'EEXIST': file sudah ada (mungkin daemon lain hidup, atau stale)
   *   - 'EACCES'/'ENOENT' dll: filesystem error
   */
  tryAcquire(content: PidFileContent): void {
    const fd = openSync(this.path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600)
    try {
      const data = `${content.pid}\n${content.startEpochMs}\n${content.socketPath}\n`
      writeSync(fd, data)
    } finally {
      closeSync(fd)
    }
  }

  /**
   * Baca isi PID file. Return null kalau tidak ada atau corrupt.
   */
  read(): PidFileContent | null {
    if (!existsSync(this.path)) return null
    try {
      const raw = readFileSync(this.path, 'utf8').trim()
      const lines = raw.split('\n')
      if (lines.length < 3) return null
      const pid = Number(lines[0])
      const startEpochMs = Number(lines[1])
      const socketPath = lines[2]
      if (!Number.isFinite(pid) || pid <= 0) return null
      if (!Number.isFinite(startEpochMs)) return null
      if (!socketPath) return null
      return { pid, startEpochMs, socketPath }
    } catch {
      return null
    }
  }

  /**
   * Validate daemon di-claim PID file masih hidup DAN start_epoch cocok
   * (hijack guard). Returns:
   *   - 'alive': daemon valid hidup
   *   - 'dead': PID file ada tapi proses mati → safe untuk cleanup+claim
   *   - 'hijacked': PID hidup tapi start_epoch beda → PID di-recycle, cleanup+claim
   *   - 'missing': PID file tidak ada
   */
  status(): 'alive' | 'dead' | 'hijacked' | 'missing' {
    const content = this.read()
    if (!content) return 'missing'
    if (!isPidAlive(content.pid)) return 'dead'

    // PID hidup — cek start_epoch
    const actualStart = getProcessStartEpoch(content.pid)
    if (actualStart === null) {
      // Tidak bisa cek start time (unsupported platform atau ps gagal) —
      // assume alive, terima risiko hijack kecil
      return 'alive'
    }
    // Toleransi 2 detik karena resolusi /proc maupun ps tidak presisi
    const TOLERANCE_MS = 2000
    if (Math.abs(actualStart - content.startEpochMs) <= TOLERANCE_MS) {
      return 'alive'
    }
    return 'hijacked'
  }

  /**
   * Hapus PID file. Idempotent — tidak throw kalau sudah tidak ada.
   */
  release(): void {
    try {
      if (existsSync(this.path)) unlinkSync(this.path)
    } catch {
      // ignore — best effort cleanup
    }
  }
}
