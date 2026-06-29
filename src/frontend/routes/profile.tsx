import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  Container,
  Divider,
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
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  TbBook,
  TbChevronRight,
  TbChevronUp,
  TbCode,
  TbFolders,
  TbKey,
  TbLayoutDashboard,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbLogout,
  TbUser,
  TbVariable,
} from 'react-icons/tb'
import { ProfileDocsSection } from '@/frontend/components/profile/ProfileDocsSection'
import { ProfileProjectsSection } from '@/frontend/components/profile/ProfileProjectsSection'
import { ProfileTokensSection } from '@/frontend/components/profile/ProfileTokensSection'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'

export const Route = createFileRoute('/profile')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ['account', 'projects', 'tokens', 'docs'].includes(search.tab as string) ? (search.tab as string) : 'account',
  }),
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
        staleTime: 0,
      })
      if (!data?.user) throw redirect({ to: '/login' })
      if (data.user.blocked) throw redirect({ to: '/blocked' })
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: ProfilePage,
})

const roleBadgeColor: Record<string, string> = { USER: 'blue', QC: 'orange', ADMIN: 'violet', SUPER_ADMIN: 'red' }

const navItems = [
  { key: 'account', label: 'Account', icon: TbUser, desc: 'Info akun & profil' },
  { key: 'projects', label: 'Projects', icon: TbFolders, desc: 'Project yang di-assign padamu' },
  { key: 'tokens', label: 'API Tokens', icon: TbKey, desc: 'Kelola token API personal' },
  { key: 'docs', label: 'Panduan', icon: TbBook, desc: 'Cara pakai CLI & token' },
]

