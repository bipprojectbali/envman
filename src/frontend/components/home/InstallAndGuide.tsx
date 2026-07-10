import { Box, Code, Container, Group, Stack, Text, ThemeIcon, Timeline } from '@mantine/core'
import { TbCode, TbPlayerPlay } from 'react-icons/tb'
import { CodeBlock } from '@/frontend/components/home/CodeBlock'
import { InstallSection } from '@/frontend/components/home/InstallSection'

interface Props {
  versionData?: { version: string }
}

export function InstallAndGuide({ versionData }: Props) {
  const origin = window.location.origin

  return (
    <>
      <InstallSection versionData={versionData} origin={origin} />

      {/* ─── Panduan Penggunaan ───────────────────────────────────────── */}
      <Container size="md" py={{ base: 48, md: 64 }} id="guide">
        <Stack gap="xl">
          <Stack align="center" gap="xs">
            <ThemeIcon size={44} variant="gradient" radius="md"><TbPlayerPlay size={22} /></ThemeIcon>
            <Text fw={700} size="xl" ta="center">Panduan Penggunaan</Text>
            <Text c="dimmed" ta="center" maw={480}>Dari install sampai inject ke production — semua ada di sini.</Text>
          </Stack>

          <Timeline active={-1} bulletSize={32} lineWidth={2} color="primary">
            <Timeline.Item bullet={<Text fw={800} size="sm" c="white">1</Text>} title={<Text fw={700} size="sm">Login ke server</Text>}>
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Setelah install CLI, login sekali untuk menyimpan credentials ke config lokal. Token bisa dibuat di dashboard → Tokens.
              </Text>
              <Stack gap="xs">
                <CodeBlock label="Login dan simpan config ke ~/.config/envman/config.json" code={`envman login ${origin} --token <API_TOKEN>`} />
                <CodeBlock label="Verifikasi login berhasil" code={`envman whoami\n# → Logged in as user@example.com (ADMIN) at ${origin}`} />
              </Stack>
            </Timeline.Item>

            <Timeline.Item bullet={<Text fw={800} size="sm" c="white">2</Text>} title={<Text fw={700} size="sm">Inject vars ke command</Text>}>
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Gunakan flag <Code fz="xs">-e project:environment</Code> untuk fetch vars dari server, lalu jalankan command apapun. Vars hanya ada di memori process — tidak ditulis ke file.
              </Text>
              <Stack gap="xs">
                <CodeBlock label="Inject ke satu environment" code={`envman -e myapp:production -- bun start`} />
                <CodeBlock label="Gabungkan beberapa env (later overrides earlier)" code={`envman -e myapp:base -e myapp:production -- bun dev`} />
                <CodeBlock label="Mix server + local file (.env.local override production)" code={`envman -e myapp:production -e .env.local -- bun dev`} />
                <CodeBlock label="Server vars kalah dari system env (--server-wins membaliknya)" code={`PORT=8080 envman -e myapp:production -- bun start\n# PORT=8080 (system wins by default)\n\nenvman --server-wins -e myapp:production -- bun start\n# PORT dari server (server wins)`} />
              </Stack>
            </Timeline.Item>

            <Timeline.Item bullet={<Text fw={800} size="sm" c="white">3</Text>} title={<Text fw={700} size="sm">CI/CD tanpa login interaktif</Text>}>
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Di CI/CD, set <Code fz="xs">ENVMAN_SERVER</Code> dan <Code fz="xs">ENVMAN_TOKEN</Code> sebagai environment secrets. Tidak perlu <Code fz="xs">envman login</Code>.
              </Text>
              <Stack gap="xs">
                <CodeBlock label="GitHub Actions" code={`- name: Deploy\n  env:\n    ENVMAN_SERVER: ${origin}\n    ENVMAN_TOKEN: \${{ secrets.ENVMAN_TOKEN }}\n  run: envman -e myapp:production -- bun start`} />
                <CodeBlock label="Shell / Docker" code={`ENVMAN_SERVER=${origin} \\\nENVMAN_TOKEN=<TOKEN> \\\n  envman -e myapp:production -- bun start`} />
              </Stack>
            </Timeline.Item>

            <Timeline.Item bullet={<Text fw={800} size="sm" c="white">4</Text>} title={<Text fw={700} size="sm">Auth dari local file</Text>}>
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Jika kamu punya file <Code fz="xs">-e</Code> yang juga berisi <Code fz="xs">ENVMAN_SERVER</Code> dan{' '}
                <Code fz="xs">ENVMAN_TOKEN</Code>, tidak perlu login sama sekali. Berguna untuk monorepo dengan auth berbeda per direktori.
              </Text>
              <Stack gap="xs">
                <CodeBlock label="Isi .env.local (tidak perlu di-commit)" code={`ENVMAN_SERVER=${origin}\nENVMAN_TOKEN=<TOKEN>\n# vars lokal lainnya...\nDEBUG=true`} />
                <CodeBlock label="Jalankan — auth diambil dari .env.local" code={`envman -e .env.local -e myapp:production -- bun dev`} />
              </Stack>
            </Timeline.Item>

            <Timeline.Item bullet={<Text fw={800} size="sm" c="white">5</Text>} title={<Text fw={700} size="sm">Aliases — simpan perintah panjang</Text>}>
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Buat alias di dashboard → project → tab <Code fz="xs">Aliases</Code>. Jalankan dengan{' '}
                <Code fz="xs">envman run project:alias</Code>. Bisa tambah extra source dan passthrough args.
              </Text>
              <Stack gap="xs">
                <CodeBlock label="Jalankan alias" code={`envman run myapp:deploy`} />
                <CodeBlock label="Alias + extra source + passthrough args" code={`envman run -e .env.local myapp:deploy --dry-run`} />
                <CodeBlock label="Project Files — eksekusi script dari server (tanpa -e, slug embedded)" code={`envman -- bash myapp:scripts/migrate.sh\nenvman -- bun myapp:ts-utils/seed.ts\nenvman -e myapp:production -- bash myapp:scripts/deploy.sh`} />
              </Stack>
            </Timeline.Item>

            <Timeline.Item bullet={<Text fw={800} size="sm" c="white">6</Text>} title={<Text fw={700} size="sm">Logout</Text>}>
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
        style={{ background: 'linear-gradient(180deg, var(--mantine-color-dark-7) 0%, var(--mantine-color-dark-8) 100%)', borderTop: '1px solid var(--mantine-color-dark-5)', borderBottom: '1px solid var(--mantine-color-dark-5)' }}
        py="xl"
      >
        <Container size="md">
          <Stack gap="md">
            <Group gap="xs">
              <ThemeIcon size={22} variant="light" color="primary" radius="sm"><TbCode size={12} /></ThemeIcon>
              <Text fw={600} size="sm" c="gray.3">CLI Cheatsheet</Text>
            </Group>
            <pre
              style={{ fontSize: 13, lineHeight: 1.75, background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 8, padding: '16px 20px', margin: 0, overflowX: 'auto', color: '#c9d1d9', fontFamily: "'Courier New', Courier, monospace", whiteSpace: 'pre' }}
            >
              {`# Auth\nenvman login ${origin} --token <TOKEN>   # simpan config\nenvman logout                             # hapus config\nenvman whoami                             # cek status login\nenvman update                             # update CLI ke versi terbaru\n\n# Inject env vars\nenvman -e myapp:production -- <command>\nenvman -e myapp:base -e myapp:production -- <command>   # later overrides\nenvman -e myapp:production -e .env.local -- <command>   # mix server + local\nENVMAN_SERVER=${origin} ENVMAN_TOKEN=<t> \\\n  envman -e myapp:production -- <command>                # CI/CD tanpa login\n\n# Aliases — simpan perintah panjang\nenvman run myapp:deploy                  # expand alias dan eksekusi\nenvman run -e .env myapp:deploy          # tambah source ekstra\nenvman run myapp:deploy --flag arg       # passthrough args ke command\n\n# Project Files — eksekusi script dari server (zero disk write)\nenvman -- bash myapp:scripts/deploy.sh         # slug:path, tanpa -e\nenvman -- bun myapp:utils/seed.ts              # slug:file.ts\nenvman -e myapp:production -- bash myapp:scripts/deploy.sh  # + inject env vars\n\n# Storage — file per project\nenvman storage ls myapp                        # list file & folder\nenvman storage upload myapp ./dist             # upload file/folder\nenvman storage download myapp:compose.yml      # download ke stdout\nenvman storage exec myapp:bin/tool -- --flag   # jalankan binary (cached)\n\n# Portainer — kontrol stack per env (alias: pt)\nenvman portainer status myapp:prod             # ringkasan stack + container\nenvman portainer logs myapp:prod api -f        # live logs sampai Ctrl+C\nenvman portainer restart-soft myapp:prod       # stop→start tanpa pull\nenvman portainer sync-repull myapp:prod        # push vars + repull image\n\n# Flag\n--server-wins    system env menang vs merged vars (default: merged wins)`}
            </pre>
          </Stack>
        </Container>
      </Box>
    </>
  )
}
