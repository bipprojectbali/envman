import { ActionIcon, AppShell, Box, Divider, Group, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand, TbVariable } from 'react-icons/tb'
import { NavItemButton } from './NavItemButton'
import { SidebarUserMenu } from './SidebarUserMenu'

export type { NavItem } from './NavItemButton'

interface Props {
  collapsed: boolean
  toggleSidebar: () => void
  closeMobile: () => void
  user: { id?: string; name?: string; email?: string; role?: string; image?: string | null } | null | undefined
  mainNav: import('./NavItemButton').NavItem[]
  otherNav: import('./NavItemButton').NavItem[]
  extensionsNav: import('./NavItemButton').NavItem[]
  confirmLogout: () => void
}

export function EnvManagerSidebar({
  collapsed,
  toggleSidebar,
  closeMobile,
  user,
  mainNav,
  otherNav,
  extensionsNav,
  confirmLogout,
}: Props) {
  return (
    <AppShell.Navbar p={collapsed ? 'xs' : 'md'} style={{ overflow: 'hidden' }}>
      {/* Logo */}
      <AppShell.Section mb="sm">
        <Group gap="xs" justify={collapsed ? 'center' : 'space-between'} wrap="nowrap">
          {collapsed ? (
            <Tooltip label="Expand sidebar" position="right" withArrow>
              <ActionIcon variant="gradient" size="lg" onClick={toggleSidebar} radius="md">
                <TbLayoutSidebarLeftExpand size={18} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <>
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                <Box style={{ position: 'relative', flexShrink: 0 }}>
                  <ThemeIcon size={38} variant="light" color="violet" radius="md">
                    <TbVariable size={20} />
                  </ThemeIcon>
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
                  <Text fw={800} size="sm" lh={1.2} truncate>
                    Env Manager
                  </Text>
                  <Text size="xs" c="dimmed" lh={1.2} truncate>
                    Collaboration workspace
                  </Text>
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
          {mainNav.map((item) => (
            <NavItemButton
              key={item.href}
              item={item}
              collapsed={collapsed}
              variant="main"
              onNavigate={closeMobile}
            />
          ))}

          {!collapsed ? (
            <Text
              size="xs"
              c="dimmed"
              fw={700}
              tt="uppercase"
              mt="md"
              mb={4}
              px={4}
              style={{ letterSpacing: '0.08em' }}
            >
              Other
            </Text>
          ) : (
            <Divider my="xs" />
          )}
          {otherNav.map((item) => (
            <NavItemButton
              key={item.href}
              item={item}
              collapsed={collapsed}
              variant="other"
              onNavigate={closeMobile}
            />
          ))}

          {extensionsNav.length > 0 && (
            <>
              {!collapsed ? (
                <Text
                  size="xs"
                  c="dimmed"
                  fw={700}
                  tt="uppercase"
                  mt="md"
                  mb={4}
                  px={4}
                  style={{ letterSpacing: '0.08em' }}
                >
                  Extensions
                </Text>
              ) : (
                <Divider my="xs" />
              )}
              {extensionsNav.map((item) => (
                <NavItemButton
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  variant="extension"
                  onNavigate={closeMobile}
                />
              ))}
            </>
          )}
        </Stack>
      </AppShell.Section>

      {/* User section */}
      <AppShell.Section>
        <SidebarUserMenu collapsed={collapsed} user={user} confirmLogout={confirmLogout} />
      </AppShell.Section>
    </AppShell.Navbar>
  )
}
