import { AppShell, Box, Burger, Group, Menu, Text, ThemeIcon } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { TbLogout, TbUser, TbVariable } from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import type { User } from '@/frontend/hooks/useAuth'

interface Props {
  user: User | null | undefined
  mobileOpened: boolean
  toggleMobile: () => void
  confirmLogout: () => void
}

export function MobileAppHeader({ user, mobileOpened, toggleMobile, confirmLogout }: Props) {
  const navigate = useNavigate()

  return (
    <AppShell.Header px="sm" hiddenFrom="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Group h="100%" justify="space-between">
        <Group gap="xs">
          <Burger opened={mobileOpened} onClick={toggleMobile} size="sm" />
          <Group gap={6}>
            <Box style={{ position: 'relative' }}>
              <ThemeIcon size={28} variant="gradient" radius="md">
                <TbVariable size={14} />
              </ThemeIcon>
              <Box
                style={{
                  position: 'absolute',
                  bottom: -1,
                  right: -1,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--mantine-color-teal-5)',
                  border: '1.5px solid var(--mantine-color-body)',
                }}
              />
            </Box>
            <Text fw={800} size="sm">
              Env Manager
            </Text>
          </Group>
        </Group>
        <Group gap={6}>
          <ThemeToggle size="sm" />
          <Menu position="bottom-end" withArrow shadow="md" width={200}>
            <Menu.Target>
              <Box style={{ position: 'relative', cursor: 'pointer' }}>
                <UserAvatar
                  user={{ id: user?.id ?? '', name: user?.name ?? '', image: user?.image }}
                  size="sm"
                  color="primary"
                  variant="gradient"
                />
                <Box
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    right: -1,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--mantine-color-teal-5)',
                    border: '1.5px solid var(--mantine-color-body)',
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
              <Menu.Item
                leftSection={<TbUser size={14} />}
                onClick={() => navigate({ to: '/profile', search: { tab: 'account' } })}
              >
                Profile
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item leftSection={<TbLogout size={14} />} color="red" onClick={confirmLogout}>
                Logout
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </AppShell.Header>
  )
}
