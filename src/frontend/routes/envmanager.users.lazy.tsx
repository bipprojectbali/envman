import { ActionIcon, Badge, Group, Stack, Text } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { TbBan, TbChevronLeft } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import type { GlobalRole, UserSummary } from '@/frontend/components/users/types'
import { GLOBAL_ROLE_COLOR } from '@/frontend/components/users/types'
import { UserDrawerContent } from '@/frontend/components/users/UserDrawerContent'
import { UserTable } from '@/frontend/components/users/UserTable'
import { apiFetch } from '@/frontend/lib/api'

export const Route = createLazyFileRoute('/envmanager/users')({ component: UsersPage })

function UsersPage() {
  const { user: selectedUserId } = Route.useSearch()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useLocalStorage<GlobalRole | 'ALL'>({
    key: 'envman:users:roleFilter',
    defaultValue: 'ALL',
  })

  const { data, isLoading } = useQuery<{ users: UserSummary[] }>({
    queryKey: ['admin', 'envman-users'],
    queryFn: () => apiFetch('/api/envman/admin/users'),
  })

  const users = data?.users ?? []

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => !u.blocked).length,
      blocked: users.filter((u) => u.blocked).length,
      adminPlus: users.filter((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN').length,
    }),
    [users],
  )

  const roleCounts = useMemo(
    () => ({
      ALL: users.length,
      USER: users.filter((u) => u.role === 'USER').length,
      QC: users.filter((u) => u.role === 'QC').length,
      ADMIN: users.filter((u) => u.role === 'ADMIN').length,
      SUPER_ADMIN: users.filter((u) => u.role === 'SUPER_ADMIN').length,
    }),
    [users],
  )

  const filtered = useMemo(() => {
    const list = roleFilter === 'ALL' ? users : users.filter((u) => u.role === roleFilter)
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users, search, roleFilter])

  if (selectedUserId) {
    const selectedUser = users.find((u) => u.id === selectedUserId)
    return (
      <Stack gap="lg" p="md">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => navigate({ to: '/envmanager/users', search: { user: undefined } })}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={() => navigate({ to: '/envmanager/users', search: { user: undefined } })}>
            Users
          </Text>
          <Text size="sm" c="dimmed">/</Text>
          {selectedUser ? (
            <Group gap="xs" wrap="nowrap">
              <UserAvatar user={selectedUser} size={22} color={GLOBAL_ROLE_COLOR[selectedUser.role]} variant="gradient" gradient={{ from: GLOBAL_ROLE_COLOR[selectedUser.role], to: 'grape' }} />
              <Text size="sm" fw={600}>{selectedUser.name}</Text>
              {selectedUser.blocked && (
                <Badge size="xs" color="red" variant="filled" leftSection={<TbBan size={9} />}>Blocked</Badge>
              )}
            </Group>
          ) : (
            <Text size="sm" fw={600}>User Access</Text>
          )}
        </Group>
        <UserDrawerContent userId={selectedUserId} />
      </Stack>
    )
  }

  return (
    <UserTable
      users={users}
      filtered={filtered}
      stats={stats}
      roleCounts={roleCounts}
      isLoading={isLoading}
      search={search}
      setSearch={setSearch}
      roleFilter={roleFilter}
      setRoleFilter={setRoleFilter}
      navigate={navigate}
    />
  )
}
