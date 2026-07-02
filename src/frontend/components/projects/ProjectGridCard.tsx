import { ActionIcon, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { TbClock, TbPencil, TbPin, TbPinFilled, TbPower, TbTrash, TbUsers, TbVariable } from 'react-icons/tb'
import { ProjectAvatar } from '@/frontend/components/projects/ProjectAvatar'
import { cardTintStyle } from '@/frontend/lib/project-avatar'
import { relativeDate, roleColor, tagColor } from '@/frontend/lib/project-utils'

interface Project {
  slug: string
  name: string
  description?: string
  tags: string[]
  isActive: boolean
  icon?: string | null
  color?: string | null
  cardColor?: string | null
  createdAt?: string
  myRole: 'OWNER' | 'EDITOR' | 'VIEWER'
  _count: { environments: number }
  members?: { id: string }[]
}

interface Props {
  project: Project
  isPinned: boolean
  onPin: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
  onTagClick: (tag: string) => void
  onClick: () => void
}

export function ProjectGridCard({
  project: p,
  isPinned,
  onPin,
  onEdit,
  onDelete,
  onToggleActive,
  onTagClick,
  onClick,
}: Props) {
  const color = roleColor[p.myRole]
  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      className="envman-project-card"
      role="link"
      tabIndex={0}
      aria-label={`Buka project ${p.name}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', ...cardTintStyle(p.cardColor) }}
    >
      <Group justify="space-between" mb="sm" wrap="nowrap" align="flex-start">
        <Group gap="sm" wrap="nowrap" align="center">
          <ProjectAvatar name={p.name} role={p.myRole} size={38} icon={p.icon} color={p.color} />
          <Stack gap={3}>
            <Badge size="xs" variant="light" color={color}>
              {p.myRole}
            </Badge>
            {!p.isActive && (
              <Badge size="xs" variant="light" color="gray">
                nonaktif
              </Badge>
            )}
          </Stack>
        </Group>
        <Group gap={2} onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
          <Tooltip label={isPinned ? 'Lepas pin' : 'Pin'} withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              color={isPinned ? 'violet' : 'gray'}
              onClick={(e) => {
                e.stopPropagation()
                onPin()
              }}
            >
              {isPinned ? <TbPinFilled size={13} /> : <TbPin size={13} />}
            </ActionIcon>
          </Tooltip>
          {p.myRole === 'OWNER' && (
            <>
              <Tooltip label={p.isActive ? 'Nonaktifkan' : 'Aktifkan'} withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color={p.isActive ? 'gray' : 'teal'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleActive()
                  }}
                >
                  <TbPower size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Edit" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit()
                  }}
                >
                  <TbPencil size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                >
                  <TbTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Group>

      <Text fw={700} size="sm" lh={1.3} mb={2} truncate>
        {p.name}
      </Text>
      <Text
        fz="xs"
        c="blue.9"
        mb={6}
        style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {p.slug}
      </Text>
      <Text
        size="xs"
        c="dimmed"
        mb={8}
        lineClamp={2}
        lh={1.6}
        fs={p.description ? undefined : 'italic'}
        style={{ flex: 1 }}
      >
        {p.description || 'Belum ada deskripsi'}
      </Text>

      {p.tags?.length > 0 && (
        <Group gap={4} mb={8}>
          {p.tags.slice(0, 4).map((tag) => (
            <Badge
              key={tag}
              size="xs"
              variant="light"
              color={tagColor(tag)}
              className="envman-tag-chip"
              onClick={(e) => {
                e.stopPropagation()
                onTagClick(tag)
              }}
            >
              {tag}
            </Badge>
          ))}
          {p.tags.length > 4 && (
            <Badge size="xs" variant="default">
              +{p.tags.length - 4}
            </Badge>
          )}
        </Group>
      )}

      <Group
        gap="xs"
        wrap="wrap"
        pt={8}
        style={{ borderTop: '1px solid var(--mantine-color-default-border)', marginTop: 'auto' }}
      >
        <Tooltip label={`${p._count.environments} environment`} withArrow>
          <Group gap={4} style={{ cursor: 'default' }}>
            <TbVariable size={12} style={{ color: `var(--mantine-color-${color}-light-color)` }} />
            <Text size="xs" fw={600}>
              {p._count.environments}
            </Text>
            <Text size="xs" c="dimmed">
              env
            </Text>
          </Group>
        </Tooltip>
        {p.members && (
          <>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Tooltip label={`${p.members.length} anggota`} withArrow>
              <Group gap={4} style={{ cursor: 'default' }}>
                <TbUsers size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />
                <Text size="xs" c="dimmed">
                  {p.members.length} anggota
                </Text>
              </Group>
            </Tooltip>
          </>
        )}
        {p.createdAt && (
          <>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Tooltip label={`Dibuat ${new Date(p.createdAt).toLocaleString('id-ID')}`} withArrow>
              <Group gap={4} style={{ cursor: 'default' }}>
                <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                <Text size="xs" c="dimmed">
                  {relativeDate(p.createdAt)}
                </Text>
              </Group>
            </Tooltip>
          </>
        )}
      </Group>
    </Paper>
  )
}
