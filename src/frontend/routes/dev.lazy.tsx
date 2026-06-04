import {
  ActionIcon,
  AppShell,
  Box,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { createLazyFileRoute, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  TbActivity,
  TbBook,
  TbBug,
  TbChevronRight,
  TbCode,
  TbDatabase,
  TbLayoutDashboard,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbLogout,
  TbPuzzle,
  TbServer,
  TbSettings,
  TbSitemap,
  TbUser,
  TbUserSearch,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { AppLogsPanel } from '@/frontend/components/dev/app-logs-panel'
import { DatabasePanel } from '@/frontend/components/dev/dev-database'
import { ProjectPanel } from '@/frontend/components/dev/dev-project'
import { ExtensionsPanel } from '@/frontend/components/dev/extensions-panel'
import { FileHealthPanel } from '@/frontend/components/dev/FileHealthPanel'
import { OverviewPanel } from '@/frontend/components/dev/overview-panel'
import { SettingsPanel } from '@/frontend/components/dev/SettingsPanel'
import { UserLogsPanel } from '@/frontend/components/dev/user-logs-panel'
import { UsersPanel } from '@/frontend/components/dev/users-panel'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { TicketsPanel } from '@/frontend/components/TicketsPanel'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'

export const Route = createLazyFileRoute('/dev')({ component: DevPage })

const navGroups = [
  {
    group: 'Monitoring',
    items: [
      { key: 'overview', label: 'Overview', icon: TbLayoutDashboard, desc: 'Statistik user online & ringkasan sistem' },
      { key: 'app-logs', label: 'App Logs', icon: TbServer, desc: 'Log server dari Redis — request, error, auth' },
      {
        key: 'user-logs',
        label: 'User Logs',
        icon: TbUserSearch,
        desc: 'Audit trail seluruh aksi user tersimpan di DB',
      },
    ],
  },
  {
    group: 'People',
    items: [
      { key: 'users', label: 'Users', icon: TbUsers, desc: 'Kelola akun, ubah role, blokir user' },
      { key: 'tickets', label: 'Tickets', icon: TbBug, desc: 'Bug report & QC workflow (OPEN → CLOSED)' },
    ],
  },
  {
    group: 'Codebase',
    items: [
      { key: 'database', label: 'Database', icon: TbDatabase, desc: 'Visualisasi schema Prisma & relasi antar tabel' },
      { key: 'project', label: 'Project', icon: TbSitemap, desc: 'Struktur file, routes, data flow & user flow' },
      { key: 'file-health', label: 'File Health', icon: TbActivity, desc: 'Monitor ukuran file vs limit per kategori' },
    ],
  },
  {
    group: 'System',
    items: [
      { key: 'extensions', label: 'Extensions', icon: TbPuzzle, desc: 'Integrasi & plugin tambahan' },
      { key: 'settings', label: 'Settings', icon: TbSettings, desc: 'Konfigurasi sistem dan aplikasi' },
    ],
  },
]

function DevPage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user
  const { tab: active } = Route.useSearch()
  const matchRoute = useMatchRoute()
  const isChildRoute = !!matchRoute({
    to: '/dev/docs',
    search: { tab: 'overview' },
  })
  const navigate = useNavigate()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 48em)')
  const setActive = (key: string) => {
    navigate({ to: '/dev', search: { tab: key } })
    closeMobile()
  }
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dev:sidebar') === 'collapsed')
  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('dev:sidebar', next ? 'collapsed' : 'open')
      return next
    })
  }
  const confirmLogout = () =>
    modals.openConfirmModal({
      title: 'Logout',
      children: <Text size="sm">Are you sure you want to logout?</Text>,
      labels: { confirm: 'Logout', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => logout.mutate(),
    })

  return (
    <AppShell
      header={{ height: 56, collapsed: !isMobile }}
      navbar={{
        width: collapsed ? 60 : 260,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding="md"
    >
      <AppShell.Header px="md" hiddenFrom="sm">
        <Group h="100%" justify="space-between">
          <Group gap="xs">
            <Burger opened={mobileOpened} onClick={toggleMobile} size="sm" />
            <ThemeIcon size="md" variant="gradient" gradient={{ from: 'red', to: 'orange' }}>
              <TbCode size={16} />
            </ThemeIcon>
            <Text fw={700} size="sm">
              Dev Console
            </Text>
          </Group>
        </Group>
      </AppShell.Header>
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
                    <Text fw={700} size="sm">
                      Dev Console
                    </Text>
                    <Text size="xs" c="dimmed">
                      Super Admin
                    </Text>
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
            // ── Collapsed: ikon + tooltip informatif ──────────────────
            <>
              {navGroups.map((g) =>
                g.items.map((item) => (
                  <Tooltip
                    key={item.key}
                    label={
                      <>
                        <Text size="xs" fw={500}>
                          {item.label}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {item.desc}
                        </Text>
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
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  component="a"
                  href="/dashboard"
                  mt={4}
                  style={{ width: '100%' }}
                >
                  <TbLayoutDashboard size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Env Manager" position="right">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  component="a"
                  href="/envmanager"
                  mt={4}
                  style={{ width: '100%' }}
                >
                  <TbVariable size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Docs" position="right">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  onClick={() => navigate({ to: '/dev/docs', search: { tab: 'overview' } })}
                  mt={4}
                  style={{ width: '100%' }}
                >
                  <TbBook size={18} />
                </ActionIcon>
              </Tooltip>
            </>
          ) : (
            // ── Expanded: group label + NavLink dengan deskripsi ──────
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
              <Text
                size="xs"
                c="dimmed"
                fw={600}
                tt="uppercase"
                mt="sm"
                mb={4}
                ml={4}
                style={{ letterSpacing: '0.05em' }}
              >
                Tools
              </Text>
              <NavLink
                label="Dashboard"
                description="Halaman admin utama"
                leftSection={<TbLayoutDashboard size={18} />}
                rightSection={<TbChevronRight size={14} />}
                component="a"
                href="/dashboard"
                variant="light"
                mb={2}
              />
              <NavLink
                label="Env Manager"
                description="Kelola env vars project"
                leftSection={<TbVariable size={18} />}
                rightSection={<TbChevronRight size={14} />}
                component="a"
                href="/envmanager"
                variant="light"
                mb={2}
              />
              <NavLink
                label="Docs"
                description="Referensi API & arsitektur"
                leftSection={<TbBook size={18} />}
                rightSection={<TbChevronRight size={14} />}
                onClick={() => navigate({ to: '/dev/docs', search: { tab: 'overview' } })}
                variant="light"
                mb={2}
              />
            </>
          )}
        </AppShell.Section>

        <AppShell.Section>
          <Box
            p={collapsed ? 'xs' : 'sm'}
            style={{
              borderTop: '1px solid var(--mantine-color-default-border)',
            }}
          >
            {collapsed ? (
              <Stack align="center" gap={4}>
                <Menu position="right-end" withArrow offset={12}>
                  <Menu.Target>
                    <Tooltip label={user?.name} position="right">
                      <Box style={{ cursor: 'pointer' }}>
                        <UserAvatar
                          user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }}
                          size="sm"
                          color="red"
                        />
                      </Box>
                    </Tooltip>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>{user?.email}</Menu.Label>
                    <Menu.Item
                      leftSection={<TbUser size={14} />}
                      onClick={() => navigate({ to: '/profile', search: { tab: 'account' } })}
                    >
                      Profile
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item leftSection={<TbLogout size={14} />} color="red" onClick={confirmLogout}>
                      Logout
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                <ThemeToggle size="sm" />
              </Stack>
            ) : (
              <Group justify="space-between">
                <Menu position="top-start" withArrow offset={8} width={220}>
                  <Menu.Target>
                    <Group
                      gap="xs"
                      style={{
                        cursor: 'pointer',
                        borderRadius: 'var(--mantine-radius-sm)',
                        padding: '4px 6px',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <UserAvatar
                        user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }}
                        size="sm"
                        color="red"
                      />
                      <div style={{ minWidth: 0 }}>
                        <Text size="xs" fw={500} truncate>
                          {user?.name}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {user?.email}
                        </Text>
                      </div>
                    </Group>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>{user?.email}</Menu.Label>
                    <Menu.Item
                      leftSection={<TbUser size={14} />}
                      onClick={() => navigate({ to: '/profile', search: { tab: 'account' } })}
                    >
                      Profile
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item leftSection={<TbLogout size={14} />} color="red" onClick={confirmLogout}>
                      Logout
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                <ThemeToggle size="sm" />
              </Group>
            )}
          </Box>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        {!isChildRoute ? (
          <>
            {active === 'overview' && <OverviewPanel />}
            {active === 'users' && <UsersPanel />}
            {active === 'tickets' && <TicketsPanel />}
            {active === 'app-logs' && <AppLogsPanel />}
            {active === 'user-logs' && <UserLogsPanel />}
            {active === 'database' && <DatabasePanel />}
            {active === 'project' && <ProjectPanel />}
            {active === 'file-health' && <FileHealthPanel />}
            {active === 'extensions' && <ExtensionsPanel />}
            {active === 'settings' && <SettingsPanel />}
          </>
        ) : (
          <Outlet />
        )}
      </AppShell.Main>
    </AppShell>
  )
}
