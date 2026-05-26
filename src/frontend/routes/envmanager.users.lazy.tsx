import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import {
  TbBan,
  TbCheck,
  TbChevronLeft,
  TbSearch,
  TbShieldCheck,
  TbUsers,
  TbX,
} from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { UserDrawerContent } from '@/frontend/components/users/UserDrawerContent'
import { GLOBAL_ROLE_COLOR } from '@/frontend/components/users/types'
import type { GlobalRole, UserSummary } from '@/frontend/components/users/types'

export const Route = createLazyFileRoute('/envmanager/users')({
  component: UsersPage,
})

function UsersPage() {
  const { user: selectedUserId } = Route.useSearch()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<GlobalRole | 'ALL'>('ALL')

  const { data, isLoading } = useQuery<{ users: UserSummary[] }>({
    queryKey: ['admin', 'envman-users'],
    queryFn: () => apiFetch('/api/envman/admin/users'),
  })

  const users = data?.users ?? []

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => !u.blocked).length,
    blocked: users.filter(u => u.blocked).length,
    adminPlus: users.filter(u => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN').length,
  }), [users])

  const filtered = useMemo(() => {
    let list = roleFilter === 'ALL' ? users : users.filter(u => u.role === roleFilter)
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q),
    )
  }, [users, search, roleFilter])

  // Detail view
  if (selectedUserId) {
    const selectedUser = users.find(u => u.id === selectedUserId)
    return (
      <Stack gap="lg" p="md">
        <Group gap={6} align="center">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => navigate({ to: '/envmanager/users', search: { user: undefined } })}
          >
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Text
            size="sm"
            c="dimmed"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate({ to: '/envmanager/users', search: { user: undefined } })}
          >
            Users
          </Text>
          <Text size="sm" c="dimmed">/</Text>
          {selectedUser ? (
            <Group gap="xs" wrap="nowrap">
              <Avatar
                size={22}
                radius="xl"
                color={GLOBAL_ROLE_COLOR[selectedUser.role]}
                variant="gradient"
                gradient={{ from: GLOBAL_ROLE_COLOR[selectedUser.role], to: 'grape' }}
              >
                {selectedUser.name.charAt(0).toUpperCase()}
              </Avatar>
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

  // List view
  return (
    <Stack gap="lg" p="md">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm">
          <ThemeIcon size={36} variant="gradient" radius="md">
            <TbUsers size={20} />
          </ThemeIcon>
          <div>
            <Text fw={700} size="lg">User Management</Text>
            <Text size="sm" c="dimmed">Kelola role global dan akses per project/environment.</Text>
          </div>
        </Group>
        {!isLoading && users.length > 0 && (
          <Badge size="sm" variant="outline" color="gray" radius="sm">
            {users.length} user{users.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </Group>

      {/* Stats */}
      {!isLoading && users.length > 0 && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
          {[
            { label: 'Total', value: stats.total, color: undefined },
            { label: 'Active', value: stats.active, color: 'teal' as const },
            { label: 'Blocked', value: stats.blocked, color: stats.blocked > 0 ? 'red' as const : undefined },
            { label: 'Admin+', value: stats.adminPlus, color: stats.adminPlus > 0 ? 'violet' as const : undefined },
          ].map(s => (
            <Paper key={s.label} withBorder p="sm" radius="md">
              <Text size="xs" c="dimmed" mb={2}>{s.label}</Text>
              <Text size="xl" fw={700} c={s.color ?? (s.value === 0 ? 'dimmed' : undefined)}>
                {s.value}
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
      )}

      {/* Search + role filter */}
      <Group gap="xs" wrap="nowrap">
        <TextInput
          placeholder="Cari user (nama, email)..."
          leftSection={<TbSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          rightSection={search ? (
            <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearch('')}>
              <TbX size={11} />
            </ActionIcon>
          ) : undefined}
          style={{ flex: 1, maxWidth: 360 }}
        />
        <SegmentedControl
          size="xs"
          value={roleFilter}
          onChange={(v) => setRoleFilter(v as GlobalRole | 'ALL')}
          data={[
            { value: 'ALL', label: 'All' },
            { value: 'USER', label: 'User' },
            { value: 'QC', label: 'QC' },
            { value: 'ADMIN', label: 'Admin' },
            { value: 'SUPER_ADMIN', label: 'Super' },
          ]}
        />
      </Group>

      {/* Table */}
      <Card withBorder radius="md" p={0}>
        {isLoading ? (
          <Stack gap={0}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Box
                key={i}
                p="sm"
                style={{ borderBottom: i < 4 ? '1px solid var(--mantine-color-default-border)' : undefined }}
              >
                <Group gap="sm">
                  <Skeleton circle height={34} width={34} />
                  <Box style={{ flex: 1 }}>
                    <Skeleton height={11} width="25%" mb={6} radius="sm" />
                    <Skeleton height={9} width="40%" radius="sm" />
                  </Box>
                  <Skeleton height={20} width={60} radius="xl" />
                  <Skeleton height={20} width={50} radius="xl" />
                  <Skeleton height={20} width={24} radius="sm" />
                </Group>
              </Box>
            ))}
          </Stack>
        ) : filtered.length === 0 ? (
          <Stack align="center" py="xl" gap="xs">
            <ThemeIcon size={44} radius="xl" variant="light" color="gray">
              <TbSearch size={22} />
            </ThemeIcon>
            <Text fw={500} size="sm">Tidak ada user yang cocok</Text>
            <Text size="xs" c="dimmed" ta="center">Coba ubah filter atau hapus kata kunci pencarian.</Text>
            {(search || roleFilter !== 'ALL') && (
              <Button size="xs" variant="subtle" mt={4} onClick={() => { setSearch(''); setRoleFilter('ALL') }}>
                Reset filter
              </Button>
            )}
          </Stack>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th ta="right">Projects</Table.Th>
                <Table.Th ta="right">Env Overrides</Table.Th>
                <Table.Th ta="right">Capabilities</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map(u => (
                <Table.Tr
                  key={u.id}
                  onClick={() => navigate({ to: '/envmanager/users', search: { user: u.id } })}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Avatar
                        size={32}
                        radius="xl"
                        color={GLOBAL_ROLE_COLOR[u.role]}
                        variant="gradient"
                        gradient={{ from: GLOBAL_ROLE_COLOR[u.role], to: 'grape' }}
                      >
                        {u.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <div>
                        <Text size="sm" fw={500}>{u.name}</Text>
                        <Text size="xs" c="dimmed">{u.email}</Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={GLOBAL_ROLE_COLOR[u.role]} variant="light">{u.role}</Badge>
                  </Table.Td>
                  <Table.Td>
                    {u.blocked
                      ? <Badge size="xs" color="red" variant="light" leftSection={<TbBan size={10} />}>Blocked</Badge>
                      : <Badge size="xs" color="teal" variant="light" leftSection={<TbCheck size={10} />}>Active</Badge>
                    }
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" fw={u.projectCount > 0 ? 500 : undefined} c={u.projectCount > 0 ? undefined : 'dimmed'}>
                      {u.projectCount > 0 ? u.projectCount : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    {u.envOverrideCount > 0 ? (
                      <Badge size="xs" color="orange" variant="light">{u.envOverrideCount}</Badge>
                    ) : (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    {u.role === 'SUPER_ADMIN' ? (
                      <Badge size="xs" color="red" variant="light">all</Badge>
                    ) : u.permissions.length > 0 ? (
                      <Badge size="xs" color="violet" variant="light">{u.permissions.length}</Badge>
                    ) : (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label="Manage access" withArrow>
                      <ActionIcon variant="subtle" size="sm" color="gray">
                        <TbShieldCheck size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  )
}
