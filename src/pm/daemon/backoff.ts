// Backoff strategy + crash-loop detection.
//
// Bug yang dimitigasi (PROCESS-MANAGER-PLAN.md):
//   P1: instant crash-loop hammer CPU → exponential backoff dengan cap
//   P2: bm2 pakai absolute counter (max 16) → kita pakai sliding window
//       5 crash dalam 60s = quarantined, exit dari quarantine = manual reset

export interface BackoffConfig {
  baseDelayMs: number // default 1000
  capDelayMs: number // default 60_000
  minUptimeMs: number // 1000 = process harus bertahan 1s untuk dianggap stable
  resetThresholdMs: number // 10_000 = setelah uptime > 10s, reset counter
  windowDurationMs: number // 60_000 = sliding window untuk crash-loop detection
  maxRestartsInWindow: number // 5 = max restart dalam window sebelum quarantine
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  baseDelayMs: 1000,
  capDelayMs: 60_000,
  minUptimeMs: 1000,
  resetThresholdMs: 10_000,
  windowDurationMs: 60_000,
  maxRestartsInWindow: 5,
}

export interface BackoffState {
  restartCount: number // total restart sejak last reset (atau sejak start)
  restartWindow: number[] // timestamps (epoch ms) dalam window
}

export function newBackoffState(): BackoffState {
  return { restartCount: 0, restartWindow: [] }
}

/**
 * Hitung delay restart berikutnya berdasarkan restartCount.
 * Pure function — tidak mutate state.
 */
export function computeDelayMs(restartCount: number, cfg: BackoffConfig = DEFAULT_BACKOFF): number {
  if (restartCount <= 0) return 0
  const exp = 2 ** (restartCount - 1)
  return Math.min(cfg.capDelayMs, cfg.baseDelayMs * exp)
}

/**
 * Record exit dengan uptime. Return action yang harus diambil.
 * - 'restart': boleh restart dengan delay computeDelayMs(state.restartCount)
 * - 'quarantine': crash-loop terdeteksi (≥maxRestartsInWindow dalam windowDuration)
 *                 → caller harus stop autorestart sampai user reset manual.
 */
export function recordExit(
  state: BackoffState,
  uptimeMs: number,
  now: number = Date.now(),
  cfg: BackoffConfig = DEFAULT_BACKOFF,
): 'restart' | 'quarantine' {
  // Reset counter kalau stable run
  if (uptimeMs >= cfg.resetThresholdMs) {
    state.restartCount = 0
    state.restartWindow = []
  }

  // Increment + record di window
  state.restartCount++
  state.restartWindow.push(now)

  // Trim window — buang timestamp lama di luar windowDurationMs
  const cutoff = now - cfg.windowDurationMs
  state.restartWindow = state.restartWindow.filter((t) => t >= cutoff)

  if (state.restartWindow.length >= cfg.maxRestartsInWindow) {
    return 'quarantine'
  }
  return 'restart'
}

/**
 * Reset state — dipanggil saat user explicit `envman pm reset <name>`
 * atau saat container baru spawn manual setelah quarantine.
 */
export function resetBackoff(state: BackoffState): void {
  state.restartCount = 0
  state.restartWindow = []
}
