import { Box, Container, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { TbArrowRight, TbLock, TbPencilPlus, TbRocket } from 'react-icons/tb'

const STEPS = [
  {
    n: '01',
    icon: TbPencilPlus,
    color: 'blue',
    title: 'Define',
    body: 'Buat project & environment (dev, staging, prod). Tambah vars lewat UI atau push langsung dari .env.',
    code: 'envman env push web:prod .env',
  },
  {
    n: '02',
    icon: TbLock,
    color: 'teal',
    title: 'Encrypt',
    body: 'Var sensitif ditandai secret & dienkripsi AES-256-GCM saat disimpan. MASTER_KEY tak pernah keluar dari server-mu.',
    code: 'DB_PASSWORD  enc:9f2a…:c71b…:af3e…',
  },
  {
    n: '03',
    icon: TbRocket,
    color: 'violet',
    title: 'Inject',
    body: 'Jalankan perintah apa pun dengan env yang benar — di-inject saat runtime, tanpa menulis .env ke disk.',
    code: 'envman -e web:prod -- bun run start',
  },
]

export function HowItWorksSection() {
  return (
    <Box style={{ background: 'var(--mantine-color-default-hover)' }}>
      <Container size="lg" py={{ base: 60, md: 80 }}>
        <Stack gap="xl">
          <Stack align="center" gap="xs">
            <Text size="sm" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em' }} c="primary">
              How it works
            </Text>
            <Title order={2} ta="center" fw={700}>
              Tiga langkah, dari secret ke runtime
            </Title>
          </Stack>

          <SimpleGrid cols={{ base: 1, md: 3 }} spacing={{ base: 'md', md: 'xl' }} style={{ position: 'relative' }}>
            {STEPS.map((s, i) => (
              <Box key={s.n} style={{ position: 'relative' }}>
                <Stack gap="sm">
                  <Group gap="sm">
                    <ThemeIcon size={44} radius="md" variant="light" color={s.color}>
                      <s.icon size={22} />
                    </ThemeIcon>
                    <Text fw={800} size="xl" c="dimmed" style={{ opacity: 0.35 }}>
                      {s.n}
                    </Text>
                  </Group>
                  <Text fw={700} size="lg">
                    {s.title}
                  </Text>
                  <Text size="sm" c="dimmed" lh={1.6}>
                    {s.body}
                  </Text>
                  <Box
                    style={{
                      background: '#0c0c0f',
                      border: '1px solid #26262b',
                      borderRadius: 8,
                      padding: '9px 12px',
                      fontFamily: 'monospace',
                      fontSize: 11.5,
                      color: '#c9d1d9',
                      overflowX: 'auto',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.code}
                  </Box>
                </Stack>
                {i < STEPS.length - 1 && (
                  <Box
                    visibleFrom="md"
                    style={{ position: 'absolute', right: -22, top: 14, color: 'var(--mantine-color-dimmed)' }}
                  >
                    <TbArrowRight size={20} />
                  </Box>
                )}
              </Box>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>
    </Box>
  )
}
