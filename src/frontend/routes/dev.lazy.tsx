import { AppShell, Burger, Group, Text, ThemeIcon } from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { createLazyFileRoute, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { TbCode } from 'react-icons/tb'
import { AppLogsPanel } from '@/frontend/components/dev/app-logs-panel'
import { DatabasePanel } from '@/frontend/components/dev/dev-database'
import { ProjectPanel } from '@/frontend/components/dev/dev-project'
import { DevSidebar } from '@/frontend/components/dev/DevSidebar'
import { ExtensionsPanel } from '@/frontend/components/dev/extensions-panel'
import { FileHealthPanel } from '@/frontend/components/dev/FileHealthPanel'
import { OverviewPanel } from '@/frontend/components/dev/overview-panel'
import { SettingsPanel } from '@/frontend/components/dev/SettingsPanel'
import { StorageAdminPanel } from '@/frontend/components/dev/StorageAdminPanel'
import { TokensAdminPanel } from '@/frontend/components/dev/TokensAdminPanel'
import { UserLogsPanel } from '@/frontend/components/dev/user-logs-panel'
import { UsersPanel } from '@/frontend/components/dev/users-panel'
import { TicketsPanel } from '@/frontend/components/TicketsPanel'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'

export const Route = createLazyFileRoute('/dev')({ component: DevPage })

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
  const setActive = (key: string) => { navigate({ to: '/dev', search: { tab: key } }); closeMobile() }
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
      navbar={{ width: collapsed ? 60 : 260, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding="md"
    >
      <AppShell.Header px="md" hiddenFrom="sm">
        <Group h="100%" justify="space-between">
          <Group gap="xs">
            <Burger opened={mobileOpened} onClick={toggleMobile} size="sm" />
            <ThemeIcon size="md" variant="gradient" gradient={{ from: 'red', to: 'orange' }}>
              <TbCode size={16} />
            </ThemeIcon>
            <Text fw={700} size="sm">Dev Console</Text>
          </Group>
        </Group>
      </AppShell.Header>

      <DevSidebar
        collapsed={collapsed}
        toggleSidebar={toggleSidebar}
        active={active}
        setActive={setActive}
        user={user}
        confirmLogout={confirmLogout}
        navigate={navigate}
      />

      <AppShell.Main>
        {!isChildRoute ? (
          <>
            {active === 'overview' && <OverviewPanel />}
            {active === 'users' && <UsersPanel />}
            {active === 'tokens-admin' && <TokensAdminPanel />}
            {active === 'tickets' && <TicketsPanel />}
            {active === 'app-logs' && <AppLogsPanel />}
            {active === 'user-logs' && <UserLogsPanel />}
            {active === 'database' && <DatabasePanel />}
            {active === 'project' && <ProjectPanel />}
            {active === 'file-health' && <FileHealthPanel />}
            {active === 'extensions' && <ExtensionsPanel />}
            {active === 'settings' && <SettingsPanel />}
            {active === 'storage' && <StorageAdminPanel />}
          </>
        ) : (
          <Outlet />
        )}
      </AppShell.Main>
    </AppShell>
  )
}
