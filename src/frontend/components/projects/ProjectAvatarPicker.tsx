import { ActionIcon, Box, Group, Stack, Text, Tooltip } from '@mantine/core'
import { TbLetterCase } from 'react-icons/tb'
import { ProjectAvatar } from '@/frontend/components/projects/ProjectAvatar'
import { PROJECT_AVATAR_COLORS, PROJECT_ICON_NAMES, PROJECT_ICONS } from '@/frontend/lib/project-avatar'

/**
 * Picker icon + background color untuk avatar project. Nilai null = default
 * (inisial nama / warna-by-role). Live preview memakai ProjectAvatar yang sama.
 */
export function ProjectAvatarPicker({
  name,
  role,
  icon,
  color,
  onIconChange,
  onColorChange,
}: {
  name: string
  role: string
  icon: string | null
  color: string | null
  onIconChange: (v: string | null) => void
  onColorChange: (v: string | null) => void
}) {
  return (
    <Stack gap="sm">
      <Group gap="sm" align="center">
        <ProjectAvatar name={name || '?'} role={role} size={48} icon={icon} color={color} />
        <Text size="xs" c="dimmed">
          Pratinjau avatar. Icon & warna opsional — kosong = inisial nama + warna sesuai role.
        </Text>
      </Group>

      {/* Icon grid */}
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          Icon
        </Text>
        <Group gap={6}>
          <Tooltip label="Inisial nama (default)" withArrow>
            <ActionIcon
              variant={icon === null ? 'filled' : 'default'}
              color={icon === null ? 'blue' : 'gray'}
              size="lg"
              radius="md"
              onClick={() => onIconChange(null)}
            >
              <TbLetterCase size={18} />
            </ActionIcon>
          </Tooltip>
          {PROJECT_ICON_NAMES.map((n) => {
            const Icon = PROJECT_ICONS[n]
            const active = icon === n
            return (
              <Tooltip key={n} label={n.replace(/^Tb/, '')} withArrow>
                <ActionIcon
                  variant={active ? 'filled' : 'default'}
                  color={active ? 'blue' : 'gray'}
                  size="lg"
                  radius="md"
                  onClick={() => onIconChange(active ? null : n)}
                >
                  <Icon size={18} />
                </ActionIcon>
              </Tooltip>
            )
          })}
        </Group>
      </Stack>

      {/* Color swatch */}
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          Background
        </Text>
        <Group gap={6}>
          <Tooltip label="Warna sesuai role (default)" withArrow>
            <Box
              onClick={() => onColorChange(null)}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                cursor: 'pointer',
                background: 'var(--mantine-color-gray-light)',
                border:
                  color === null
                    ? '2px solid var(--mantine-color-blue-filled)'
                    : '2px solid var(--mantine-color-default-border)',
              }}
            />
          </Tooltip>
          {PROJECT_AVATAR_COLORS.map((c) => (
            <Tooltip key={c} label={c} withArrow>
              <Box
                onClick={() => onColorChange(color === c ? null : c)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  background: `var(--mantine-color-${c}-filled)`,
                  border: color === c ? '2px solid var(--mantine-color-blue-filled)' : '2px solid transparent',
                  outline: color === c ? '1px solid var(--mantine-color-blue-filled)' : 'none',
                }}
              />
            </Tooltip>
          ))}
        </Group>
      </Stack>
    </Stack>
  )
}
