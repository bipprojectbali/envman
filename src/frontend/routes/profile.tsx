import { AppShell, Badge, Burger, Container, Divider, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { TbCode, TbLayoutDashboard, TbUser, TbVariable } from 'react-icons/tb'
import { ProfileDocsSection } from '@/frontend/components/profile/ProfileDocsSection'
import { ProfileProjectsSection } from '@/frontend/components/profile/ProfileProjectsSection'
import { ProfileSidebar } from '@/frontend/components/profile/ProfileSidebar'
import { ProfileTokensSection } from '@/frontend/components/profile/ProfileTokensSection'
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

const roleBadgeColor: Record<string, string> = { USER: 'blue', ADMIN: 'violet', SUPER_ADMIN: 'red' }

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
    { label: 'Env Manager', icon: TbVariable, href: '/envmanager' },
    ...(['ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '')
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

      <ProfileSidebar
        collapsed={collapsed}
        toggleSidebar={toggleSidebar}
        tab={tab}
        setTab={setTab}
        user={user}
        confirmLogout={confirmLogout}
        backLinks={backLinks}
      />

      <AppShell.Main>
        <Container size="xl">
          {tab === 'account' && <AccountPanel user={user} />}
          {tab === 'projects' && <ProfileProjectsSection role={user?.role ?? 'USER'} />}
          {tab === 'tokens' && <ProfileTokensSection role={user?.role ?? 'USER'} />}
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
      <Stack
        p="lg"
        gap="sm"
        align="center"
        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
      >
        <UserAvatar
          user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }}
          size={72}
          color="blue"
          variant="gradient"
          gradient={{ from: 'blue', to: 'violet' }}
        />
        <Stack gap={4} align="center">
          <Text fw={600} size="md">
            {user?.name}
          </Text>
          <Text c="dimmed" size="sm" style={{ wordBreak: 'break-all' }}>
            {user?.email}
          </Text>
        </Stack>
        <Badge color={roleBadgeColor[user?.role ?? 'USER']} variant="light" size="md">
          {user?.role}
        </Badge>
      </Stack>
      <Stack
        p="md"
        gap="sm"
        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
      >
        <Group gap="xs">
          <TbUser size={15} />
          <Text fw={600} size="sm">
            Account Info
          </Text>
        </Group>
        <Divider />
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
      </Stack>
    </Stack>
  )
}
