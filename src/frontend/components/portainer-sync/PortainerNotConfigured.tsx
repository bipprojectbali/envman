import { Alert, Box, Button, Card, Group, Text, ThemeIcon } from '@mantine/core'
import { TbPlug, TbPlugConnected, TbPlugConnectedX, TbPlus, TbServer } from 'react-icons/tb'
import type { PortainerConnection } from './types'

interface Props {
  connections: PortainerConnection[]
  canEdit: boolean
  onSetupOpen: (mode: 'new' | 'edit') => void
}

export function PortainerNotConfigured({ connections, canEdit, onSetupOpen }: Props) {
  return (
    <Card>
      <Box p="md">
        <Group gap="sm">
          <ThemeIcon size={40} radius="md" variant="light" color="gray">
            <TbPlugConnectedX size={20} />
          </ThemeIcon>
          <Box>
            <Text fw={600} size="sm">Belum terhubung ke Portainer</Text>
            <Text size="xs" c="dimmed" mt={2}>
              {connections.length > 0
                ? `${connections.length} connection tersedia — hubungkan ke stack Portainer`
                : 'Belum ada Portainer connection yang dikonfigurasi'}
            </Text>
          </Box>
        </Group>
      </Box>
      <Box p="md">
        <Group gap="sm" mb="sm" wrap="wrap">
          <ThemeIcon size={16} variant="transparent" color="dimmed"><TbPlug size={13} /></ThemeIcon>
          <Text size="xs" c="dimmed" lh={1.6}>
            Hubungkan environment ke Portainer stack untuk bisa sync env vars langsung ke container.
            Perubahan vars akan diterapkan saat sync tanpa perlu deploy ulang manual.
          </Text>
        </Group>
        {connections.length === 0 ? (
          <Alert color="blue" icon={<TbServer size={14} />} p="sm" radius="md">
            <Text size="xs" fw={500} mb={4}>Belum ada Portainer connection</Text>
            <Text size="xs" c="dimmed">
              Tambah connection di halaman Connections terlebih dahulu, lalu kembali ke sini untuk menghubungkan ke stack.
            </Text>
          </Alert>
        ) : (
          <Box p="sm" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
            <Group gap="xs">
              <TbPlugConnected size={14} color="var(--mantine-color-primary)" />
              <Text size="xs" c="blue.7" fw={500}>{connections.length} connection siap digunakan</Text>
            </Group>
          </Box>
        )}
        {canEdit && (
          <Group gap="xs" mt="sm">
            {connections.length > 0 ? (
              <Button size="sm" color="primary" leftSection={<TbPlugConnected size={14} />} onClick={() => onSetupOpen('new')}>
                Hubungkan ke Stack
              </Button>
            ) : (
              <Button size="sm" variant="light" color="gray" leftSection={<TbPlus size={14} />} component="a" href="/envmanager/connections">
                Tambah Connection
              </Button>
            )}
            {connections.length > 0 && (
              <Button size="sm" variant="subtle" color="gray" component="a" href="/envmanager/connections" leftSection={<TbServer size={14} />}>
                Kelola Connections
              </Button>
            )}
          </Group>
        )}
      </Box>
    </Card>
  )
}
