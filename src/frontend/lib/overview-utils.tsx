import { Box, Text } from '@mantine/core'

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hari lalu`
  return new Date(dateStr).toLocaleDateString('id-ID')
}

export function absoluteTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const HOVER_STYLES = `
.envman-stat-card,
.envman-overview-row {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-stat-card.is-clickable:hover,
.envman-overview-row:hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-primary);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-stat-card.is-clickable:focus-visible,
.envman-overview-row:focus-visible {
  outline: 2px solid var(--mantine-color-primary);
  outline-offset: 2px;
  border-color: var(--mantine-color-primary);
}
`

export const envColor = (name: string) => {
  if (name === 'production' || name === 'prod') return 'red'
  if (name === 'staging' || name === 'stg') return 'orange'
  if (name === 'development' || name === 'dev') return 'blue'
  return 'violet'
}

export function ProjectInitial({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <Box
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        flexShrink: 0,
        background: 'color-mix(in srgb, var(--mantine-color-blue-5) 25%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text size="xs" fw={800} c="blue" lh={1}>
        {initial}
      </Text>
    </Box>
  )
}