function ProfilePage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('profile:sidebar') === 'collapsed')

  const setTab = (key: string) => {
    navigate({ to: '/profile', search: { tab: key } })
    closeMobile()
  }
  const toggleSidebar = () =>
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('profile:sidebar', next ? 'collapsed' : 'open')
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

  const backLinks = [
    ...(user?.role === 'SUPER_ADMIN' ? [{ label: 'Dev Console', icon: TbCode, href: '/dev' }] : []),
    ...(user?.role !== 'QC' ? [{ label: 'Env Manager', icon: TbVariable, href: '/envmanager' }] : []),
    ...(['QC', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '')
      ? [{ label: 'Dashboard', icon: TbLayoutDashboard, href: '/dashboard' }]
      : []),
  ]

  return (
    <AppShell
      header={{ height: 56, collapsed: !isMobile }}
      navbar={{ width: collapsed ? 60 : 240, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding="md"
    >
      <AppShell.Header px="md" hiddenFrom="sm">
        <Group h="100%" gap="xs">
          <Burger opened={mobileOpened} onClick={toggleMobile} size="sm" />
          <ThemeIcon size="md" variant="gradient" gradient={{ from: 'blue', to: 'violet' }}>
            <TbUser size={16} />
          </ThemeIcon>
          <Text fw={700} size="sm">
            Profile
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p={collapsed ? 'xs' : 'md'}>
        {/* Brand */}
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
                  <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'blue', to: 'violet' }}>
                    <TbUser size={18} />
                  </ThemeIcon>
                  <div>
                    <Text fw={700} size="sm">
                      Profile
                    </Text>
                    <Text size="xs" c="dimmed">
                      {user?.role ?? 'User'}
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

        {/* Nav */}
        <AppShell.Section grow component={ScrollArea}>
          {collapsed ? (
            navItems.map((item) => (
              <Tooltip key={item.key} label={item.label} position="right" withArrow>
                <Box ta="center" mb={4}>
                  <ThemeIcon
                    size="lg"
                    variant={tab === item.key ? 'light' : 'subtle'}
                    color={tab === item.key ? 'blue' : 'gray'}
                    style={{ cursor: 'pointer', width: '100%' }}
                    onClick={() => setTab(item.key)}
                  >
                    <item.icon size={18} />
                  </ThemeIcon>
                </Box>
              </Tooltip>
            ))
          ) : (
            <>
              {navItems.map((item) => (
                <NavLink
                  key={item.key}
                  label={item.label}
                  description={item.desc}
                  leftSection={<item.icon size={18} />}
                  rightSection={<TbChevronRight size={14} />}
                  active={tab === item.key}
                  onClick={() => setTab(item.key)}
                  variant="light"
                  mb={2}
                />
              ))}
              {backLinks.length > 0 && (
                <>
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
                    Navigasi
                  </Text>
                  {backLinks.map((l) => (
                    <NavLink
                      key={l.href}
                      label={l.label}
                      leftSection={<l.icon size={18} />}
                      rightSection={<TbChevronRight size={14} />}
                      component="a"
                      href={l.href}
                      variant="light"
                      mb={2}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </AppShell.Section>

        {/* User footer */}
        <AppShell.Section>
          <Box p={collapsed ? 'xs' : 'sm'} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            {collapsed ? (
              <Stack align="center" gap={4}>
                <Menu position="right-end" withArrow offset={12}>
                  <Menu.Target>
                    <Box style={{ cursor: 'pointer' }}>
                      <UserAvatar
                        user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }}
                        size="sm"
                        color="blue"
                      />
                    </Box>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>{user?.email}</Menu.Label>
                    <Menu.Divider />
                    <Menu.Item leftSection={<TbLogout size={14} />} color="red" onClick={confirmLogout}>
                      Logout
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                <ThemeToggle size="sm" />
              </Stack>
            ) : (
              <Stack gap={6}>
                <Menu position="top-start" withArrow offset={8} width={220}>
                  <Menu.Target>
                    <Group
                      gap="xs"
                      justify="space-between"
                      style={{ cursor: 'pointer', borderRadius: 'var(--mantine-radius-sm)', padding: '4px 6px' }}
                    >
                      <Group gap="xs" style={{ minWidth: 0, flex: 1 }}>
                        <UserAvatar
                          user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }}
                          size="sm"
                          color="blue"
                        />
                        <div style={{ minWidth: 0 }}>
                          <Text size="xs" fw={500} truncate>
                            {user?.name}
                          </Text>
                          <Badge size="xs" color={roleBadgeColor[user?.role ?? 'USER']} variant="light">
                            {user?.role}
                          </Badge>
                        </div>
                      </Group>
                      <TbChevronUp size={13} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
                    </Group>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>{user?.email}</Menu.Label>
                    <Menu.Divider />
                    <Menu.Item leftSection={<TbLogout size={14} />} color="red" onClick={confirmLogout}>
                      Logout
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                <Group gap="xs" px={6}>
                  <ThemeToggle size="sm" />
                  <Text size="xs" c="dimmed">
                    Theme
                  </Text>
                </Group>
              </Stack>
            )}
          </Box>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size={'xl'}>
          {tab === 'account' && <AccountPanel user={user} />}
          {tab === 'projects' && <ProfileProjectsSection role={user?.role ?? 'USER'} />}
          {tab === 'tokens' && user?.role !== 'QC' && <ProfileTokensSection role={user?.role ?? 'USER'} />}
          {tab === 'docs' && <ProfileDocsSection />}
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}

type SessionUser = NonNullable<NonNullable<ReturnType<typeof useSession>['data']>['user']>

function AccountPanel({ user }: { user: SessionUser | null | undefined }) {
  return (
    <Stack gap="md">
      <Box
        p="lg"
        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
      >
        <Stack align="center" gap="sm">
          <UserAvatar
            user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }}
            size={72}
            color="blue"
            variant="gradient"
            gradient={{ from: 'blue', to: 'violet' }}
          />
          <Box ta="center">
            <Text fw={600} size="md">
              {user?.name}
            </Text>
            <Text c="dimmed" size="sm" style={{ wordBreak: 'break-all' }}>
              {user?.email}
            </Text>
          </Box>
          <Badge color={roleBadgeColor[user?.role ?? 'USER']} variant="light" size="md">
            {user?.role}
          </Badge>
        </Stack>
      </Box>
      <Box
        p="md"
        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
      >
        <Group gap="xs" mb="sm">
          <TbUser size={15} />
          <Text fw={600} size="sm">
            Account Info
          </Text>
        </Group>
        <Divider mb="sm" />
        <Stack gap="xs">
          {[
            { label: 'Name', value: user?.name },
            { label: 'Email', value: user?.email },
            { label: 'Role', value: user?.role },
          ].map((row) => (
            <Group key={row.label} justify="space-between" wrap="nowrap">
              <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                {row.label}
              </Text>
              <Text size="sm" ta="right" style={{ wordBreak: 'break-all', minWidth: 0 }}>
                {row.value}
              </Text>
            </Group>
          ))}
        </Stack>
      </Box>
    </Stack>
  )
}
