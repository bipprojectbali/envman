import { Box, Text } from '@mantine/core'
import { roleColor } from '@/frontend/lib/project-utils'

export function ProjectAvatar({ name, role, size = 40 }: { name: string; role: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  const color = roleColor[role as keyof typeof roleColor] ?? 'gray'
  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        flexShrink: 0,
        background: `var(--mantine-color-${color}-light)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        size={size > 36 ? 'sm' : 'xs'}
        fw={800}
        lh={1}
        style={{ color: `var(--mantine-color-${color}-light-color)` }}
      >
        {initial}
      </Text>
    </Box>
  )
}
