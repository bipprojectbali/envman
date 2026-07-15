import { Box, Container, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { TbAlertTriangle, TbFileText, TbMessage2, TbUsersGroup } from 'react-icons/tb'

const PAINS = [
  {
    icon: TbFileText,
    title: '.env files everywhere',
    body: 'Berserakan di laptop, server, CI — tak pernah sinkron. Satu berubah, yang lain basi tanpa ada yang sadar.',
  },
  {
    icon: TbMessage2,
    title: 'Secrets in Slack & DMs',
    body: 'Kredensial produksi ditempel di chat, screenshot, atau ticket. Sekali bocor, tak bisa ditarik.',
  },
  {
    icon: TbUsersGroup,
    title: 'No access control',
    body: 'Semua orang lihat semua secret. Tak ada batas per-env, per-anggota, atau siapa boleh reveal apa.',
  },
  {
    icon: TbAlertTriangle,
    title: 'No audit trail',
    body: 'Siapa mengubah kredensial itu, kapan? Tak ada catatan. Rotasi jadi tebak-tebakan dan berisiko.',
  },
]

export function ProblemSection() {
  return (
    <Container size="lg" py={{ base: 60, md: 80 }}>
      <Stack gap="xl">
        <Stack align="center" gap="xs">
          <Text size="sm" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em' }} c="red">
            The problem
          </Text>
          <Title order={2} ta="center" fw={700} maw={640}>
            Mengelola secret dengan berkas <code>.env</code> tidak berskala
          </Title>
          <Text c="dimmed" ta="center" maw={520}>
            Saat tim & environment bertambah, cara lama berubah dari "merepotkan" jadi "berbahaya".
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {PAINS.map((p) => (
            <Box
              key={p.title}
              p="lg"
              style={{
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-lg)',
                background: 'var(--mantine-color-body)',
              }}
            >
              <ThemeIcon size={38} radius="md" variant="light" color="red" mb="sm">
                <p.icon size={19} />
              </ThemeIcon>
              <Text fw={600} size="sm" mb={4}>
                {p.title}
              </Text>
              <Text size="xs" c="dimmed" lh={1.6}>
                {p.body}
              </Text>
            </Box>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  )
}
