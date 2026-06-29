import { Paper, Skeleton, Text, ThemeIcon, Group } from '@mantine/core'
import { TbChevronRight } from 'react-icons/tb'

interface OverviewStatCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color: string
  loading?: boolean
  onClick?: () => void
}

export function OverviewStatCard({ icon: Icon, label, value, sub, color, loading, onClick }: OverviewStatCardProps) {
  const clickable = !!onClick
  return (
    <Paper
      p={{ base: 'sm', sm: 'md' }}
      className={`envman-stat-card ${clickable ? 'is-clickable' : ''}`}
      role={clickable ? 'link' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Buka ${label}` : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } : undefined}
      style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', cursor: clickable ? 'pointer' : undefined }}
    >
      <Group justify="space-between" align="center" mb={8}>
        <ThemeIcon size={32} radius="md" variant="light" color={color}>
          <Icon size={16} />
        </ThemeIcon>
        {clickable && <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />}
      </Group>
      {loading ? (
        <Skeleton height={26} width={48} mb={4} />
      ) : (
        <Text fw={800} size="xl" lh={1} mb={4}>{value}</Text>
      )}
      <Text size="xs" fw={600} c="dimmed">{label}</Text>
      {sub && <Text size="xs" c="dimmed" mt={2} lineClamp={1}>{sub}</Text>}
    </Paper>
  )
}
