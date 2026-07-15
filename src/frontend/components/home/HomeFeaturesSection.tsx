import { Badge, Box, Container, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { TbArrowsExchange, TbBrandDocker, TbFolder, TbKey, TbLock, TbTerminal2, TbUsersGroup } from 'react-icons/tb'
import classes from './HomeFeaturesSection.module.css'

function CellHead({ icon: Icon, color, title }: { icon: typeof TbLock; color: string; title: string }) {
  return (
    <Group gap="sm" mb="xs">
      <ThemeIcon size={38} radius="md" variant="light" color={color}>
        <Icon size={19} />
      </ThemeIcon>
      <Text fw={700} size="sm">
        {title}
      </Text>
    </Group>
  )
}

export function HomeFeaturesSection() {
  return (
    <Container size="lg" py={{ base: 60, md: 80 }} id="features">
      <Stack gap="xl">
        <Stack align="center" gap="xs">
          <Text size="sm" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em' }} c="primary">
            Features
          </Text>
          <Title order={2} ta="center" fw={700}>
            Secrets management yang lengkap
          </Title>
          <Text c="dimmed" ta="center" maw={520}>
            Dari enkripsi sampai kontrol akses granular, CLI, hingga operasi infrastruktur — semua dalam satu tempat.
          </Text>
        </Stack>

        {/* Bento: anchor cell (encryption) spans 2 cols on lg, then varied cells. */}
        <Box className={classes.bento}>
          {/* Anchor — Encryption (big) */}
          <Box className={classes.cell}>
            <CellHead icon={TbLock} color="teal" title="End-to-end encryption" />
            <Text size="sm" c="dimmed" lh={1.6} mb="md">
              Var yang ditandai <strong>secret</strong> dienkripsi AES-256-GCM sebelum menyentuh database. MASTER_KEY
              tinggal di server-mu — kami secara harfiah tak bisa mendekripsinya.
            </Text>
            <Box
              style={{
                background: '#0c0c0f',
                border: '1px solid #26262b',
                borderRadius: 8,
                padding: '10px 14px',
                fontFamily: 'monospace',
                fontSize: 11.5,
                color: '#c9d1d9',
                overflowX: 'auto',
              }}
            >
              <Text component="span" c="teal.4" ff="monospace" fz={11.5}>
                DB_PASSWORD
              </Text>
              {'  '}
              <Text component="span" ff="monospace" fz={11.5} c="dimmed">
                enc:9f2a1c…:c71b0e…:af3e77…
              </Text>
            </Box>
          </Box>

          {/* CLI inject */}
          <Box className={classes.cell}>
            <CellHead icon={TbTerminal2} color="violet" title="CLI inject" />
            <Text size="sm" c="dimmed" lh={1.6}>
              Jalankan perintah apa pun dengan env yang tepat, tanpa <code>.env</code> di disk.
            </Text>
            <Text mt="sm" ff="monospace" fz={11.5} c="dimmed" style={{ whiteSpace: 'nowrap', overflowX: 'auto' }}>
              $ envman -e web:prod -- bun start
            </Text>
          </Box>

          {/* Granular access */}
          <Box className={classes.cell}>
            <CellHead icon={TbUsersGroup} color="blue" title="Granular access" />
            <Text size="sm" c="dimmed" lh={1.6}>
              Izin per-project, per-environment, dan per-section. Secure-by-default: anggota baru default deny.
            </Text>
            <Group gap={6} mt="sm">
              <Badge size="xs" variant="light" color="gray">
                ~ inherit
              </Badge>
              <Badge size="xs" variant="light" color="blue">
                V·E·O
              </Badge>
              <Badge size="xs" variant="light" color="red">
                ✕ denied
              </Badge>
            </Group>
          </Box>

          {/* Env sync + import */}
          <Box className={classes.cell}>
            <CellHead icon={TbArrowsExchange} color="grape" title="Sync & live-link" />
            <Text size="sm" c="dimmed" lh={1.6}>
              <code>env push/pull</code> menyinkronkan <code>.env</code>. Env Import meminjam vars dari env lain secara
              live — lintas project, tanpa duplikasi.
            </Text>
          </Box>

          {/* Storage */}
          <Box className={classes.cell}>
            <CellHead icon={TbFolder} color="teal" title="Project storage" />
            <Text size="sm" c="dimmed" lh={1.6}>
              Simpan config, skrip, & file di samping secret (MinIO). Upload chunked &gt;50MB, quota per-project, dan{' '}
              <code>storage exec</code> binary ter-cache.
            </Text>
          </Box>

          {/* Portainer */}
          <Box className={classes.cell}>
            <CellHead icon={TbBrandDocker} color="indigo" title="Portainer control" />
            <Text size="sm" c="dimmed" lh={1.6}>
              Status, live logs, restart, repull, prune stack Docker — langsung dari CLI dengan
              <code> project:env</code>. Bukan sekadar sync vars.
            </Text>
          </Box>

          {/* Account clipboard */}
          <Box className={classes.cell}>
            <CellHead icon={TbKey} color="orange" title="Account clipboard" />
            <Text size="sm" c="dimmed" lh={1.6}>
              <code>envman clip</code> — pbcopy/pbpaste lintas device. Terenkripsi, auto-expire. Copy di server, paste
              di laptop.
            </Text>
          </Box>
        </Box>
      </Stack>
    </Container>
  )
}
