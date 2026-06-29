export const roleColor = { OWNER: 'blue', EDITOR: 'teal', VIEWER: 'gray' } as const

export const envColor: Record<string, string> = {
  production: 'red',
  prod: 'red',
  staging: 'orange',
  stage: 'orange',
  development: 'blue',
  dev: 'blue',
  testing: 'grape',
  test: 'grape',
  qa: 'cyan',
  uat: 'pink',
}

export const getEnvColor = (name: string) => envColor[name.toLowerCase()] ?? 'primary'

export const ENV_NAME_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/
export const ENV_PRESETS = ['prod', 'stg', 'dev'] as const

const TAG_COLORS = [
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
] as const

export function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

export function relativeDate(iso?: string): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0 || Number.isNaN(ms)) return ''
  if (ms < 60_000) return 'baru saja'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m} mnt lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hari lalu`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} bln lalu`
  return `${Math.floor(mo / 12)} thn lalu`
}
