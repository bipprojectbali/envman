import { Box, Button, Container, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { TbDownload, TbLayoutDashboard, TbLogin, TbVariable } from 'react-icons/tb'
import { HomeFeaturesSection } from '@/frontend/components/home/HomeFeaturesSection'
import { HomeHeroSection } from '@/frontend/components/home/HomeHeroSection'
import { InstallAndGuide } from '@/frontend/components/home/InstallAndGuide'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  const { data: sessionData } = useSession()
  const { data: versionData } = useQuery({
    queryKey: ['cli-version'],
    queryFn: () => fetch('/download/cli/version').then((r) => r.json()) as Promise<{ version: string }>,
    staleTime: 5 * 60_000,
  })
  const user = sessionData?.user

  return (
    <Box>
      {/* ─── Navbar ─────────────────────────────────────────────────── */}
      <Box
        component="header"
        style={{
          position: 'sticky', top: 0, zIndex: 100,
          borderBottom: '1px solid var(--mantine-color-default-border)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          backgroundColor: 'color-mix(in srgb, var(--mantine-color-body) 80%, transparent)',
        }}
      >
        <Container size="lg">
          <Group h={56} justify="space-between">
            <Group gap="xs">
              <ThemeIcon size={32} variant="gradient" radius="md"><TbVariable size={16} /></ThemeIcon>
              <Text fw={700} size="sm" lh={1}>Env Manager</Text>
            </Group>
            <Group gap="xs">
              <ThemeToggle />
              <Button component={Link} to="/docs" size="sm" variant="subtle" color="gray">Docs</Button>
              {user ? (
                <Button component={Link} to={getDefaultRoute(user.role)} size="sm" variant="gradient" leftSection={<TbLayoutDashboard size={14} />}>
                  Dashboard
                </Button>
              ) : (
                <Button component={Link} to="/login" size="sm" variant="gradient" leftSection={<TbLogin size={14} />}>
                  Login
                </Button>
              )}
            </Group>
          </Group>
        </Container>
      </Box>

      <HomeHeroSection user={user} versionData={versionData} defaultRoute={user ? getDefaultRoute(user.role) : '/login'} />
      <InstallAndGuide versionData={versionData} />
      <HomeFeaturesSection />

      {/* ─── CTA ─────────────────────────────────────────────────────── */}
      <Container size="sm" py={{ base: 60, md: 80 }}>
        <Box p={{ base: 'xl', md: 48 }} ta="center" style={{ background: 'linear-gradient(135deg, var(--mantine-color-violet-light) 0%, var(--mantine-color-grape-light) 100%)', border: '1px solid var(--mantine-color-violet-light-hover)', borderRadius: 'var(--mantine-radius-xl)' }}>
          <Stack gap="md" align="center">
            <ThemeIcon size={60} variant="gradient" radius="xl" style={{ boxShadow: '0 8px 32px rgba(121, 80, 242, 0.35)' }}>
              <TbVariable size={30} />
            </ThemeIcon>
            <Text fw={700} size="xl">Siap mulai?</Text>
            <Text c="dimmed" maw={360}>Login dan mulai kelola environment variables-mu dengan aman sekarang juga.</Text>
            <Group gap="sm" mt="xs">
              <Button component={Link} to="/login" size="md" variant="gradient" leftSection={<TbLogin size={17} />}>Masuk ke Dashboard</Button>
              <Button component="a" href="#install" size="md" variant="default" leftSection={<TbDownload size={17} />}>Install CLI</Button>
            </Group>
          </Stack>
        </Box>
      </Container>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <Box style={{ borderTop: '1px solid var(--mantine-color-default-border)' }} py="md">
        <Container size="lg">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <ThemeIcon size={22} variant="gradient" radius="sm"><TbVariable size={11} /></ThemeIcon>
              <Text size="xs" fw={600}>Env Manager</Text>
            </Group>
            <Group gap="md">
              <Button component={Link} to="/docs" size="compact-xs" variant="subtle" color="gray">Docs</Button>
              <Text size="xs" c="dimmed">Self-hosted. Data tetap milikmu.</Text>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  )
}
