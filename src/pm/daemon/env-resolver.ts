// Env resolver — bangun env untuk child process.
//
// Bug yang dimitigasi (P5 di PROCESS-MANAGER-PLAN.md):
//   bm2 leak SEMUA process.env ke child. Kita pakai explicit allowlist
//   + strip secret variables yang punya envman daemon (ENVMAN_TOKEN, ENVMAN_SERVER).

/**
 * Env vars yang aman di-inherit dari daemon ke child.
 * Cover: locale, paths, terminal, language identity.
 */
export const DEFAULT_INHERIT_ALLOWLIST: readonly string[] = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TZ',
  'LANG',
  'LC_ALL',
  'TERM',
  // LC_* family
] as const

/**
 * Variables yang HARUS di-strip dari child env, walaupun ada di allowlist.
 * Ini secret/auth yang dipakai daemon untuk komunikasi dengan envman server —
 * child tidak boleh dapat akses ini secara default.
 */
export const STRIP_ALWAYS: readonly string[] = [
  'ENVMAN_TOKEN',
  'ENVMAN_SERVER',
  'ENVMAN_PM_HOME', // jangan biarkan child manipulate daemon paths
] as const

export interface ResolveEnvParams {
  /** Static env user yang di-set saat `pm start` */
  userEnv?: Record<string, string>
  /** Env dari envman server (Phase 5+). Sekarang kosong. */
  envmanEnv?: Record<string, string>
  /** Metadata pm — auto-injected */
  processId: string
  processName: string
  /** Daemon's env saat ini (process.env) — di-filter via allowlist */
  daemonEnv?: NodeJS.ProcessEnv
  /** Extra keys yang boleh di-inherit (selain DEFAULT_INHERIT_ALLOWLIST) */
  extraAllowlist?: readonly string[]
}

/**
 * Build env final untuk child process.
 * Order precedence (last wins):
 *   1. Daemon inherited (allowlist only)
 *   2. envman server env
 *   3. User static env
 *   4. PM metadata (ENVMAN_PM_*)
 */
export function resolveChildEnv(params: ResolveEnvParams): Record<string, string> {
  const daemonEnv = params.daemonEnv ?? process.env
  const allowlist = new Set<string>(
    params.extraAllowlist ? [...DEFAULT_INHERIT_ALLOWLIST, ...params.extraAllowlist] : DEFAULT_INHERIT_ALLOWLIST,
  )
  const stripSet = new Set<string>(STRIP_ALWAYS)

  const result: Record<string, string> = {}

  // 1. Inherit dari daemon env — hanya yang di allowlist
  for (const [key, value] of Object.entries(daemonEnv)) {
    if (value === undefined) continue
    if (stripSet.has(key)) continue
    if (allowlist.has(key) || key.startsWith('LC_')) {
      result[key] = value
    }
  }

  // 2. envman server env (Phase 5+)
  if (params.envmanEnv) {
    for (const [key, value] of Object.entries(params.envmanEnv)) {
      if (stripSet.has(key)) continue
      result[key] = value
    }
  }

  // 3. User static env
  if (params.userEnv) {
    for (const [key, value] of Object.entries(params.userEnv)) {
      if (stripSet.has(key)) continue
      result[key] = value
    }
  }

  // 4. PM metadata (auto-injected, override semua)
  result.ENVMAN_PM_ID = params.processId
  result.ENVMAN_PM_NAME = params.processName

  return result
}

/**
 * Hash env untuk detect changes (Phase 5 sync feature).
 * Pakai sorted JSON canonical form untuk avoid key-order false positive.
 * Stub untuk sekarang — Phase 5+ akan return sha256.
 */
export function hashEnv(env: Record<string, string>): string {
  const sorted = Object.keys(env)
    .sort()
    .map((k) => `${k}=${env[k]}`)
    .join('\n')
  // Pakai Bun.hash kalau ada, atau fallback ke string length untuk Phase 2 placeholder
  // Phase 5+ akan ganti ke sha256.
  if (typeof (globalThis as any).Bun?.hash === 'function') {
    return String((globalThis as any).Bun.hash(sorted))
  }
  return `${sorted.length}-${sorted.slice(0, 32)}`
}
