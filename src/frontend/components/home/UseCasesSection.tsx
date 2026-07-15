import { Box, Container, List, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { TbBuildingStore, TbCheck, TbRobot, TbServer2, TbUser } from 'react-icons/tb'

const CASES = [
  {
    icon: TbUser,
    color: 'blue',
    title: 'Solo developer',
    tagline: 'Banyak project, satu tempat',
    points: ['Stop menyalin .env antar mesin', 'Inject env yang benar per project', 'Clipboard akun lintas device'],
  },
  {
    icon: TbServer2,
    color: 'teal',
    title: 'Self-hoster / Homelab',
    tagline: 'Kendali penuh atas datamu',
    points: [
      'Jalan di server sendiri, zero telemetry',
      'Kontrol stack Portainer dari CLI',
      'Storage MinIO untuk config & file',
    ],
  },
  {
    icon: TbBuildingStore,
    color: 'grape',
    title: 'Agency multi-client',
    tagline: 'Pisahkan akses per klien',
    points: [
      'Izin granular per-project & per-env',
      'Secure-by-default onboarding anggota',
      'Audit trail untuk setiap perubahan',
    ],
  },
  {
    icon: TbRobot,
    color: 'violet',
    title: 'AI agents & CI/CD',
    tagline: 'Env sebagai kode, aman',
    points: ['Token tanpa login untuk pipeline', 'env keys — beri "bentuk" env ke agent', 'envman docs > context.md'],
  },
]

export function UseCasesSection() {
  return (
    <Container size="lg" py={{ base: 60, md: 80 }}>
      <Stack gap="xl">
        <Stack align="center" gap="xs">
          <Text size="sm" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em' }} c="primary">
            Who is it for
          </Text>
          <Title order={2} ta="center" fw={700}>
            Dibuat untuk cara kerjamu
          </Title>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          {CASES.map((c) => (
            <Box
              key={c.title}
              p="xl"
              style={{
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-lg)',
                background: 'var(--mantine-color-body)',
              }}
            >
              <Stack gap="sm">
                <ThemeIcon size={44} radius="md" variant="light" color={c.color}>
                  <c.icon size={22} />
                </ThemeIcon>
                <Box>
                  <Text fw={700}>{c.title}</Text>
                  <Text size="sm" c="dimmed">
                    {c.tagline}
                  </Text>
                </Box>
                <List
                  spacing={6}
                  size="sm"
                  icon={
                    <ThemeIcon size={16} radius="xl" variant="light" color={c.color}>
                      <TbCheck size={11} />
                    </ThemeIcon>
                  }
                >
                  {c.points.map((p) => (
                    <List.Item key={p}>
                      <Text size="sm" c="dimmed">
                        {p}
                      </Text>
                    </List.Item>
                  ))}
                </List>
              </Stack>
            </Box>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  )
}
