import { Badge, Button, Container, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { TbDownload, TbLogin } from 'react-icons/tb'

interface HomeHeroSectionProps {
  user: { role: string } | null | undefined
  versionData?: { version: string }
  defaultRoute: string
}

export function HomeHeroSection({ versionData }: HomeHeroSectionProps) {
  return (
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
              <Text fw={700} size="md">{stat.label}</Text>
              <Text size="xs" c="dimmed">{stat.sub}</Text>
            </Stack>
          ))}
        </Group>
      </Stack>
    </Container>
  )
}
