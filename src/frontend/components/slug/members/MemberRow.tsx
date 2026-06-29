import { ActionIcon, Badge, Box, Checkbox, Collapse, Divider, Group, Select, Text, Tooltip } from '@mantine/core'
import { TbChevronDown, TbChevronRight, TbTrash } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { MemberEnvOverrides } from '../MemberEnvOverrides'
import { type Member, type ProjectRole, roleColor, roleOptions } from './types'

export function MemberRow({
  slug,
  member,
  environments,
  isOwner,
  isSelf,
  isLastOwner,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
  onChangeRole,
  onDelete,
}: {
  slug: string
  member: Member
  environments: { name: string }[]
  isOwner: boolean
  isSelf: boolean
  isLastOwner: boolean
  selected: boolean
  expanded: boolean
  onToggleSelect: () => void
  onToggleExpand: () => void
  onChangeRole: (role: ProjectRole) => void
  onDelete: () => void
}) {
  return (
    <Box style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
      <Group gap="sm" wrap="nowrap" align="center" p="xs">
        {isOwner && <Checkbox size="xs" checked={selected} disabled={isLastOwner} onChange={onToggleSelect} />}
        <UserAvatar user={member.user} size={32} color={roleColor[member.role]} />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap" align="center">
            <Text size="sm" fw={600} truncate>
              {member.user.name}
            </Text>
            {isSelf && (
              <Badge size="xs" variant="outline" color="gray">
                kamu
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {member.user.email}
          </Text>
        </Box>
        {isOwner ? (
          <Select
            size="xs"
            data={roleOptions}
            value={member.role}
            onChange={(v) => {
              if (v && v !== member.role) onChangeRole(v as ProjectRole)
            }}
            w={100}
            allowDeselect={false}
            disabled={isLastOwner}
          />
        ) : (
          <Badge size="sm" variant="light" color={roleColor[member.role]}>
            {member.role}
          </Badge>
        )}
        {isOwner && environments.length > 0 && (
          <Tooltip label={expanded ? 'Tutup' : 'Atur akses per environment'} withArrow>
            <ActionIcon size="sm" variant="subtle" onClick={onToggleExpand}>
              {expanded ? <TbChevronDown size={14} /> : <TbChevronRight size={14} />}
            </ActionIcon>
          </Tooltip>
        )}
        {isOwner && (
          <Tooltip label={isLastOwner ? 'Owner terakhir tidak bisa dihapus' : 'Hapus anggota'} withArrow>
            <ActionIcon size="sm" variant="subtle" color="red" disabled={isLastOwner} onClick={onDelete}>
              <TbTrash size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      {isOwner && (
        <Collapse in={expanded}>
          <Box px="xs" pb="xs" pt={0}>
            <Divider mb="xs" />
            <MemberEnvOverrides
              slug={slug}
              userId={member.user.id}
              projectRole={member.role}
              environments={environments}
            />
          </Box>
        </Collapse>
      )}
    </Box>
  )
}
