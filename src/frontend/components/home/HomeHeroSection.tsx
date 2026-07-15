import { Badge, Box, Button, Container, CopyButton, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { TbBrandGithub, TbCheck, TbCopy, TbLock, TbServer, TbShieldLock, TbTerminal2 } from 'react-icons/tb'
import { Cmd, Comment, MockTerminal, Out } from './MockTerminal'

interface HomeHeroSectionProps {
  versionData?: { version: string }
  loginRoute: string
}

const INSTALL = 'curl -fsSL https://your-server/install | sh'

export function HomeHeroSection({ versionData, loginRoute }: HomeHeroSectionProps) {
  return (
    <Box style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Soft gradient glow behind the hero (decorative, theme-safe via light vars). */}
      <Box
        aria-hidden
        style={{
          position: 'absolute',
          top: -160,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 900,
          height: 500,
          background: 'radial-gradient(closest-side, var(--mantine-color-violet-light) 0%, transparent 70%)',
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />
      <Container size="lg" py={{ base: 56, md: 90 }} style={{ position: 'relative' }}>
        <Group align="center" gap={48} wrap="wrap" justify="space-between">
          {/* ─── Left: message ─── */}
          <Stack gap="lg" style={{ flex: '1 1 440px', minWidth: 300 }}>
            <Badge variant="dot" color="primary" size="lg" radius="sm" style={{ alignSelf: 'flex-start' }}>
              Self-Hosted · Open Source · Encrypted
            </Badge>

            <Title
              order={1}
              fw={800}
              style={{ fontSize: 'clamp(2.2rem, 5.2vw, 3.6rem)', lineHeight: 1.08, letterSpacing: '-0.03em' }}
            >
              Own your{' '}
              <Text component="span" variant="gradient" inherit>
                secrets.
              </Text>
              <br />
              Ship them everywhere.
            </Title>

            <Text size="lg" c="dimmed" lh={1.65} maw={520}>
              Manajer environment variable <strong>self-hosted</strong> dengan enkripsi end-to-end. Ganti berkas{' '}
              <code>.env</code> yang berserakan dengan satu sumber kebenaran — lalu inject ke runtime lewat CLI, tanpa
              mengubah kode.
            </Text>

            <Group gap="sm">
              <Button
                component={Link}
                to={loginRoute}
                size="md"
                variant="gradient"
                leftSection={<TbShieldLock size={17} />}
              >
                Start self-hosting
              </Button>
              <Button component={Link} to="/docs" size="md" variant="default" leftSection={<TbTerminal2 size={17} />}>
                Read the docs
              </Button>
            </Group>

            {/* Install one-liner with copy */}
            <Box maw={520}>
              <Group
                gap={0}
                wrap="nowrap"
                style={{
                  background: 'var(--mantine-color-dark-8)',
                  border: '1px solid var(--mantine-color-dark-4)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    padding: '9px 14px',
                    fontFamily: 'monospace',
                    fontSize: 12.5,
                    color: '#c9d1d9',
                    whiteSpace: 'nowrap',
                    overflowX: 'auto',
                  }}
                >
                  <Text component="span" c="dimmed">
                    ${' '}
                  </Text>
                  {INSTALL}
                </Text>
                <CopyButton value={INSTALL}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Tersalin!' : 'Copy'}>
                      <Button
                        variant="subtle"
                        color={copied ? 'teal' : 'gray'}
                        h={38}
                        px={12}
                        radius={0}
                        onClick={copy}
                      >
                        {copied ? <TbCheck size={15} /> : <TbCopy size={15} />}
                      </Button>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            </Box>

            <Group gap="lg" mt={4}>
              <Group gap={6}>
                <TbLock size={14} color="var(--mantine-color-teal-6)" />
                <Text size="xs" c="dimmed">
                  AES-256-GCM
                </Text>
              </Group>
              <Group gap={6}>
                <TbServer size={14} color="var(--mantine-color-blue-6)" />
                <Text size="xs" c="dimmed">
                  Data milikmu
                </Text>
              </Group>
              <Group gap={6}>
                <TbBrandGithub size={14} />
                <Text size="xs" c="dimmed">
                  Zero telemetry
                </Text>
              </Group>
            </Group>
          </Stack>

          {/* ─── Right: terminal preview ─── */}
          <Box style={{ flex: '1 1 380px', minWidth: 300, maxWidth: 520 }}>
            <MockTerminal title="envman — ~/apps/web" minH={230}>
              <Comment>login sekali, pakai di mana saja</Comment>
              <Cmd>envman login https://env.acme.dev --token ****</Cmd>
              <Out color="#28c840">✓ Logged in as you@acme.dev</Out>
              <Box h={10} />
              <Comment>jalankan app dengan env prod — tanpa .env di disk</Comment>
              <Cmd>envman -e web:prod -- bun run start</Cmd>
              <Out>→ 24 vars injected (6 encrypted)</Out>
              <Out color="#7c5cff">▸ server listening on :3000</Out>
              <Box h={10} />
              <Comment>tarik ke .env kapan pun</Comment>
              <Cmd>envman env pull web:prod &gt; .env</Cmd>
            </MockTerminal>
            {versionData?.version && (
              <Text ta="center" size="xs" c="dimmed" mt={8}>
                CLI v{versionData.version} · Linux · macOS · Windows
              </Text>
            )}
          </Box>
        </Group>
      </Container>
    </Box>
  )
}
