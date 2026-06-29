import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Loader,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import {
  TbAlertTriangle,
  TbCheck,
  TbCloud,
  TbCloudUpload,
  TbCode,
  TbLock,
  TbPencil,
  TbPlug,
  TbRefresh,
  TbRefreshDot,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { useSession } from '../hooks/useAuth'
import { PortainerComposeModal } from './portainer-sync/PortainerComposeModal'
import { PortainerDiffModal } from './portainer-sync/PortainerDiffModal'
import { PortainerExecModal } from './portainer-sync/PortainerExecModal'
import { PortainerLogsModal } from './portainer-sync/PortainerLogsModal'
import { PortainerNotConfigured } from './portainer-sync/PortainerNotConfigured'
import { PortainerSyncBody } from './portainer-sync/PortainerSyncBody'
import type { ExecContainer, OpState, PortainerConfig, PortainerConnection } from './portainer-sync/types'
import { apiFetch } from './portainer-sync/types'

interface Props {
  slug: string
  env: string
  canEdit: boolean
  secretCount: number
  onSetupOpen: (mode: 'new' | 'edit') => void
}

export function PortainerSync({ slug, env, canEdit, secretCount, onSetupOpen }: Props) {
  const { data: session } = useSession()
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN'
  const qc = useQueryClient()

  // Op state — persisted in localStorage so it survives reload
  const opsKey = `envman:portainer-op:${slug}:${env}`
  const [activeOp, setActiveOp] = useState<OpState | null>(() => {
    try { const s = localStorage.getItem(opsKey); return s ? JSON.parse(s) : null } catch { return null }
  })
  const setOp = useCallback((op: OpState | null) => {
    setActiveOp(op)
    if (op) localStorage.setItem(opsKey, JSON.stringify(op))
    else localStorage.removeItem(opsKey)
  }, [opsKey])

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!activeOp || activeOp.done) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - activeOp.startedAt) / 1000)), 1000)
    return () => clearInterval(t)
  }, [activeOp])

  // Modal states
  const [diffOpen, { open: openDiff, close: closeDiff }] = useDisclosure(false)
  const [logsOpen, { open: openLogs, close: closeLogs }] = useDisclosure(false)
  const [logsInitialContainerId, setLogsInitialContainerId] = useState<string | null>(null)
  const [composeOpen, { open: openCompose, close: closeCompose }] = useDisclosure(false)
  const [execOpen, { open: openExec, close: closeExec }] = useDisclosure(false)
  const [execContainer, setExecContainer] = useState<ExecContainer | null>(null)

  // Queries
  const { data, isLoading } = useQuery({
    queryKey: ['portainer', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`),
  })
  const { data: connectionsData } = useQuery({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
  })
  const config: PortainerConfig | null = data?.config ?? null
  const connections: PortainerConnection[] = connectionsData?.connections ?? []

  const { data: statusData, isFetching: statusFetching } = useQuery({
    queryKey: ['portainer', 'env-status', slug, env, config?.connectionId, config?.stackId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/status`),
    enabled: !!config?.connectionId,
    refetchInterval: 30000,
    staleTime: 20000,
  })
  const containers = statusData?.containers ?? []

  // Mutations
  const sync = useMutation({
    mutationFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/sync`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const repull = useMutation({
    mutationFn: () => {
      setOp({ type: 'repull', startedAt: Date.now(), step: 'Pulling image terbaru...', done: false, error: null })
      return apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/repull`, { method: 'POST' })
    },
    onSuccess: () => {
      setOp({ type: 'repull', startedAt: activeOp?.startedAt ?? Date.now(), step: 'Selesai — container restart dengan image terbaru', done: true, error: null })
      qc.invalidateQueries({ queryKey: ['portainer', 'env-status', slug, env] })
      setTimeout(() => setOp(null), 8000)
    },
    onError: (e: Error) => setOp({ type: 'repull', startedAt: activeOp?.startedAt ?? Date.now(), step: e.message, done: true, error: e.message }),
  })

  const recreate = useMutation({
    mutationFn: () => {
      setOp({ type: 'recreate', startedAt: Date.now(), step: 'Menghentikan container...', done: false, error: null })
      return apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/recreate`, { method: 'POST' })
    },
    onSuccess: () => {
      setOp({ type: 'recreate', startedAt: activeOp?.startedAt ?? Date.now(), step: 'Selesai — container berhasil di-recreate', done: true, error: null })
      qc.invalidateQueries({ queryKey: ['portainer', 'env-status', slug, env] })
      setTimeout(() => setOp(null), 8000)
    },
    onError: (e: Error) => setOp({ type: 'recreate', startedAt: activeOp?.startedAt ?? Date.now(), step: e.message, done: true, error: e.message }),
  })

  const toggleAutoSync = useMutation({
    mutationFn: (autoSync: boolean) => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, { method: 'PATCH', body: JSON.stringify({ autoSync }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const removeTarget = useMutation({
    mutationFn: (targetId: string) => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, { method: 'PATCH', body: JSON.stringify({ removeTargetId: targetId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const deleteConfig = () =>
    modals.openConfirmModal({
      title: 'Hapus konfigurasi Portainer',
      children: <Text size="sm">Hapus konfigurasi Portainer untuk <strong>{env}</strong>?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, { method: 'DELETE' })
        .then(() => qc.invalidateQueries({ queryKey: ['portainer', slug, env] })),
    })

  const confirmSync = () =>
    modals.openConfirmModal({
      title: 'Sync vars ke Portainer',
      children: (
        <Stack gap="xs">
          <Text size="sm">Push semua vars <strong>{slug}:{env}</strong> ke stack <strong>{config?.stackName}</strong>?</Text>
          {secretCount > 0 && (
            <Alert color="red" icon={<TbLock size={14} />} p="xs">
              <Text size="xs" fw={600} mb={2}>{secretCount} secret var akan di-decrypt</Text>
              <Text size="xs" c="dimmed">Nilai dikirim sebagai plaintext dan tersimpan di <Code fz="xs">stack.env</Code>.</Text>
            </Alert>
          )}
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Semua env vars di stack akan diganti dan mungkin trigger redeploy container.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Sync sekarang', cancel: 'Batal' },
      confirmProps: { color: 'violet' },
      onConfirm: () => sync.mutate(),
    })

  const confirmRepull = () =>
    modals.openConfirmModal({
      title: `Repull — ${config?.stackName}`,
      children: (
        <Stack gap="xs">
          <Text size="sm">Pull image terbaru untuk stack <strong>{config?.stackName}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Setara <Code fz="xs">docker compose pull && up -d</Code>. Container akan restart.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Repull & Restart', cancel: 'Batal' },
      confirmProps: { color: 'blue' },
      onConfirm: () => repull.mutate(),
    })

  const confirmRecreate = () =>
    modals.openConfirmModal({
      title: `Force Recreate — ${config?.stackName}`,
      children: (
        <Stack gap="xs">
          <Text size="sm">Stop dan start ulang container di stack <strong>{config?.stackName}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Image tidak di-pull ulang. Setara <Code fz="xs">docker compose stop && up -d</Code>.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Recreate', cancel: 'Batal' },
      confirmProps: { color: 'orange' },
      onConfirm: () => recreate.mutate(),
    })

  if (isLoading) return null

  const syncStatus = config?.lastSyncOk === true ? 'success' : config?.lastSyncOk === false ? 'failed' : 'never'
  const displayUrl = config?.portainerUrl ?? ''

  const handleOpenLogs = (containerId: string) => {
    setLogsInitialContainerId(containerId)
    openLogs()
  }
  const handleOpenExec = (container: ExecContainer) => {
    setExecContainer(container)
    openExec()
  }

  return (
    <>
      {!config ? (
        <PortainerNotConfigured connections={connections} canEdit={canEdit} onSetupOpen={onSetupOpen} />
      ) : (
        <Box style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)', overflow: 'hidden' }}>
          {/* ── Header ── */}
          <Stack gap="xs" p="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Group gap="xs" style={{ minWidth: 0, flex: 1 }} wrap="nowrap">
                <ThemeIcon size={32} radius="md" variant="light" color={syncStatus === 'failed' ? 'red' : syncStatus === 'success' ? 'teal' : 'gray'} style={{ flexShrink: 0 }}>
                  <TbCloud size={15} />
                </ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                  <Text fw={700} size="sm" truncate>{config.stackName}</Text>
                  <Group gap={4} wrap="wrap" mt={2}>
                    {config.connectionName && (<><Text size="xs" c="dimmed">{config.connectionName}</Text><Text size="xs" c="dimmed">·</Text></>)}
                    <Text size="xs" c="dimmed">ep#{config.endpointId}</Text>
                    <Text size="xs" c="dimmed">·</Text>
                    <Text size="xs" c="dimmed">stack#{config.stackId}</Text>
                  </Group>
                </Box>
              </Group>
              <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }} align="center">
                {syncStatus === 'success' && <Badge size="xs" color="teal" variant="light" leftSection={<TbCheck size={9} />}>synced</Badge>}
                {syncStatus === 'failed' && <Badge size="xs" color="red" variant="light" leftSection={<TbX size={9} />}>failed</Badge>}
                {syncStatus === 'never' && <Badge size="xs" color="gray" variant="outline">belum sync</Badge>}
                {sync.isError && (
                  <Tooltip label={(sync.error as Error).message} position="left" multiline maw={260}>
                    <TbAlertTriangle size={14} style={{ color: 'var(--mantine-color-red-5)', cursor: 'help' }} />
                  </Tooltip>
                )}
                {canEdit && (
                  <>
                    <Tooltip label="Edit konfigurasi">
                      <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => onSetupOpen('edit')}><TbPencil size={13} /></ActionIcon>
                    </Tooltip>
                    <Tooltip label="Hapus koneksi">
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={deleteConfig}><TbTrash size={13} /></ActionIcon>
                    </Tooltip>
                  </>
                )}
              </Group>
            </Group>

            {canEdit && (
              <Group gap="xs" wrap="wrap">
                <Button size="xs" variant="subtle" color="gray" leftSection={<TbPlug size={12} />} onClick={() => openDiff()}>Diff</Button>
                <Tooltip label="Pull image terbaru & restart container">
                  <Button size="xs" variant="light" color="blue" leftSection={<TbRefreshDot size={12} />} loading={repull.isPending} disabled={!config?.connectionId} onClick={confirmRepull}>Repull</Button>
                </Tooltip>
                <Tooltip label="Stop → start ulang container (tanpa pull)">
                  <Button size="xs" variant="light" color="orange" leftSection={<TbRefresh size={12} />} loading={recreate.isPending} disabled={!config?.connectionId} onClick={confirmRecreate}>Recreate</Button>
                </Tooltip>
                {!!config?.connectionId && (
                  <Tooltip label="Edit compose file">
                    <Button size="xs" variant="light" color="violet" leftSection={<TbCode size={12} />} onClick={openCompose}>Compose</Button>
                  </Tooltip>
                )}
                <Button size="xs" color="primary" variant={sync.isPending ? 'filled' : 'light'}
                  leftSection={sync.isPending ? <Loader size={10} color="white" /> : <TbCloudUpload size={12} />}
                  onClick={confirmSync} loading={sync.isPending}>
                  Sync Vars
                </Button>
              </Group>
            )}
          </Stack>

          <PortainerSyncBody
            config={config}
            containers={containers}
            statusFetching={statusFetching}
            activeOp={activeOp}
            elapsed={elapsed}
            canEdit={canEdit}
            secretCount={secretCount}
            displayUrl={displayUrl}
            syncStatus={syncStatus}
            onOpenLogs={handleOpenLogs}
            onOpenExec={handleOpenExec}
            onDismissOp={() => setOp(null)}
            onToggleAutoSync={(v) => toggleAutoSync.mutate(v)}
            onRemoveTarget={(id) => removeTarget.mutate(id)}
          />
        </Box>
      )}

      <PortainerDiffModal opened={diffOpen} onClose={closeDiff} slug={slug} env={env} config={config} onConfirmSync={confirmSync} />
      <PortainerLogsModal opened={logsOpen} onClose={closeLogs} config={config} containers={containers} statusFetching={statusFetching} initialContainerId={logsInitialContainerId} />
      <PortainerExecModal opened={execOpen} onClose={closeExec} execContainer={execContainer} config={config} isSuperAdmin={isSuperAdmin} slug={slug} env={env} />
      <PortainerComposeModal opened={composeOpen} onClose={closeCompose} config={config} />
    </>
  )
}
