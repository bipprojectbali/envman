import {
  Badge,
  Box,
  Button,
  Card,
  Code,
  Container,
  CopyButton,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Timeline,
  Title,
  Tooltip,
} from '@mantine/core'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  TbBrandDocker,
  TbBrandWindows,
  TbCheck,
  TbCode,
  TbCopy,
  TbDownload,
  TbKey,
  TbLogin,
  TbPlayerPlay,
  TbServer,
  TbShield,
  TbTerminal,
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

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <Box>
      {label && <Text size="xs" c="dimmed" mb={4}>{label}</Text>}
      <Group gap={6} align="flex-start">
        <Box
          style={{
            flex: 1,
            background: '#0d0d0d',
            border: '1px solid #2a2a2a',
            borderRadius: 6,
            padding: '10px 14px',
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 12,
            lineHeight: 1.7,
            color: '#c9d1d9',
            overflowX: 'auto',
            whiteSpace: 'pre',
          }}
        >
          {code}
        </Box>
        <CopyButton value={code}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied!' : 'Copy'}>
              <Button
                size="compact-xs"
                variant="subtle"
                color={copied ? 'teal' : 'gray'}
                onClick={copy}
                mt={6}
                px={6}
              >
                {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
              </Button>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
    </Box>
  )
}

function HomePage() {
  const origin = window.location.origin

  const installCmds = {
    'linux-x64': `curl -sL ${origin}/download/cli/linux-x64 -o envman
chmod +x envman
sudo mv envman /usr/local/bin/
envman --version`,
    'linux-arm64': `curl -sL ${origin}/download/cli/linux-arm64 -o envman
chmod +x envman
sudo mv envman /usr/local/bin/
envman --version`,
    'darwin-arm64': `curl -sL ${origin}/download/cli/darwin-arm64 -o envman
chmod +x envman
sudo mv envman /usr/local/bin/
envman --version`,
    'darwin-x64': `curl -sL ${origin}/download/cli/darwin-x64 -o envman
chmod +x envman
sudo mv envman /usr/local/bin/
envman --version`,
    'windows-x64': `# PowerShell
Invoke-WebRequest -Uri "${origin}/download/cli/windows-x64" \`
  -OutFile "envman.exe"

# Atau dengan curl (Windows 10+)
curl -L ${origin}/download/cli/windows-x64 -o envman.exe`,
  }

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
                to="/docs"
                size="sm"
                variant="subtle"
                color="gray"
              >
                Docs
              </Button>
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
              href="#install"
              size="md"
              variant="default"
              leftSection={<TbDownload size={17} />}
            >
              Install CLI
            </Button>
          </Group>

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

      {/* ─── Install ─────────────────────────────────────────────────── */}
      <Box
        id="install"
        style={{ borderTop: '1px solid var(--mantine-color-default-border)', borderBottom: '1px solid var(--mantine-color-default-border)' }}
        py={{ base: 48, md: 64 }}
      >
        <Container size="md">
          <Stack gap="xl">
            <Stack align="center" gap="xs">
              <ThemeIcon size={44} variant="gradient" gradient={{ from: 'violet', to: 'grape' }} radius="md">
                <TbDownload size={22} />
              </ThemeIcon>
              <Title order={2} ta="center" fw={700}>Install CLI</Title>
              <Text c="dimmed" ta="center" maw={480}>
                Binary standalone — tidak perlu Node.js, npm, atau runtime apapun.
                Satu file, langsung jalan.
              </Text>
            </Stack>

            {/* One-liner */}
            <Stack gap="xs">
              <Text size="sm" fw={600}>Linux &amp; macOS — satu command, auto-detect platform:</Text>
              <CodeBlock code={`curl -fsSL ${origin}/install | bash`} />
              <Text size="xs" c="dimmed">
                Script otomatis deteksi OS dan arsitektur, download binary yang tepat, install ke <Code fz="xs">/usr/local/bin/envman</Code>.
                Butuh <Code fz="xs">sudo</Code>? Script akan memintanya otomatis jika diperlukan.
              </Text>
            </Stack>

            <Divider label="atau pilih platform manual" labelPosition="center" />

            <Tabs defaultValue="linux-x64" variant="pills" radius="md">
              <Tabs.List mb="md">
                <Tabs.Tab value="linux-x64" leftSection={<TbTerminal size={13} />}>Linux x64</Tabs.Tab>
                <Tabs.Tab value="linux-arm64" leftSection={<TbTerminal size={13} />}>Linux ARM64</Tabs.Tab>
                <Tabs.Tab value="darwin-arm64" leftSection={<TbTerminal size={13} />}>macOS Apple Silicon</Tabs.Tab>
                <Tabs.Tab value="darwin-x64" leftSection={<TbTerminal size={13} />}>macOS Intel</Tabs.Tab>
                <Tabs.Tab value="windows-x64" leftSection={<TbBrandWindows size={13} />}>Windows</Tabs.Tab>
              </Tabs.List>

              {(Object.entries(installCmds) as [string, string][]).map(([platform, cmd]) => (
                <Tabs.Panel key={platform} value={platform}>
                  <Stack gap="sm">
                    <CodeBlock code={cmd} />
                    <Group gap="xs">
                      <Button
                        component="a"
                        href={`${origin}/download/cli/${platform}`}
                        size="xs"
                        variant="light"
                        color="violet"
                        leftSection={<TbDownload size={13} />}
                        download
                      >
                        Download binary langsung
                      </Button>
                    </Group>
                  </Stack>
                </Tabs.Panel>
              ))}
            </Tabs>
          </Stack>
        </Container>
      </Box>

      {/* ─── Panduan Penggunaan ───────────────────────────────────────── */}
      <Container size="md" py={{ base: 48, md: 64 }} id="guide">
        <Stack gap="xl">
          <Stack align="center" gap="xs">
            <ThemeIcon size={44} variant="gradient" gradient={{ from: 'violet', to: 'grape' }} radius="md">
              <TbPlayerPlay size={22} />
            </ThemeIcon>
            <Title order={2} ta="center" fw={700}>Panduan Penggunaan</Title>
            <Text c="dimmed" ta="center" maw={480}>
              Dari install sampai inject ke production — semua ada di sini.
            </Text>
          </Stack>

          <Timeline active={-1} bulletSize={32} lineWidth={2} color="violet">
            {/* Step 1 */}
            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">1</Text>}
              title={<Text fw={700} size="sm">Login ke server</Text>}
            >
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Setelah install CLI, login sekali untuk menyimpan credentials ke config lokal.
                Token bisa dibuat di dashboard → Tokens.
              </Text>
              <Stack gap="xs">
                <CodeBlock
                  label="Login dan simpan config ke ~/.config/envman/config.json"
                  code={`envman login ${origin} --token <API_TOKEN>`}
                />
                <CodeBlock
                  label="Verifikasi login berhasil"
                  code={`envman whoami
# → Logged in as user@example.com (ADMIN) at ${origin}`}
                />
              </Stack>
            </Timeline.Item>

            {/* Step 2 */}
            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">2</Text>}
              title={<Text fw={700} size="sm">Inject vars ke command</Text>}
            >
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Gunakan flag <Code fz="xs">-e project:environment</Code> untuk fetch vars dari server,
                lalu jalankan command apapun. Vars hanya ada di memori process — tidak ditulis ke file.
              </Text>
              <Stack gap="xs">
                <CodeBlock
                  label="Inject ke satu environment"
                  code={`envman -e myapp:production -- bun start`}
                />
                <CodeBlock
                  label="Gabungkan beberapa env (later overrides earlier)"
                  code={`envman -e myapp:base -e myapp:production -- bun dev`}
                />
                <CodeBlock
                  label="Mix server + local file (.env.local override production)"
                  code={`envman -e myapp:production -e .env.local -- bun dev`}
                />
                <CodeBlock
                  label="Server vars kalah dari system env (--server-wins membaliknya)"
                  code={`PORT=8080 envman -e myapp:production -- bun start
# PORT=8080 (system wins by default)

envman --server-wins -e myapp:production -- bun start
# PORT dari server (server wins)`}
                />
              </Stack>
            </Timeline.Item>

            {/* Step 3 */}
            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">3</Text>}
              title={<Text fw={700} size="sm">CI/CD tanpa login interaktif</Text>}
            >
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Di CI/CD, set <Code fz="xs">ENVMAN_SERVER</Code> dan <Code fz="xs">ENVMAN_TOKEN</Code> sebagai
                environment secrets. Tidak perlu <Code fz="xs">envman login</Code>.
              </Text>
              <Stack gap="xs">
                <CodeBlock
                  label="GitHub Actions"
                  code={`- name: Deploy
  env:
    ENVMAN_SERVER: ${origin}
    ENVMAN_TOKEN: \${{ secrets.ENVMAN_TOKEN }}
  run: envman -e myapp:production -- bun start`}
                />
                <CodeBlock
                  label="Shell / Docker"
                  code={`ENVMAN_SERVER=${origin} \\
ENVMAN_TOKEN=<TOKEN> \\
  envman -e myapp:production -- bun start`}
                />
              </Stack>
            </Timeline.Item>

            {/* Step 4 */}
            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">4</Text>}
              title={<Text fw={700} size="sm">Auth dari local file</Text>}
            >
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Jika kamu punya file <Code fz="xs">-e</Code> yang juga berisi <Code fz="xs">ENVMAN_SERVER</Code> dan{' '}
                <Code fz="xs">ENVMAN_TOKEN</Code>, tidak perlu login sama sekali. Berguna untuk monorepo dengan
                auth berbeda per direktori.
              </Text>
              <Stack gap="xs">
                <CodeBlock
                  label="Isi .env.local (tidak perlu di-commit)"
                  code={`ENVMAN_SERVER=${origin}
ENVMAN_TOKEN=<TOKEN>
# vars lokal lainnya...
DEBUG=true`}
                />
                <CodeBlock
                  label="Jalankan — auth diambil dari .env.local"
                  code={`envman -e .env.local -e myapp:production -- bun dev`}
                />
              </Stack>
            </Timeline.Item>

            {/* Step 5 */}
            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">5</Text>}
              title={<Text fw={700} size="sm">Logout</Text>}
            >
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Menghapus config tersimpan di <Code fz="xs">~/.config/envman/config.json</Code>.
              </Text>
              <CodeBlock code={`envman logout`} />
            </Timeline.Item>
          </Timeline>
        </Stack>
      </Container>

      {/* ─── CLI Cheatsheet ───────────────────────────────────────────── */}
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
              <Text fw={600} size="sm" c="gray.3">CLI Cheatsheet</Text>
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
              {`# Auth
envman login ${origin} --token <TOKEN>   # simpan config
envman logout                             # hapus config
envman whoami                             # cek status login

# Inject (single source)
envman -e myapp:production -- <command>

# Inject (multiple sources, later overrides earlier)
envman -e myapp:base -e myapp:production -- <command>

# Mix remote + local file
envman -e myapp:production -e .env.local -- <command>

# CI/CD (tanpa login, auth dari env vars)
ENVMAN_SERVER=${origin} ENVMAN_TOKEN=<TOKEN> \\
  envman -e myapp:production -- <command>

# Flag
--server-wins    system env menang vs merged vars (default: merged wins)`}
            </pre>
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
              <Card key={f.title} withBorder p="md" radius="md">
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
            <Group gap="sm" mt="xs">
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
                href="#install"
                size="md"
                variant="default"
                leftSection={<TbDownload size={17} />}
              >
                Install CLI
              </Button>
            </Group>
          </Stack>
        </Card>
      </Container>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <Box style={{ borderTop: '1px solid var(--mantine-color-default-border)' }} py="md">
        <Container size="lg">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <ThemeIcon size={22} variant="gradient" gradient={{ from: 'violet', to: 'grape' }} radius="sm">
                <TbVariable size={11} />
              </ThemeIcon>
              <Text size="xs" fw={600}>Env Manager</Text>
            </Group>
            <Group gap="md">
              <Button component={Link} to="/docs" size="compact-xs" variant="subtle" color="gray">
                Docs
              </Button>
              <Text size="xs" c="dimmed">Self-hosted. Data tetap milikmu.</Text>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  )
}
