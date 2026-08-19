import { Box, Container, Group, Stack, Tabs, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { Cmd, Comment, MockTerminal, Out } from './MockTerminal'

type Line = { type: 'cmd' | 'out' | 'ok' | 'comment' | 'gap'; text?: string }

const TABS: { value: string; label: string; lines: Line[] }[] = [
  {
    value: 'inject',
    label: 'Inject',
    lines: [
      { type: 'comment', text: 'jalankan app dengan env dari server' },
      { type: 'cmd', text: 'envman -e web:prod -- bun run start' },
      { type: 'out', text: '→ 24 vars injected (6 encrypted)' },
      { type: 'gap' },
      { type: 'comment', text: 'gabung beberapa sumber, yang belakang menang' },
      { type: 'cmd', text: 'envman -e web:base -e web:prod -- bun dev' },
      { type: 'gap' },
      { type: 'comment', text: 'CI/CD tanpa login, pakai token env' },
      { type: 'cmd', text: 'ENVMAN_TOKEN=*** envman -e web:prod -- ./deploy.sh' },
    ],
  },
  {
    value: 'env',
    label: 'Sync .env',
    lines: [
      { type: 'comment', text: 'push .env ke server (upsert, auto-deteksi secret)' },
      { type: 'cmd', text: 'envman env push web:prod .env' },
      { type: 'ok', text: '✓ web:prod — 3 created, 5 updated, 4 secret' },
      { type: 'gap' },
      { type: 'comment', text: 'tarik balik jadi .env' },
      { type: 'cmd', text: 'envman env pull web:prod -o .env' },
      { type: 'gap' },
      { type: 'comment', text: 'cetak nama key saja (untuk AI agent, tanpa value)' },
      { type: 'cmd', text: 'envman env keys web:prod' },
      { type: 'out', text: 'DATABASE_URL=\nREDIS_URL=\nAPI_KEY=' },
    ],
  },
  {
    value: 'clip',
    label: 'Clipboard',
    lines: [
      { type: 'comment', text: 'di server (tanpa pbcopy):' },
      { type: 'cmd', text: 'cat .env | envman clip set' },
      { type: 'ok', text: '✓ clipboard di-set (412 byte, kedaluwarsa 24j)' },
      { type: 'gap' },
      { type: 'comment', text: 'di laptop, akun sama:' },
      { type: 'cmd', text: 'envman clip get > .env' },
      { type: 'out', text: '# tersinkron, terenkripsi, auto-expire' },
    ],
  },
  {
    value: 'storage',
    label: 'Storage',
    lines: [
      { type: 'comment', text: 'simpan file di project' },
      { type: 'cmd', text: 'envman storage upload web ./dist' },
      { type: 'out', text: '→ 34 files uploaded' },
      { type: 'gap' },
      { type: 'comment', text: 'jalankan binary dari storage (ter-cache)' },
      { type: 'cmd', text: 'envman storage exec web:bin/migrate -- --up' },
    ],
  },
  {
    value: 'portainer',
    label: 'Portainer',
    lines: [
      { type: 'comment', text: 'status stack Docker per env' },
      { type: 'cmd', text: 'envman portainer status web:prod' },
      { type: 'out', text: 'web-prod  running  3/3 containers  up 4d' },
      { type: 'gap' },
      { type: 'comment', text: 'live logs sampai Ctrl+C' },
      { type: 'cmd', text: 'envman pt logs web:prod api -f' },
      { type: 'gap' },
      { type: 'comment', text: 'push vars lalu repull image' },
      { type: 'cmd', text: 'envman pt sync-repull web:prod' },
    ],
  },
  {
    value: 'transfer',
    label: 'Transfer',
    lines: [
      { type: 'comment', text: 'kirim .env ke rekan tim' },
      { type: 'cmd', text: 'envman transfer send .env --to alice@team.io' },
      { type: 'ok', text: '✓ terkirim — burn-after-read, kedaluwarsa 72j' },
      { type: 'gap' },
      { type: 'comment', text: 'atau kode 4 kata yang bisa didikte via telepon' },
      { type: 'cmd', text: 'envman transfer send key.pem --once' },
      { type: 'out', text: '→ viking.pudding.alaska.sunny' },
      { type: 'gap' },
      { type: 'comment', text: 'penerima ambil (tanpa login)' },
      { type: 'cmd', text: 'envman transfer get viking.pudding.alaska.sunny -o key.pem' },
    ],
  },
  {
    value: 'gists',
    label: 'Gists',
    lines: [
      { type: 'comment', text: 'simpan snippet multi-file' },
      { type: 'cmd', text: 'envman gists push "Deploy Script" deploy.sh --tags ops' },
      { type: 'ok', text: '✓ Deploy Script — 1 file' },
      { type: 'gap' },
      { type: 'comment', text: 'tarik balik by judul (bukan UUID)' },
      { type: 'cmd', text: 'envman gists pull "Deploy Script" -o ./scripts' },
    ],
  },
  {
    value: 'projects',
    label: 'Projects',
    lines: [
      { type: 'comment', text: 'daftar project yang bisa diakses' },
      { type: 'cmd', text: 'envman projects ls' },
      { type: 'out', text: 'SLUG  NAME  ENVS  ROLE\nweb   web   3     OWNER' },
      { type: 'gap' },
      { type: 'comment', text: 'env di sebuah project' },
      { type: 'cmd', text: 'envman projects web' },
      { type: 'out', text: 'ENV   ROLE   VARS\nprod  OWNER  24' },
    ],
  },
]

function renderLine(l: Line, i: number) {
  switch (l.type) {
    case 'cmd':
      return <Cmd key={i}>{l.text}</Cmd>
    case 'ok':
      return (
        <Out key={i} color="#28c840">
          {l.text}
        </Out>
      )
    case 'out':
      return <Out key={i}>{l.text}</Out>
    case 'comment':
      return <Comment key={i}>{l.text}</Comment>
    default:
      return <Box key={i} h={10} />
  }
}

export function CliShowcaseSection() {
  const [tab, setTab] = useState<string | null>('inject')
  return (
    <Container size="lg" py={{ base: 60, md: 80 }} id="cli">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
          <Stack gap="xs" style={{ flex: '1 1 320px' }}>
            <Text size="sm" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em' }} c="primary">
              CLI first
            </Text>
            <Title order={2} fw={700}>
              Satu binary Go, semua alur kerja
            </Title>
            <Text c="dimmed" maw={480}>
              Statically-linked, jalan di Linux/macOS/Windows tanpa dependency. Auth sekali, lalu inject, sync, kontrol
              stack — semua dari terminal.
            </Text>
          </Stack>
        </Group>

        <Tabs value={tab} onChange={setTab} variant="pills" color="primary" radius="md">
          <Tabs.List mb="md">
            {TABS.map((t) => (
              <Tabs.Tab key={t.value} value={t.value}>
                {t.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {TABS.map((t) => (
            <Tabs.Panel key={t.value} value={t.value}>
              <MockTerminal title={`envman ${t.label.toLowerCase()}`} minH={200}>
                {t.lines.map(renderLine)}
              </MockTerminal>
            </Tabs.Panel>
          ))}
        </Tabs>
      </Stack>
    </Container>
  )
}
