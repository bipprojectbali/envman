export interface ApiToken {
  id: string
  name: string
  scopes: string[]
  tags: string[]
  canWrite: boolean
  isDisabled: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

const TAG_COLORS = [
  'red', 'pink', 'grape', 'violet', 'indigo', 'blue',
  'cyan', 'teal', 'green', 'lime', 'yellow', 'orange',
] as const

export function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hari lalu`
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function absoluteTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function expiryStatus(expiresAt: string | null): 'none' | 'active' | 'soon' | 'expired' {
  if (!expiresAt) return 'none'
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff < 0) return 'expired'
  if (diff < 7 * 24 * 60 * 60 * 1000) return 'soon'
  return 'active'
}

export function daysUntil(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

export const TOKEN_CARD_STYLES = `
.envman-token-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-token-card:not(.is-disabled):not(.is-expired):hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-primary);
  box-shadow: var(--mantine-shadow-sm);
}
`
