import { Box, Container, Group, Text } from '@mantine/core'
import { TbBrandGithub, TbDeviceDesktop, TbEyeOff, TbLock, TbServer, TbShieldCheck } from 'react-icons/tb'

const ITEMS = [
  { icon: TbLock, label: 'AES-256-GCM' },
  { icon: TbServer, label: 'Self-hosted' },
  { icon: TbBrandGithub, label: 'Open source' },
  { icon: TbEyeOff, label: 'Zero telemetry' },
  { icon: TbShieldCheck, label: 'Audit trail' },
  { icon: TbDeviceDesktop, label: '5 platform CLI' },
]

export function TrustStrip() {
  return (
    <Box
      style={{
        borderTop: '1px solid var(--mantine-color-default-border)',
        borderBottom: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-default-hover)',
      }}
    >
      <Container size="lg" py="md">
        <Group justify="center" gap={40} wrap="wrap">
          {ITEMS.map((it) => (
            <Group key={it.label} gap={7} wrap="nowrap">
              <it.icon size={15} color="var(--mantine-color-dimmed)" />
              <Text size="sm" c="dimmed" fw={500} style={{ whiteSpace: 'nowrap' }}>
                {it.label}
              </Text>
            </Group>
          ))}
        </Group>
      </Container>
    </Box>
  )
}
