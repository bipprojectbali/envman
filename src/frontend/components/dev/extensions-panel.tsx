import { Badge, Box, Container, Group, Paper, Stack, Switch, Text, ThemeIcon, Title } from '@mantine/core'
import { TbPlugConnected, TbPlugOff } from 'react-icons/tb'
import { notifyErr } from '@/frontend/lib/notify'
import { useExtensions, useUpdateExtensions } from '@/frontend/hooks/useExtensions'

const EXTENSIONS_META = [
  {
    key: 'portainer' as const,
    label: 'Portainer',
    description: 'Integrasikan Portainer untuk sync env vars ke Docker stack dan exec container langsung dari dashboard.',
    icon: TbPlugConnected,
    color: 'cyan',
    links: [
      { label: 'Kelola connections', href: '/envmanager/connections' },
    ],
  },
]

export function ExtensionsPanel() {
  const { data: ext, isLoading } = useExtensions()
  const update = useUpdateExtensions()

  const toggle = (key: 'portainer', value: boolean) => {
    update.mutate({ [key]: value }, {
      onError: () => notifyErr('Gagal menyimpan pengaturan extension'),
    })
  }

  return (
    <Container size="md">
      <Stack gap="lg">
        <Box>
          <Title order={3} mb={4}>Extensions</Title>
          <Text size="sm" c="dimmed">Aktifkan atau nonaktifkan fitur tambahan. Perubahan berlaku untuk semua pengguna.</Text>
        </Box>

        <Stack gap="sm">
          {EXTENSIONS_META.map((ext_meta) => {
            const enabled = ext ? ext[ext_meta.key] : true
            const Icon = ext_meta.icon
            return (
              <Paper key={ext_meta.key} withBorder p="md" radius="md">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Group gap="md" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <ThemeIcon
                      size={44} radius="md"
                      variant={enabled ? 'light' : 'default'}
                      color={enabled ? ext_meta.color : 'gray'}
                    >
                      {enabled ? <Icon size={22} /> : <TbPlugOff size={22} />}
                    </ThemeIcon>
                    <Box style={{ minWidth: 0 }}>
                      <Group gap="xs" mb={4}>
                        <Text fw={600} size="sm">{ext_meta.label}</Text>
                        <Badge
                          size="xs"
                          variant="light"
                          color={enabled ? 'teal' : 'gray'}
                        >
                          {enabled ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                        {ext_meta.description}
                      </Text>
                      {enabled && ext_meta.links.length > 0 && (
                        <Group gap="xs" mt={6}>
                          {ext_meta.links.map((link) => (
                            <Text
                              key={link.href}
                              component="a"
                              href={link.href}
                              size="xs"
                              c={ext_meta.color}
                              style={{ textDecoration: 'underline', cursor: 'pointer' }}
                            >
                              {link.label}
                            </Text>
                          ))}
                        </Group>
                      )}
                    </Box>
                  </Group>
                  <Switch
                    checked={enabled}
                    onChange={(e) => toggle(ext_meta.key, e.currentTarget.checked)}
                    disabled={isLoading || update.isPending}
                    color={ext_meta.color}
                    size="md"
                  />
                </Group>
              </Paper>
            )
          })}
        </Stack>
      </Stack>
    </Container>
  )
}
