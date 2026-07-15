import { Badge, Box, Button, Container, Divider, Group, Stack, Tabs, Text, ThemeIcon } from '@mantine/core'
import { TbBrandWindows, TbDownload, TbTerminal } from 'react-icons/tb'
import { CodeBlock } from '@/frontend/components/home/CodeBlock'

interface Props {
  versionData?: { version: string }
  origin: string
}

export function InstallSection({ versionData, origin }: Props) {
  const installCmds: Record<string, string> = {
    'linux-x64': `curl --compressed -fsSL ${origin}/download/cli/linux-x64 -o envman\nchmod +x envman && sudo mv envman /usr/local/bin/\nenvman --version`,
    'linux-arm64': `curl --compressed -fsSL ${origin}/download/cli/linux-arm64 -o envman\nchmod +x envman && sudo mv envman /usr/local/bin/\nenvman --version`,
    'darwin-arm64': `curl --compressed -fsSL ${origin}/download/cli/darwin-arm64 -o envman\nchmod +x envman && sudo mv envman /usr/local/bin/\nenvman --version`,
    'darwin-x64': `curl --compressed -fsSL ${origin}/download/cli/darwin-x64 -o envman\nchmod +x envman && sudo mv envman /usr/local/bin/\nenvman --version`,
    'windows-x64': `# PowerShell\nInvoke-WebRequest -Uri "${origin}/download/cli/windows-x64" \`\n  -OutFile "envman.exe"\n\n# Atau dengan curl (Windows 10+)\ncurl -L ${origin}/download/cli/windows-x64 -o envman.exe`,
  }

  return (
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
  )
}
