import {
  ActionIcon,
  AppShell,
  Box,
  Burger,
  Container,
  Group,
  Menu,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import {
  TbBook,
  TbBrandGithub,
  TbCode,
  TbDatabase,
  TbHome,
  TbKey,
  TbLayoutDashboard,
  TbLogout,
  TbPlugConnected,
  TbUser,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { EnvManagerSidebar } from '@/frontend/components/layout/EnvManagerSidebar'
import { MobileTabBar } from '@/frontend/components/layout/MobileTabBar'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { hasCapability, useLogout, useSession } from '@/frontend/hooks/useAuth'
import { useExtensions } from '@/frontend/hooks/useExtensions'

export const Route = createFileRoute('/envmanager')({
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
        staleTime: 0,
      })
      if (!data?.user) throw redirect({ to: '/login' })
      if (data.user.blocked) throw redirect({ to: '/blocked' })
      if (data.user.role === 'QC') throw redirect({ to: '/dashboard', search: { tab: 'dashboard' } })
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: EnvManagerLayout,
})

function EnvManagerLayout() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user
  const { data: extensions } = useExtensions()
  const portainerEnabled = extensions?.portainer ?? true
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 48em)')
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('envmanager:sidebar') === 'collapsed')
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const toggleSidebar = () =>
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('envmanager:sidebar', next ? 'collapsed' : 'open')
      return next
    })

  const confirmLogout = () =>
    modals.openConfirmModal({
      title: 'Logout',
      children: <Text size="sm">Yakin ingin logout?</Text>,
      labels: { confirm: 'Logout', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => logout.mutate(),
    })

  const isOverview = pathname === '/envmanager/overview'
  const isTokens = pathname.startsWith('/envmanager/tokens')
  const isConnections = pathname.startsWith('/envmanager/connections')
  const isReadme = pathname.startsWith('/envmanager/docs')
  const isGists = pathname.startsWith('/envmanager/gists')
  const isDatabase = pathname.startsWith('/envmanager/database')
  const isUsers = pathname.startsWith('/envmanager/users')
  const isProjectsActive =
    !isOverview && !isTokens && !isConnections && !isReadme && !isGists && !isDatabase && !isUsers

  const mainNav = [
    ...(hasCapability(user, 'menu:overview')
      ? [{ label: 'Overview', description: 'Ringkasan semua resources', icon: TbHome, href: '/envmanager/overview', active: isOverview }]
      : []),
    { label: 'Projects', description: 'Kelola environment vars', icon: TbVariable, href: '/envmanager', active: isProjectsActive },
    ...(hasCapability(user, 'menu:tokens')
      ? [{ label: 'Tokens', description: 'API token untuk CLI', icon: TbKey, href: '/envmanager/tokens', active: isTokens }]
      : []),
    ...(hasCapability(user, 'menu:gists')
      ? [{ label: 'Gists', description: 'Snippets & konfigurasi', icon: TbBrandGithub, href: '/envmanager/gists', active: isGists }]
      : []),
    ...(user?.role === 'SUPER_ADMIN'
      ? [
          { label: 'Database', description: 'Sync data dari remote', icon: TbDatabase, href: '/envmanager/database', active: isDatabase },
          { label: 'Users', description: 'Kelola akses user', icon: TbUsers, href: '/envmanager/users', active: isUsers },
        ]
      : []),
  ]

  const otherNav = [
    // Dashboard hanya untuk QC + SUPER_ADMIN (ticket workflow). ADMIN tidak.
    ...(user?.role === 'QC' || user?.role === 'SUPER_ADMIN'
      ? [{ label: 'Dashboard', icon: TbLayoutDashboard, href: '/dashboard', active: false }]
      : []),
    ...(user?.role === 'SUPER_ADMIN' ? [{ label: 'Dev Console', icon: TbCode, href: '/dev', active: false }] : []),
    { label: 'Docs', icon: TbBook, href: '/envmanager/docs', active: isReadme },
  ]

  const extensionsNav = [
    ...(portainerEnabled && (user?.role === 'SUPER_ADMIN' || hasCapability(user, 'menu:connections'))
      ? [{ label: 'Portainer', description: 'Connections & backup', icon: TbPlugConnected, href: '/envmanager/connections', active: isConnections }]
      : []),
  ]

  const bottomTabs = [
    ...(hasCapability(user, 'menu:overview') ? [{ label: 'Overview', icon: TbHome, href: '/envmanager/overview', active: isOverview }] : []),
    { label: 'Projects', icon: TbVariable, href: '/envmanager', active: isProjectsActive },
    ...(hasCapability(user, 'menu:tokens') ? [{ label: 'Tokens', icon: TbKey, href: '/envmanager/tokens', active: isTokens }] : []),
    ...(hasCapability(user, 'menu:gists') ? [{ label: 'Gists', icon: TbBrandGithub, href: '/envmanager/gists', active: isGists }] : []),
    { label: 'Profil', icon: TbUser, href: '/profile', active: false },
  ]

  return (
    <AppShell
      header={{ height: 56, collapsed: !isMobile }}
      navbar={{ width: collapsed ? 60 : 260, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding={{ base: 'sm', sm: 'md' }}
    >
      {/* ─── Mobile header ──────────────── */}
      <AppShell.Header
        px="sm"
        hiddenFrom="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group h="100%" justify="space-between">
          <Group gap="xs">
            <Burger opened={mobileOpened} onClick={toggleMobile} size="sm" />
            <Group gap={6}>
              <Box style={{ position: 'relative' }}>
                <ThemeIcon size={28} variant="gradient" radius="md">
                  <TbVariable size={14} />
                </ThemeIcon>
                <Box
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    right: -1,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--mantine-color-teal-5)',
                    border: '1.5px solid var(--mantine-color-body)',
                  }}
                />
              </Box>
              <Text fw={800} size="sm">
                Env Manager
              </Text>
            </Group>
          </Group>
          <Group gap={6}>
            <ThemeToggle size="sm" />
            <Menu position="bottom-end" withArrow shadow="md" width={200}>
              <Menu.Target>
                <Box style={{ position: 'relative', cursor: 'pointer' }}>
                  <UserAvatar
                    user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }}
                    size="sm"
                    color="primary"
                    variant="gradient"
                  />
                  <Box
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      right: -1,
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: 'var(--mantine-color-teal-5)',
                      border: '1.5px solid var(--mantine-color-body)',
                    }}
                  />
                </Box>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Text size="xs" fw={600}>
                    {user?.name}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {user?.email}
                  </Text>
                </Menu.Label>
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
          </Group>
        </Group>
      </AppShell.Header>

      {/* ─── Sidebar (desktop only) ─────── */}
      <AppShell.Navbar p={collapsed ? 'xs' : 'md'} style={{ overflow: 'hidden' }}>
        <EnvManagerSidebar
          collapsed={collapsed}
          toggleSidebar={toggleSidebar}
          closeMobile={closeMobile}
          user={user}
          mainNav={mainNav}
          otherNav={otherNav}
          extensionsNav={extensionsNav}
          confirmLogout={confirmLogout}
        />
      </AppShell.Navbar>

      <AppShell.Main style={{ paddingBottom: isMobile ? 'calc(64px + env(safe-area-inset-bottom))' : undefined }}>
        <Container size="lg" px={0}>
          <Outlet />
        </Container>
      </AppShell.Main>

      {/* ─── Mobile bottom tab bar ──────── */}
      {isMobile && (
        <MobileTabBar
          tabs={bottomTabs}
          navigate={(opts) => {
            navigate({ to: opts.to })
          }}
          onClose={closeMobile}
        />
      )}
    </AppShell>
  )
}
