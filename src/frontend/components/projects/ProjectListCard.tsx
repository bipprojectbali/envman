import { ActionIcon, Badge, Box, Code, Group, Paper, Text, Tooltip } from '@mantine/core'
import {
  TbChevronRight,
  TbClock,
  TbPencil,
  TbPin,
  TbPinFilled,
  TbPower,
  TbTrash,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
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

export function ProjectListCard({
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
      p="sm"
      radius={8}
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
      style={{ cursor: 'pointer', ...cardTintStyle(p.cardColor) }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
        <Group gap="sm" style={{ flex: 1, minWidth: 0 }} wrap="nowrap" align="flex-start">
          <ProjectAvatar name={p.name} role={p.myRole} size={36} icon={p.icon} color={p.color} />
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} size="sm" truncate lh={1.3} mb={2}>
              {p.name}
            </Text>
            <Group
              gap={4}
              mb={p.description || p.tags?.length > 0 || p._count.environments >= 0 ? 3 : 0}
              wrap="wrap"
              align="center"
            >
              <Code fz="xs">{p.slug}</Code>
              <Badge size="xs" variant="light" color={color}>
                {p.myRole}
              </Badge>
              {!p.isActive && (
                <Badge size="xs" variant="light" color="gray">
                  nonaktif
                </Badge>
              )}
            </Group>

            {p.description && (
              <Text size="xs" c="dimmed" truncate lh={1.5} mb={3}>
                {p.description}
              </Text>
            )}

            <Group gap="xs" wrap="wrap" align="center">
              <Tooltip label={`${p._count.environments} environment`} withArrow>
                <Group gap={3} style={{ cursor: 'default' }}>
                  <TbVariable size={11} color={`var(--mantine-color-${color}-5)`} />
                  <Text size="xs" c="dimmed">
                    {p._count.environments} env
                  </Text>
                </Group>
              </Tooltip>
              {p.members && (
                <>
                  <Text size="xs" c="dimmed">
                    ·
                  </Text>
                  <Tooltip label={`${p.members.length} anggota`} withArrow>
                    <Group gap={3} style={{ cursor: 'default' }}>
                      <TbUsers size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                      <Text size="xs" c="dimmed">
                        {p.members.length}
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
                    <Group gap={3} style={{ cursor: 'default' }}>
                      <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                      <Text size="xs" c="dimmed">
                        {relativeDate(p.createdAt)}
                      </Text>
                    </Group>
                  </Tooltip>
                </>
              )}
            </Group>

            {p.tags?.length > 0 && (
              <Group gap={4} mt={5}>
                {p.tags.slice(0, 5).map((tag) => (
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
                {p.tags.length > 5 && (
                  <Badge size="xs" variant="default">
                    +{p.tags.length - 5}
                  </Badge>
                )}
              </Group>
            )}
          </Box>
        </Group>

        <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
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
              <Tooltip label={p.isActive ? 'Nonaktifkan' : 'Aktifkan'} position="left" withArrow>
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
              <Tooltip label="Edit" position="left" withArrow>
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
              <Tooltip label="Hapus" position="left" withArrow>
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
          <TbChevronRight size={14} style={{ color: 'var(--mantine-color-dimmed)', marginLeft: 2 }} />
        </Group>
      </Group>
    </Paper>
  )
}
