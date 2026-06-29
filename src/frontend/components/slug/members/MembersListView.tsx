import { Stack, Text } from '@mantine/core'
import { MemberRow } from './MemberRow'
import type { Member, ProjectRole } from './types'

export function MembersListView({
  slug,
  members,
  environments,
  isOwner,
  myUserId,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
  onChangeRole,
  onDelete,
}: {
  slug: string
  members: Member[]
  environments: { name: string }[]
  isOwner: boolean
  myUserId: string
  selected: Set<string>
  expanded: string | null
  onToggleSelect: (userId: string) => void
  onToggleExpand: (userId: string) => void
  onChangeRole: (userId: string, role: ProjectRole) => void
  onDelete: (member: Member) => void
}) {
  if (members.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        Belum ada anggota
      </Text>
    )
  }
  const ownerCount = members.filter((m) => m.role === 'OWNER').length

  return (
    <Stack gap="xs">
      {members.map((m) => {
        const isSelf = m.user.id === myUserId
        const isLastOwner = m.role === 'OWNER' && ownerCount === 1
        return (
          <MemberRow
            key={m.id}
            slug={slug}
            member={m}
            environments={environments}
            isOwner={isOwner}
            isSelf={isSelf}
            isLastOwner={isLastOwner}
            selected={selected.has(m.user.id)}
            expanded={expanded === m.user.id}
            onToggleSelect={() => !isLastOwner && onToggleSelect(m.user.id)}
            onToggleExpand={() => onToggleExpand(m.user.id)}
            onChangeRole={(role) => onChangeRole(m.user.id, role)}
            onDelete={() => onDelete(m)}
          />
        )
      })}
    </Stack>
  )
}
