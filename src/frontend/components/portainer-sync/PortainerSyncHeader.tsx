import { ActionIcon, Badge, Box, Button, Group, Loader, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import {
  TbAlertTriangle,
  TbCheck,
  TbCloud,
  TbCloudUpload,
  TbCode,
  TbPencil,
  TbPlug,
  TbRefresh,
  TbRefreshDot,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import type { PortainerConfig } from './types'

interface PortainerSyncHeaderProps {
  config: PortainerConfig
  syncStatus: 'success' | 'failed' | 'never'
  syncError: Error | null
  syncPending: boolean
  repullPending: boolean
  recreatePending: boolean
  canEdit: boolean
  onSetupOpen: (mode: 'edit') => void
  onDeleteConfig: () => void
  onOpenDiff: () => void
  onConfirmSync: () => void
  onConfirmRepull: () => void
  onConfirmRecreate: () => void
  onOpenCompose: () => void
}

export function PortainerSyncHeader({
  config,
  syncStatus,
  syncError,
  syncPending,
  repullPending,
  recreatePending,
  canEdit,
  onSetupOpen,
  onDeleteConfig,
  onOpenDiff,
  onConfirmSync,
  onConfirmRepull,
  onConfirmRecreate,
  onOpenCompose,
}: PortainerSyncHeaderProps) {
  return (
    <Stack gap="xs" p="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Group gap="xs" style={{ minWidth: 0, flex: 1 }} wrap="nowrap">
          <ThemeIcon
            size={32}
            radius="md"
            variant="light"
            color={syncStatus === 'failed' ? 'red' : syncStatus === 'success' ? 'teal' : 'gray'}
            style={{ flexShrink: 0 }}
          >
            <TbCloud size={15} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="sm" truncate>
              {config.stackName}
            </Text>
            <Group gap={4} wrap="wrap" mt={2}>
              {config.connectionName && (
                <>
                  <Text size="xs" c="dimmed">
                    {config.connectionName}
                  </Text>
                  <Text size="xs" c="dimmed">
                    ·
                  </Text>
                </>
              )}
              <Text size="xs" c="dimmed">
                ep#{config.endpointId}
              </Text>
              <Text size="xs" c="dimmed">
                ·
              </Text>
              <Text size="xs" c="dimmed">
                stack#{config.stackId}
              </Text>
            </Group>
          </Box>
        </Group>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }} align="center">
          {syncStatus === 'success' && (
            <Badge size="xs" color="teal" variant="light" leftSection={<TbCheck size={9} />}>
              synced
            </Badge>
          )}
          {syncStatus === 'failed' && (
            <Badge size="xs" color="red" variant="light" leftSection={<TbX size={9} />}>
              failed
            </Badge>
          )}
          {syncStatus === 'never' && (
            <Badge size="xs" color="gray" variant="outline">
              belum sync
            </Badge>
          )}
          {syncError && (
            <Tooltip label={syncError.message} position="left" multiline maw={260}>
              <TbAlertTriangle size={14} style={{ color: 'var(--mantine-color-red-5)', cursor: 'help' }} />
            </Tooltip>
          )}
          {canEdit && (
            <>
              <Tooltip label="Edit konfigurasi">
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => onSetupOpen('edit')}>
                  <TbPencil size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus koneksi">
                <ActionIcon size="sm" variant="subtle" color="red" onClick={onDeleteConfig}>
                  <TbTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Group>

      {canEdit && (
        <Group gap="xs" wrap="wrap">
          <Button size="xs" variant="subtle" color="gray" leftSection={<TbPlug size={12} />} onClick={onOpenDiff}>
            Diff
          </Button>
          <Tooltip label="Pull image terbaru & restart container">
            <Button
              size="xs"
              variant="light"
              color="blue"
              leftSection={<TbRefreshDot size={12} />}
              loading={repullPending}
              disabled={!config?.connectionId}
              onClick={onConfirmRepull}
            >
              Repull
            </Button>
          </Tooltip>
          <Tooltip label="Stop → start ulang container (tanpa pull)">
            <Button
              size="xs"
              variant="light"
              color="orange"
              leftSection={<TbRefresh size={12} />}
              loading={recreatePending}
              disabled={!config?.connectionId}
              onClick={onConfirmRecreate}
            >
              Recreate
            </Button>
          </Tooltip>
          {!!config?.connectionId && (
            <Tooltip label="Edit compose file">
              <Button size="xs" variant="light" color="violet" leftSection={<TbCode size={12} />} onClick={onOpenCompose}>
                Compose
              </Button>
            </Tooltip>
          )}
          <Button
            size="xs"
            color="primary"
            variant={syncPending ? 'filled' : 'light'}
            leftSection={syncPending ? <Loader size={10} color="white" /> : <TbCloudUpload size={12} />}
            onClick={onConfirmSync}
            loading={syncPending}
          >
            Sync Vars
          </Button>
        </Group>
      )}
    </Stack>
  )
}

