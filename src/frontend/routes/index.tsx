import { Box, Button, Container, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { TbLayoutDashboard, TbLogin, TbShieldLock, TbVariable } from 'react-icons/tb'
import { CliShowcaseSection } from '@/frontend/components/home/CliShowcaseSection'
import { FaqSection } from '@/frontend/components/home/FaqSection'
import { HomeFeaturesSection } from '@/frontend/components/home/HomeFeaturesSection'
import { HomeHeroSection } from '@/frontend/components/home/HomeHeroSection'
import { HowItWorksSection } from '@/frontend/components/home/HowItWorksSection'
import { InstallAndGuide } from '@/frontend/components/home/InstallAndGuide'
import { IntegrationsStrip } from '@/frontend/components/home/IntegrationsStrip'
import { ProblemSection } from '@/frontend/components/home/ProblemSection'
import { SecuritySection } from '@/frontend/components/home/SecuritySection'
import { TrustStrip } from '@/frontend/components/home/TrustStrip'
import { UseCasesSection } from '@/frontend/components/home/UseCasesSection'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'

export const Route = createFileRoute('/')({ component: HomePage })

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#cli', label: 'CLI' },
  { href: '#security', label: 'Security' },
  { href: '#faq', label: 'FAQ' },
]

function HomePage() {
  const { data: sessionData } = useSession()
  const { data: versionData } = useQuery({
    queryKey: ['cli-version'],
    queryFn: () => fetch('/download/cli/version').then((r) => r.json()) as Promise<{ version: string }>,
    staleTime: 5 * 60_000,
  })
  const user = sessionData?.user
  const loginRoute = user ? getDefaultRoute(user.role) : '/login'

  return (
    <Box>
      {/* ─── Navbar ─────────────────────────────────────────────────── */}
      <Box
        component="header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          borderBottom: '1px solid var(--mantine-color-default-border)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          backgroundColor: 'color-mix(in srgb, var(--mantine-color-body) 80%, transparent)',
        }}
      >
        <Container size="lg">
          <Group h={56} justify="space-between">
            <Group gap="xs">
              <ThemeIcon size={32} variant="gradient" radius="md">
                <TbVariable size={16} />
              </ThemeIcon>
              <Text fw={700} size="sm" lh={1}>
                Env Manager
              </Text>
            </Group>
            <Group gap="xs" visibleFrom="sm">
              {NAV_LINKS.map((l) => (
                <Button key={l.href} component="a" href={l.href} size="compact-sm" variant="subtle" color="gray">
                  {l.label}
                </Button>
              ))}
            </Group>
            <Group gap="xs">
              <ThemeToggle />
              <Button component={Link} to="/docs" size="sm" variant="subtle" color="gray">
                Docs
              </Button>
              {user ? (
                <Button
                  component={Link}
                  to={getDefaultRoute(user.role)}
                  size="sm"
                  variant="gradient"
                  leftSection={<TbLayoutDashboard size={14} />}
                >
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

      <HomeHeroSection versionData={versionData} loginRoute={loginRoute} />
      <TrustStrip />
      <ProblemSection />
      <HowItWorksSection />
      <HomeFeaturesSection />
      <CliShowcaseSection />
      <SecuritySection />
      <UseCasesSection />
      <IntegrationsStrip />
      <InstallAndGuide versionData={versionData} />
      <FaqSection />

      {/* ─── Final CTA ───────────────────────────────────────────────── */}
      <Container size="sm" py={{ base: 60, md: 90 }}>
        <Box
          p={{ base: 'xl', md: 48 }}
          ta="center"
          style={{
            background:
              'linear-gradient(135deg, var(--mantine-color-violet-light) 0%, var(--mantine-color-grape-light) 100%)',
            border: '1px solid var(--mantine-color-violet-light-hover)',
            borderRadius: 'var(--mantine-radius-xl)',
          }}
        >
          <Stack gap="md" align="center">
            <ThemeIcon
              size={60}
              variant="gradient"
              radius="xl"
              style={{ boxShadow: '0 8px 32px rgba(121, 80, 242, 0.35)' }}
            >
              <TbShieldLock size={30} />
            </ThemeIcon>
            <Text fw={800} size="xl">
              Own your secrets today
            </Text>
            <Text c="dimmed" maw={400}>
              Self-host envman dan kelola environment variables timmu dengan enkripsi penuh — data tetap di tanganmu.
            </Text>
            <Group gap="sm" mt="xs">
              <Button
                component={Link}
                to={loginRoute}
                size="md"
                variant="gradient"
                leftSection={<TbShieldLock size={17} />}
              >
                Start self-hosting
              </Button>
              <Button component="a" href="#install" size="md" variant="default">
                Install CLI
              </Button>
            </Group>
          </Stack>
        </Box>
      </Container>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <Box style={{ borderTop: '1px solid var(--mantine-color-default-border)' }} py="lg">
        <Container size="lg">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <ThemeIcon size={22} variant="gradient" radius="sm">
                <TbVariable size={11} />
              </ThemeIcon>
              <Text size="xs" fw={600}>
                Env Manager
              </Text>
              {versionData?.version && (
                <Text size="xs" c="dimmed">
                  v{versionData.version}
                </Text>
              )}
            </Group>
            <Group gap="md">
              <Button component={Link} to="/docs" size="compact-xs" variant="subtle" color="gray">
                Docs
              </Button>
              <Text size="xs" c="dimmed">
                Self-hosted · Open source · Data tetap milikmu
              </Text>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  )
}
