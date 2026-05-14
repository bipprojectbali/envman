import {
  Accordion,
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Collapse,
  CopyButton,
  Divider,
  Drawer,
  Group,
  Loader,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLazyFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import {
  TbAlertTriangle,
  TbBan,
  TbCheck,
  TbChevronDown,
  TbCopy,
  TbInfoCircle,
  TbKey,
  TbLayoutDashboard,
  TbLock,
  TbPlugConnected,
  TbPlus,
  TbSearch,
  TbShieldCheck,
  TbUser,
  TbUsers,
  TbX,
} from 'react-icons/tb'

export const Route = createLazyFileRoute('/envmanager/users')({
  component: UsersPage,
})

// ─── Types ───────────────────────────────────────────────────────────────────

type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER'
type GlobalRole = 'USER' | 'QC' | 'ADMIN' | 'SUPER_ADMIN'

interface UserSummary {
  id: string
  name: string
  email: string
  role: GlobalRole
  blocked: boolean
  permissions: string[]
  createdAt: string
  projectCount: number
  envOverrideCount: number
}

interface UserAccess {
  user: { id: string; name: string; email: string; role: GlobalRole; blocked: boolean; permissions: string[] }
  projects: ProjectAccess[]
}

interface ProjectAccess {
  slug: string
  name: string
  projectRole: ProjectRole | null
  environments: EnvAccess[]
}

type EnvRoleValue = 'inherit' | 'denied' | ProjectRole

interface EnvAccess {
  name: string
  envRole: EnvRoleValue
  effectiveRole: ProjectRole | null
}

const ROLE_COLOR: Record<ProjectRole, string> = {
  OWNER: 'blue',
  EDITOR: 'teal',
  VIEWER: 'gray',
}

const GLOBAL_ROLE_COLOR: Record<GlobalRole, string> = {
  SUPER_ADMIN: 'red',
  ADMIN: 'violet',
  QC: 'orange',
  USER: 'gray',
}

// ─── Page ────────────────────────────────────────────────────────────────────

function UsersPage() {
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false)

  const { data, isLoading } = useQuery<{ users: UserSummary[] }>({
    queryKey: ['admin', 'envman-users'],
    queryFn: () => apiFetch('/api/envman/admin/users'),
  })

  const users = data?.users ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q),
    )
  }, [users, search])

  const handleRowClick = (userId: string) => {
    setSelectedUserId(userId)
    openDrawer()
  }

  return (
    <Stack gap="lg" p="md">
      <Group gap="sm">
        <ThemeIcon size={36} variant="gradient" gradient={{ from: 'violet', to: 'grape' }} radius="md">
          <TbUsers size={20} />
        </ThemeIcon>
        <div>
          <Text fw={700} size="lg">User Management</Text>
          <Text size="sm" c="dimmed">Kelola role global dan akses per project/environment.</Text>
        </div>
      </Group>

      <TextInput
        placeholder="Cari user (nama, email)..."
        leftSection={<TbSearch size={14} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        style={{ maxWidth: 400 }}
      />

      <Card withBorder radius="md" p={0}>
        {isLoading ? (
          <Group justify="center" p="xl"><Loader size="sm" /></Group>
        ) : filtered.length === 0 ? (
          <Text p="xl" ta="center" c="dimmed" size="sm">Tidak ada user yang cocok.</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th>Global Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th ta="right">Projects</Table.Th>
                <Table.Th ta="right">Env Overrides</Table.Th>
                <Table.Th ta="right">Capabilities</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map(u => (
                <Table.Tr
                  key={u.id}
                  onClick={() => handleRowClick(u.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>
                    <div>
                      <Text size="sm" fw={500}>{u.name}</Text>
                      <Text size="xs" c="dimmed">{u.email}</Text>
                    </div>
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
                  <Table.Td ta="right">{u.projectCount}</Table.Td>
                  <Table.Td ta="right">
                    {u.envOverrideCount > 0 ? (
                      <Badge size="xs" color="orange" variant="light">{u.envOverrideCount}</Badge>
                    ) : (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    {u.role === 'SUPER_ADMIN' ? (
                      <Badge size="xs" color="violet" variant="light">all</Badge>
                    ) : u.permissions.length > 0 ? (
                      <Badge size="xs" color="violet" variant="light">{u.permissions.length}</Badge>
                    ) : (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label="Manage access">
                      <ActionIcon variant="subtle" size="sm">
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

      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        position="right"
        size="xl"
        padding="md"
        title={
          <Group gap="xs">
            <ThemeIcon size={28} radius="md" variant="gradient" gradient={{ from: 'violet', to: 'grape' }}>
              <TbShieldCheck size={16} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="sm">Manage User Access</Text>
              <Text size="xs" c="dimmed">Atur role, capability, dan akses per project/env</Text>
            </Box>
          </Group>
        }
      >
        {selectedUserId && <UserDrawerContent userId={selectedUserId} />}
      </Drawer>
    </Stack>
  )
}

// ─── Drawer Content ──────────────────────────────────────────────────────────

function UserDrawerContent({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery<UserAccess>({
    queryKey: ['admin', 'envman-users', userId, 'access'],
    queryFn: () => apiFetch(`/api/envman/admin/users/${userId}/access`),
  })

  if (isLoading || !data) {
    return (
      <Stack gap="md" mt="sm">
        <Card withBorder p="md" radius="md">
          <Group>
            <Loader size="sm" />
            <Text size="sm" c="dimmed">Memuat data user...</Text>
          </Group>
        </Card>
      </Stack>
    )
  }

  const { user, projects } = data
  const accessibleProjects = projects.filter(p => p.projectRole !== null).length
  const envOverrides = projects.reduce(
    (sum, p) => sum + p.environments.filter(e => e.envRole !== 'inherit').length,
    0,
  )
  const permissionCount = user.permissions.length
  const isSuperAdmin = user.role === 'SUPER_ADMIN'

  return (
    <Stack gap="md">
      {/* User header */}
      <Card withBorder p="md" radius="md">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <Avatar
              color={GLOBAL_ROLE_COLOR[user.role]}
              radius="xl"
              size={48}
              variant="gradient"
              gradient={{ from: GLOBAL_ROLE_COLOR[user.role], to: 'grape' }}
            >
              {user.name.charAt(0).toUpperCase()}
            </Avatar>
            <Box style={{ minWidth: 0, flex: 1 }}>
              <Group gap={6}>
                <Text fw={700} size="md" truncate>{user.name}</Text>
                {user.blocked && (
                  <Badge size="xs" color="red" variant="filled" leftSection={<TbBan size={9} />}>
                    Blocked
                  </Badge>
                )}
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed" truncate>{user.email}</Text>
                <CopyButton value={user.email}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Disalin' : 'Copy email'}>
                      <ActionIcon size="xs" variant="subtle" color="gray" onClick={copy}>
                        {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
              <Group gap={4} mt={4}>
                <Badge size="xs" color={GLOBAL_ROLE_COLOR[user.role]} variant="light">
                  {user.role}
                </Badge>
                {isSuperAdmin && (
                  <Badge size="xs" color="violet" variant="dot">
                    bypass semua check
                  </Badge>
                )}
              </Group>
            </Box>
          </Group>
        </Group>

        {/* Quick stats */}
        <Divider my="sm" />
        <SimpleGrid cols={3} spacing="xs">
          <Stack gap={0} align="center">
            <Text size="lg" fw={700} c="violet">{accessibleProjects}</Text>
            <Text size="xs" c="dimmed">Project access</Text>
          </Stack>
          <Stack gap={0} align="center">
            <Text size="lg" fw={700} c={envOverrides > 0 ? 'orange' : 'dimmed'}>
              {envOverrides}
            </Text>
            <Text size="xs" c="dimmed">Env overrides</Text>
          </Stack>
          <Stack gap={0} align="center">
            <Text size="lg" fw={700} c={isSuperAdmin ? 'violet' : permissionCount > 0 ? 'teal' : 'dimmed'}>
              {isSuperAdmin ? 'all' : permissionCount}
            </Text>
            <Text size="xs" c="dimmed">Capabilities</Text>
          </Stack>
        </SimpleGrid>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="profile" variant="pills" color="violet">
        <Tabs.List grow>
          <Tabs.Tab value="profile" leftSection={<TbUser size={14} />}>Profile</Tabs.Tab>
          <Tabs.Tab value="access" leftSection={<TbShieldCheck size={14} />}>
            <Group gap={4}>
              <Text size="sm">Access Matrix</Text>
              {accessibleProjects > 0 && (
                <Badge size="xs" color="violet" variant="filled" circle>{accessibleProjects}</Badge>
              )}
            </Group>
          </Tabs.Tab>
          <Tabs.Tab value="permissions" leftSection={<TbKey size={14} />}>
            <Group gap={4}>
              <Text size="sm">Permissions</Text>
              {!isSuperAdmin && permissionCount > 0 && (
                <Badge size="xs" color="violet" variant="filled" circle>{permissionCount}</Badge>
              )}
            </Group>
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="profile" pt="md">
          <ProfileTab user={user} />
        </Tabs.Panel>

        <Tabs.Panel value="access" pt="md">
          <AccessMatrixTab userId={userId} projects={projects} />
        </Tabs.Panel>

        <Tabs.Panel value="permissions" pt="md">
          <PermissionsTab user={user} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

const ROLE_DESCRIPTIONS: Record<GlobalRole, { label: string; description: string; icon: typeof TbUser }> = {
  USER: { label: 'USER', description: 'Default. Tidak punya hak istimewa. Lihat profile saja.', icon: TbUser },
  QC: { label: 'QC', description: 'Akses dashboard ticket (QC workflow). Tidak ke envmanager.', icon: TbShieldCheck },
  ADMIN: { label: 'ADMIN', description: 'Akses envmanager. Hak harus di-grant via capability.', icon: TbShieldCheck },
  SUPER_ADMIN: { label: 'SUPER_ADMIN', description: 'Bypass semua. Akses penuh ke /dev, /envmanager, /dashboard.', icon: TbLock },
}

function ProfileTab({ user }: { user: UserAccess['user'] }) {
  const qc = useQueryClient()

  const roleMutation = useMutation({
    mutationFn: (role: GlobalRole) =>
      apiFetch(`/api/admin/users/${user.id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    onSuccess: () => {
      notifyOk('Role berhasil diubah')
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users', user.id, 'access'] })
    },
    onError: (e) => notifyErr(e),
  })

  const blockMutation = useMutation({
    mutationFn: (blocked: boolean) =>
      apiFetch(`/api/admin/users/${user.id}/block`, { method: 'PUT', body: JSON.stringify({ blocked }) }),
    onSuccess: () => {
      notifyOk('Status diperbarui')
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users', user.id, 'access'] })
    },
    onError: (e) => notifyErr(e),
  })

  const isSuperAdmin = user.role === 'SUPER_ADMIN'

  return (
    <Stack gap="md">
      {/* ─── Global Role section ────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Group gap="xs" mb="xs">
          <ThemeIcon size={22} radius="md" variant="light" color="violet">
            <TbShieldCheck size={13} />
          </ThemeIcon>
          <Text size="sm" fw={600}>Global Role</Text>
        </Group>
        <Text size="xs" c="dimmed" mb="sm">
          Identity user di sistem. ADMIN tidak punya hak default — semua akses harus di-grant via capability/access matrix.
        </Text>

        {isSuperAdmin ? (
          <Alert color="violet" variant="light" icon={<TbLock size={14} />} p="sm">
            <Text size="xs" fw={500}>SUPER_ADMIN tidak dapat diubah dari sini.</Text>
            <Text size="xs" c="dimmed">Untuk promote/demote SUPER_ADMIN, lakukan via Prisma Studio atau database langsung.</Text>
          </Alert>
        ) : (
          <SegmentedControl
            fullWidth
            value={user.role}
            onChange={(v) => roleMutation.mutate(v as GlobalRole)}
            disabled={roleMutation.isPending}
            color="violet"
            data={(['USER', 'QC', 'ADMIN'] as const).map(r => ({
              value: r,
              label: (
                <Group gap={4} justify="center" wrap="nowrap">
                  <Text size="xs" fw={500}>{r}</Text>
                </Group>
              ),
            }))}
          />
        )}

        {!isSuperAdmin && (
          <Alert color="gray" variant="light" mt="sm" p="xs">
            <Text size="xs" c="dimmed">
              <b>{ROLE_DESCRIPTIONS[user.role].label}:</b> {ROLE_DESCRIPTIONS[user.role].description}
            </Text>
          </Alert>
        )}
      </Paper>

      {/* ─── Account Status section ──────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Group gap="xs" mb="xs">
          <ThemeIcon size={22} radius="md" variant="light" color={user.blocked ? 'red' : 'teal'}>
            {user.blocked ? <TbBan size={13} /> : <TbCheck size={13} />}
          </ThemeIcon>
          <Text size="sm" fw={600}>Account Status</Text>
        </Group>

        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box style={{ flex: 1 }}>
            <Text size="sm" fw={500}>
              {user.blocked ? 'Akun di-block' : 'Akun aktif'}
            </Text>
            <Text size="xs" c="dimmed">
              {user.blocked
                ? 'User tidak bisa login. Semua session aktif dihapus saat di-block.'
                : 'User bisa login dan menggunakan aplikasi sesuai hak akses.'}
            </Text>
          </Box>
          <Switch
            checked={user.blocked}
            onChange={(e) => blockMutation.mutate(e.currentTarget.checked)}
            disabled={isSuperAdmin || blockMutation.isPending}
            color="red"
            size="md"
            onLabel="ON"
            offLabel="OFF"
          />
        </Group>

        {isSuperAdmin && (
          <Alert color="gray" variant="light" mt="sm" p="xs" icon={<TbLock size={12} />}>
            <Text size="xs" c="dimmed">SUPER_ADMIN tidak bisa di-block.</Text>
          </Alert>
        )}

        {user.blocked && !isSuperAdmin && (
          <Alert color="red" variant="light" mt="sm" p="xs" icon={<TbAlertTriangle size={12} />}>
            <Text size="xs">
              Saat blocked: login akan tertolak, semua session aktif dihapus, dan token API jadi tidak valid.
            </Text>
          </Alert>
        )}
      </Paper>

      {/* ─── Quick info ─────────────────────────────────── */}
      <Paper withBorder p="md" radius="md" bg="var(--mantine-color-default-hover)">
        <Group gap="xs" mb={6}>
          <TbAlertTriangle size={14} color="var(--mantine-color-dimmed)" />
          <Text size="xs" fw={600} c="dimmed">Catatan</Text>
        </Group>
        <Text size="xs" c="dimmed">
          • Untuk atur akses per <b>project</b> dan <b>environment</b>, buka tab <Code fz={10}>Access Matrix</Code>.<br />
          • Untuk grant <b>capability</b> (create project, view connection, dll), buka tab <Code fz={10}>Permissions</Code>.<br />
          • Status block/role berlaku <b>seketika</b> — tidak perlu refresh user.
        </Text>
      </Paper>
    </Stack>
  )
}

// ─── Access Matrix Tab ───────────────────────────────────────────────────────

function AccessMatrixTab({ userId, projects }: { userId: string; projects: ProjectAccess[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'has-access' | 'restricted'>('all')

  const hasAnyOverride = (p: ProjectAccess) => p.environments.some(e => e.envRole !== 'inherit')
  const hasRestricted = (p: ProjectAccess) => p.environments.some(e => e.envRole === 'denied')

  const filtered = useMemo(() => {
    let list = projects
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
    }
    if (filter === 'has-access') {
      list = list.filter(p => p.projectRole !== null || hasAnyOverride(p))
    } else if (filter === 'restricted') {
      list = list.filter(p => hasRestricted(p))
    }
    return list
  }, [projects, search, filter])

  const withAccess = filtered.filter(p => p.projectRole !== null || hasAnyOverride(p))
  const withoutAccess = filtered.filter(p => p.projectRole === null && !hasAnyOverride(p))

  const totalHasAccess = projects.filter(p => p.projectRole !== null || hasAnyOverride(p)).length
  const totalRestricted = projects.filter(hasRestricted).length

  return (
    <Stack gap="sm">
      {/* Summary bar */}
      <Card withBorder p="sm" radius="md" bg="var(--mantine-color-default-hover)">
        <SimpleGrid cols={3} spacing="xs">
          <Stack gap={0} align="center">
            <Text size="lg" fw={700} c="teal">{totalHasAccess}</Text>
            <Text size="xs" c="dimmed">Has access</Text>
          </Stack>
          <Stack gap={0} align="center">
            <Text size="lg" fw={700} c={totalRestricted > 0 ? 'red' : 'dimmed'}>{totalRestricted}</Text>
            <Text size="xs" c="dimmed">Restricted</Text>
          </Stack>
          <Stack gap={0} align="center">
            <Text size="lg" fw={700} c="gray">{projects.length}</Text>
            <Text size="xs" c="dimmed">Total projects</Text>
          </Stack>
        </SimpleGrid>
      </Card>

      {/* Search + filter */}
      <Group gap="xs">
        <TextInput
          placeholder="Cari project (nama atau slug)..."
          leftSection={<TbSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          size="sm"
          style={{ flex: 1 }}
          rightSection={search ? (
            <ActionIcon size="xs" variant="subtle" onClick={() => setSearch('')}>
              <TbX size={11} />
            </ActionIcon>
          ) : undefined}
        />
      </Group>
      <SegmentedControl
        fullWidth
        size="xs"
        value={filter}
        onChange={(v) => setFilter(v as typeof filter)}
        data={[
          { value: 'all', label: `Semua (${projects.length})` },
          { value: 'has-access', label: `Has access (${totalHasAccess})` },
          { value: 'restricted', label: `Restricted (${totalRestricted})` },
        ]}
      />

      {/* Has access section */}
      {withAccess.length > 0 && (
        <Stack gap={6}>
          <Group gap={6}>
            <ThemeIcon size={18} radius="sm" variant="light" color="teal">
              <TbCheck size={11} />
            </ThemeIcon>
            <Text size="xs" tt="uppercase" fw={700} c="teal">
              Has access
            </Text>
            <Badge size="xs" variant="light" color="teal">{withAccess.length}</Badge>
          </Group>
          <Accordion variant="separated" radius="md">
            {withAccess.map(p => (
              <ProjectAccessItem key={p.slug} userId={userId} project={p} />
            ))}
          </Accordion>
        </Stack>
      )}

      {/* No access section */}
      {withoutAccess.length > 0 && (
        <Stack gap={6} mt="xs">
          <Group gap={6}>
            <ThemeIcon size={18} radius="sm" variant="light" color="gray">
              <TbBan size={11} />
            </ThemeIcon>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              No access
            </Text>
            <Badge size="xs" variant="outline" color="gray">{withoutAccess.length}</Badge>
          </Group>
          <Accordion variant="separated" radius="md">
            {withoutAccess.map(p => (
              <ProjectAccessItem key={p.slug} userId={userId} project={p} />
            ))}
          </Accordion>
        </Stack>
      )}

      {filtered.length === 0 && (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={32} radius="xl" variant="light" color="gray" mx="auto" mb="xs">
            <TbSearch size={16} />
          </ThemeIcon>
          <Text size="sm" fw={500}>Tidak ada project yang cocok</Text>
          <Text size="xs" c="dimmed">
            Coba ubah filter atau hapus kata kunci pencarian.
          </Text>
          {(search || filter !== 'all') && (
            <Button size="xs" variant="subtle" mt="xs" onClick={() => { setSearch(''); setFilter('all') }}>
              Reset filter
            </Button>
          )}
        </Card>
      )}
    </Stack>
  )
}

function ProjectAccessItem({ userId, project }: { userId: string; project: ProjectAccess }) {
  const qc = useQueryClient()

  const setProjectRole = useMutation({
    mutationFn: (role: ProjectRole | null) =>
      apiFetch(`/api/envman/admin/users/${userId}/projects/${project.slug}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      notifyOk(`Project role updated`)
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users', userId, 'access'] })
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users'] })
    },
    onError: (e) => notifyErr(e),
  })

  const setEnvRole = useMutation({
    mutationFn: ({ envName, role }: { envName: string; role: EnvRoleValue }) =>
      apiFetch(`/api/envman/admin/users/${userId}/projects/${project.slug}/envs/${envName}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      notifyOk('Env override updated')
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users', userId, 'access'] })
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users'] })
    },
    onError: (e) => notifyErr(e),
  })

  const handleProjectRoleChange = (value: string | null) => {
    const newRole = value === '' || value === null ? null : (value as ProjectRole)
    if (project.projectRole === 'OWNER' && newRole !== 'OWNER') {
      modals.openConfirmModal({
        title: 'Demote OWNER',
        children: <Text size="sm">Yakin menurunkan OWNER project ini? Pastikan masih ada OWNER lain.</Text>,
        labels: { confirm: 'Ya, turunkan', cancel: 'Batal' },
        confirmProps: { color: 'red' },
        onConfirm: () => setProjectRole.mutate(newRole),
      })
    } else {
      setProjectRole.mutate(newRole)
    }
  }

  const hasRestricted = project.environments.some(e => e.envRole === 'denied')
  const hasOverride = project.environments.some(e => e.envRole !== 'inherit')

  return (
    <Accordion.Item value={project.slug}>
      <Accordion.Control>
        <Group justify="space-between" wrap="nowrap" pr="xs">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <ThemeIcon
              size={26}
              radius="md"
              variant="light"
              color={project.projectRole ? ROLE_COLOR[project.projectRole] : 'gray'}
            >
              {project.projectRole ? <TbCheck size={13} /> : <TbBan size={13} />}
            </ThemeIcon>
            <Box style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={600} truncate>{project.name}</Text>
              <Text size="xs" c="dimmed" truncate>
                <Code fz={10}>{project.slug}</Code> · {project.environments.length} env{project.environments.length !== 1 ? 's' : ''}
              </Text>
            </Box>
          </Group>
          <Group gap={4}>
            {project.projectRole ? (
              <Badge size="sm" color={ROLE_COLOR[project.projectRole]} variant="light">
                {project.projectRole}
              </Badge>
            ) : (
              <Badge size="sm" color="gray" variant="outline">No access</Badge>
            )}
            {hasRestricted && (
              <Tooltip label="Ada env yang di-deny">
                <Badge size="sm" color="red" variant="dot">restricted</Badge>
              </Tooltip>
            )}
            {!hasRestricted && hasOverride && (
              <Tooltip label="Ada env dengan role override">
                <Badge size="sm" color="orange" variant="dot">override</Badge>
              </Tooltip>
            )}
          </Group>
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        <Stack gap="md">
          {/* Project default role */}
          <Paper withBorder p="sm" radius="md">
            <Group gap="xs" mb={6}>
              <ThemeIcon size={18} radius="sm" variant="light" color="violet">
                <TbShieldCheck size={11} />
              </ThemeIcon>
              <Text size="xs" fw={700} tt="uppercase" c="violet">Project default role</Text>
            </Group>
            <Text size="xs" c="dimmed" mb="xs">
              Role default yang berlaku di semua environment project ini (kecuali di-override di env spesifik).
            </Text>
            <SegmentedControl
              fullWidth
              size="xs"
              value={project.projectRole ?? 'none'}
              onChange={(v) => handleProjectRoleChange(v === 'none' ? null : v)}
              disabled={setProjectRole.isPending}
              data={[
                { value: 'none', label: 'No access' },
                { value: 'VIEWER', label: 'VIEWER' },
                { value: 'EDITOR', label: 'EDITOR' },
                { value: 'OWNER', label: 'OWNER' },
              ]}
            />
          </Paper>

          {/* Per-environment overrides */}
          {project.environments.length > 0 && (
            <Paper withBorder p="sm" radius="md">
              <Group gap="xs" mb={6}>
                <ThemeIcon size={18} radius="sm" variant="light" color="orange">
                  <TbAlertTriangle size={11} />
                </ThemeIcon>
                <Text size="xs" fw={700} tt="uppercase" c="orange">Per-environment override</Text>
              </Group>
              <Text size="xs" c="dimmed" mb="xs">
                Override role untuk env tertentu. <b>Inherit</b> = ikut project default.
                <b> No access (deny)</b> = blokir env meski project default punya akses.
              </Text>
              <Stack gap={6}>
                {project.environments.map(env => {
                  const envColor = env.envRole === 'denied'
                    ? 'red'
                    : env.effectiveRole
                      ? ROLE_COLOR[env.effectiveRole]
                      : 'gray'
                  return (
                    <Group key={env.name} gap="xs" wrap="nowrap"
                      p="xs"
                      style={{
                        borderRadius: 6,
                        background: 'var(--mantine-color-default-hover)',
                      }}
                    >
                      <Box
                        style={{
                          width: 6,
                          height: 28,
                          borderRadius: 3,
                          background: `var(--mantine-color-${envColor}-5)`,
                          flexShrink: 0,
                        }}
                      />
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="xs" fw={600}>{env.name}</Text>
                        <Group gap={4}>
                          {env.envRole === 'denied' ? (
                            <Badge size="xs" color="red" variant="filled" leftSection={<TbBan size={9} />}>
                              DENIED
                            </Badge>
                          ) : env.effectiveRole ? (
                            <Badge size="xs" color={ROLE_COLOR[env.effectiveRole]} variant="light">
                              {env.effectiveRole}
                            </Badge>
                          ) : (
                            <Badge size="xs" color="gray" variant="outline">No access</Badge>
                          )}
                          {env.envRole === 'inherit' && (
                            <Text size="xs" c="dimmed">inherit dari project</Text>
                          )}
                        </Group>
                      </Box>
                      <Select
                        value={env.envRole}
                        data={[
                          { value: 'inherit', label: project.projectRole ? `Inherit (${project.projectRole})` : 'Inherit (no access)' },
                          { value: 'VIEWER', label: 'VIEWER' },
                          { value: 'EDITOR', label: 'EDITOR' },
                          { value: 'OWNER', label: 'OWNER' },
                          { value: 'denied', label: 'No access (deny)' },
                        ]}
                        onChange={(v) => v && setEnvRole.mutate({
                          envName: env.name,
                          role: v as EnvRoleValue,
                        })}
                        disabled={setEnvRole.isPending}
                        size="xs"
                        style={{ width: 200, flexShrink: 0 }}
                        allowDeselect={false}
                      />
                    </Group>
                  )
                })}
              </Stack>
            </Paper>
          )}

          {project.projectRole === null && project.environments.every(e => e.envRole === 'inherit') && (
            <Alert color="gray" variant="light" icon={<TbAlertTriangle size={14} />} p="sm">
              <Text size="xs" fw={500} mb={4}>User tidak punya akses ke project ini</Text>
              <Text size="xs" c="dimmed">
                Set "Project default role" untuk memberi akses ke semua env, atau set role di env spesifik untuk akses env-only.
              </Text>
            </Alert>
          )}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  )
}

// ─── Permissions Tab ─────────────────────────────────────────────────────────

interface CapabilityItem {
  value: string
  label: string
  description: string
}

interface CapabilityGroup {
  label: string
  description: string
  color: string
  icon: typeof TbKey
  items: CapabilityItem[]
}

const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    label: 'Create actions',
    description: 'Apa yang boleh dibuat user ini.',
    color: 'teal',
    icon: TbPlus,
    items: [
      { value: 'project:create', label: 'Create new project', description: 'Bisa create project baru (otomatis jadi OWNER).' },
      { value: 'token:create', label: 'Create API token', description: 'Bisa create API token untuk CLI/integrasi (scope tetap dibatasi project member).' },
      { value: 'gist:create', label: 'Create gist', description: 'Bisa simpan snippet/konfigurasi di Gists.' },
      { value: 'ticket:create', label: 'Create ticket', description: 'Bisa create ticket di tracker. (QC sudah otomatis bisa.)' },
      { value: 'note:create', label: 'Create project note', description: 'Bisa create note di project (selain capability, butuh role EDITOR+ di project tersebut).' },
    ],
  },
  {
    label: 'Sidebar menu visibility',
    description: 'Menu yang muncul di sidebar envmanager.',
    color: 'blue',
    icon: TbLayoutDashboard,
    items: [
      { value: 'menu:overview', label: 'Show Overview menu', description: 'Akses halaman /envmanager/overview (ringkasan resources).' },
      { value: 'menu:tokens', label: 'Show Tokens menu', description: 'Akses halaman /envmanager/tokens.' },
      { value: 'menu:connections', label: 'Show Connections menu', description: 'Akses halaman /envmanager/connections (perlu connection:view juga).' },
      { value: 'menu:gists', label: 'Show Gists menu', description: 'Akses halaman /envmanager/gists.' },
    ],
  },
  {
    label: 'Portainer operations',
    description: 'Akses ke infra Portainer global. Bertingkat dari view → operate → mutate → prune.',
    color: 'orange',
    icon: TbPlugConnected,
    items: [
      { value: 'connection:view', label: 'View Portainer connections', description: 'Lihat list & detail connection, health, probe.' },
      { value: 'stack:operate', label: 'Operate stacks (read)', description: 'View stacks, container logs, compose file, status, stats, dangling images.' },
      { value: 'stack:mutate', label: 'Mutate stacks', description: 'Edit compose, restart container, repull image, recreate stack.' },
      { value: 'stack:prune', label: 'Prune resources (destructive)', description: 'Hapus images/volumes/networks yang tidak terpakai.' },
    ],
  },
]

function PermissionsTab({ user }: { user: UserAccess['user'] }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string[]>(user.permissions)
  const [showInfo, setShowInfo] = useState(false)
  const isSuperAdmin = user.role === 'SUPER_ADMIN'

  const mutation = useMutation({
    mutationFn: (perms: string[]) =>
      apiFetch(`/api/envman/admin/users/${user.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: perms }),
      }),
    onSuccess: () => {
      notifyOk('Permissions updated')
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users', user.id, 'access'] })
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users'] })
    },
    onError: (e) => notifyErr(e),
  })

  if (isSuperAdmin) {
    return (
      <Card withBorder p="md" radius="md">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={40} radius="xl" variant="gradient" gradient={{ from: 'violet', to: 'grape' }}>
            <TbShieldCheck size={20} />
          </ThemeIcon>
          <Box>
            <Text size="sm" fw={600}>SUPER_ADMIN bypass semua check</Text>
            <Text size="xs" c="dimmed">
              SUPER_ADMIN otomatis lulus semua capability check di backend. Tidak perlu di-grant manual.
            </Text>
          </Box>
        </Group>
      </Card>
    )
  }

  const totalCaps = CAPABILITY_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
  const sortedSelected = [...selected].sort()
  const sortedCurrent = [...user.permissions].sort()
  const hasChanges = JSON.stringify(sortedSelected) !== JSON.stringify(sortedCurrent)

  const toggleGroupAll = (group: CapabilityGroup) => {
    const groupValues = group.items.map(i => i.value)
    const allSelected = groupValues.every(v => selected.includes(v))
    if (allSelected) {
      setSelected(selected.filter(s => !groupValues.includes(s)))
    } else {
      setSelected([...new Set([...selected, ...groupValues])])
    }
  }

  return (
    <Stack gap="md">
      {/* Summary header */}
      <Card withBorder p="sm" radius="md" bg="var(--mantine-color-default-hover)">
        <Group justify="space-between" wrap="nowrap">
          <Box>
            <Text size="xs" c="dimmed">Capability granted</Text>
            <Group gap={6} align="flex-end">
              <Text size="xl" fw={700} c="violet">{selected.length}</Text>
              <Text size="sm" c="dimmed" pb={4}>/ {totalCaps}</Text>
            </Group>
          </Box>
          <Box style={{ flex: 1, maxWidth: 240 }}>
            <Progress
              value={(selected.length / totalCaps) * 100}
              color="violet"
              radius="md"
              size="sm"
            />
            <Text size="xs" c="dimmed" mt={4} ta="right">
              {Math.round((selected.length / totalCaps) * 100)}% access
            </Text>
          </Box>
        </Group>
      </Card>

      {/* Capability groups */}
      <Checkbox.Group value={selected} onChange={setSelected}>
        <Stack gap="md">
          {CAPABILITY_GROUPS.map(group => {
            const groupValues = group.items.map(i => i.value)
            const groupSelected = groupValues.filter(v => selected.includes(v)).length
            const groupTotal = groupValues.length
            const allSelected = groupSelected === groupTotal
            const someSelected = groupSelected > 0 && groupSelected < groupTotal
            return (
              <Paper key={group.label} withBorder radius="md" style={{ overflow: 'hidden' }}>
                {/* Group header */}
                <Box
                  p="sm"
                  style={{
                    background: `var(--mantine-color-${group.color}-light)`,
                    borderBottom: '1px solid var(--mantine-color-default-border)',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                      <ThemeIcon size={26} radius="md" variant="white" color={group.color}>
                        <group.icon size={14} />
                      </ThemeIcon>
                      <Box>
                        <Text size="sm" fw={700} c={group.color}>{group.label}</Text>
                        <Text size="xs" c="dimmed">{group.description}</Text>
                      </Box>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      <Badge size="sm" color={group.color} variant="filled">
                        {groupSelected}/{groupTotal}
                      </Badge>
                      <Button
                        size="xs"
                        variant="subtle"
                        color={group.color}
                        onClick={() => toggleGroupAll(group)}
                      >
                        {allSelected ? 'Uncheck all' : someSelected ? 'Check all' : 'Check all'}
                      </Button>
                    </Group>
                  </Group>
                </Box>
                {/* Group items */}
                <Stack gap="xs" p="sm">
                  {group.items.map(cap => (
                    <Box
                      key={cap.value}
                      p="xs"
                      style={{
                        borderRadius: 6,
                        background: selected.includes(cap.value)
                          ? `var(--mantine-color-${group.color}-light)`
                          : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <Checkbox
                        color={group.color}
                        value={cap.value}
                        label={
                          <Group gap="xs">
                            <Text size="sm" fw={500}>{cap.label}</Text>
                            <Code fz={10}>{cap.value}</Code>
                          </Group>
                        }
                        description={cap.description}
                      />
                    </Box>
                  ))}
                </Stack>
              </Paper>
            )
          })}
        </Stack>
      </Checkbox.Group>

      {/* Non-capability rules — collapsible */}
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <Group
          p="sm"
          justify="space-between"
          style={{ cursor: 'pointer' }}
          onClick={() => setShowInfo(!showInfo)}
        >
          <Group gap="xs">
            <ThemeIcon size={22} radius="md" variant="light" color="gray">
              <TbInfoCircle size={13} />
            </ThemeIcon>
            <Text size="sm" fw={600}>Aturan akses non-capability</Text>
            <Badge size="xs" variant="outline" color="gray">read-only info</Badge>
          </Group>
          <ActionIcon variant="subtle" size="sm" color="gray">
            <TbChevronDown
              size={14}
              style={{ transform: showInfo ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
            />
          </ActionIcon>
        </Group>
        <Collapse in={showInfo}>
          <Divider />
          <Box p="sm">
            <Text size="xs" c="dimmed">
              • <b>Portainer connection CRUD</b> (create/edit/delete connection itself) — <b>hanya SUPER_ADMIN</b>.<br />
              • <b>Database sync &amp; Users management menu</b> — <b>hanya SUPER_ADMIN</b>.<br />
              • <b>Project member &amp; env access</b> — diatur per-project di tab <Code fz={10}>Access Matrix</Code>.<br />
              • <b>Project edit/delete &amp; member CRUD</b> — butuh ProjectMember OWNER (bukan capability).<br />
              • <b>Env vars CRUD &amp; per-env Portainer sync</b> — butuh ProjectMember EDITOR+ untuk env tersebut.<br />
              • <b>Default landing</b> — ADMIN ke <Code fz={10}>/envmanager</Code>; QC ke <Code fz={10}>/dashboard</Code>; SUPER_ADMIN ke <Code fz={10}>/dev</Code>.
            </Text>
          </Box>
        </Collapse>
      </Paper>

      {/* Footer actions */}
      <Card
        withBorder
        p="sm"
        radius="md"
        style={{
          position: 'sticky',
          bottom: 0,
          background: 'var(--mantine-color-body)',
          zIndex: 10,
        }}
      >
        <Group justify="space-between">
          <Text size="xs" c={hasChanges ? 'orange' : 'dimmed'}>
            {hasChanges ? `${Math.abs(selected.length - user.permissions.length)} perubahan belum disimpan` : 'Tidak ada perubahan'}
          </Text>
          <Group gap="xs">
            {hasChanges && (
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => setSelected(user.permissions)}
                disabled={mutation.isPending}
              >
                Reset
              </Button>
            )}
            <Button
              size="sm"
              color="violet"
              leftSection={<TbCheck size={14} />}
              onClick={() => mutation.mutate(selected)}
              loading={mutation.isPending}
              disabled={!hasChanges}
            >
              Save permissions
            </Button>
          </Group>
        </Group>
      </Card>
    </Stack>
  )
}
