import { Box, Container, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import {
  TbBrandDocker,
  TbBrandGithub,
  TbCode,
  TbFiles,
  TbKey,
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

export function HomeFeaturesSection() {
  return (
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
              style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
            >
              <Group gap="sm" mb="xs">
                <ThemeIcon size={36} variant="light" color={f.color} radius="md">
                  <f.icon size={18} />
                </ThemeIcon>
                <Text fw={600} size="sm">{f.title}</Text>
              </Group>
              <Text size="sm" c="dimmed" lh={1.65}>{f.description}</Text>
            </Box>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  )
}
