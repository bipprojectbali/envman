import { Box, Container, Group, Text } from '@mantine/core'
import { TbBrandDocker, TbBrandGolang, TbDatabase, TbLeaf } from 'react-icons/tb'

// Names + icons for the tech envman runs on / integrates with. Text labels keep
// it copyright-safe (no third-party logos).
const TECH = [
  { icon: TbLeaf, label: 'Bun' },
  { icon: TbBrandGolang, label: 'Go CLI' },
  { icon: TbBrandDocker, label: 'Docker' },
  { icon: TbBrandDocker, label: 'Portainer' },
  { icon: TbDatabase, label: 'PostgreSQL' },
  { icon: TbDatabase, label: 'MinIO' },
  { icon: TbDatabase, label: 'Redis' },
]

export function IntegrationsStrip() {
  return (
    <Container size="lg" py={{ base: 40, md: 56 }}>
      <Text ta="center" size="xs" c="dimmed" tt="uppercase" fw={600} mb="lg" style={{ letterSpacing: '0.08em' }}>
        Berjalan di stack yang kamu percaya
      </Text>
      <Group justify="center" gap={40} wrap="wrap">
        {TECH.map((t, i) => (
          <Group key={`${t.label}-${i}`} gap={8} wrap="nowrap" style={{ opacity: 0.75 }}>
            <t.icon size={20} color="var(--mantine-color-dimmed)" />
            <Text size="sm" fw={600} c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {t.label}
            </Text>
          </Group>
        ))}
      </Group>
    </Container>
  )
}
