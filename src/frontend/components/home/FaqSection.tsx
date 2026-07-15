import { Accordion, Container, Stack, Text, Title } from '@mantine/core'

const FAQ = [
  {
    q: 'Apakah secret saya benar-benar aman?',
    a: 'Var yang ditandai secret dienkripsi AES-256-GCM sebelum disimpan. Kunci enkripsi (MASTER_KEY) hanya ada di server-mu dan tak pernah dikirim ke mana pun. Tanpa kunci itu, data tersimpan hanyalah noise — bahkan bagi yang punya akses database.',
  },
  {
    q: 'Bagaimana migrasi dari .env / Doppler / Vault?',
    a: 'Cukup push berkas .env yang ada: `envman env push project:env .env`. Secret di-auto-deteksi dari nama key (TOKEN, PASSWORD, API_KEY, dst) dan langsung dienkripsi. Untuk banyak environment, ulangi per env — atau pakai Env Import untuk berbagi var lintas project tanpa duplikasi.',
  },
  {
    q: 'Apa yang dibutuhkan untuk self-host?',
    a: 'PostgreSQL untuk data, Redis untuk cache/logs, dan (opsional) MinIO untuk Project Storage. Server berjalan sebagai satu binary/kontainer. Deploy via Docker Compose atau Portainer — panduan lengkap ada di dokumentasi.',
  },
  {
    q: 'Bagaimana kontrol akses tim bekerja?',
    a: 'Berlapis: role per-project (Owner/Editor/Viewer), lalu override per-environment dan per-section (Notes/Aliases/Files/Storage). Anggota baru default deny — akses harus di-grant eksplisit. Semua perubahan tercatat di audit log.',
  },
  {
    q: 'Ramah untuk AI agent & CI/CD?',
    a: 'Ya. `envman env keys` mencetak nama key tanpa value untuk memberi "bentuk" env ke agent tanpa membocorkan rahasia. `envman docs` mengeluarkan dokumentasi sebagai konteks. Untuk pipeline, pakai token (tanpa login interaktif) via ENVMAN_TOKEN.',
  },
  {
    q: 'Butuh kartu kredit atau langganan?',
    a: 'Tidak. envman open-source dan self-hosted — kamu menjalankannya di infrastrukturmu sendiri, gratis. Tak ada telemetry, tak ada tier berbayar tersembunyi.',
  },
]

export function FaqSection() {
  return (
    <Container size="sm" py={{ base: 60, md: 80 }} id="faq">
      <Stack gap="xl">
        <Stack align="center" gap="xs">
          <Text size="sm" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em' }} c="primary">
            FAQ
          </Text>
          <Title order={2} ta="center" fw={700}>
            Pertanyaan yang sering muncul
          </Title>
        </Stack>

        <Accordion variant="separated" radius="md">
          {FAQ.map((f, i) => (
            <Accordion.Item key={i} value={`faq-${i}`}>
              <Accordion.Control>
                <Text fw={600} size="sm">
                  {f.q}
                </Text>
              </Accordion.Control>
              <Accordion.Panel>
                <Text size="sm" c="dimmed" lh={1.65}>
                  {f.a}
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Stack>
    </Container>
  )
}
