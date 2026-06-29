export type Connection = { id: string; name: string }

export type Backup = {
  id: string
  type: string
  note: string | null
  sizeBytes: number | null
  ok: boolean
  error: string | null
  createdAt: string
  createdBy: { name: string } | null
}

export type Schedule = {
  id: string
  cron: string
  type: string
  note: string | null
  enabled: boolean
  lastRunAt: string | null
  lastRunOk: boolean | null
} | null

export const TYPE_LABELS: Record<string, string> = {
  PORTAINER_DB: 'Database',
  COMPOSE_FILES: 'Compose Files',
  FULL: 'Full',
}

export function formatBytes(n: number | null) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
