import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Divider,
  Group,
  NavLink,
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
  TbHome,
  TbKey,
  TbLayoutDashboard,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbLogout,
  TbPlugConnected,
  TbUser,
  TbVariable,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'

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
      if (data.user.role === 'USER') throw redirect({ to: '/profile' })
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
  const isProjectsActive = !isOverview && !isTokens && !isConnections && !isReadme

  const mainNav = [
    { label: 'Overview', description: 'Ringkasan semua resources', icon: TbHome, href: '/envmanager/overview', active: isOverview },
    { label: 'Projects', description: 'Kelola environment vars', icon: TbVariable, href: '/envmanager', active: isProjectsActive },
    { label: 'Tokens', description: 'API token untuk CLI', icon: TbKey, href: '/envmanager/tokens', active: isTokens },
    { label: 'Connections', description: 'Portainer instances', icon: TbPlugConnected, href: '/envmanager/connections', active: isConnections },
  ]

  const otherNav = [
    { label: 'Dashboard', icon: TbLayoutDashboard, href: '/dashboard', active: false },
    ...(user?.role === 'SUPER_ADMIN' ? [{ label: 'Dev Console', icon: TbCode, href: '/dev', active: false }] : []),
    { label: 'Docs', icon: TbBook, href: '/envmanager/docs', active: isReadme },
  ]

  return (
    <AppShell
      header={{ height: 56, collapsed: !isMobile }}
      navbar={{ width: collapsed ? 60 : 260, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding="md"
    >
      {/* ─── Mobile header ──────────────── */}
      <AppShell.Header px="md" hiddenFrom="sm">
        <Group h="100%" justify="space-between">
          <Group gap="xs">
            <Burger opened={mobileOpened} onClick={toggleMobile} size="sm" />
            <ThemeIcon size="md" variant="gradient" gradient={{ from: 'violet', to: 'grape' }}>
              <TbVariable size={16} />
            </ThemeIcon>
            <Text fw={700} size="sm">Env Manager</Text>
          </Group>
          <Group gap="xs">
            <ThemeToggle size="sm" />
            <Avatar color="violet" radius="xl" size="sm">
              {user?.name?.charAt(0).toUpperCase()}
            </Avatar>
          </Group>
        </Group>
      </AppShell.Header>

      {/* ─── Sidebar ───────────────────── */}
      <AppShell.Navbar p={collapsed ? 'xs' : 'md'}>

        {/* Logo section */}
        <AppShell.Section mb="xs">
          <Group gap="xs" justify={collapsed ? 'center' : 'space-between'}>
            {collapsed ? (
              <Tooltip label="Expand sidebar" position="right">
                <ActionIcon variant="subtle" color="gray" size="lg" onClick={toggleSidebar}>
                  <TbLayoutSidebarLeftExpand size={18} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <>
                <Group gap="xs">
                  <ThemeIcon size={36} variant="gradient" gradient={{ from: 'violet', to: 'grape' }} radius="md">
                    <TbVariable size={18} />
                  </ThemeIcon>
                  <Box>
                    <Text fw={700} size="sm" lh={1.2}>Env Manager</Text>
                    <Text size="xs" c="dimmed">Environment Variables</Text>
                  </Box>
                </Group>
                <Tooltip label="Collapse sidebar">
                  <ActionIcon variant="subtle" color="gray" size="sm" onClick={toggleSidebar}>
                    <TbLayoutSidebarLeftCollapse size={18} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}
          </Group>
        </AppShell.Section>

        <Divider mb="xs" />

        {/* Main nav */}
        <AppShell.Section grow>
          <Stack gap={2}>
            {mainNav.map(item =>
              collapsed ? (
                <Tooltip key={item.href} label={item.label} position="right">
                  <ActionIcon
                    variant={item.active ? 'light' : 'subtle'}
                    color={item.active ? 'violet' : 'gray'}
                    size="lg"
                    onClick={() => { navigate({ to: item.href }); closeMobile() }}
                    style={{ width: '100%' }}
                  >
                    <item.icon size={18} />
                  </ActionIcon>
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
                    borderRadius: 8,
                    background: item.active ? 'var(--mantine-color-violet-light)' : undefined,
                    borderLeft: item.active ? '3px solid var(--mantine-color-violet-5)' : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)' }}
                  onMouseLeave={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = '' }}
                >
                  <ThemeIcon size={30} variant={item.active ? 'light' : 'subtle'} color={item.active ? 'violet' : 'gray'} radius="md">
                    <item.icon size={15} />
                  </ThemeIcon>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={item.active ? 600 : 500} c={item.active ? 'violet' : undefined} lh={1.2}>
                      {item.label}
                    </Text>
                    <Text size="xs" c="dimmed" lh={1.2} mt={1}>{item.description}</Text>
                  </Box>
                </UnstyledButton>
              )
            )}

            <Divider my="xs" label={collapsed ? undefined : (
              <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: '0.06em' }}>Other</Text>
            )} />

            {otherNav.map(item =>
              collapsed ? (
                <Tooltip key={item.href} label={item.label} position="right">
                  <ActionIcon
                    variant={item.active ? 'light' : 'subtle'}
                    color={item.active ? 'violet' : 'gray'}
                    size="lg"
                    onClick={() => { navigate({ to: item.href }); closeMobile() }}
                    style={{ width: '100%' }}
                  >
                    <item.icon size={18} />
                  </ActionIcon>
                </Tooltip>
              ) : (
                <UnstyledButton
                  key={item.href}
                  onClick={() => { navigate({ to: item.href }); closeMobile() }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 10px',
                    borderRadius: 8,
                    background: item.active ? 'var(--mantine-color-violet-light)' : undefined,
                    borderLeft: item.active ? '3px solid var(--mantine-color-violet-5)' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)' }}
                  onMouseLeave={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = '' }}
                >
                  <ThemeIcon size={28} variant={item.active ? 'light' : 'subtle'} color={item.active ? 'violet' : 'gray'} radius="md">
                    <item.icon size={14} />
                  </ThemeIcon>
                  <Text size="sm" fw={500} c={item.active ? 'violet' : 'dimmed'}>{item.label}</Text>
                </UnstyledButton>
              )
            )}
          </Stack>
        </AppShell.Section>

        {/* User section */}
        <AppShell.Section>
          <Divider mb="sm" />
          {collapsed ? (
            <Stack align="center" gap="xs">
              <Tooltip label={`${user?.name} · ${roleLabel[user?.role ?? ''] ?? user?.role}`} position="right">
                <Avatar
                  color="violet"
                  radius="xl"
                  size="md"
                  variant="gradient"
                  gradient={{ from: 'violet', to: 'grape' }}
                  style={{ cursor: 'default' }}
                >
                  {user?.name?.charAt(0).toUpperCase()}
                </Avatar>
              </Tooltip>
              <ThemeToggle size="sm" />
              <Tooltip label="Profile" position="right">
                <ActionIcon variant="subtle" color="gray" size="sm" component="a" href="/profile">
                  <TbUser size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Logout" position="right">
                <ActionIcon variant="subtle" color="red" size="sm" onClick={confirmLogout} loading={logout.isPending}>
                  <TbLogout size={14} />
                </ActionIcon>
              </Tooltip>
            </Stack>
          ) : (
            <Box>
              <Group gap="xs" mb="xs" wrap="nowrap">
                <Avatar
                  color="violet"
                  radius="xl"
                  size="md"
                  variant="gradient"
                  gradient={{ from: 'violet', to: 'grape' }}
                >
                  {user?.name?.charAt(0).toUpperCase()}
                </Avatar>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.name}
                  </Text>
                  <Badge size="xs" variant="dot" color="violet">
                    {roleLabel[user?.role ?? ''] ?? user?.role}
                  </Badge>
                </Box>
              </Group>
              <Group gap="xs" justify="flex-end">
                <ThemeToggle size="sm" />
                <Tooltip label="Profile">
                  <ActionIcon variant="subtle" color="gray" size="sm" component="a" href="/profile">
                    <TbUser size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Logout">
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={confirmLogout} loading={logout.isPending}>
                    <TbLogout size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Box>
          )}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
