import { AppShell, Burger, Group, Text, ThemeIcon } from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { createLazyFileRoute, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { TbLayoutDashboard } from 'react-icons/tb'
import { DashboardSidebar } from '@/frontend/components/dashboard/DashboardSidebar'
import {
  AnalyticsPanel,
  OrdersPanel,
  OverviewPanel,
  PlaceholderPanel,
} from '@/frontend/components/dashboard/DashboardPanels'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { TicketsPanel } from '@/frontend/components/TicketsPanel'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'
import { TbCalendar, TbMessages, TbSettings } from 'react-icons/tb'

export const Route = createLazyFileRoute('/dashboard')({ component: DashboardPage })

function DashboardPage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user
  const { tab: active } = Route.useSearch()
  const matchRoute = useMatchRoute()
  const isChildRoute = !!matchRoute({ to: '/dashboard/docs' })
  const isQcOnly = user?.role === 'QC'
  const navigate = useNavigate()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 48em)')
  const setActive = (key: string) => { navigate({ to: '/dashboard', search: { tab: key } }); closeMobile() }
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dashboard:sidebar') === 'collapsed')
  const toggleSidebar = () =>
    setCollapsed((prev) => { const next = !prev; localStorage.setItem('dashboard:sidebar', next ? 'collapsed' : 'open'); return next })
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
      navbar={{ width: collapsed ? 60 : 260, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding="md"
    >
      <AppShell.Header px="md" hiddenFrom="sm">
        <Group h="100%" justify="space-between">
          <Group gap="xs">
            <Burger opened={mobileOpened} onClick={toggleMobile} size="sm" />
            <ThemeIcon size="md" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
              <TbLayoutDashboard size={16} />
            </ThemeIcon>
            <Text fw={700} size="sm">Dashboard</Text>
          </Group>
        </Group>
      </AppShell.Header>

      <DashboardSidebar
        collapsed={collapsed}
        toggleSidebar={toggleSidebar}
        active={active}
        setActive={setActive}
        user={user}
        isQcOnly={isQcOnly}
        logoutPending={logout.isPending}
        confirmLogout={confirmLogout}
        navigate={navigate}
      />

      <AppShell.Main>
        {!isChildRoute ? (
          <>
            {active === 'dashboard' && !isQcOnly && <OverviewPanel />}
            {active === 'tickets' && <TicketsPanel />}
            {active === 'analytics' && !isQcOnly && <AnalyticsPanel />}
            {active === 'orders' && !isQcOnly && <OrdersPanel />}
            {active === 'messages' && !isQcOnly && <PlaceholderPanel title="Messages" desc="Kelola pesan dan notifikasi." icon={TbMessages} />}
            {active === 'calendar' && !isQcOnly && <PlaceholderPanel title="Calendar" desc="Jadwal dan agenda kegiatan." icon={TbCalendar} />}
            {active === 'settings' && !isQcOnly && <PlaceholderPanel title="Settings" desc="Pengaturan akun dan aplikasi." icon={TbSettings} />}
          </>
        ) : (
          <Outlet />
        )}
      </AppShell.Main>
    </AppShell>
  )
}
