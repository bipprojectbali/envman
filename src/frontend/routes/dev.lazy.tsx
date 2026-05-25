import {
  ActionIcon, AppShell, Avatar, Box, Burger, Group,
  NavLink, Stack, Text, ThemeIcon, Title, Tooltip,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { createLazyFileRoute, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  TbBook, TbBug, TbChevronRight, TbCode,
  TbDatabase, TbLayoutDashboard, TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand, TbLogout, TbPuzzle, TbServer,
  TbSettings, TbSitemap, TbUserSearch, TbUsers, TbVariable,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { TicketsPanel } from '@/frontend/components/TicketsPanel'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'
import { OverviewPanel } from '@/frontend/components/dev/overview-panel'
import { UsersPanel } from '@/frontend/components/dev/users-panel'
import { AppLogsPanel } from '@/frontend/components/dev/app-logs-panel'
import { UserLogsPanel } from '@/frontend/components/dev/user-logs-panel'
import { ExtensionsPanel } from '@/frontend/components/dev/extensions-panel'
import { PlaceholderPanel } from '@/frontend/components/dev/placeholder-panel'
import { DatabasePanel } from '@/frontend/components/dev/dev-database'
import { ProjectPanel } from '@/frontend/components/dev/dev-project'

export const Route = createLazyFileRoute('/dev')({ component: DevPage })

const navItems = [
  { label: 'Overview', icon: TbLayoutDashboard, key: 'overview' },
  { label: 'Users', icon: TbUsers, key: 'users' },
  { label: 'Tickets', icon: TbBug, key: 'tickets' },
  { label: 'App Logs', icon: TbServer, key: 'app-logs' },
  { label: 'User Logs', icon: TbUserSearch, key: 'user-logs' },
  { label: 'Database', icon: TbDatabase, key: 'database' },
  { label: 'Project', icon: TbSitemap, key: 'project' },
  { label: 'Extensions', icon: TbPuzzle, key: 'extensions' },
  { label: 'Settings', icon: TbSettings, key: 'settings' },
]

function DevPage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user
  const { tab: active } = Route.useSearch()
  const matchRoute = useMatchRoute()
  const isChildRoute = !!matchRoute({ to: '/dev/docs', search: { tab: 'overview' } })
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

        <AppShell.Section grow>
          {navItems.map((item) =>
            collapsed ? (
              <Tooltip key={item.key} label={item.label} position="right">
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
            ) : (
              <NavLink
                key={item.key}
                label={item.label}
                leftSection={<item.icon size={18} />}
                rightSection={<TbChevronRight size={14} />}
                active={active === item.key}
                onClick={() => setActive(item.key)}
                variant="light"
                mb={4}
              />
            ),
          )}
          {collapsed ? (
            <>
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
              <Text size="xs" c="dimmed" fw={500} mt="md" mb={4} ml="sm">Tools</Text>
              <NavLink
                label="Dashboard"
                leftSection={<TbLayoutDashboard size={18} />}
                rightSection={<TbChevronRight size={14} />}
                component="a"
                href="/dashboard"
                variant="light"
                mb={4}
              />
              <NavLink
                label="Env Manager"
                leftSection={<TbVariable size={18} />}
                rightSection={<TbChevronRight size={14} />}
                component="a"
                href="/envmanager"
                variant="light"
                mb={4}
              />
              <NavLink
                label="Docs"
                leftSection={<TbBook size={18} />}
                rightSection={<TbChevronRight size={14} />}
                onClick={() => navigate({ to: '/dev/docs', search: { tab: 'overview' } })}
                variant="light"
                mb={4}
              />
            </>
          )}
        </AppShell.Section>

        <AppShell.Section>
          <Box p={collapsed ? 'xs' : 'sm'} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            {collapsed ? (
              <Stack align="center" gap={4}>
                <Tooltip label={user?.name} position="right">
                  <Avatar color="red" radius="xl" size="sm">
                    {user?.name?.charAt(0).toUpperCase()}
                  </Avatar>
                </Tooltip>
                <ThemeToggle size="sm" />
                <Tooltip label="Logout" position="right">
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={confirmLogout} loading={logout.isPending}>
                    <TbLogout size={14} />
                  </ActionIcon>
                </Tooltip>
              </Stack>
            ) : (
              <Group justify="space-between">
                <Group gap="xs">
                  <Avatar color="red" radius="xl" size="sm">
                    {user?.name?.charAt(0).toUpperCase()}
                  </Avatar>
                  <div>
                    <Text size="xs" fw={500}>
                      {user?.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {user?.email}
                    </Text>
                  </div>
                </Group>
                <Group gap={4}>
                  <ThemeToggle size="sm" />
                  <Tooltip label="Logout">
                    <ActionIcon variant="subtle" color="red" onClick={confirmLogout} loading={logout.isPending}>
                      <TbLogout size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
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
            {active === 'extensions' && <ExtensionsPanel />}
            {active === 'settings' && (
              <PlaceholderPanel title="Settings" desc="System configuration akan ditampilkan di sini." icon={TbSettings} />
            )}
          </>
        ) : (
          <Outlet />
        )}
      </AppShell.Main>
    </AppShell>
  )
}
