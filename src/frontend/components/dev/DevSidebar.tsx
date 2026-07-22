import {
  ActionIcon,
  AppShell,
  Box,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import type { NavigateFn } from '@tanstack/react-router'
import {
  TbBook,
  TbChevronRight,
  TbCode,
  TbDatabase,
  TbKey,
  TbLayoutDashboard,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbLogout,
  TbPuzzle,
  TbServer,
  TbBucket,
  TbSettings,
  TbUser,
  TbUserSearch,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { UserAvatar } from '@/frontend/components/UserAvatar'

export const navGroups = [
  {
    group: 'Monitoring',
    items: [
      { key: 'overview', label: 'Overview', icon: TbLayoutDashboard, desc: 'Statistik user online & ringkasan sistem' },
      { key: 'app-logs', label: 'App Logs', icon: TbServer, desc: 'Log server dari Redis — request, error, auth' },
      { key: 'user-logs', label: 'User Logs', icon: TbUserSearch, desc: 'Audit trail seluruh aksi user tersimpan di DB' },
    ],
  },
  {
    group: 'People',
    items: [
      { key: 'users', label: 'Users', icon: TbUsers, desc: 'Kelola akun, ubah role, blokir user' },
      { key: 'tokens-admin', label: 'Token Control', icon: TbKey, desc: 'Pantau & kendalikan semua API token' },
    ],
  },
  {
    group: 'Codebase',
    items: [
      { key: 'database', label: 'Database', icon: TbDatabase, desc: 'Visualisasi schema Prisma & relasi antar tabel' },
    ],
  },
  {
    group: 'System',
    items: [
      { key: 'extensions', label: 'Extensions', icon: TbPuzzle, desc: 'Integrasi & plugin tambahan' },
      { key: 'storage', label: 'Storage', icon: TbBucket, desc: 'Status MinIO dan manajemen bucket' },
      { key: 'settings', label: 'Settings', icon: TbSettings, desc: 'Konfigurasi sistem dan aplikasi' },
    ],
  },
]

interface DevSidebarProps {
  collapsed: boolean
  toggleSidebar: () => void
  active: string
  setActive: (key: string) => void
  user: { id?: string; name?: string; email?: string; image?: string | null } | null | undefined
  confirmLogout: () => void
  navigate: NavigateFn
}

export function DevSidebar({ collapsed, toggleSidebar, active, setActive, user, confirmLogout, navigate }: DevSidebarProps) {
  return (
    <AppShell.Navbar p={collapsed ? 'xs' : 'md'}>
      <AppShell.Section>
        <Group gap="xs" mb="md" justify={collapsed ? 'center' : 'space-between'}>
          {collapsed ? (
            <Tooltip label="Expand sidebar" position="right">
              <ActionIcon variant="subtle" color="gray" size="lg" onClick={toggleSidebar}>
                <TbLayoutSidebarLeftExpand size={18} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <>
              <Group gap="xs">
                <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'red', to: 'orange' }}>
                  <TbCode size={18} />
                </ThemeIcon>
                <div>
                  <Text fw={700} size="sm">Dev Console</Text>
                  <Text size="xs" c="dimmed">Super Admin</Text>
                </div>
              </Group>
              <Tooltip label="Minimize sidebar">
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={toggleSidebar}>
                  <TbLayoutSidebarLeftCollapse size={18} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </AppShell.Section>

      <AppShell.Section grow component={ScrollArea}>
        {collapsed ? (
          <>
            {navGroups.map((g) =>
              g.items.map((item) => (
                <Tooltip
                  key={item.key}
                  label={
                    <>
                      <Text size="xs" fw={500}>{item.label}</Text>
                      <Text size="xs" c="dimmed">{item.desc}</Text>
                    </>
                  }
                  position="right"
                  multiline
                  w={200}
                >
                  <ActionIcon
                    variant={active === item.key ? 'light' : 'subtle'}
                    color={active === item.key ? 'blue' : 'gray'}
                    size="lg"
                    onClick={() => setActive(item.key)}
                    mb={4}
                    style={{ width: '100%' }}
                  >
                    <item.icon size={18} />
                  </ActionIcon>
                </Tooltip>
              )),
            )}
            <Tooltip label="Dashboard" position="right">
              <ActionIcon variant="subtle" color="gray" size="lg" component="a" href="/dashboard" mt={4} style={{ width: '100%' }}>
                <TbLayoutDashboard size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Env Manager" position="right">
              <ActionIcon variant="subtle" color="gray" size="lg" component="a" href="/envmanager" mt={4} style={{ width: '100%' }}>
                <TbVariable size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Docs" position="right">
              <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => navigate({ to: '/dev/docs', search: { tab: 'overview' } })} mt={4} style={{ width: '100%' }}>
                <TbBook size={18} />
              </ActionIcon>
            </Tooltip>
          </>
        ) : (
          <>
            {navGroups.map((g, gi) => (
              <Box key={g.group} mt={gi > 0 ? 'sm' : 0} mb={4}>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4} ml={4} style={{ letterSpacing: '0.05em' }}>
                  {g.group}
                </Text>
                {g.items.map((item) => (
                  <NavLink
                    key={item.key}
                    label={item.label}
                    description={item.desc}
                    leftSection={<item.icon size={18} />}
                    rightSection={<TbChevronRight size={14} />}
                    active={active === item.key}
                    onClick={() => setActive(item.key)}
                    variant="light"
                    mb={2}
                  />
                ))}
              </Box>
            ))}
            <Text size="xs" c="dimmed" fw={600} tt="uppercase" mt="sm" mb={4} ml={4} style={{ letterSpacing: '0.05em' }}>
              Tools
            </Text>
            <NavLink label="Dashboard" description="Halaman admin utama" leftSection={<TbLayoutDashboard size={18} />} rightSection={<TbChevronRight size={14} />} component="a" href="/dashboard" variant="light" mb={2} />
            <NavLink label="Env Manager" description="Kelola env vars project" leftSection={<TbVariable size={18} />} rightSection={<TbChevronRight size={14} />} component="a" href="/envmanager" variant="light" mb={2} />
            <NavLink label="Docs" description="Referensi API & arsitektur" leftSection={<TbBook size={18} />} rightSection={<TbChevronRight size={14} />} onClick={() => navigate({ to: '/dev/docs', search: { tab: 'overview' } })} variant="light" mb={2} />
          </>
        )}
      </AppShell.Section>

      <AppShell.Section>
        <Box p={collapsed ? 'xs' : 'sm'} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          {collapsed ? (
            <Stack align="center" gap={4}>
              <Menu position="right-end" withArrow offset={12}>
                <Menu.Target>
                  <Tooltip label={user?.name} position="right">
                    <Box style={{ cursor: 'pointer' }}>
                      <UserAvatar user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }} size="sm" color="red" />
                    </Box>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{user?.email}</Menu.Label>
                  <Menu.Item leftSection={<TbUser size={14} />} onClick={() => navigate({ to: '/profile', search: { tab: 'account' } })}>Profile</Menu.Item>
                  <Menu.Divider />
                  <Menu.Item leftSection={<TbLogout size={14} />} color="red" onClick={confirmLogout}>Logout</Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <ThemeToggle size="sm" />
            </Stack>
          ) : (
            <Group justify="space-between">
              <Menu position="top-start" withArrow offset={8} width={220}>
                <Menu.Target>
                  <Group gap="xs" style={{ cursor: 'pointer', borderRadius: 'var(--mantine-radius-sm)', padding: '4px 6px', flex: 1, minWidth: 0 }}>
                    <UserAvatar user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }} size="sm" color="red" />
                    <div style={{ minWidth: 0 }}>
                      <Text size="xs" fw={500} truncate>{user?.name}</Text>
                      <Text size="xs" c="dimmed" truncate>{user?.email}</Text>
                    </div>
                  </Group>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{user?.email}</Menu.Label>
                  <Menu.Item leftSection={<TbUser size={14} />} onClick={() => navigate({ to: '/profile', search: { tab: 'account' } })}>Profile</Menu.Item>
                  <Menu.Divider />
                  <Menu.Item leftSection={<TbLogout size={14} />} color="red" onClick={confirmLogout}>Logout</Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <ThemeToggle size="sm" />
            </Group>
          )}
        </Box>
      </AppShell.Section>
    </AppShell.Navbar>
  )
}
