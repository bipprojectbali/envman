import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Container,
  Divider,
  Group,
  Menu,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import {
  TbBook,
  TbCode,
  TbBrandGithub,
  TbChevronUp,
  TbDatabase,
  TbHome,
  TbKey,
  TbLayoutDashboard,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbLogout,
  TbPlugConnected,
  TbUser,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
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

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  QC: 'QC',
  USER: 'User',
}

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
  const isProjectsActive = !isOverview && !isTokens && !isConnections && !isReadme && !isGists && !isDatabase && !isUsers

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

  // Bottom tab items untuk mobile — visible berdasarkan capability
  const bottomTabs = [
    ...(hasCapability(user, 'menu:overview')
      ? [{ label: 'Overview', icon: TbHome, href: '/envmanager/overview', active: isOverview }]
      : []),
    { label: 'Projects', icon: TbVariable, href: '/envmanager', active: isProjectsActive },
    ...(hasCapability(user, 'menu:tokens')
      ? [{ label: 'Tokens', icon: TbKey, href: '/envmanager/tokens', active: isTokens }]
      : []),
    ...(hasCapability(user, 'menu:gists')
      ? [{ label: 'Gists', icon: TbBrandGithub, href: '/envmanager/gists', active: isGists }]
      : []),
    { label: 'Profil', icon: TbUser, href: '/profile', active: false },
  ]

  return (
    <AppShell
      header={{ height: 56, collapsed: !isMobile }}
      navbar={{ width: collapsed ? 60 : 260, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding={{ base: 'sm', sm: 'md' }}
    >
      {/* ─── Mobile header ──────────────── */}
      <AppShell.Header px="sm" hiddenFrom="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
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
              <Text fw={800} size="sm">Env Manager</Text>
            </Group>
          </Group>
          <Group gap={6}>
            <ThemeToggle size="sm" />
            <Menu position="bottom-end" withArrow shadow="md" width={200}>
              <Menu.Target>
                <Box style={{ position: 'relative', cursor: 'pointer' }}>
                  <Avatar
                    color="primary"
                    radius="xl"
                    size="sm"
                    variant="gradient"
                   
                  >
                    {user?.name?.charAt(0).toUpperCase()}
                  </Avatar>
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
                  <Text size="xs" fw={600}>{user?.name}</Text>
                  <Text size="xs" c="dimmed" truncate>{user?.email}</Text>
                </Menu.Label>
                <Menu.Item leftSection={<TbUser size={14} />} onClick={() => navigate({ to: '/profile' })}>
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

        {/* Logo */}
        <AppShell.Section mb="sm">
          <Group gap="xs" justify={collapsed ? 'center' : 'space-between'} wrap="nowrap">
            {collapsed ? (
              <Tooltip label="Expand sidebar" position="right" withArrow>
                <ActionIcon
                  variant="gradient"
                 
                  size="lg"
                  onClick={toggleSidebar}
                  radius="md"
                >
                  <TbLayoutSidebarLeftExpand size={18} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <>
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                  <Box style={{ position: 'relative', flexShrink: 0 }}>
                    <ThemeIcon
                      size={38}
                      variant="gradient"
                     
                      radius="md"
                    >
                      <TbVariable size={20} />
                    </ThemeIcon>
                    {/* Online dot indicator */}
                    <Box
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--mantine-color-teal-5)',
                        border: '2px solid var(--mantine-color-body)',
                      }}
                    />
                  </Box>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={800} size="sm" lh={1.2} truncate>Env Manager</Text>
                    <Text size="xs" c="dimmed" lh={1.2} truncate>Collaboration workspace</Text>
                  </Box>
                </Group>
                <Tooltip label="Collapse sidebar" position="bottom" withArrow>
                  <ActionIcon variant="subtle" color="gray" size="sm" onClick={toggleSidebar} radius="md">
                    <TbLayoutSidebarLeftCollapse size={16} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}
          </Group>
        </AppShell.Section>

        {/* Main nav */}
        <AppShell.Section grow style={{ overflow: 'auto' }}>
          <Stack gap={2}>
            {!collapsed && (
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4} px={4} style={{ letterSpacing: '0.08em' }}>
                Workspace
              </Text>
            )}
            {mainNav.map(item =>
              collapsed ? (
                <Tooltip key={item.href} label={item.label} position="right" withArrow>
                  <UnstyledButton
                    onClick={() => { navigate({ to: item.href }); closeMobile() }}
                    style={{
                      width: '100%',
                      height: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 10,
                      background: item.active
                        ? 'linear-gradient(135deg, var(--mantine-color-violet-light), var(--mantine-color-grape-light))'
                        : undefined,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)' }}
                    onMouseLeave={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    <item.icon size={18} color={item.active ? 'var(--mantine-color-primary)' : 'var(--mantine-color-dimmed)'} />
                  </UnstyledButton>
                </Tooltip>
              ) : (
                <UnstyledButton
                  key={item.href}
                  onClick={() => { navigate({ to: item.href }); closeMobile() }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 10px',
                    minHeight: 46,
                    borderRadius: 10,
                    background: item.active
                      ? 'linear-gradient(135deg, var(--mantine-color-violet-light), var(--mantine-color-grape-light))'
                      : undefined,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)' }}
                  onMouseLeave={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = '' }}
                >
                  <ThemeIcon
                    size={34}
                    variant={item.active ? 'gradient' : 'subtle'}
                    color={item.active ? undefined : 'gray'}
                    radius="md"
                  >
                    <item.icon size={16} />
                  </ThemeIcon>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={item.active ? 700 : 500} c={item.active ? 'violet' : undefined} lh={1.2} truncate>
                      {item.label}
                    </Text>
                    <Text size="xs" c="dimmed" lh={1.2} mt={1} truncate>{item.description}</Text>
                  </Box>
                  {item.active && (
                    <Box
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: 'var(--mantine-color-primary)',
                      }}
                    />
                  )}
                </UnstyledButton>
              )
            )}

            {!collapsed ? (
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" mt="md" mb={4} px={4} style={{ letterSpacing: '0.08em' }}>
                Other
              </Text>
            ) : (
              <Divider my="xs" />
            )}

            {otherNav.map(item =>
              collapsed ? (
                <Tooltip key={item.href} label={item.label} position="right" withArrow>
                  <UnstyledButton
                    onClick={() => { navigate({ to: item.href }); closeMobile() }}
                    style={{
                      width: '100%',
                      height: 40,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      background: item.active ? 'var(--mantine-color-violet-light)' : undefined,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)' }}
                    onMouseLeave={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    <item.icon size={16} color={item.active ? 'var(--mantine-color-primary)' : 'var(--mantine-color-dimmed)'} />
                  </UnstyledButton>
                </Tooltip>
              ) : (
                <UnstyledButton
                  key={item.href}
                  onClick={() => { navigate({ to: item.href }); closeMobile() }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    minHeight: 38,
                    borderRadius: 8,
                    background: item.active ? 'var(--mantine-color-violet-light)' : undefined,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)' }}
                  onMouseLeave={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = '' }}
                >
                  <ThemeIcon size={26} variant={item.active ? 'light' : 'subtle'} color={item.active ? 'violet' : 'gray'} radius="md">
                    <item.icon size={13} />
                  </ThemeIcon>
                  <Text size="sm" fw={item.active ? 600 : 500} c={item.active ? 'violet' : 'dimmed'}>{item.label}</Text>
                </UnstyledButton>
              )
            )}

            {/* Extensions group — hanya muncul jika ada item aktif */}
            {extensionsNav.length > 0 && (
              <>
                {!collapsed ? (
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase" mt="md" mb={4} px={4} style={{ letterSpacing: '0.08em' }}>
                    Extensions
                  </Text>
                ) : (
                  <Divider my="xs" />
                )}
                {extensionsNav.map(item =>
                  collapsed ? (
                    <Tooltip key={item.href} label={item.label} position="right" withArrow>
                      <UnstyledButton
                        onClick={() => { navigate({ to: item.href }); closeMobile() }}
                        style={{
                          width: '100%', height: 40,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 8,
                          background: item.active ? 'var(--mantine-color-cyan-light)' : undefined,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)' }}
                        onMouseLeave={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = '' }}
                      >
                        <item.icon size={16} color={item.active ? 'var(--mantine-color-cyan-6)' : 'var(--mantine-color-dimmed)'} />
                      </UnstyledButton>
                    </Tooltip>
                  ) : (
                    <UnstyledButton
                      key={item.href}
                      onClick={() => { navigate({ to: item.href }); closeMobile() }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', minHeight: 38, borderRadius: 8,
                        background: item.active ? 'var(--mantine-color-cyan-light)' : undefined,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)' }}
                      onMouseLeave={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = '' }}
                    >
                      <ThemeIcon size={26} variant={item.active ? 'light' : 'subtle'} color={item.active ? 'cyan' : 'gray'} radius="md">
                        <item.icon size={13} />
                      </ThemeIcon>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={item.active ? 600 : 500} c={item.active ? 'cyan' : 'dimmed'} lh={1.2} truncate>{item.label}</Text>
                        <Text size="xs" c="dimmed" lh={1.2} mt={1} truncate>{item.description}</Text>
                      </Box>
                    </UnstyledButton>
                  )
                )}
              </>
            )}
          </Stack>
        </AppShell.Section>

        {/* User section */}
        <AppShell.Section>
          <Divider mb="sm" />
          {collapsed ? (
            <Stack align="center" gap="xs">
              <Menu position="right-end" withArrow shadow="md" width={220}>
                <Menu.Target>
                  <Box style={{ position: 'relative', cursor: 'pointer' }}>
                    <Avatar
                      color="primary" radius="xl" size="md"
                      variant="gradient"
                    >
                      {user?.name?.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--mantine-color-teal-5)',
                        border: '2px solid var(--mantine-color-body)',
                      }}
                    />
                  </Box>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>
                    <Text size="xs" fw={600}>{user?.name}</Text>
                    <Text size="xs" c="dimmed" truncate>{user?.email}</Text>
                  </Menu.Label>
                  <Menu.Item leftSection={<TbUser size={14} />} component="a" href="/profile">
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
            <Box>
              <Menu position="top" withArrow shadow="md" width="target">
                <Menu.Target>
                  <UnstyledButton
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: 'var(--mantine-color-default-hover)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-violet-light)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)'}
                  >
                    <Group gap="xs" wrap="nowrap">
                      <Box style={{ position: 'relative', flexShrink: 0 }}>
                        <Avatar
                          color="primary" radius="xl" size="md"
                          variant="gradient"
                        >
                          {user?.name?.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box
                          style={{
                            position: 'absolute',
                            bottom: -1,
                            right: -1,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: 'var(--mantine-color-teal-5)',
                            border: '2px solid var(--mantine-color-body)',
                          }}
                        />
                      </Box>
                      <Box style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <Text size="sm" fw={600} lh={1.2} truncate>
                          {user?.name}
                        </Text>
                        <Group gap={4} mt={2}>
                          <Badge size="xs" color="primary" variant="light">
                            {roleLabel[user?.role ?? ''] ?? user?.role}
                          </Badge>
                        </Group>
                      </Box>
                      <TbChevronUp size={14} style={{ flexShrink: 0, color: 'var(--mantine-color-dimmed)' }} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>
                    <Group gap={4} wrap="nowrap">
                      <Box
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--mantine-color-teal-5)',
                          flexShrink: 0,
                        }}
                      />
                      <Text size="xs" c="dimmed" truncate>{user?.email}</Text>
                    </Group>
                  </Menu.Label>
                  <Menu.Item leftSection={<TbUser size={14} />} component="a" href="/profile">
                    Profile
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item leftSection={<TbLogout size={14} />} color="red" onClick={confirmLogout}>
                    Logout
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <Group gap="xs" justify="space-between" mt="xs" px={4}>
                <Text size="xs" c="dimmed">Theme</Text>
                <ThemeToggle size="sm" />
              </Group>
            </Box>
          )}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main style={{ paddingBottom: isMobile ? 'calc(64px + env(safe-area-inset-bottom))' : undefined }}>
        <Container size="xl" px={0}>
          <Outlet />
        </Container>
      </AppShell.Main>

      {/* ─── Mobile bottom tab bar ──────── */}
      {isMobile && (
        <Box
          hiddenFrom="sm"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 200,
            background: 'var(--mantine-color-body)',
            borderTop: '1px solid var(--mantine-color-default-border)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            display: 'flex',
            boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
          }}
        >
          {bottomTabs.map(tab => (
            <UnstyledButton
              key={tab.href}
              onClick={() => { navigate({ to: tab.href }); closeMobile() }}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '8px 4px',
                minHeight: 58,
                color: tab.active ? 'var(--mantine-color-primary)' : 'var(--mantine-color-dimmed)',
                position: 'relative',
                transition: 'color 0.15s',
              }}
            >
              {/* Active indicator pill di atas */}
              {tab.active && (
                <Box
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 32,
                    height: 3,
                    borderRadius: '0 0 4px 4px',
                    background: 'linear-gradient(90deg, var(--mantine-color-primary), var(--mantine-color-grape-5))',
                  }}
                />
              )}
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: tab.active ? '4px 10px' : '4px',
                  borderRadius: 12,
                  background: tab.active
                    ? 'linear-gradient(135deg, var(--mantine-color-violet-light), var(--mantine-color-grape-light))'
                    : undefined,
                  transition: 'all 0.15s',
                }}
              >
                <tab.icon size={20} />
              </Box>
              <Text size="xs" fw={tab.active ? 700 : 500} lh={1} style={{ fontSize: 10 }}>
                {tab.label}
              </Text>
            </UnstyledButton>
          ))}
        </Box>
      )}
    </AppShell>
  )
}
