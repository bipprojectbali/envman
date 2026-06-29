export interface EnvVar {
  id: string
  key: string
  value: string
  isSecret: boolean
  isDisabled: boolean
  updatedAt: string
  imported?: boolean
  source?: { project: string; env: string }
}

export type FilterType = 'all' | 'plain' | 'secret'

export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}j`
  if (d < 30) return `${d}h`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}
