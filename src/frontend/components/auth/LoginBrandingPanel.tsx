import { Box, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { TbCode, TbServer, TbShield, TbUsers, TbVariable } from 'react-icons/tb'

const features = [
  { icon: TbShield, label: 'Encrypted at Rest', desc: 'AES-256-GCM untuk semua secret vars' },
  { icon: TbCode, label: 'Runtime Injection', desc: 'envman -e app:prod -- bun start' },
  { icon: TbUsers, label: 'Team Access Control', desc: 'Owner · Editor · Viewer per project' },
  { icon: TbServer, label: 'Self-Hosted', desc: 'Data 100% di server milikmu sendiri' },
]

export function LoginBrandingPanel() {
  return (
    <Box
      visibleFrom="md"
      style={{
        width: '45%',
        background: 'linear-gradient(145deg, var(--mantine-color-violet-9) 0%, var(--mantine-color-grape-8) 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '56px 48px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
      <Box style={{ position: 'absolute', bottom: -60, left: -60, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

      <Box style={{ position: 'relative', zIndex: 1 }}>
        <ThemeIcon size={56} variant="white" radius="xl" mb="xl" style={{ color: 'var(--mantine-color-violet-7)' }}>
          <TbVariable size={28} />
        </ThemeIcon>

        <Text component="h1" c="white" fw={800} mb="xs" style={{ fontSize: 32, lineHeight: 1.2, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
          Environment variables,{' '}
          <Text component="span" c="rgba(255,255,255,0.7)" inherit>
            terkelola rapi.
          </Text>
        </Text>

        <Text c="rgba(255,255,255,0.65)" mb="xl" size="sm" lh={1.7}>
          Satu tempat untuk semua env vars tim kamu. Terenkripsi, ter-scope, siap inject ke runtime.
        </Text>

        <Stack gap="md">
          {features.map((f) => (
            <Group key={f.label} gap="sm">
              <ThemeIcon size={32} radius="md" variant="white" style={{ color: 'var(--mantine-color-violet-7)', flexShrink: 0 }}>
                <f.icon size={16} />
              </ThemeIcon>
              <Box>
                <Text size="sm" fw={600} c="white" lh={1.2}>{f.label}</Text>
                <Text size="xs" c="rgba(255,255,255,0.6)">{f.desc}</Text>
              </Box>
            </Group>
          ))}
        </Stack>
      </Box>
    </Box>
  )
}
