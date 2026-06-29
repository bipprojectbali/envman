import { Badge, Tooltip } from '@mantine/core'

export function HealthBadge({
  health,
}: { health?: { totalStacks: number; activeStacks: number; inactiveStacks: number } }) {
  if (!health) return null
  const color = health.inactiveStacks === 0 ? 'teal' : health.activeStacks === 0 ? 'red' : 'orange'
  return (
    <Tooltip
      label={`${health.activeStacks} aktif, ${health.inactiveStacks} tidak aktif, dari ${health.totalStacks} total stack`}
    >
      <Badge size="xs" variant="light" color={color}>
        {health.activeStacks}/{health.totalStacks} active
      </Badge>
    </Tooltip>
  )
}
