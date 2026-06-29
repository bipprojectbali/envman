import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  TbBrandDocker,
  TbBrandGithub,
  TbCode,
  TbDownload,
  TbFiles,
  TbKey,
  TbLayoutDashboard,
  TbLogin,
  TbNote,
  TbRefresh,
  TbRobot,
  TbServer,
  TbShield,
  TbTerminal,
  TbTerminal2,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { InstallAndGuide } from '@/frontend/components/home/InstallAndGuide'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'

export const Route = createFileRoute('/')({
  component: HomePage,
})

const features = [
  {
    icon: TbShield,
    color: 'violet',
    title: 'Encrypted at Rest',
    description:
      'Secret vars dienkripsi dengan AES-256-GCM sebelum disimpan ke database. Plaintext tidak pernah menyentuh disk.',
  },
  {
    icon: TbCode,
    color: 'blue',
    title: 'Runtime Injection',
    description:
      'envman -e myapp:production -- bun start. Tidak ada perubahan di kode aplikasi, tidak ada library tambahan.',
  },
  {
    icon: TbTerminal2,
    color: 'indigo',
    title: 'Aliases & Scripts',
    description:
      'Simpan perintah panjang sebagai alias. envman run myapp:deploy — expand dan eksekusi. Script bisa langsung dari project Files tanpa menyentuh disk.',
  },
  {
    icon: TbFiles,
    color: 'blue',
    title: 'Project Files',
    description:
      'Simpan scripts, config, dan template per project. Eksekusi langsung: envman -- bash myapp:scripts/deploy.sh. Konten di-pipe via stdin, zero disk write.',
  },
  {
    icon: TbNote,
    color: 'grape',
    title: 'Notes & Docs',
    description: 'Dokumentasi runbook, deployment guide, atau apapun per project. Markdown support, tag, dan search.',
  },
  {
    icon: TbBrandGithub,
    color: 'dark',
    title: 'Gists',
    description:
      'Simpan dan bagikan snippet multi-file dengan syntax highlight. Private secara default, atau set public agar terlihat anggota lain. Tag dan search.',
  },
  {
    icon: TbUsers,
    color: 'teal',
    title: 'Role-Based Access',
    description:
      'Owner, Editor, Viewer per project. Viewer hanya melihat ***, Editor bisa reveal dan edit secara langsung.',
  },
  {
    icon: TbBrandDocker,
    color: 'cyan',
    title: 'Portainer Integration',
    description: 'Push semua vars ke Docker stack dalam satu klik. Sync otomatis menginject via env_file ke container.',
  },
  {
    icon: TbKey,
    color: 'orange',
    title: 'API Tokens',
    description: 'Token ter-scope per project:env atau global. Pilih read-only atau read-write, tambahkan expiry date.',
  },
  {
    icon: TbRefresh,
    color: 'teal',
    title: 'Auto-Update CLI',
    description:
      'Binary CLI auto-update di background setiap ada versi baru. Tidak perlu reinstall manual — envman update jika butuh update paksa.',
  },
  {
    icon: TbTerminal,
    color: 'indigo',
    title: 'Process Manager',
    description:
      'envman pm — supervisor process built-in, tanpa PM2. Start, stop, restart, logs, env sync, crash-loop quarantine. Daemon persisten di background.',
  },
  {
    icon: TbRobot,
    color: 'violet',
    title: 'MCP untuk AI Agent',
    description:
      'envman mcp — stdio MCP server untuk Claude Code. Agent bisa introspect vars, files, aliases, dan kontrol pm process tanpa shell exec.',
  },
  {
    icon: TbServer,
    color: 'pink',
    title: 'Self-Hosted',
    description: 'Data sepenuhnya ada di server kamu sendiri. Tidak ada pihak ketiga yang menyentuh secrets-mu.',
  },
]

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

      {/* ─── Hero ────────────────────────────────────────────────────── */}
      <Container size="md" py={{ base: 60, md: 100 }}>
        <Stack align="center" gap="xl">
          <Badge variant="dot" color="primary" size="lg" radius="sm">
            Self-Hosted · Open Source
          </Badge>

          <Title
            order={1}
            ta="center"
            fw={800}
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.1, letterSpacing: '-0.02em' }}
          >
            Environment variables,{' '}
            <Text component="span" variant="gradient" inherit>
              terkelola dengan baik.
            </Text>
          </Title>

          <Text size="lg" c="dimmed" ta="center" maw={540} lh={1.7}>
            Ganti .env files yang berserakan dengan satu sumber kebenaran yang terenkripsi. Inject ke runtime tanpa
            mengubah kode aplikasi.
          </Text>

          <Group gap="sm">
            <Button component={Link} to="/login" size="md" variant="gradient" leftSection={<TbLogin size={17} />}>
              Masuk ke Dashboard
            </Button>
            <Button component="a" href="#install" size="md" variant="default" leftSection={<TbDownload size={17} />}>
              Install CLI
            </Button>
          </Group>

          <Group gap="xl" mt="md">
            {[
              { label: 'AES-256-GCM', sub: 'enkripsi secret' },
              { label: 'Multi-env', sub: 'per project' },
              { label: versionData?.version ? `v${versionData.version}` : '—', sub: 'CLI terbaru' },
            ].map((stat) => (
              <Stack key={stat.label} align="center" gap={2}>
                <Text fw={700} size="md">
                  {stat.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {stat.sub}
                </Text>
              </Stack>
            ))}
          </Group>
        </Stack>
      </Container>

      <InstallAndGuide versionData={versionData} />

      {/* ─── Features ────────────────────────────────────────────────── */}
      <Container size="lg" py={{ base: 60, md: 80 }}>
        <Stack gap="xl">
          <Stack align="center" gap="xs">
            <Title order={2} ta="center" fw={700}>
              Semua yang kamu butuhkan
            </Title>
            <Text c="dimmed" ta="center" maw={480}>
              Dirancang untuk tim yang serius soal secrets management dan tidak mau kompromi soal keamanan.
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {features.map((f) => (
              <Box
                key={f.title}
                p="md"
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-md)',
                }}
              >
                <Group gap="sm" mb="xs">
                  <ThemeIcon size={36} variant="light" color={f.color} radius="md">
                    <f.icon size={18} />
                  </ThemeIcon>
                  <Text fw={600} size="sm">
                    {f.title}
                  </Text>
                </Group>
                <Text size="sm" c="dimmed" lh={1.65}>
                  {f.description}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>

      {/* ─── CTA ─────────────────────────────────────────────────────── */}
      <Container size="sm" py={{ base: 60, md: 80 }}>
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
              <TbVariable size={30} />
            </ThemeIcon>
            <Title order={2} fw={700}>
              Siap mulai?
            </Title>
            <Text c="dimmed" maw={360}>
              Login dan mulai kelola environment variables-mu dengan aman sekarang juga.
            </Text>
            <Group gap="sm" mt="xs">
              <Button component={Link} to="/login" size="md" variant="gradient" leftSection={<TbLogin size={17} />}>
                Masuk ke Dashboard
              </Button>
              <Button component="a" href="#install" size="md" variant="default" leftSection={<TbDownload size={17} />}>
                Install CLI
              </Button>
            </Group>
          </Stack>
        </Box>
      </Container>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <Box style={{ borderTop: '1px solid var(--mantine-color-default-border)' }} py="md">
        <Container size="lg">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <ThemeIcon size={22} variant="gradient" radius="sm">
                <TbVariable size={11} />
              </ThemeIcon>
              <Text size="xs" fw={600}>
                Env Manager
              </Text>
            </Group>
            <Group gap="md">
              <Button component={Link} to="/docs" size="compact-xs" variant="subtle" color="gray">
                Docs
              </Button>
              <Text size="xs" c="dimmed">
                Self-hosted. Data tetap milikmu.
              </Text>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  )
}
