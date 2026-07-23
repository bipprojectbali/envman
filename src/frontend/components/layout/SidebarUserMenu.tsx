import { Badge, Box, Divider, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core'
import { TbChevronUp, TbLogout, TbUser } from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { UserAvatar } from '@/frontend/components/UserAvatar'

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  USER: 'User',
}

interface SidebarUserMenuProps {
  collapsed: boolean
  user: { id?: string; name?: string; email?: string; role?: string; image?: string | null } | null | undefined
  confirmLogout: () => void
}

export function SidebarUserMenu({ collapsed, user, confirmLogout }: SidebarUserMenuProps) {
  return (
    <Box>
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
    </Box>
  )
}
