import { ActionIcon, Box, Group, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { TbLetterCase } from 'react-icons/tb'
import { ProjectAvatar } from '@/frontend/components/projects/ProjectAvatar'
import { cardTintStyle, PROJECT_AVATAR_COLORS, PROJECT_ICON_NAMES, PROJECT_ICONS } from '@/frontend/lib/project-avatar'

/** Baris swatch warna Mantine + opsi "default" (null). Reusable untuk avatar & card. */
function ColorSwatchRow({
  value,
  onChange,
  defaultLabel,
}: {
  value: string | null
  onChange: (v: string | null) => void
  defaultLabel: string
}) {
  return (
    <Group gap={6}>
      <Tooltip label={defaultLabel} withArrow>
        <Box
          onClick={() => onChange(null)}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            cursor: 'pointer',
            background: 'var(--mantine-color-gray-light)',
            border:
              value === null
                ? '2px solid var(--mantine-color-blue-filled)'
                : '2px solid var(--mantine-color-default-border)',
          }}
        />
      </Tooltip>
      {PROJECT_AVATAR_COLORS.map((c) => (
        <Tooltip key={c} label={c} withArrow>
          <Box
            onClick={() => onChange(value === c ? null : c)}
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              cursor: 'pointer',
              background: `var(--mantine-color-${c}-filled)`,
              border: value === c ? '2px solid var(--mantine-color-blue-filled)' : '2px solid transparent',
              outline: value === c ? '1px solid var(--mantine-color-blue-filled)' : 'none',
            }}
          />
        </Tooltip>
      ))}
    </Group>
  )
}

/**
 * Picker icon avatar + warna avatar + warna tint card. Nilai null = default
 * (inisial nama / warna-by-role / tanpa tint). Live preview memakai komponen asli.
 */
export function ProjectAvatarPicker({
  name,
  role,
  icon,
  color,
  cardColor,
  onIconChange,
  onColorChange,
  onCardColorChange,
}: {
  name: string
  role: string
  icon: string | null
  color: string | null
  cardColor: string | null
  onIconChange: (v: string | null) => void
  onColorChange: (v: string | null) => void
  onCardColorChange: (v: string | null) => void
}) {
  return (
    <Stack gap="sm">
      {/* Live preview: card tint + avatar */}
      <Paper withBorder p="sm" radius="md" style={cardTintStyle(cardColor)}>
        <Group gap="sm" align="center">
          <ProjectAvatar name={name || '?'} role={role} size={44} icon={icon} color={color} />
          <Box>
            <Text size="sm" fw={700} lh={1.2}>
              {name || 'Nama project'}
            </Text>
            <Text size="xs" c="dimmed">
              Pratinjau kartu
            </Text>
          </Box>
        </Group>
      </Paper>

      {/* Icon grid */}
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          Icon avatar
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

      {/* Avatar background color */}
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          Warna avatar
        </Text>
        <ColorSwatchRow value={color} onChange={onColorChange} defaultLabel="Warna sesuai role (default)" />
      </Stack>

      {/* Card tint color */}
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          Warna kartu
        </Text>
        <ColorSwatchRow value={cardColor} onChange={onCardColorChange} defaultLabel="Tanpa warna (default)" />
      </Stack>
    </Stack>
  )
}
