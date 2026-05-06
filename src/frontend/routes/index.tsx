import {
  Badge,
  Box,
  Button,
  Card,
  Code,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  TbBrandDocker,
  TbCode,
  TbKey,
  TbLogin,
  TbServer,
  TbShield,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'

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
    description:
      'Push semua vars ke Docker stack dalam satu klik. Sync otomatis menginject via env_file ke container.',
  },
  {
    icon: TbKey,
    color: 'orange',
    title: 'API Tokens',
    description:
      'Token ter-scope per project:env atau global. Pilih read-only atau read-write, tambahkan expiry date.',
  },
  {
    icon: TbServer,
    color: 'pink',
    title: 'Self-Hosted',
    description:
      'Data sepenuhnya ada di server kamu sendiri. Tidak ada pihak ketiga yang menyentuh secrets-mu.',
  },
]

const steps = [
  {
    n: '1',
    title: 'Tambah project & vars',
    desc: 'Buat project, tambah environment (production, staging, dev), isi vars. Tandai yang sensitif sebagai secret.',
  },
  {
    n: '2',
    title: 'Generate API token',
    desc: 'Buat token untuk CLI, CI/CD, atau tim. Bisa di-scope ke project:env tertentu dengan hak akses terpisah.',
  },
  {
    n: '3',
    title: 'Inject ke runtime',
    desc: 'Jalankan envman -e project:env -- command. Vars ter-inject langsung tanpa menyentuh .env files.',
  },
]

const CLI_DEMO = `# Login sekali, simpan ke ~/.config/envman/config.json
envman login https://envman.example.com --token em_abc123

# Inject vars lalu jalankan command
envman -e myapp:production -- bun start

# Gabungkan beberapa env (later overrides earlier)
envman -e myapp:base -e myapp:production -- bun dev

# Mix server + local file (local wins)
envman -e myapp:production -e .env.local -- bun dev

# CI/CD — auth dari env vars, tanpa login
ENVMAN_SERVER=https://envman.example.com \\
ENVMAN_TOKEN=em_xxx \\
  envman -e myapp:production -- bun start`

