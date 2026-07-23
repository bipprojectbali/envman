import {
  ActionIcon,
  Badge,
  Box,
  Container,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type React from 'react'
import { useMemo, useState } from 'react'
import { TbCircleFilled, TbDots, TbLock, TbLockOpen, TbSearch, TbShieldCheck, TbShieldOff, TbX } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { useSession } from '@/frontend/hooks/useAuth'
import { usePresence } from '@/frontend/hooks/usePresence'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { AdminUser } from './types'

const roleBadge: Record<string, { color: string; label: string }> = {
  USER: { color: 'blue', label: 'User' },
  ADMIN: { color: 'violet', label: 'Admin' },
  SUPER_ADMIN: { color: 'red', label: 'Super Admin' },
}

export function UsersPanel() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () =>
      fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()) as Promise<{ users: AdminUser[] }>,
  })

  const { data: sessionData } = useSession()
  const currentUserId = sessionData?.user?.id
  const { onlineUserIds } = usePresence()

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      fetch(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      }).then((r) => r.json()),
    onSuccess: (_: unknown, { role }: { id: string; role: string }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      notifyOk(`Role diubah ke ${role}`)
    },
    onError: (e) => notifyErr(e),
  })

  const toggleBlock = useMutation({
    mutationFn: ({ id, blocked }: { id: string; blocked: boolean }) =>
      fetch(`/api/admin/users/${id}/block`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked }),
      }).then((r) => r.json()),
    onSuccess: (_: unknown, { blocked }: { id: string; blocked: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      notifyOk(blocked ? 'User diblokir' : 'Blokir user dicabut')
    },
    onError: (e) => notifyErr(e),
  })

  const users = data?.users ?? []
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline' | 'blocked'>('all')

  const filteredUsers = useMemo(() => {
    let list = [...users]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    }
    if (filterStatus === 'online') list = list.filter((u) => !u.blocked && onlineUserIds.includes(u.id))
    if (filterStatus === 'offline') list = list.filter((u) => !u.blocked && !onlineUserIds.includes(u.id))
    if (filterStatus === 'blocked') list = list.filter((u) => u.blocked)
    return list
  }, [users, search, filterStatus, onlineUserIds])

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={3}>User Management</Title>
          <Badge variant="light" size="lg">
            {filteredUsers.length}
            {filteredUsers.length !== users.length ? `/${users.length}` : ''} users
          </Badge>
        </Group>

        <Group gap="xs">
          <TextInput
            size="xs"
            placeholder="Cari nama atau email..."
            leftSection={<TbSearch size={13} />}
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            rightSection={
              search ? (
                <ActionIcon size="xs" variant="subtle" onClick={() => setSearch('')}>
                  <TbX size={11} />
                </ActionIcon>
              ) : undefined
            }
            style={{ flex: 1 }}
          />
          <SegmentedControl
            size="xs"
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as typeof filterStatus)}
            data={[
              { label: 'Semua', value: 'all' },
              { label: 'Online', value: 'online' },
              { label: 'Offline', value: 'offline' },
              { label: 'Blocked', value: 'blocked' },
            ]}
          />
        </Group>

        <Box style={{ border: '1px solid var(--mantine-color-default-border)' }} p={0}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th ta="right">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading && (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text ta="center" c="dimmed" py="md">
                      Loading...
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {filteredUsers.length === 0 && !isLoading && (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text ta="center" c="dimmed" py="md" size="sm">
                      Tidak ada user yang cocok.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {filteredUsers.map((u) => {
                const isSelf = u.id === currentUserId
                const badge = roleBadge[u.role] ?? roleBadge.USER
                const isOnline = onlineUserIds.includes(u.id)

                return (
                  <Table.Tr key={u.id} opacity={u.blocked ? 0.5 : 1}>
                    <Table.Td>
                      <Group gap="sm">
                        <div style={{ position: 'relative' }}>
                          <UserAvatar user={u} color={badge.color} size="sm" />
                          {!u.blocked && (
                            <TbCircleFilled
                              size={10}
                              color={isOnline ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-6)'}
                              style={{
                                position: 'absolute',
                                bottom: -1,
                                right: -1,
                                borderRadius: '50%',
                                border: '2px solid var(--mantine-color-body)',
                              }}
                            />
                          )}
                        </div>
                        <div>
                          <Text size="sm" fw={500}>
                            {u.name}{' '}
                            {isSelf && (
                              <Text span c="dimmed" size="xs">
                                (you)
                              </Text>
                            )}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {u.email}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={badge.color} variant="light" size="sm">
                        {badge.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {u.blocked ? (
                        <Badge color="red" variant="filled" size="sm">
                          Blocked
                        </Badge>
                      ) : isOnline ? (
                        <Badge color="green" variant="filled" size="sm">
                          Online
                        </Badge>
                      ) : (
                        <Badge color="gray" variant="light" size="sm">
                          Offline
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      {!isSelf && u.role !== 'SUPER_ADMIN' && (
                        <Menu shadow="md" width={200} position="bottom-end">
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray">
                              <TbDots size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Label>Role</Menu.Label>
                            {u.role !== 'USER' && (
                              <Menu.Item
                                leftSection={<TbShieldOff size={14} />}
                                onClick={() => changeRole.mutate({ id: u.id, role: 'USER' })}
                              >
                                Set as User
                              </Menu.Item>
                            )}
                            {u.role !== 'ADMIN' && (
                              <Menu.Item
                                leftSection={<TbShieldCheck size={14} />}
                                onClick={() => changeRole.mutate({ id: u.id, role: 'ADMIN' })}
                              >
                                Set as Admin
                              </Menu.Item>
                            )}

                            <Menu.Divider />
                            <Menu.Label>Status</Menu.Label>
                            {u.blocked ? (
                              <Menu.Item
                                leftSection={<TbLockOpen size={14} />}
                                color="green"
                                onClick={() => toggleBlock.mutate({ id: u.id, blocked: false })}
                              >
                                Unblock User
                              </Menu.Item>
                            ) : (
                              <Menu.Item
                                leftSection={<TbLock size={14} />}
                                color="red"
                                onClick={() => toggleBlock.mutate({ id: u.id, blocked: true })}
                              >
                                Block User
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Box>
      </Stack>
    </Container>
  )
}
