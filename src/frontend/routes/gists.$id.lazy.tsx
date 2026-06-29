import { ActionIcon, Box, Button, Container, Group, Skeleton, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { TbArrowLeft, TbBrandGithub, TbLayoutDashboard, TbLogin } from 'react-icons/tb'
import { GistDetailContent, type PublicGist } from '@/frontend/components/gists/GistDetailContent'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'

export const Route = createLazyFileRoute('/gists/$id')({ component: PublicGistDetailPage })

function PublicGistDetailPage() {
  const { id } = useParams({ from: '/gists/$id' })
  const { data: session } = useSession()
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery<{ gist: PublicGist }>({
    queryKey: ['public', 'gist', id],
    queryFn: () =>
      fetch(`/api/public/gists/${id}`).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`)
        return r.json()
      }),
  })

  const handleNav = () => {
    if (session?.user) {
      navigate({ to: getDefaultRoute(session.user.role) })
    } else {
      navigate({ to: '/login' })
    }
  }

  return (
    <Box style={{ minHeight: '100vh', background: 'var(--mantine-color-body)' }}>
      {/* Navbar */}
      <Box style={{ borderBottom: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-body)', position: 'sticky', top: 0, zIndex: 100 }}>
        <Container size="lg" py="xs">
          <Group justify="space-between">
            <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => navigate({ to: '/gists' })}>
              <ThemeIcon size={28} variant="gradient" radius="md"><TbBrandGithub size={14} /></ThemeIcon>
              <Text fw={800} size="sm">Public Gists</Text>
            </Group>
            <Group gap="xs">
              <ThemeToggle size="sm" />
              {session?.user ? (
                <Tooltip label="Go to dashboard">
                  <ActionIcon variant="subtle" color="gray" onClick={handleNav}><TbLayoutDashboard size={16} /></ActionIcon>
                </Tooltip>
              ) : (
                <Button size="xs" variant="subtle" leftSection={<TbLogin size={13} />} onClick={handleNav}>Login</Button>
              )}
            </Group>
          </Group>
        </Container>
      </Box>

      <Container size="lg" py="xl">
        <Group gap="xs" mb="md">
          <Button size="xs" variant="subtle" color="gray" leftSection={<TbArrowLeft size={13} />} onClick={() => navigate({ to: '/gists' })}>
            Public Gists
          </Button>
        </Group>

        {isLoading ? (
          <Stack gap="md">
            <Skeleton height={32} width="40%" radius="md" />
            <Skeleton height={20} width="60%" radius="md" />
            <Skeleton height={300} radius="md" />
          </Stack>
        ) : isError || !data ? (
          <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
            <Text size="sm" fw={500} c="red">Gist tidak ditemukan atau bersifat private.</Text>
            <Button size="xs" variant="subtle" mt="sm" onClick={() => navigate({ to: '/gists' })}>Kembali</Button>
          </Box>
        ) : (
          <GistDetailContent gist={data.gist} />
        )}
      </Container>
    </Box>
  )
}
