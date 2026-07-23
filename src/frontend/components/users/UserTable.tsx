import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import type { NavigateFn } from '@tanstack/react-router'
import { TbBan, TbCheck, TbSearch, TbShieldCheck, TbUsers, TbX } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import type { GlobalRole, UserSummary } from '@/frontend/components/users/types'
import { GLOBAL_ROLE_COLOR } from '@/frontend/components/users/types'

interface Stats {
  total: number
  active: number
  blocked: number
  adminPlus: number
}

interface RoleCounts {
  ALL: number
  USER: number
  ADMIN: number
  SUPER_ADMIN: number
}

interface UserTableProps {
  users: UserSummary[]
  filtered: UserSummary[]
  stats: Stats
  roleCounts: RoleCounts
  isLoading: boolean
  search: string
  setSearch: (v: string) => void
  roleFilter: GlobalRole | 'ALL'
  setRoleFilter: (v: GlobalRole | 'ALL') => void
  navigate: NavigateFn
}

export function UserTable({
  users,
  filtered,
  stats,
  roleCounts,
  isLoading,
  search,
  setSearch,
  roleFilter,
  setRoleFilter,
  navigate,
}: UserTableProps) {
  return (
    <Stack gap="lg" p="md">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" style={{ minWidth: 0 }}>
          <ThemeIcon size={38} variant="gradient" radius="md" style={{ flexShrink: 0 }}>
            <TbUsers size={20} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={800} size="xl" lh={1.2}>
              User Management
            </Text>
            {!isLoading && users.length > 0 ? (
              <Group gap={4} mt={2} wrap="wrap">
                <Text size="xs" c="dimmed">
                  {users.length} user
                </Text>
                <Text size="xs" c="dimmed">
                  ·
                </Text>
                <Text size="xs" c="dimmed">
                  {stats.active} aktif
                </Text>
                {stats.blocked > 0 && (
                  <>
                    <Text size="xs" c="dimmed">
                      ·
                    </Text>
                    <Text size="xs" c="dimmed">
                      {stats.blocked} blocked
                    </Text>
                  </>
                )}
                {stats.adminPlus > 0 && (
                  <>
                    <Text size="xs" c="dimmed">
                      ·
                    </Text>
                    <Text size="xs" c="dimmed">
                      {stats.adminPlus} admin+
                    </Text>
                  </>
                )}
              </Group>
            ) : (
              <Text size="xs" c="dimmed" mt={2}>
                Kelola role global dan akses per project.
              </Text>
            )}
          </Box>
        </Group>
      </Group>

      <Stack gap="xs">
        <TextInput
          size="sm"
          placeholder="Cari user (nama, email)..."
          leftSection={<TbSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          rightSection={
            search ? (
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setSearch('')}>
                <TbX size={12} />
              </ActionIcon>
            ) : undefined
          }
          rightSectionWidth={search ? 32 : undefined}
          radius="md"
          maw={540}
        />
        <SegmentedControl
          size="xs"
          value={roleFilter}
          onChange={(v) => setRoleFilter(v as GlobalRole | 'ALL')}
          radius="md"
          style={{ width: 'fit-content' }}
          data={(
            [
              { value: 'ALL', label: 'All' },
              { value: 'USER', label: 'User' },
              { value: 'ADMIN', label: 'Admin' },
              { value: 'SUPER_ADMIN', label: 'Super' },
            ] as { value: keyof typeof roleCounts; label: string }[]
          ).map(({ value, label }) => ({
            value,
            label: (
              <Group miw={72} gap={4} wrap="nowrap" justify="center">
                <span>{label}</span>
                {roleCounts[value] > 0 && (
                  <Badge size="md" variant="light" color={GLOBAL_ROLE_COLOR[value === 'ALL' ? 'USER' : value]} circle>
                    {roleCounts[value]}
                  </Badge>
                )}
              </Group>
            ),
          }))}
        />
      </Stack>

      <Box style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <Stack gap={0}>
            {[0, 1, 2, 3, 4].map((i) => (
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
            <Text fw={500} size="sm">
              Tidak ada user yang cocok
            </Text>
            <Text size="xs" c="dimmed" ta="center">
              Coba ubah filter atau hapus kata kunci pencarian.
            </Text>
            {(search || roleFilter !== 'ALL') && (
              <Button
                size="xs"
                variant="subtle"
                mt={4}
                onClick={() => {
                  setSearch('')
                  setRoleFilter('ALL')
                }}
              >
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
              {filtered.map((u) => (
                <Table.Tr
                  key={u.id}
                  onClick={() => navigate({ to: '/envmanager/users', search: { user: u.id } })}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <UserAvatar
                        user={u}
                        size={32}
                        color={GLOBAL_ROLE_COLOR[u.role]}
                        variant="gradient"
                        gradient={{ from: GLOBAL_ROLE_COLOR[u.role], to: 'grape' }}
                      />
                      <div>
                        <Text size="sm" fw={500}>
                          {u.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {u.email}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={GLOBAL_ROLE_COLOR[u.role]} variant="light">
                      {u.role}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {u.blocked ? (
                      <Badge size="xs" color="red" variant="light" leftSection={<TbBan size={10} />}>
                        Blocked
                      </Badge>
                    ) : (
                      <Badge size="xs" color="teal" variant="light" leftSection={<TbCheck size={10} />}>
                        Active
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text
                      size="sm"
                      fw={u.projectCount > 0 ? 500 : undefined}
                      c={u.projectCount > 0 ? undefined : 'dimmed'}
                    >
                      {u.projectCount > 0 ? u.projectCount : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    {u.envOverrideCount > 0 ? (
                      <Badge size="xs" color="orange" variant="light">
                        {u.envOverrideCount}
                      </Badge>
                    ) : (
                      <Text size="xs" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    {u.role === 'SUPER_ADMIN' ? (
                      <Badge size="xs" color="red" variant="light">
                        all
                      </Badge>
                    ) : u.permissions.length > 0 ? (
                      <Badge size="xs" color="violet" variant="light">
                        {u.permissions.length}
                      </Badge>
                    ) : (
                      <Text size="xs" c="dimmed">
                        —
                      </Text>
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
      </Box>
    </Stack>
  )
}
