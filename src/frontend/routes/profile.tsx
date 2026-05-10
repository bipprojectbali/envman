import { Avatar, Badge, Box, Button, Container, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { TbLogout, TbUser } from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'

export const Route = createFileRoute('/profile')({
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
        staleTime: 0,
      })
      if (!data?.user) throw redirect({ to: '/login' })
      if (data.user.blocked) throw redirect({ to: '/blocked' })
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: ProfilePage,
})

const roleBadgeColor: Record<string, string> = {
  USER: 'blue',
  ADMIN: 'violet',
  SUPER_ADMIN: 'red',
}

function ProfilePage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user

  return (
    <Container size="xs" py={{ base: 'md', sm: 'xl' }} px={{ base: 'sm', sm: 'md' }}>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" wrap="nowrap">
          <Title order={3}>Profile</Title>
          <Group gap="xs" wrap="nowrap">
            <ThemeToggle size="sm" />
            {user?.role === 'SUPER_ADMIN' && (
              <Button component={Link} to="/dev" variant="light" size="sm">
                Dev
              </Button>
            )}
            {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
              <Button component={Link} to="/dashboard" variant="light" size="sm">
                Dashboard
              </Button>
            )}
            <Button
              variant="light"
              color="red"
              size="sm"
              leftSection={<TbLogout size={15} />}
              onClick={() =>
                modals.openConfirmModal({
                  title: 'Logout',
                  children: <Text size="sm">Yakin ingin logout?</Text>,
                  labels: { confirm: 'Logout', cancel: 'Batal' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => logout.mutate(),
                })
              }
              loading={logout.isPending}
            >
              Logout
            </Button>
          </Group>
        </Group>

        {/* Avatar card */}
        <Paper withBorder p="lg" radius="md">
          <Stack align="center" gap="sm">
            <Avatar color="blue" radius="xl" size={72} variant="gradient" gradient={{ from: 'blue', to: 'violet' }}>
              {user?.name?.charAt(0).toUpperCase()}
            </Avatar>
            <Box ta="center">
              <Text fw={600} size="md">{user?.name}</Text>
              <Text c="dimmed" size="sm" style={{ wordBreak: 'break-all' }}>{user?.email}</Text>
            </Box>
            <Badge color={roleBadgeColor[user?.role ?? 'USER']} variant="light" size="md">
              {user?.role}
            </Badge>
          </Stack>
        </Paper>

        {/* Info */}
        <Paper withBorder p="md" radius="md">
          <Group gap="xs" mb="sm">
            <TbUser size={15} />
            <Text fw={600} size="sm">Account Info</Text>
          </Group>
          <Divider mb="sm" />
          <Stack gap="xs">
            {[
              { label: 'Name', value: user?.name },
              { label: 'Email', value: user?.email },
              { label: 'Role', value: user?.role },
            ].map(row => (
              <Group key={row.label} justify="space-between" wrap="nowrap">
                <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>{row.label}</Text>
                <Text size="sm" ta="right" style={{ wordBreak: 'break-all', minWidth: 0 }}>{row.value}</Text>
              </Group>
            ))}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
