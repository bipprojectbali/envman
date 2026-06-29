import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Divider,
  Group,
  Menu,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { TbChevronUp, TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand, TbLogout, TbUser, TbVariable } from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { UserAvatar } from '@/frontend/components/UserAvatar'

export interface NavItem {
  label: string
  description?: string
  icon: React.ComponentType<{ size?: number; color?: string }>
  href: string
  active: boolean
}

interface Props {
  collapsed: boolean
  toggleSidebar: () => void
  closeMobile: () => void
  user: { id?: string; name?: string; email?: string; role?: string; image?: string | null } | null | undefined
  mainNav: NavItem[]
  otherNav: NavItem[]
  extensionsNav: NavItem[]
  confirmLogout: () => void
}

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  QC: 'QC',
  USER: 'User',
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
  const navigate = useNavigate()

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
          {mainNav.map((item) =>
            collapsed ? (
              <Tooltip key={item.href} label={item.label} position="right" withArrow>
                <UnstyledButton
                  onClick={() => {
                    navigate({ to: item.href })
                    closeMobile()
                  }}
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
                  onMouseEnter={(e) => {
                    if (!item.active)
                      (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!item.active) (e.currentTarget as HTMLElement).style.background = ''
                  }}
                >
                  <item.icon
                    size={18}
                    color={item.active ? 'var(--mantine-color-primary)' : 'var(--mantine-color-dimmed)'}
                  />
                </UnstyledButton>
              </Tooltip>
            ) : (
              <UnstyledButton
                key={item.href}
                onClick={() => {
                  navigate({ to: item.href })
                  closeMobile()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 10px',
                  minHeight: 46,
                  borderRadius: 10,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = ''
                }}
              >
                <ThemeIcon size={34} variant="subtle" color={item.active ? 'violet' : 'gray'} radius="md">
                  <item.icon size={16} />
                </ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    size="sm"
                    fw={item.active ? 700 : 500}
                    c={item.active ? 'violet' : undefined}
                    lh={1.2}
                    truncate
                  >
                    {item.label}
                  </Text>
                  <Text size="xs" c="dimmed" lh={1.2} mt={1} truncate>
                    {item.description}
                  </Text>
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
            ),
          )}

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

          {otherNav.map((item) =>
            collapsed ? (
              <Tooltip key={item.href} label={item.label} position="right" withArrow>
                <UnstyledButton
                  onClick={() => {
                    navigate({ to: item.href })
                    closeMobile()
                  }}
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
                  onMouseEnter={(e) => {
                    if (!item.active)
                      (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!item.active) (e.currentTarget as HTMLElement).style.background = ''
                  }}
                >
                  <item.icon
                    size={16}
                    color={item.active ? 'var(--mantine-color-primary)' : 'var(--mantine-color-dimmed)'}
                  />
                </UnstyledButton>
              </Tooltip>
            ) : (
              <UnstyledButton
                key={item.href}
                onClick={() => {
                  navigate({ to: item.href })
                  closeMobile()
                }}
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
                onMouseEnter={(e) => {
                  if (!item.active)
                    (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!item.active) (e.currentTarget as HTMLElement).style.background = ''
                }}
              >
                <ThemeIcon
                  size={26}
                  variant={item.active ? 'light' : 'subtle'}
                  color={item.active ? 'violet' : 'gray'}
                  radius="md"
                >
                  <item.icon size={13} />
                </ThemeIcon>
                <Text size="sm" fw={item.active ? 600 : 500} c={item.active ? 'violet' : 'dimmed'}>
                  {item.label}
                </Text>
              </UnstyledButton>
            ),
          )}

          {/* Extensions group */}
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
              {extensionsNav.map((item) =>
                collapsed ? (
                  <Tooltip key={item.href} label={item.label} position="right" withArrow>
                    <UnstyledButton
                      onClick={() => {
                        navigate({ to: item.href })
                        closeMobile()
                      }}
                      style={{
                        width: '100%',
                        height: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 8,
                        background: item.active ? 'var(--mantine-color-cyan-light)' : undefined,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!item.active)
                          (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)'
                      }}
                      onMouseLeave={(e) => {
                        if (!item.active) (e.currentTarget as HTMLElement).style.background = ''
                      }}
                    >
                      <item.icon
                        size={16}
                        color={item.active ? 'var(--mantine-color-cyan-6)' : 'var(--mantine-color-dimmed)'}
                      />
                    </UnstyledButton>
                  </Tooltip>
                ) : (
                  <UnstyledButton
                    key={item.href}
                    onClick={() => {
                      navigate({ to: item.href })
                      closeMobile()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      minHeight: 38,
                      borderRadius: 8,
                      background: item.active ? 'var(--mantine-color-cyan-light)' : undefined,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!item.active)
                        (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)'
                    }}
                    onMouseLeave={(e) => {
                      if (!item.active) (e.currentTarget as HTMLElement).style.background = ''
                    }}
                  >
                    <ThemeIcon
                      size={26}
                      variant={item.active ? 'light' : 'subtle'}
                      color={item.active ? 'cyan' : 'gray'}
                      radius="md"
                    >
                      <item.icon size={13} />
                    </ThemeIcon>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        size="sm"
                        fw={item.active ? 600 : 500}
                        c={item.active ? 'cyan' : 'dimmed'}
                        lh={1.2}
                        truncate
                      >
                        {item.label}
                      </Text>
                      <Text size="xs" c="dimmed" lh={1.2} mt={1} truncate>
                        {item.description}
                      </Text>
                    </Box>
                  </UnstyledButton>
                ),
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
                  <UserAvatar
                    user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }}
                    size="md"
                    color="primary"
                    variant="gradient"
                  />
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
                  <Text size="xs" fw={600}>
                    {user?.name}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {user?.email}
                  </Text>
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
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-violet-light)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)')
                  }
                >
                  <Group gap="xs" wrap="nowrap">
                    <Box style={{ position: 'relative', flexShrink: 0 }}>
                      <UserAvatar
                        user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }}
                        size="md"
                        color="primary"
                        variant="gradient"
                      />
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
                    <Text size="xs" c="dimmed" truncate>
                      {user?.email}
                    </Text>
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
              <Text size="xs" c="dimmed">
                Theme
              </Text>
              <ThemeToggle size="sm" />
            </Group>
          </Box>
        )}
      </AppShell.Section>
    </AppShell.Navbar>
  )
}