function HomePage() {
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
              <ThemeIcon size={32} variant="gradient" gradient={{ from: 'violet', to: 'grape' }} radius="md">
                <TbVariable size={16} />
              </ThemeIcon>
              <Text fw={700} size="sm" lh={1}>Env Manager</Text>
            </Group>
            <Group gap="xs">
              <ThemeToggle />
              <Button
                component={Link}
                to="/login"
                size="sm"
                variant="gradient"
                gradient={{ from: 'violet', to: 'grape' }}
                leftSection={<TbLogin size={14} />}
              >
                Login
              </Button>
            </Group>
          </Group>
        </Container>
      </Box>

      {/* ─── Hero ────────────────────────────────────────────────────── */}
      <Container size="md" py={{ base: 60, md: 100 }}>
        <Stack align="center" gap="xl">
          <Badge variant="dot" color="violet" size="lg" radius="sm">
            Self-Hosted · Open Source
          </Badge>

          <Title
            order={1}
            ta="center"
            fw={800}
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.1, letterSpacing: '-0.02em' }}
          >
            Environment variables,{' '}
            <Text
              component="span"
              variant="gradient"
              gradient={{ from: 'violet', to: 'grape' }}
              inherit
            >
              terkelola dengan baik.
            </Text>
          </Title>

          <Text size="lg" c="dimmed" ta="center" maw={540} lh={1.7}>
            Ganti .env files yang berserakan dengan satu sumber kebenaran yang terenkripsi.
            Inject ke runtime tanpa mengubah kode aplikasi.
          </Text>

          <Group gap="sm">
            <Button
              component={Link}
              to="/login"
              size="md"
              variant="gradient"
              gradient={{ from: 'violet', to: 'grape' }}
              leftSection={<TbLogin size={17} />}
            >
              Masuk ke Dashboard
            </Button>
            <Button
              component="a"
              href="#cli"
              size="md"
              variant="default"
              leftSection={<TbCode size={17} />}
            >
              Lihat CLI
            </Button>
          </Group>

          {/* Mini stats */}
          <Group gap="xl" mt="md">
            {[
              { label: 'AES-256-GCM', sub: 'enkripsi secret' },
              { label: 'Multi-env', sub: 'per project' },
              { label: 'CLI binary', sub: 'tanpa npm' },
            ].map(stat => (
              <Stack key={stat.label} align="center" gap={2}>
                <Text fw={700} size="md">{stat.label}</Text>
                <Text size="xs" c="dimmed">{stat.sub}</Text>
              </Stack>
            ))}
          </Group>
        </Stack>
      </Container>

      {/* ─── CLI Demo ────────────────────────────────────────────────── */}
      <Box
        id="cli"
        style={{
          background: 'linear-gradient(180deg, var(--mantine-color-dark-7) 0%, var(--mantine-color-dark-8) 100%)',
          borderTop: '1px solid var(--mantine-color-dark-5)',
          borderBottom: '1px solid var(--mantine-color-dark-5)',
        }}
        py="xl"
      >
        <Container size="md">
          <Stack gap="md">
            <Group gap="xs">
              <ThemeIcon size={22} variant="light" color="violet" radius="sm">
                <TbCode size={12} />
              </ThemeIcon>
              <Text fw={600} size="sm" c="gray.3">CLI Usage</Text>
            </Group>
            <pre
              style={{
                fontSize: 13,
                lineHeight: 1.75,
                background: '#0d0d0d',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                padding: '16px 20px',
                margin: 0,
                overflowX: 'auto',
                color: '#c9d1d9',
                fontFamily: "'Courier New', Courier, monospace",
                whiteSpace: 'pre',
              }}
            >
              {CLI_DEMO}
            </pre>
            <Text size="xs" c="dimmed">
              Binary standalone — tidak perlu Node.js atau npm. Download untuk Linux, macOS, dan Windows.
            </Text>
          </Stack>
        </Container>
      </Box>

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
            {features.map(f => (
              <Card key={f.title} withBorder p="md" radius="md" style={{ transition: 'border-color 0.15s' }}>
                <Group gap="sm" mb="xs">
                  <ThemeIcon size={36} variant="light" color={f.color} radius="md">
                    <f.icon size={18} />
                  </ThemeIcon>
                  <Text fw={600} size="sm">{f.title}</Text>
                </Group>
                <Text size="sm" c="dimmed" lh={1.65}>{f.description}</Text>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>

      {/* ─── How it works ────────────────────────────────────────────── */}
      <Box
        style={{
          background: 'linear-gradient(135deg, var(--mantine-color-violet-light) 0%, var(--mantine-color-grape-light) 100%)',
          borderTop: '1px solid var(--mantine-color-violet-light-hover)',
          borderBottom: '1px solid var(--mantine-color-violet-light-hover)',
        }}
        py={{ base: 60, md: 80 }}
      >
        <Container size="md">
          <Stack gap="xl" align="center">
            <Stack align="center" gap="xs">
              <Title order={2} ta="center" fw={700}>Cara kerjanya</Title>
              <Text c="dimmed" ta="center">Mulai dalam 3 langkah.</Text>
            </Stack>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl" w="100%">
              {steps.map(step => (
                <Stack key={step.n} align="center" gap="sm">
                  <ThemeIcon
                    size={52}
                    variant="gradient"
                    gradient={{ from: 'violet', to: 'grape' }}
                    radius="xl"
                    style={{ boxShadow: '0 4px 20px rgba(121, 80, 242, 0.3)' }}
                  >
                    <Text fw={800} size="xl" c="white">{step.n}</Text>
                  </ThemeIcon>
                  <Text fw={600} ta="center" size="sm">{step.title}</Text>
                  <Text size="sm" c="dimmed" ta="center" lh={1.65}>{step.desc}</Text>
                </Stack>
              ))}
            </SimpleGrid>
          </Stack>
        </Container>
      </Box>

      {/* ─── CTA ─────────────────────────────────────────────────────── */}
      <Container size="sm" py={{ base: 60, md: 80 }}>
        <Card
          withBorder
          p={{ base: 'xl', md: 48 }}
          radius="xl"
          ta="center"
          style={{
            background: 'linear-gradient(135deg, var(--mantine-color-violet-light) 0%, var(--mantine-color-grape-light) 100%)',
            borderColor: 'var(--mantine-color-violet-light-hover)',
          }}
        >
          <Stack gap="md" align="center">
            <ThemeIcon
              size={60}
              variant="gradient"
              gradient={{ from: 'violet', to: 'grape' }}
              radius="xl"
              style={{ boxShadow: '0 8px 32px rgba(121, 80, 242, 0.35)' }}
            >
              <TbVariable size={30} />
            </ThemeIcon>
            <Title order={2} fw={700}>Siap mulai?</Title>
            <Text c="dimmed" maw={360}>
              Login dan mulai kelola environment variables-mu dengan aman sekarang juga.
            </Text>
            <Button
              component={Link}
              to="/login"
              size="md"
              variant="gradient"
              gradient={{ from: 'violet', to: 'grape' }}
              leftSection={<TbLogin size={17} />}
              mt="xs"
            >
              Masuk ke Dashboard
            </Button>
          </Stack>
        </Card>
      </Container>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <Box style={{ borderTop: '1px solid var(--mantine-color-default-border)' }} py="md">
        <Container size="lg">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs">
              <ThemeIcon size={22} variant="gradient" gradient={{ from: 'violet', to: 'grape' }} radius="sm">
                <TbVariable size={11} />
              </ThemeIcon>
              <Text size="xs" fw={600}>Env Manager</Text>
            </Group>
            <Text size="xs" c="dimmed">Self-hosted. Data tetap milikmu.</Text>
          </Group>
        </Container>
      </Box>
    </Box>
  )
}
