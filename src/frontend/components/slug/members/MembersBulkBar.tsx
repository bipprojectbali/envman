import { Box, Button, Group, Text } from '@mantine/core'
import { TbShieldLock, TbTrash, TbUserCheck } from 'react-icons/tb'

export function MembersBulkBar({
  count,
  onChangeRole,
  onSetEnvAccess,
  onDelete,
  busy,
}: {
  count: number
  onChangeRole: () => void
  onSetEnvAccess: () => void
  onDelete: () => void
  busy?: boolean
}) {
  if (count === 0) return null
  return (
    <Box
      p="xs"
      style={{
        position: 'sticky',
        bottom: 0,
        background: 'var(--mantine-color-body)',
        zIndex: 10,
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={600}>
          {count} dipilih
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="light"
            color="violet"
            leftSection={<TbUserCheck size={13} />}
            onClick={onChangeRole}
            disabled={busy}
          >
            Change role…
          </Button>
          <Button
            size="xs"
            variant="light"
            color="grape"
            leftSection={<TbShieldLock size={13} />}
            onClick={onSetEnvAccess}
            disabled={busy}
          >
            Set env access…
          </Button>
          <Button
            size="xs"
            variant="light"
            color="red"
            leftSection={<TbTrash size={13} />}
            onClick={onDelete}
            loading={busy}
          >
            Hapus
          </Button>
        </Group>
      </Group>
    </Box>
  )
}
