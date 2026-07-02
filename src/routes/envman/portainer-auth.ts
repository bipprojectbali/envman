import { getEnvironmentAccess } from '../../lib/access'
import type { EnvAuthCaller } from '../../lib/auth-middleware'
import { type Capability, hasCapability } from '../../lib/permissions'

// Caller minimal yang dibutuhkan cek capability. EnvAuthCaller memenuhi ini.
type CapCaller = Pick<EnvAuthCaller, 'userId' | 'role' | 'permissions'>

/**
 * Guard capability untuk endpoint connection-scoped (infra global). Set status 403
 * dan kembalikan body error bila caller tak punya capability. Return null = lolos.
 * Pola pakai: `const denied = requireCap(caller, 'stack:exec', set); if (denied) return denied`
 */
export function requireCap(
  caller: CapCaller,
  cap: Capability,
  set: { status?: number | string },
): { error: string } | null {
  if (hasCapability(caller, cap)) return null
  set.status = 403
  return { error: `Butuh capability: ${cap}` }
}

/**
 * Guard untuk endpoint env-scoped: lolos bila caller EDITOR/OWNER di env tsb ATAU
 * punya capability global. Backward-compatible dengan workflow role project existing.
 * Return null = lolos; selain itu body error (status sudah di-set).
 */
export async function editorOrCap(
  caller: CapCaller,
  slug: string,
  envName: string,
  cap: Capability,
  set: { status?: number | string },
): Promise<{ error: string } | null> {
  const access = await getEnvironmentAccess(caller.userId, caller.role, slug, envName)
  if ((access && access !== 'VIEWER') || hasCapability(caller, cap)) return null
  set.status = 403
  return { error: `Butuh role EDITOR/OWNER di env ini atau capability: ${cap}` }
}

/**
 * Guard baca env-scoped: lolos bila caller punya akses apa pun di env (≥VIEWER) ATAU
 * punya capability. Untuk endpoint read seperti dangling images.
 */
export async function envAccessOrCap(
  caller: CapCaller,
  slug: string,
  envName: string,
  cap: Capability,
  set: { status?: number | string },
): Promise<{ error: string } | null> {
  const access = await getEnvironmentAccess(caller.userId, caller.role, slug, envName)
  if (access || hasCapability(caller, cap)) return null
  set.status = 403
  return { error: `Butuh akses env ini atau capability: ${cap}` }
}
