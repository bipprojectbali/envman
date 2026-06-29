import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import {
  TbBook,
  TbChevronRight,
  TbChevronUp,
  TbFolders,
  TbKey,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbLogout,
  TbUser,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { UserAvatar } from '@/frontend/components/UserAvatar'

const roleBadgeColor: Record<string, string> = { USER: 'blue', QC: 'orange', ADMIN: 'violet', SUPER_ADMIN: 'red' }

export const profileNavItems = [
  { key: 'account', label: 'Account', icon: TbUser, desc: 'Info akun & profil' },
  { key: 'projects', label: 'Projects', icon: TbFolders, desc: 'Project yang di-assign padamu' },
  { key: 'tokens', label: 'API Tokens', icon: TbKey, desc: 'Kelola token API personal' },
  { key: 'docs', label: 'Panduan', icon: TbBook, desc: 'Cara pakai CLI & token' },
]

interface BackLink {
  label: string
  icon: React.ElementType
  href: string
}

interface ProfileSidebarProps {
  collapsed: boolean
  toggleSidebar: () => void
  tab: string
  setTab: (key: string) => void
  user: { id?: string; name?: string; email?: string; role?: string; image?: string | null } | null | undefined
  confirmLogout: () => void
  backLinks: BackLink[]
}

export function ProfileSidebar({ collapsed, toggleSidebar, tab, setTab, user, confirmLogout, backLinks }: ProfileSidebarProps) {
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
                <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'blue', to: 'violet' }}>
                  <TbUser size={18} />
                </ThemeIcon>
                <div>
                  <Text fw={700} size="sm">Profile</Text>
                  <Text size="xs" c="dimmed">{user?.role ?? 'User'}</Text>
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

      <AppShell.Section grow component={ScrollArea}>
        {collapsed ? (
          profileNavItems.map((item) => (
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
            {profileNavItems.map((item) => (
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
                <Text size="xs" c="dimmed" fw={600} tt="uppercase" mt="sm" mb={4} ml={4} style={{ letterSpacing: '0.05em' }}>
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

      <AppShell.Section>
        <Box p={collapsed ? 'xs' : 'sm'} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          {collapsed ? (
            <Stack align="center" gap={4}>
              <Menu position="right-end" withArrow offset={12}>
                <Menu.Target>
                  <Box style={{ cursor: 'pointer' }}>
                    <UserAvatar user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }} size="sm" color="blue" />
                  </Box>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{user?.email}</Menu.Label>
                  <Menu.Divider />
                  <Menu.Item leftSection={<TbLogout size={14} />} color="red" onClick={confirmLogout}>Logout</Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <ThemeToggle size="sm" />
            </Stack>
          ) : (
            <Stack gap={6}>
              <Menu position="top-start" withArrow offset={8} width={220}>
                <Menu.Target>
                  <Group gap="xs" justify="space-between" style={{ cursor: 'pointer', borderRadius: 'var(--mantine-radius-sm)', padding: '4px 6px' }}>
                    <Group gap="xs" style={{ minWidth: 0, flex: 1 }}>
                      <UserAvatar user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }} size="sm" color="blue" />
                      <div style={{ minWidth: 0 }}>
                        <Text size="xs" fw={500} truncate>{user?.name}</Text>
                        <Badge size="xs" color={roleBadgeColor[user?.role ?? 'USER']} variant="light">{user?.role}</Badge>
                      </div>
                    </Group>
                    <TbChevronUp size={13} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
                  </Group>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{user?.email}</Menu.Label>
                  <Menu.Divider />
                  <Menu.Item leftSection={<TbLogout size={14} />} color="red" onClick={confirmLogout}>Logout</Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <Group gap="xs" px={6}>
                <ThemeToggle size="sm" />
                <Text size="xs" c="dimmed">Theme</Text>
              </Group>
            </Stack>
          )}
        </Box>
      </AppShell.Section>
    </AppShell.Navbar>
  )
}
