import { ActionIcon, Box, Button, Container, Group, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { TbBrandGithub, TbLayoutDashboard, TbLogin } from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'

interface Props {
  title?: string
}

export function GistPublicNavbar({ title = 'Public Gists' }: Props) {
  const { data: session } = useSession()
  const navigate = useNavigate()

  const handleNav = () => {
    if (session?.user) navigate({ to: getDefaultRoute(session.user.role) })
    else navigate({ to: '/login' })
  }

  return (
    <Box
      style={{
        borderBottom: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-body)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Container size="lg" py="xs">
        <Group justify="space-between">
          <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => navigate({ to: '/gists' })}>
            <ThemeIcon size={28} variant="gradient" radius="md">
              <TbBrandGithub size={14} />
            </ThemeIcon>
            <Text fw={800} size="sm">
              {title}
            </Text>
          </Group>
          <Group gap="xs">
            <ThemeToggle size="sm" />
            {session?.user ? (
              <Tooltip label="Go to dashboard">
                <ActionIcon variant="subtle" color="gray" onClick={handleNav}>
                  <TbLayoutDashboard size={16} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <Button size="xs" variant="subtle" leftSection={<TbLogin size={13} />} onClick={handleNav}>
                Login
              </Button>
            )}
          </Group>
        </Group>
      </Container>
    </Box>
  )
}
