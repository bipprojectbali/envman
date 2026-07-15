import { Box, Container, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { TbEyeOff, TbFingerprint, TbHistory, TbLock, TbServer, TbShieldLock } from 'react-icons/tb'

const POINTS = [
  {
    icon: TbFingerprint,
    title: 'Trust math, not us',
    body: 'MASTER_KEY tak pernah meninggalkan server-mu. Secret dienkripsi AES-256-GCM — kami tak menyimpan kunci, jadi tak bisa mendekripsi apa pun.',
  },
  {
    icon: TbServer,
    title: 'Your data, your server',
    body: 'Self-hosted sepenuhnya. Tak ada pihak ketiga, tak ada telemetry, tak ada vendor lock-in. Deploy di infrastrukturmu sendiri.',
  },
  {
    icon: TbShieldLock,
    title: 'Secure by default',
    body: 'Anggota baru default deny di semua environment. Akses harus di-grant eksplisit per-env & per-section — bukan sebaliknya.',
  },
  {
    icon: TbEyeOff,
    title: 'Hidden by default',
    body: 'Nilai var disembunyikan di UI kecuali kamu ungkap — aman dari screenshot & screen-share. Secret butuh reveal terpisah.',
  },
  {
    icon: TbHistory,
    title: 'Full audit trail',
    body: 'Setiap login, perubahan role, dan aksi token tercatat di AuditLog. Aktivitas per-token terlacak (useCount, IP terakhir).',
  },
  {
    icon: TbLock,
    title: 'Transparent scope',
    body: 'Jujur soal apa yang dienkripsi: secret → AES-256-GCM; metadata (nama key) → plaintext agar bisa dicari. Tanpa magic tersembunyi.',
  },
]

export function SecuritySection() {
  return (
    <Box style={{ background: 'var(--mantine-color-default-hover)' }} id="security">
      <Container size="lg" py={{ base: 60, md: 90 }}>
        <Stack gap={48}>
          <Group align="center" gap={40} wrap="wrap" justify="center">
            <Stack gap="md" style={{ flex: '1 1 380px', minWidth: 300 }}>
              <Text size="sm" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em' }} c="teal">
                Security
              </Text>
              <Title order={2} fw={700} maw={440}>
                Dibangun agar kamu tak perlu mempercayai siapa pun
              </Title>
              <Text c="dimmed" lh={1.65} maw={460}>
                Untuk secrets manager, keamanan bukan fitur — ini fondasinya. envman dirancang supaya arsitekturnya
                sendiri yang menjamin, bukan janji kami.
              </Text>
            </Stack>

            {/* Encryption proof */}
            <Box style={{ flex: '1 1 340px', minWidth: 300, maxWidth: 460 }}>
              <MockEncryption />
            </Box>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
            {POINTS.map((p) => (
              <Box key={p.title}>
                <ThemeIcon size={40} radius="md" variant="light" color="teal" mb="sm">
                  <p.icon size={20} />
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
    </Box>
  )
}

function MockEncryption() {
  return (
    <Box
      style={{
        background: '#0c0c0f',
        border: '1px solid #26262b',
        borderRadius: 12,
        padding: 18,
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.9,
        boxShadow: '0 20px 60px -20px rgba(0,0,0,0.5)',
      }}
    >
      <Text ff="monospace" fz={11} c="dimmed" mb={8}>
        # sebelum disimpan ke database
      </Text>
      <Box style={{ whiteSpace: 'pre-wrap', color: '#d4d4d8' }}>
        <Text component="span" ff="monospace" fz={12} c="teal.4">
          DB_PASSWORD
        </Text>
        <Text component="span" ff="monospace" fz={12} c="dimmed">
          {' = '}
        </Text>
        <Text component="span" ff="monospace" fz={12} c="orange.4">
          s3cr3t-pr0d-p@ss
        </Text>
      </Box>
      <Box my={10} style={{ color: '#4a4a52', textAlign: 'center' }}>
        ↓ AES-256-GCM
      </Box>
      <Box style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#7c5cff' }}>
        enc:9f2a1c4e8b:c71b0e3f92a6d1:af3e77b219
      </Box>
      <Text ff="monospace" fz={11} c="dimmed" mt={10}>
        # tanpa MASTER_KEY, ini hanya noise
      </Text>
    </Box>
  )
}
