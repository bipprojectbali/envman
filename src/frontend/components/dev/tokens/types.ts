export interface AdminToken {
  id: string
  name: string
  scopes: string[]
  canWrite: boolean
  isDisabled: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
  useCount: number
  lastIp: string | null
  disabledBy: string | null
  disabledAt: string | null
  disabledReason: string | null
  user: { id: string; name: string; email: string; role: string }
}

export interface Summary {
  total: number
  active: number
  disabled: number
  expired: number
}

export const STALE_DAYS = 30
export const EXPIRING_DAYS = 7

export function tokenWarnings(t: AdminToken) {
  const now = Date.now()
  const stale =
    !t.isDisabled &&
    !t.expiresAt &&
    (t.lastUsedAt
      ? now - new Date(t.lastUsedAt).getTime() > STALE_DAYS * 86400_000
      : now - new Date(t.createdAt).getTime() > STALE_DAYS * 86400_000)
  const expiring =
    !t.isDisabled &&
    !!t.expiresAt &&
    new Date(t.expiresAt).getTime() - now > 0 &&
    new Date(t.expiresAt).getTime() - now < EXPIRING_DAYS * 86400_000
  const expired = !!t.expiresAt && new Date(t.expiresAt) < new Date() && !t.isDisabled
  const wide = t.canWrite && t.scopes.length === 0
  return { stale, expiring, expired, wide }
}

export function tokenStatusColor(t: AdminToken) {
  if (t.isDisabled) return 'gray'
  if (t.expiresAt && new Date(t.expiresAt) < new Date()) return 'red'
  return 'green'
}

export function tokenStatusLabel(t: AdminToken) {
  if (t.isDisabled) return 'Disabled'
  if (t.expiresAt && new Date(t.expiresAt) < new Date()) return 'Expired'
  return 'Active'
}
