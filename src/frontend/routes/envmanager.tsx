import { AppShell, Container, Text } from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { EnvManagerSidebar } from '@/frontend/components/layout/EnvManagerSidebar'
import { MobileAppHeader } from '@/frontend/components/layout/MobileAppHeader'
import { MobileTabBar } from '@/frontend/components/layout/MobileTabBar'
import { useLogout } from '@/frontend/hooks/useAuth'
import { useEnvManagerNav } from '@/frontend/hooks/useEnvManagerNav'

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
  const { user, mainNav, otherNav, extensionsNav, bottomTabs } = useEnvManagerNav()
  const logout = useLogout()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 48em)')
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('envmanager:sidebar') === 'collapsed')

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

  return (
    <AppShell
      header={{ height: 56, collapsed: !isMobile }}
      navbar={{ width: collapsed ? 60 : 260, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding={{ base: 'sm', sm: 'md' }}
    >
      <MobileAppHeader user={user} mobileOpened={mobileOpened} toggleMobile={toggleMobile} confirmLogout={confirmLogout} />

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
