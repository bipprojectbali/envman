import { Box, Text } from '@mantine/core'
import { getProjectIcon } from '@/frontend/lib/project-avatar'
import { roleColor } from '@/frontend/lib/project-utils'

export function ProjectAvatar({
  name,
  role,
  size = 40,
  icon,
  color,
}: {
  name: string
  role: string
  size?: number
  icon?: string | null
  color?: string | null
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  // Warna custom bila diset, else fallback warna-by-role (perilaku lama).
  const effectiveColor = color ?? roleColor[role as keyof typeof roleColor] ?? 'gray'
  const IconCmp = getProjectIcon(icon)
  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        flexShrink: 0,
        background: `var(--mantine-color-${effectiveColor}-light)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {IconCmp ? (
        <IconCmp size={size * 0.5} style={{ color: `var(--mantine-color-${effectiveColor}-light-color)` }} />
      ) : (
        <Text
          size={size > 36 ? 'sm' : 'xs'}
          fw={800}
          lh={1}
          style={{ color: `var(--mantine-color-${effectiveColor}-light-color)` }}
        >
          {initial}
        </Text>
      )}
    </Box>
  )
}
