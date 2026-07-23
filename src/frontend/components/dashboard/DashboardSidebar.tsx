import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Group,
  NavLink,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import type { NavigateFn } from '@tanstack/react-router'
import {
  TbBook,
  TbCalendar,
  TbChevronRight,
  TbClipboardList,
  TbCode,
  TbLayoutDashboard,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbLogout,
  TbMessages,
  TbReportAnalytics,
  TbSettings,
  TbUser,
  TbVariable,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'

type NavItem = {
  label: string
  icon: typeof TbLayoutDashboard
  key: string
  badge?: number
  qcOnly?: boolean
  adminOnly?: boolean
}

export const dashboardNavItemsAll: NavItem[] = [
  { label: 'Dashboard', icon: TbLayoutDashboard, key: 'dashboard', adminOnly: true },
  { label: 'Analytics', icon: TbReportAnalytics, key: 'analytics', adminOnly: true },
  { label: 'Orders', icon: TbClipboardList, key: 'orders', adminOnly: true },
  { label: 'Messages', icon: TbMessages, key: 'messages', badge: 3, adminOnly: true },
  { label: 'Calendar', icon: TbCalendar, key: 'calendar', adminOnly: true },
  { label: 'Settings', icon: TbSettings, key: 'settings', adminOnly: true },
]

interface DashboardSidebarProps {
  collapsed: boolean
  toggleSidebar: () => void
  active: string
  setActive: (key: string) => void
  user: { name?: string; role?: string } | null | undefined
  logoutPending: boolean
  confirmLogout: () => void
  navigate: NavigateFn
}

export function DashboardSidebar({
  collapsed,
  toggleSidebar,
  active,
  setActive,
  user,
  logoutPending,
  confirmLogout,
  navigate,
}: DashboardSidebarProps) {
  const navItems = dashboardNavItemsAll

  return (
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
                <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
                  <TbLayoutDashboard size={18} />
                </ThemeIcon>
                <div>
                  <Text fw={700} size="sm">
                    Dashboard
                  </Text>
                  <Text size="xs" c="dimmed">
                    Admin Panel
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
                style={{ width: '100%', position: 'relative' }}
              >
                <item.icon size={18} />
                {item.badge && (
                  <Badge
                    size="xs"
                    color="red"
                    variant="filled"
                    style={{ position: 'absolute', top: -2, right: -2, padding: '0 4px', minWidth: 16, height: 16 }}
                  >
                    {item.badge}
                  </Badge>
                )}
              </ActionIcon>
            </Tooltip>
          ) : (
            <NavLink
              key={item.key}
              label={item.label}
              leftSection={<item.icon size={18} />}
              rightSection={
                item.badge ? (
                  <Badge size="xs" color="red" variant="filled">
                    {item.badge}
                  </Badge>
                ) : (
                  <TbChevronRight size={14} />
                )
              }
              active={active === item.key}
              onClick={() => setActive(item.key)}
              variant="light"
              mb={4}
            />
          ),
        )}

        {collapsed ? (
          <Tooltip label="Env Manager" position="right">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              component="a"
              href="/envmanager"
              mt={8}
              style={{ width: '100%' }}
            >
              <TbVariable size={18} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <>
            <Text size="xs" c="dimmed" fw={500} mt="md" mb={4} ml="sm">
              Tools
            </Text>
            <NavLink
              label="Env Manager"
              leftSection={<TbVariable size={18} />}
              rightSection={<TbChevronRight size={14} />}
              component="a"
              href="/envmanager"
              variant="light"
              mb={4}
            />
          </>
        )}

        {user?.role === 'SUPER_ADMIN' &&
          (collapsed ? (
            <Tooltip label="Dev Console" position="right">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                component="a"
                href="/dev"
                mt={8}
                style={{ width: '100%' }}
              >
                <TbCode size={18} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <NavLink
              label="Dev Console"
              leftSection={<TbCode size={18} />}
              rightSection={<TbChevronRight size={14} />}
              component="a"
              href="/dev"
              variant="light"
              mb={4}
            />
          ))}

        {collapsed ? (
          <Tooltip label="Docs" position="right">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={() => navigate({ to: '/dashboard/docs', search: { tab: 'dashboard' } })}
              mt={8}
              style={{ width: '100%' }}
            >
              <TbBook size={18} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <NavLink
            label="Docs"
            leftSection={<TbBook size={18} />}
            rightSection={<TbChevronRight size={14} />}
            onClick={() => navigate({ to: '/dashboard/docs', search: { tab: 'dashboard' } })}
            variant="light"
            mb={4}
          />
        )}
      </AppShell.Section>

      <AppShell.Section>
        <Box p={collapsed ? 'xs' : 'sm'} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          {collapsed ? (
            <Stack align="center" gap={4}>
              <Tooltip label={user?.name} position="right">
                <Avatar color={user?.role === 'SUPER_ADMIN' ? 'red' : 'violet'} radius="xl" size="sm">
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
                <ActionIcon variant="subtle" color="red" size="sm" onClick={confirmLogout} loading={logoutPending}>
                  <TbLogout size={14} />
                </ActionIcon>
              </Tooltip>
            </Stack>
          ) : (
            <Group justify="space-between">
              <Group gap="xs">
                <Avatar color={user?.role === 'SUPER_ADMIN' ? 'red' : 'violet'} radius="xl" size="sm">
                  {user?.name?.charAt(0).toUpperCase()}
                </Avatar>
                <div>
                  <Text size="xs" fw={500}>
                    {user?.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : user?.role === 'ADMIN' ? 'Admin' : 'User'}
                  </Text>
                </div>
              </Group>
              <Group gap={4}>
                <ThemeToggle size="sm" />
                <Tooltip label="Profile">
                  <ActionIcon variant="subtle" color="gray" component="a" href="/profile">
                    <TbUser size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Logout">
                  <ActionIcon variant="subtle" color="red" onClick={confirmLogout} loading={logoutPending}>
                    <TbLogout size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          )}
        </Box>
      </AppShell.Section>
    </AppShell.Navbar>
  )
}
