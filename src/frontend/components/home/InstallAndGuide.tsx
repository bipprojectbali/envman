import {
  Badge,
  Box,
  Button,
  Code,
  Container,
  CopyButton,
  Divider,
  Group,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Timeline,
  Tooltip,
} from '@mantine/core'
import {
  TbBrandWindows,
  TbCheck,
  TbCode,
  TbCopy,
  TbDownload,
  TbPlayerPlay,
  TbTerminal,
} from 'react-icons/tb'

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <Box>
      {label && (
        <Text size="xs" c="dimmed" mb={4}>
          {label}
        </Text>
      )}
      <Group gap={6} align="flex-start">
        <Box
          style={{
            flex: 1,
            background: '#0d0d0d',
            border: '1px solid #2a2a2a',
            borderRadius: 6,
            padding: '10px 14px',
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 12,
            lineHeight: 1.7,
            color: '#c9d1d9',
            overflowX: 'auto',
            whiteSpace: 'pre',
          }}
        >
          {code}
        </Box>
        <CopyButton value={code}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied!' : 'Copy'}>
              <Button size="compact-xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} mt={6} px={6}>
                {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
              </Button>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
    </Box>
  )
}

interface Props {
  versionData?: { version: string }
}

export function InstallAndGuide({ versionData }: Props) {
  const origin = window.location.origin

  const installCmds = {
    'linux-x64': `curl --compressed -fsSL ${origin}/download/cli/linux-x64 -o envman\nchmod +x envman && sudo mv envman /usr/local/bin/\nenvman --version`,
    'linux-arm64': `curl --compressed -fsSL ${origin}/download/cli/linux-arm64 -o envman\nchmod +x envman && sudo mv envman /usr/local/bin/\nenvman --version`,
    'darwin-arm64': `curl --compressed -fsSL ${origin}/download/cli/darwin-arm64 -o envman\nchmod +x envman && sudo mv envman /usr/local/bin/\nenvman --version`,
    'darwin-x64': `curl --compressed -fsSL ${origin}/download/cli/darwin-x64 -o envman\nchmod +x envman && sudo mv envman /usr/local/bin/\nenvman --version`,
    'windows-x64': `# PowerShell\nInvoke-WebRequest -Uri "${origin}/download/cli/windows-x64" \`\n  -OutFile "envman.exe"\n\n# Atau dengan curl (Windows 10+)\ncurl -L ${origin}/download/cli/windows-x64 -o envman.exe`,
  }

  return (
    <>
      {/* ─── Install ─────────────────────────────────────────────────── */}
      <Box
        id="install"
        style={{
          borderTop: '1px solid var(--mantine-color-default-border)',
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
        py={{ base: 48, md: 64 }}
      >
        <Container size="md">
          <Stack gap="xl">
            <Stack align="center" gap="xs">
              <ThemeIcon size={44} variant="gradient" radius="md">
                <TbDownload size={22} />
              </ThemeIcon>
              <Text fw={700} size="xl" ta="center">
                Install CLI
              </Text>
              {versionData?.version && (
                <Group justify="center" gap="xs">
                  <Badge variant="light" color="primary" size="sm">
                    CLI v{versionData.version}
                  </Badge>
                  <Badge variant="outline" color="gray" size="sm">
                    auto-update built-in
                  </Badge>
                </Group>
              )}
              <Text c="dimmed" ta="center" maw={480}>
                Binary standalone — tidak perlu Node.js, npm, atau runtime apapun. Satu file, langsung jalan.
              </Text>
            </Stack>

            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Linux &amp; macOS — satu command, auto-detect platform:
              </Text>
              <CodeBlock code={`curl -fsSL ${origin}/install | bash`} />
              <Text size="xs" c="dimmed">
                Script otomatis deteksi OS dan arsitektur, download binary yang tepat, install ke{' '}
                <Code fz="xs">/usr/local/bin/envman</Code>. Butuh <Code fz="xs">sudo</Code>? Script akan memintanya
                otomatis jika diperlukan.
              </Text>
            </Stack>

            <Divider label="atau pilih platform manual" labelPosition="center" />

            <Tabs defaultValue="linux-x64" variant="pills" radius="md">
              <Tabs.List mb="md">
                <Tabs.Tab value="linux-x64" leftSection={<TbTerminal size={13} />}>
                  Linux x64
                </Tabs.Tab>
                <Tabs.Tab value="linux-arm64" leftSection={<TbTerminal size={13} />}>
                  Linux ARM64
                </Tabs.Tab>
                <Tabs.Tab value="darwin-arm64" leftSection={<TbTerminal size={13} />}>
                  macOS Apple Silicon
                </Tabs.Tab>
                <Tabs.Tab value="darwin-x64" leftSection={<TbTerminal size={13} />}>
                  macOS Intel
                </Tabs.Tab>
                <Tabs.Tab value="windows-x64" leftSection={<TbBrandWindows size={13} />}>
                  Windows
                </Tabs.Tab>
              </Tabs.List>

              {(Object.entries(installCmds) as [string, string][]).map(([platform, cmd]) => (
                <Tabs.Panel key={platform} value={platform}>
                  <Stack gap="sm">
                    <CodeBlock code={cmd} />
                    <Group gap="xs">
                      <Button
                        component="a"
                        href={`${origin}/download/cli/${platform}`}
                        size="xs"
                        variant="light"
                        color="primary"
                        leftSection={<TbDownload size={13} />}
                        download
                      >
                        Download binary langsung
                      </Button>
                    </Group>
                  </Stack>
                </Tabs.Panel>
              ))}
            </Tabs>
          </Stack>
        </Container>
      </Box>

      {/* ─── Panduan Penggunaan ───────────────────────────────────────── */}
      <Container size="md" py={{ base: 48, md: 64 }} id="guide">
        <Stack gap="xl">
          <Stack align="center" gap="xs">
            <ThemeIcon size={44} variant="gradient" radius="md">
              <TbPlayerPlay size={22} />
            </ThemeIcon>
            <Text fw={700} size="xl" ta="center">
              Panduan Penggunaan
            </Text>
            <Text c="dimmed" ta="center" maw={480}>
              Dari install sampai inject ke production — semua ada di sini.
            </Text>
          </Stack>

          <Timeline active={-1} bulletSize={32} lineWidth={2} color="primary">
            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">1</Text>}
              title={<Text fw={700} size="sm">Login ke server</Text>}
            >
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Setelah install CLI, login sekali untuk menyimpan credentials ke config lokal. Token bisa dibuat di
                dashboard → Tokens.
              </Text>
              <Stack gap="xs">
                <CodeBlock
                  label="Login dan simpan config ke ~/.config/envman/config.json"
                  code={`envman login ${origin} --token <API_TOKEN>`}
                />
                <CodeBlock
                  label="Verifikasi login berhasil"
                  code={`envman whoami\n# → Logged in as user@example.com (ADMIN) at ${origin}`}
                />
              </Stack>
            </Timeline.Item>

            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">2</Text>}
              title={<Text fw={700} size="sm">Inject vars ke command</Text>}
            >
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Gunakan flag <Code fz="xs">-e project:environment</Code> untuk fetch vars dari server, lalu jalankan
                command apapun. Vars hanya ada di memori process — tidak ditulis ke file.
              </Text>
              <Stack gap="xs">
                <CodeBlock label="Inject ke satu environment" code={`envman -e myapp:production -- bun start`} />
                <CodeBlock
                  label="Gabungkan beberapa env (later overrides earlier)"
                  code={`envman -e myapp:base -e myapp:production -- bun dev`}
                />
                <CodeBlock
                  label="Mix server + local file (.env.local override production)"
                  code={`envman -e myapp:production -e .env.local -- bun dev`}
                />
                <CodeBlock
                  label="Server vars kalah dari system env (--server-wins membaliknya)"
                  code={`PORT=8080 envman -e myapp:production -- bun start\n# PORT=8080 (system wins by default)\n\nenvman --server-wins -e myapp:production -- bun start\n# PORT dari server (server wins)`}
                />
              </Stack>
            </Timeline.Item>

            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">3</Text>}
              title={<Text fw={700} size="sm">CI/CD tanpa login interaktif</Text>}
            >
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Di CI/CD, set <Code fz="xs">ENVMAN_SERVER</Code> dan <Code fz="xs">ENVMAN_TOKEN</Code> sebagai
                environment secrets. Tidak perlu <Code fz="xs">envman login</Code>.
              </Text>
              <Stack gap="xs">
                <CodeBlock
                  label="GitHub Actions"
                  code={`- name: Deploy\n  env:\n    ENVMAN_SERVER: ${origin}\n    ENVMAN_TOKEN: \${{ secrets.ENVMAN_TOKEN }}\n  run: envman -e myapp:production -- bun start`}
                />
                <CodeBlock
                  label="Shell / Docker"
                  code={`ENVMAN_SERVER=${origin} \\\nENVMAN_TOKEN=<TOKEN> \\\n  envman -e myapp:production -- bun start`}
                />
              </Stack>
            </Timeline.Item>

            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">4</Text>}
              title={<Text fw={700} size="sm">Auth dari local file</Text>}
            >
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Jika kamu punya file <Code fz="xs">-e</Code> yang juga berisi <Code fz="xs">ENVMAN_SERVER</Code> dan{' '}
                <Code fz="xs">ENVMAN_TOKEN</Code>, tidak perlu login sama sekali. Berguna untuk monorepo dengan auth
                berbeda per direktori.
              </Text>
              <Stack gap="xs">
                <CodeBlock
                  label="Isi .env.local (tidak perlu di-commit)"
                  code={`ENVMAN_SERVER=${origin}\nENVMAN_TOKEN=<TOKEN>\n# vars lokal lainnya...\nDEBUG=true`}
                />
                <CodeBlock
                  label="Jalankan — auth diambil dari .env.local"
                  code={`envman -e .env.local -e myapp:production -- bun dev`}
                />
              </Stack>
            </Timeline.Item>

            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">5</Text>}
              title={<Text fw={700} size="sm">Aliases — simpan perintah panjang</Text>}
            >
              <Text size="sm" c="dimmed" mb="sm" mt={4}>
                Buat alias di dashboard → project → tab <Code fz="xs">Aliases</Code>. Jalankan dengan{' '}
                <Code fz="xs">envman run project:alias</Code>. Bisa tambah extra source dan passthrough args.
              </Text>
              <Stack gap="xs">
                <CodeBlock label="Jalankan alias" code={`envman run myapp:deploy`} />
                <CodeBlock
                  label="Alias + extra source + passthrough args"
                  code={`envman run -e .env.local myapp:deploy --dry-run`}
                />
                <CodeBlock
                  label="Project Files — eksekusi script dari server (tanpa -e, slug embedded)"
                  code={`envman -- bash myapp:scripts/migrate.sh\nenvman -- bun myapp:ts-utils/seed.ts\nenvman -e myapp:production -- bash myapp:scripts/deploy.sh`}
                />
              </Stack>
            </Timeline.Item>

            <Timeline.Item
              bullet={<Text fw={800} size="sm" c="white">6</Text>}
              title={<Text fw={700} size="sm">Logout</Text>}
            >
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
        style={{
          background: 'linear-gradient(180deg, var(--mantine-color-dark-7) 0%, var(--mantine-color-dark-8) 100%)',
          borderTop: '1px solid var(--mantine-color-dark-5)',
          borderBottom: '1px solid var(--mantine-color-dark-5)',
        }}
        py="xl"
      >
        <Container size="md">
          <Stack gap="md">
            <Group gap="xs">
              <ThemeIcon size={22} variant="light" color="primary" radius="sm">
                <TbCode size={12} />
              </ThemeIcon>
              <Text fw={600} size="sm" c="gray.3">
                CLI Cheatsheet
              </Text>
            </Group>
            <pre
              style={{
                fontSize: 13,
                lineHeight: 1.75,
                background: '#0d0d0d',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                padding: '16px 20px',
                margin: 0,
                overflowX: 'auto',
                color: '#c9d1d9',
                fontFamily: "'Courier New', Courier, monospace",
                whiteSpace: 'pre',
              }}
            >
              {`# Auth\nenvman login ${origin} --token <TOKEN>   # simpan config\nenvman logout                             # hapus config\nenvman whoami                             # cek status login\nenvman update                             # update CLI ke versi terbaru\n\n# Inject env vars\nenvman -e myapp:production -- <command>\nenvman -e myapp:base -e myapp:production -- <command>   # later overrides\nenvman -e myapp:production -e .env.local -- <command>   # mix server + local\nENVMAN_SERVER=${origin} ENVMAN_TOKEN=<t> \\\n  envman -e myapp:production -- <command>                # CI/CD tanpa login\n\n# Aliases — simpan perintah panjang\nenvman run myapp:deploy                  # expand alias dan eksekusi\nenvman run -e .env myapp:deploy          # tambah source ekstra\nenvman run myapp:deploy --flag arg       # passthrough args ke command\n\n# Project Files — eksekusi script dari server (zero disk write)\nenvman -- bash myapp:scripts/deploy.sh         # slug:path, tanpa -e\nenvman -- bun myapp:utils/seed.ts              # slug:file.ts\nenvman -e myapp:production -- bash myapp:scripts/deploy.sh  # + inject env vars\n\n# Process Manager (POSIX: Linux + macOS)\nenvman pm daemon start               # start supervisor daemon\nenvman pm start --name api -- bun index.js   # start managed process\nenvman pm start --name api -s myapp:prod -- bun index.js  # + env sync\nenvman pm ls                         # list semua proses\nenvman pm logs api -f                # tail logs live\nenvman pm stop|restart|delete api   # lifecycle\n\n# MCP server (Claude Code + AI agents)\nenvman mcp                           # readonly (15 tools)\nenvman mcp --write                   # + write tools (var_set, pm_start, dll)\n\n# Flag\n--server-wins    system env menang vs merged vars (default: merged wins)`}
            </pre>
          </Stack>
        </Container>
      </Box>
    </>
  )
}
