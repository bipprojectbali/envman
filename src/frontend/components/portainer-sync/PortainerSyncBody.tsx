import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Code,
  Divider,
  Group,
  Loader,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { Link } from '@tanstack/react-router'
import {
  TbAlertTriangle,
  TbCheck,
  TbChevronRight,
  TbCloudUpload,
  TbExternalLink,
  TbFileText,
  TbHistory,
  TbServer,
  TbTerminal2,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import type { ContainerInfo, ExecContainer, OpState, PortainerConfig } from './types'
import { relativeTime, stateColor } from './types'

interface Props {
  config: PortainerConfig
  containers: ContainerInfo[]
  statusFetching: boolean
  activeOp: OpState | null
  elapsed: number
  canEdit: boolean
  secretCount: number
  displayUrl: string
  syncStatus: 'success' | 'failed' | 'never'
  onOpenLogs: (containerId: string) => void
  onOpenExec: (container: ExecContainer) => void
  onDismissOp: () => void
  onToggleAutoSync: (value: boolean) => void
  onRemoveTarget: (targetId: string) => void
}

export function PortainerSyncBody({
  config, containers, statusFetching, activeOp, elapsed, canEdit, secretCount,
  displayUrl, syncStatus, onOpenLogs, onOpenExec, onDismissOp, onToggleAutoSync, onRemoveTarget,
}: Props) {
  return (
    <Stack gap="sm" p="sm">
      {/* Stats: Last sync + links */}
      <Group gap="xs" wrap="wrap" justify="space-between" align="flex-start">
        <Group gap="lg" wrap="wrap">
          <Box>
            <Text size="xs" c="dimmed" fw={500} mb={2}>Last Sync</Text>
            <Group gap={4}>
              <TbHistory size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
              <Text size="xs" fw={600}>{config.lastSyncAt ? relativeTime(config.lastSyncAt) : '—'}</Text>
            </Group>
          </Box>
          <Box>
            <Text size="xs" c="dimmed" fw={500} mb={2}>Stack</Text>
            <Text size="xs" fw={600} ff="monospace">{config.stackName}</Text>
          </Box>
          {config.connectionName && (
            <Box>
              <Text size="xs" c="dimmed" fw={500} mb={2}>Connection</Text>
              <Text size="xs" fw={600}>{config.connectionName}</Text>
            </Box>
          )}
        </Group>
        <Group gap="sm" wrap="wrap">
          <Anchor size="xs" href={`${displayUrl}#!/${config.endpointId}/docker/stacks/${config.stackId}`} target="_blank" rel="noreferrer">
            <Group gap={4} wrap="nowrap">
              <TbExternalLink size={12} />
              <Text size="xs">Portainer</Text>
            </Group>
          </Anchor>
          {config.connectionId && (
            <Anchor size="xs" component={Link} to="/envmanager/connections/$id" params={{ id: config.connectionId } as never}>
              <Group gap={4} wrap="nowrap">
                <TbServer size={12} />
                <Text size="xs">Connection</Text>
                <TbChevronRight size={10} />
              </Group>
            </Anchor>
          )}
        </Group>
      </Group>

      {/* Active operation banner */}
      {activeOp && (
        <Box p="xs" style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: `1px solid ${activeOp.error ? 'var(--mantine-color-red-4)' : activeOp.done ? 'var(--mantine-color-teal-4)' : 'var(--mantine-color-blue-4)'}`,
          background: activeOp.error ? 'var(--mantine-color-red-light)' : activeOp.done ? 'var(--mantine-color-teal-light)' : 'var(--mantine-color-blue-light)',
        }}>
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Group gap="xs" style={{ minWidth: 0 }}>
              <ThemeIcon size={26} radius="md" variant="light" color={activeOp.error ? 'red' : activeOp.done ? 'teal' : 'blue'} style={{ flexShrink: 0 }}>
                {!activeOp.done ? <Loader size={12} color="blue" /> : activeOp.error ? <TbAlertTriangle size={13} /> : <TbCheck size={13} />}
              </ThemeIcon>
              <Box style={{ minWidth: 0 }}>
                <Group gap="xs" mb={2}>
                  <Badge size="xs" variant="filled" color={activeOp.error ? 'red' : activeOp.done ? 'teal' : 'blue'}>
                    {activeOp.type === 'repull' ? 'Repull' : 'Recreate'}
                  </Badge>
                  {!activeOp.done && <Text fz={10} c="dimmed">{elapsed}s</Text>}
                </Group>
                <Text size="xs" fw={500} c={activeOp.error ? 'red' : undefined} truncate>{activeOp.step}</Text>
                {!activeOp.done && (
                  <Text fz={10} c="dimmed" mt={2}>
                    {activeOp.type === 'repull' ? 'Portainer sedang pull image dan restart container...' : 'Portainer sedang stop dan start ulang container...'}
                  </Text>
                )}
              </Box>
            </Group>
            {activeOp.done && (
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={onDismissOp}><TbX size={12} /></ActionIcon>
            )}
          </Group>
        </Box>
      )}

      {/* Containers */}
      <Divider
        label={
          <Group gap="xs">
            <TbServer size={12} />
            <Text size="xs" c="dimmed" fw={500}>Containers</Text>
            {statusFetching && <Loader size={10} />}
            {!statusFetching && containers.length > 0 && <Badge size="xs" variant="light" color="gray">{containers.length}</Badge>}
          </Group>
        }
        labelPosition="left"
      />

      {statusFetching && containers.length === 0 ? (
        <Group gap="xs" py="xs">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">Memuat containers...</Text>
        </Group>
      ) : !config.connectionId ? (
        <Text size="xs" c="dimmed" py={4}>Connection tidak terkonfigurasi.</Text>
      ) : containers.length === 0 && !statusFetching ? (
        <Text size="xs" c="dimmed" py={4}>Tidak ada container ditemukan di stack ini.</Text>
      ) : (
        <Stack gap="xs">
          {containers.map((c) => (
            <Box key={c.id} p="xs" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', cursor: 'pointer' }}
              onClick={() => onOpenLogs(c.id)}>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Group gap="xs" style={{ minWidth: 0, flex: 1 }} wrap="nowrap">
                  <ThemeIcon size={28} radius="md" variant="light" color={stateColor[c.state] ?? 'gray'} style={{ flexShrink: 0 }}>
                    <TbServer size={13} />
                  </ThemeIcon>
                  <Box style={{ minWidth: 0 }}>
                    <Text size="xs" fw={600} truncate>{c.names[0]}</Text>
                    <Group gap={6} mt={2} wrap="nowrap">
                      <Code fz={10} c="dimmed">{c.shortId}</Code>
                      <Text fz={10} c="dimmed" truncate style={{ maxWidth: 140 }}>{c.image.split('/').pop()}</Text>
                    </Group>
                  </Box>
                </Group>
                <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                  <Badge size="xs" color={stateColor[c.state] ?? 'gray'} variant="light">{c.state}</Badge>
                  {c.ports.length > 0 && <Code fz={10}>{c.ports[0]}</Code>}
                  <Tooltip label="Lihat logs">
                    <ActionIcon size="sm" variant="subtle" color="gray"
                      onClick={(e) => { e.stopPropagation(); onOpenLogs(c.id) }}>
                      <TbFileText size={13} />
                    </ActionIcon>
                  </Tooltip>
                  {canEdit && (
                    <Tooltip label="Exec command">
                      <ActionIcon size="sm" variant="subtle" color="teal"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenExec({ containerId: c.id, endpointId: config.endpointId, containerName: c.names[0] })
                        }}>
                        <TbTerminal2 size={13} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
            </Box>
          ))}
        </Stack>
      )}

      {/* Auto-sync */}
      {canEdit && (
        <Box p="xs" style={{ borderRadius: 'var(--mantine-radius-md)', background: 'var(--mantine-color-default-hover)' }}>
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Box style={{ minWidth: 0 }}>
              <Text size="xs" fw={600} mb={2}>Auto-sync</Text>
              <Text size="xs" c="dimmed">Sync otomatis ke Portainer setiap kali vars disimpan</Text>
              {config.autoSync && secretCount > 0 && (
                <Text size="xs" c="orange" mt={2}>Secret vars akan di-decrypt setiap save</Text>
              )}
            </Box>
            <Switch checked={config.autoSync ?? false} onChange={(e) => onToggleAutoSync(e.currentTarget.checked)} size="sm" style={{ flexShrink: 0 }} />
          </Group>
        </Box>
      )}

      {/* Additional stack targets */}
      {config.additionalTargets && config.additionalTargets.length > 0 && (
        <>
          <Divider label={<Text size="xs" c="dimmed">Stack tambahan</Text>} labelPosition="left" />
          <Stack gap="xs">
            {config.additionalTargets.map((t) => (
              <Box key={t.id} p="xs" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Group gap="xs" wrap="wrap" style={{ minWidth: 0 }}>
                    <Badge size="xs" variant="outline" color="gray">ep#{t.endpointId}</Badge>
                    <Text size="xs" fw={500} ff="monospace">{t.stackName}</Text>
                    {t.label && <Text size="xs" c="dimmed">({t.label})</Text>}
                  </Group>
                  {canEdit && (
                    <ActionIcon size="xs" variant="subtle" color="red" style={{ flexShrink: 0 }} onClick={() => onRemoveTarget(t.id)}>
                      <TbTrash size={12} />
                    </ActionIcon>
                  )}
                </Group>
              </Box>
            ))}
          </Stack>
        </>
      )}

      {/* Alerts */}
      {syncStatus === 'never' && (
        <Alert color="blue" icon={<TbCloudUpload size={14} />} p="xs" radius="md">
          <Text size="xs" fw={500} mb={2}>Belum pernah disync</Text>
          <Text size="xs" c="dimmed">Klik <strong>Sync Vars</strong> untuk pertama kali push env vars ke stack Portainer.</Text>
        </Alert>
      )}
      {syncStatus === 'failed' && (
        <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs" radius="md">
          <Text size="xs" fw={500} mb={2}>Sync terakhir gagal</Text>
          <Text size="xs" c="dimmed">Periksa koneksi ke Portainer dan pastikan stack masih aktif, lalu coba sync ulang.</Text>
        </Alert>
      )}
    </Stack>
  )
}
