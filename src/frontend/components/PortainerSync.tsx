import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Stepper,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TbAlertTriangle,
  TbCheck,
  TbChevronDown,
  TbCloud,
  TbCloudUpload,
  TbExternalLink,
  TbLock,
  TbPackage,
  TbPencil,
  TbPlug,
  TbPlugConnected,
  TbPlugConnectedX,
  TbPlus,
  TbRefresh,
  TbRefreshDot,
  TbServer,
  TbTrash,
  TbX,
} from 'react-icons/tb'

interface Props {
  slug: string
  env: string
  canEdit: boolean
  secretCount: number
}

interface PortainerStack {
  id: number
  name: string
  endpointId: number
}

interface PortainerConnection {
  id: string
  name: string
  portainerUrl: string
}

interface PortainerConfig {
  id: string
  portainerUrl?: string | null
  stackId: number
  stackName: string
  endpointId: number
  lastSyncAt: string | null
  lastSyncOk: boolean | null
  connectionId?: string | null
  connectionName?: string | null
}

interface ContainerInfo {
  id: string
  names: string[]
  image: string
  status: string
  state: string
  created: number
  ports: string[]
}

interface DanglingImage {
  id: string
  tags: string[]
  size: number
  created: number
}

const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts }).then(async (r) => {
    const body = await r.json()
    if (!r.ok) throw new Error(body.error ?? 'Request failed')
    return body
  })

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h / 24)} hari lalu`
}

function fmtBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

const stateColor: Record<string, string> = {
  running: 'teal',
  exited: 'red',
  paused: 'yellow',
  restarting: 'orange',
  dead: 'red',
  created: 'gray',
}

export function PortainerSync({ slug, env, canEdit, secretCount }: Props) {
  const qc = useQueryClient()
  const [setupOpen, { open: openSetup, close: closeSetup }] = useDisclosure(false)
  const [statusOpen, { open: openStatus, close: closeStatus }] = useDisclosure(false)
  const [diffOpen, { open: openDiff, close: closeDiff }] = useDisclosure(false)
  const [cleanupOpen, { open: openCleanup, close: closeCleanup }] = useDisclosure(false)

  const [isEditing, setIsEditing] = useState(false)
  const [step, setStep] = useState(0)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [stacks, setStacks] = useState<PortainerStack[]>([])
  const [selectedStack, setSelectedStack] = useState<PortainerStack | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)

  const handleClose = () => {
    closeSetup()
    setIsEditing(false)
    setStep(0)
    setSelectedConnectionId(null)
    setStacks([])
    setSelectedStack(null)
    setProbeError(null)
  }

  const openEdit = (cfg: PortainerConfig) => {
    setIsEditing(true)
    setStep(0)
    setSelectedConnectionId(cfg.connectionId ?? null)
    setSelectedStack({ id: cfg.stackId, name: cfg.stackName, endpointId: cfg.endpointId })
    setStacks([{ id: cfg.stackId, name: cfg.stackName, endpointId: cfg.endpointId }])
    setProbeError(null)
    openSetup()
  }

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['portainer', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`),
  })

  const { data: connectionsData } = useQuery({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
  })

  const { data: statusData, isFetching: statusFetching, refetch: refetchStatus } = useQuery({
    queryKey: ['portainer', 'status', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/status`),
    enabled: statusOpen,
    refetchInterval: statusOpen ? 10000 : false,
  })

  const { data: diffData, isFetching: diffFetching } = useQuery({
    queryKey: ['portainer', 'diff', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/sync-preview`, { method: 'POST' }),
    enabled: diffOpen,
  })

  const { data: imagesData, isFetching: imagesFetching, refetch: refetchImages } = useQuery({
    queryKey: ['portainer', 'images', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/images/dangling`),
    enabled: cleanupOpen,
  })

  const config: PortainerConfig | null = data?.config ?? null
  const connections: PortainerConnection[] = connectionsData?.connections ?? []

  // ─── Mutations ────────────────────────────────────────────────────────────
  const probe = useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch(`/api/envman/portainer/connections/${connectionId}/probe`, { method: 'POST' }),
    onSuccess: (data) => { setStacks(data.stacks); setProbeError(null); setStep(1) },
    onError: (e: Error) => { setStacks([]); setProbeError(e.message) },
  })

  const saveConfig = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, {
        method: 'PUT',
        body: JSON.stringify({ connectionId: selectedConnectionId, stackId: selectedStack!.id, stackName: selectedStack!.name, endpointId: selectedStack!.endpointId }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portainer', slug, env] }); handleClose() },
  })

  const deleteConfig = () =>
    modals.openConfirmModal({
      title: 'Hapus konfigurasi Portainer',
      children: <Text size="sm">Hapus konfigurasi Portainer untuk <strong>{env}</strong>?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, { method: 'DELETE' })
          .then(() => qc.invalidateQueries({ queryKey: ['portainer', slug, env] })),
    })

  const sync = useMutation({
    mutationFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/sync`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const repull = useMutation({
    mutationFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/repull`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const recreate = useMutation({
    mutationFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/recreate`, { method: 'POST' }),
  })

  const syncRepull = useMutation({
    mutationFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/sync-repull`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const pruneImages = useMutation({
    mutationFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/prune/images`, { method: 'POST' }),
    onSuccess: () => refetchImages(),
  })

  const pruneVolumes = useMutation({
    mutationFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/prune/volumes`, { method: 'POST' }),
  })

  const pruneNetworks = useMutation({
    mutationFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/prune/networks`, { method: 'POST' }),
  })

  // ─── Confirm helpers ──────────────────────────────────────────────────────
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
      title: 'Repull Image Terbaru',
      children: (
        <Stack gap="xs">
          <Text size="sm">Pull image terbaru untuk stack <strong>{config?.stackName}</strong> dan restart container?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Setara dengan <Code fz="xs">docker compose pull && docker compose up -d</Code>. Container akan restart.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Pull & Restart', cancel: 'Batal' },
      confirmProps: { color: 'blue' },
      onConfirm: () => repull.mutate(),
    })

  const confirmRecreate = () =>
    modals.openConfirmModal({
      title: 'Force Recreate Containers',
      children: (
        <Stack gap="xs">
          <Text size="sm">Stop dan start ulang semua container di stack <strong>{config?.stackName}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Setara dengan <Code fz="xs">docker compose stop && docker compose up -d</Code>. Image tidak di-pull ulang.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Recreate', cancel: 'Batal' },
      confirmProps: { color: 'orange' },
      onConfirm: () => recreate.mutate(),
    })

  const confirmSyncRepull = () =>
    modals.openConfirmModal({
      title: 'Sync Vars + Repull Image',
      children: (
        <Stack gap="xs">
          <Text size="sm">Sync vars <strong>{slug}:{env}</strong> sekaligus pull image terbaru ke stack <strong>{config?.stackName}</strong>?</Text>
          {secretCount > 0 && (
            <Alert color="red" icon={<TbLock size={14} />} p="xs">
              <Text size="xs" fw={600} mb={2}>{secretCount} secret var akan di-decrypt dan dikirim plaintext.</Text>
            </Alert>
          )}
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Operasi ini sync vars + pull image + restart container sekaligus.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Sync + Repull', cancel: 'Batal' },
      confirmProps: { color: 'violet' },
      onConfirm: () => syncRepull.mutate(),
    })

  const confirmPruneImages = () =>
    modals.openConfirmModal({
      title: 'Hapus Dangling Images',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Hapus <strong>{imagesData?.count ?? 0} dangling image</strong> (~{imagesData?.totalSizeMB ?? 0} MB) dari host Docker?
          </Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Hanya image yang tidak dipakai container manapun yang akan dihapus. Operasi ini tidak bisa dibatalkan.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Hapus Images', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => pruneImages.mutate(),
    })

  const confirmPruneVolumes = () =>
    modals.openConfirmModal({
      title: 'Hapus Unused Volumes',
      children: (
        <Stack gap="xs">
          <Text size="sm">Hapus semua volume yang tidak dipakai container manapun?</Text>
          <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs" fw={600}>Peringatan: Data di volume yang dihapus tidak bisa dikembalikan.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Hapus Volumes', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => pruneVolumes.mutate(),
    })

  const confirmPruneNetworks = () =>
    modals.openConfirmModal({
      title: 'Hapus Unused Networks',
      children: <Text size="sm">Hapus semua network Docker yang tidak dipakai container manapun?</Text>,
      labels: { confirm: 'Hapus Networks', cancel: 'Batal' },
      confirmProps: { color: 'orange' },
      onConfirm: () => pruneNetworks.mutate(),
    })

  if (isLoading) return null

  const syncStatus = config?.lastSyncOk === true ? 'success' : config?.lastSyncOk === false ? 'failed' : 'never'
  const displayUrl = config?.portainerUrl ?? ''
  const anyPending = sync.isPending || repull.isPending || recreate.isPending || syncRepull.isPending

  return (
    <>
      <Divider mt="xl" mb="sm" label={
        <Group gap="xs">
          <TbCloud size={13} />
          <Text size="xs" fw={500} c="dimmed">Portainer</Text>
        </Group>
      } labelPosition="left" />

      {/* ─── Not configured ───────────────────────────── */}
      {!config ? (
        <Card withBorder p="sm" radius="md" style={{ borderStyle: 'dashed' }}>
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="sm">
              <ThemeIcon size={28} radius="md" variant="light" color="gray">
                <TbPlugConnectedX size={15} />
              </ThemeIcon>
              <Box>
                <Text size="xs" fw={500}>Belum terhubung ke Portainer</Text>
                <Text size="xs" c="dimmed">
                  {connections.length > 0
                    ? `${connections.length} connection tersedia — pilih dan hubungkan ke stack`
                    : 'Tambah Portainer connection terlebih dahulu'}
                </Text>
              </Box>
            </Group>
            {canEdit && (
              connections.length > 0 ? (
                <Button size="xs" variant="light" color="violet" leftSection={<TbPlugConnected size={13} />} onClick={openSetup}>
                  Connect
                </Button>
              ) : (
                <Button size="xs" variant="light" color="gray" leftSection={<TbPlus size={13} />} component="a" href="/envmanager/connections">
                  Add Connection
                </Button>
              )
            )}
          </Group>
        </Card>
      ) : (
        /* ─── Configured — status + actions ─────────── */
        <Group justify="space-between" wrap="wrap" gap="xs">
          {/* Info kiri */}
          <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
            <ThemeIcon size={32} radius="md" variant="light"
              color={syncStatus === 'failed' ? 'red' : syncStatus === 'success' ? 'teal' : 'gray'}>
              {syncStatus === 'failed' ? <TbX size={16} /> : <TbCloud size={16} />}
            </ThemeIcon>
            <Box>
              <Group gap="xs" mb={2}>
                <Text size="xs" fw={600}>{config.stackName}</Text>
                {config.connectionName && (
                  <Badge size="xs" variant="dot" color="violet">{config.connectionName}</Badge>
                )}
                <Tooltip label={displayUrl}>
                  <Badge size="xs" variant="dot" color="gray" style={{ cursor: 'default' }}>
                    {displayUrl.replace(/^https?:\/\//, '')}
                  </Badge>
                </Tooltip>
                {syncStatus === 'success' && <Badge size="xs" color="teal" variant="light" leftSection={<TbCheck size={9} />}>synced</Badge>}
                {syncStatus === 'failed' && <Badge size="xs" color="red" variant="light" leftSection={<TbX size={9} />}>failed</Badge>}
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  {config.lastSyncAt ? `Sync ${relativeTime(config.lastSyncAt)}` : 'Belum pernah sync'}
                </Text>
                <Anchor size="xs" href={`${displayUrl}#!/${config.endpointId}/docker/stacks/${config.stackId}`} target="_blank" rel="noreferrer" c="dimmed">
                  Buka Portainer <TbExternalLink size={10} style={{ verticalAlign: 'middle' }} />
                </Anchor>
                {/* Status containers */}
                <Anchor size="xs" c="dimmed" style={{ cursor: 'pointer' }} onClick={() => { openStatus(); refetchStatus() }}>
                  <TbServer size={10} style={{ verticalAlign: 'middle' }} /> Status
                </Anchor>
              </Group>
            </Box>
          </Group>

          {/* Action buttons kanan */}
          <Group gap="xs" wrap="nowrap">
            {(sync.isError || repull.isError || recreate.isError || syncRepull.isError) && (
              <Tooltip
                label={(sync.error || repull.error || recreate.error || syncRepull.error as Error)?.message}
                position="left" multiline maw={260}
              >
                <Badge size="xs" color="red" variant="light" leftSection={<TbAlertTriangle size={10} />} style={{ cursor: 'help' }}>error</Badge>
              </Tooltip>
            )}

            {canEdit && (
              <>
                {/* Edit + Delete */}
                <Tooltip label="Edit konfigurasi">
                  <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => openEdit(config!)}>
                    <TbPencil size={13} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Hapus koneksi">
                  <ActionIcon size="sm" variant="subtle" color="red" onClick={deleteConfig}>
                    <TbTrash size={13} />
                  </ActionIcon>
                </Tooltip>

                {/* ─── Sync (sync vars only) ─── */}
                <Button
                  size="xs" color="violet"
                  variant={sync.isPending ? 'filled' : 'light'}
                  leftSection={anyPending ? <Loader size={11} color="white" /> : <TbCloudUpload size={13} />}
                  onClick={confirmSync}
                  loading={sync.isPending}
                  disabled={anyPending && !sync.isPending}
                >
                  Sync
                </Button>

                {/* ─── Deploy Actions dropdown ─── */}
                <Menu shadow="md" width={230} position="bottom-end">
                  <Menu.Target>
                    <Button size="xs" variant="light" color="gray" rightSection={<TbChevronDown size={12} />}
                      leftSection={<TbRefresh size={13} />}
                      loading={repull.isPending || recreate.isPending || syncRepull.isPending}
                    >
                      Deploy
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Sync + Deploy</Menu.Label>
                    <Menu.Item leftSection={<TbCloudUpload size={14} />} onClick={confirmSyncRepull}>
                      Sync vars + Repull image
                      <Text size="xs" c="dimmed">Push vars & pull image terbaru</Text>
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Label>Deploy saja (tanpa sync vars)</Menu.Label>
                    <Menu.Item leftSection={<TbRefreshDot size={14} />} onClick={confirmRepull}>
                      Repull image
                      <Text size="xs" c="dimmed">Pull image terbaru, restart containers</Text>
                    </Menu.Item>
                    <Menu.Item leftSection={<TbRefresh size={14} />} onClick={confirmRecreate}>
                      Force recreate
                      <Text size="xs" c="dimmed">Stop → start, tanpa pull image</Text>
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Label>Preview</Menu.Label>
                    <Menu.Item leftSection={<TbPlug size={14} />} onClick={() => openDiff()}>
                      Diff sebelum sync
                      <Text size="xs" c="dimmed">Bandingkan vars envman vs Portainer</Text>
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>

                {/* ─── Cleanup dropdown ─── */}
                <Menu shadow="md" width={230} position="bottom-end">
                  <Menu.Target>
                    <Tooltip label="Cleanup Docker resources">
                      <Button size="xs" variant="light" color="orange" rightSection={<TbChevronDown size={12} />}
                        leftSection={<TbPackage size={13} />}
                        loading={pruneImages.isPending || pruneVolumes.isPending || pruneNetworks.isPending}
                      >
                        Cleanup
                      </Button>
                    </Tooltip>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Docker Cleanup</Menu.Label>
                    <Menu.Item leftSection={<TbPackage size={14} />} onClick={() => openCleanup()}>
                      Preview & prune images
                      <Text size="xs" c="dimmed">Lihat dan hapus dangling images</Text>
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item leftSection={<TbTrash size={14} />} color="orange" onClick={confirmPruneVolumes}>
                      Prune unused volumes
                      <Text size="xs" c="dimmed">Hapus volume yang tidak dipakai</Text>
                    </Menu.Item>
                    <Menu.Item leftSection={<TbTrash size={14} />} onClick={confirmPruneNetworks}>
                      Prune unused networks
                      <Text size="xs" c="dimmed">Hapus network yang tidak dipakai</Text>
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </>
            )}
          </Group>
        </Group>
      )}

      {/* ─── Setup Modal ─────────────────────────────── */}
      <Modal
        opened={setupOpen}
        onClose={handleClose}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="violet" radius="md"><TbCloud size={13} /></ThemeIcon>
            <Text fw={600} size="sm">{isEditing ? 'Edit Portainer' : 'Hubungkan ke Portainer'}</Text>
          </Group>
        }
        size="md"
      >
        <Stepper active={step} size="xs" mb="md" onStepClick={s => { if (s < step) setStep(s) }}>
          <Stepper.Step label="Connection" />
          <Stepper.Step label="Stack" />
        </Stepper>

        {step === 0 && (
          <Stack gap="sm">
            {connections.length === 0 ? (
              <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
                <Text size="xs">
                  Belum ada Portainer connection.{' '}
                  <Anchor size="xs" href="/envmanager/connections">Tambah connection</Anchor> terlebih dahulu.
                </Text>
              </Alert>
            ) : (
              <>
                <Text size="xs" c="dimmed">
                  Pilih Portainer instance untuk environment <strong>{slug}:{env}</strong>.
                </Text>
                <Select
                  label="Portainer Connection"
                  placeholder="Pilih connection..."
                  data={connections.map(c => ({ value: c.id, label: c.name, description: c.portainerUrl.replace(/^https?:\/\//, '') }))}
                  value={selectedConnectionId}
                  onChange={setSelectedConnectionId}
                  searchable
                />
                {selectedConnectionId && (
                  <Alert color="blue" p="xs" icon={<TbServer size={14} />}>
                    <Text size="xs">{connections.find(c => c.id === selectedConnectionId)?.portainerUrl}</Text>
                  </Alert>
                )}
                {probeError && (
                  <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
                    <Text size="xs">{probeError}</Text>
                  </Alert>
                )}
              </>
            )}
            <Group justify="space-between" mt="xs">
              <Button size="sm" variant="subtle" color="gray" component="a" href="/envmanager/connections" leftSection={<TbPlus size={13} />}>
                Kelola Connections
              </Button>
              <Group gap="xs">
                <Button variant="subtle" size="sm" color="gray" onClick={handleClose}>Batal</Button>
                <Button size="sm" disabled={!selectedConnectionId || connections.length === 0} loading={probe.isPending}
                  leftSection={<TbPlugConnected size={14} />}
                  onClick={() => selectedConnectionId && probe.mutate(selectedConnectionId)}>
                  Load Stacks
                </Button>
              </Group>
            </Group>
          </Stack>
        )}

        {step === 1 && (
          <Stack gap="sm">
            <Alert color="teal" p="xs" icon={<TbCheck size={14} />}>
              <Text size="xs" fw={500}>{connections.find(c => c.id === selectedConnectionId)?.name} — {stacks.length} stack ditemukan</Text>
            </Alert>
            <Select
              label="Stack target"
              placeholder="Pilih stack..."
              data={stacks.map(s => ({ value: String(s.id), label: s.name, description: `Endpoint ${s.endpointId}` }))}
              value={selectedStack ? String(selectedStack.id) : null}
              onChange={v => setSelectedStack(stacks.find(s => String(s.id) === v) ?? null)}
              searchable nothingFoundMessage="Stack tidak ditemukan"
            />
            {selectedStack && (
              <Card withBorder p="sm" radius="md" style={{ borderColor: 'var(--mantine-color-violet-4)' }}>
                <Text size="xs" c="dimmed" mb={6}>Ringkasan</Text>
                <Stack gap={4}>
                  {[
                    ['Connection', connections.find(c => c.id === selectedConnectionId)?.name ?? '—'],
                    ['Project:Env', `${slug}:${env}`],
                    ['Stack', selectedStack.name],
                    ['Endpoint', `#${selectedStack.endpointId}`],
                  ].map(([label, value]) => (
                    <Group key={label} justify="space-between">
                      <Text size="xs" c="dimmed">{label}</Text>
                      <Code fz="xs">{value}</Code>
                    </Group>
                  ))}
                </Stack>
              </Card>
            )}
            <Group justify="space-between" mt="xs">
              <Button variant="subtle" size="sm" color="gray" onClick={() => setStep(0)}>← Kembali</Button>
              <Button size="sm" color="violet" disabled={!selectedStack} loading={saveConfig.isPending}
                leftSection={<TbCheck size={14} />} onClick={() => saveConfig.mutate()}>
                {isEditing ? 'Update' : 'Simpan & Hubungkan'}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* ─── Stack Status Modal ───────────────────────── */}
      <Modal
        opened={statusOpen}
        onClose={closeStatus}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="teal" radius="md"><TbServer size={13} /></ThemeIcon>
            <Text fw={600} size="sm">Status Stack — {config?.stackName}</Text>
            <ActionIcon size="sm" variant="subtle" color="gray" loading={statusFetching} onClick={() => refetchStatus()}>
              <TbRefresh size={13} />
            </ActionIcon>
          </Group>
        }
        size="lg"
      >
        {statusFetching && !statusData ? (
          <Group justify="center" py="xl"><Loader size="sm" /></Group>
        ) : statusData?.stack ? (
          <Stack gap="md">
            {/* Stack info */}
            <Paper withBorder p="sm" radius="md">
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={600}>Stack Info</Text>
                <Badge size="sm" color={statusData.stack.status === 1 ? 'teal' : 'red'} variant="light">
                  {statusData.stack.status === 1 ? 'Active' : 'Inactive'}
                </Badge>
              </Group>
              <Group gap="xl">
                {[
                  ['Type', statusData.stack.type === 2 ? 'Compose' : 'Swarm'],
                  ['Endpoint', `#${statusData.stack.endpointId}`],
                  ['Containers', statusData.containers.length],
                ].map(([label, value]) => (
                  <Box key={String(label)}>
                    <Text size="xs" c="dimmed">{label}</Text>
                    <Text size="sm" fw={600}>{String(value)}</Text>
                  </Box>
                ))}
              </Group>
            </Paper>

            {/* Containers */}
            {statusData.containers.length > 0 ? (
              <Box>
                <Text size="sm" fw={600} mb="xs">Containers ({statusData.containers.length})</Text>
                <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                  <Table fz="xs" horizontalSpacing="sm" verticalSpacing="xs" highlightOnHover>
                    <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
                      <Table.Tr>
                        <Table.Th>Container</Table.Th>
                        <Table.Th>Image</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Ports</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {statusData.containers.map((c: ContainerInfo) => (
                        <Table.Tr key={c.id}>
                          <Table.Td>
                            <Text fz="xs" fw={500}>{c.names[0]}</Text>
                            <Code fz={10} c="dimmed">{c.id}</Code>
                          </Table.Td>
                          <Table.Td>
                            <Text fz="xs" style={{ wordBreak: 'break-all' }}>{c.image.split('/').pop()}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="xs" color={stateColor[c.state] ?? 'gray'} variant="light">
                              {c.state}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            {c.ports.length > 0
                              ? <Code fz={10}>{c.ports.join(', ')}</Code>
                              : <Text fz="xs" c="dimmed">—</Text>}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Paper>
              </Box>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="sm">Tidak ada container running</Text>
            )}
          </Stack>
        ) : (
          <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">{statusData?.error ?? 'Gagal mengambil status'}</Text>
          </Alert>
        )}
      </Modal>

      {/* ─── Diff Modal ───────────────────────────────── */}
      <Modal
        opened={diffOpen}
        onClose={closeDiff}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="blue" radius="md"><TbPlug size={13} /></ThemeIcon>
            <Text fw={600} size="sm">Diff — {slug}:{env} vs Portainer</Text>
          </Group>
        }
        size="lg"
      >
        {diffFetching ? (
          <Group justify="center" py="xl"><Loader size="sm" /></Group>
        ) : diffData?.diff ? (
          <Stack gap="md">
            {/* Summary */}
            <Group gap="xs">
              {diffData.diff.added.length > 0 && <Badge color="teal" variant="light">+{diffData.diff.added.length} baru</Badge>}
              {diffData.diff.removed.length > 0 && <Badge color="red" variant="light">-{diffData.diff.removed.length} dihapus</Badge>}
              {diffData.diff.changed.length > 0 && <Badge color="yellow" variant="light">~{diffData.diff.changed.length} berubah</Badge>}
              {diffData.diff.unchanged.length > 0 && <Badge color="gray" variant="light">{diffData.diff.unchanged.length} sama</Badge>}
            </Group>

            {diffData.diff.added.length === 0 && diffData.diff.removed.length === 0 && diffData.diff.changed.length === 0 && (
              <Alert color="teal" icon={<TbCheck size={14} />} p="xs">
                <Text size="xs">Semua vars sudah sinkron dengan Portainer. Tidak perlu sync.</Text>
              </Alert>
            )}

            <ScrollArea.Autosize mah={400}>
              <Stack gap="xs">
                {diffData.diff.added.map((key: string) => (
                  <Paper key={key} p="xs" radius="sm" style={{ background: 'var(--mantine-color-teal-light)', borderLeft: '3px solid var(--mantine-color-teal-5)' }}>
                    <Group gap="xs">
                      <Badge size="xs" color="teal">+</Badge>
                      <Code fz="xs" fw={600}>{key}</Code>
                      <Text fz="xs" c="dimmed">— akan ditambahkan ke Portainer</Text>
                    </Group>
                  </Paper>
                ))}
                {diffData.diff.removed.map((key: string) => (
                  <Paper key={key} p="xs" radius="sm" style={{ background: 'var(--mantine-color-red-light)', borderLeft: '3px solid var(--mantine-color-red-5)' }}>
                    <Group gap="xs">
                      <Badge size="xs" color="red">-</Badge>
                      <Code fz="xs" fw={600}>{key}</Code>
                      <Text fz="xs" c="dimmed">— ada di Portainer, tidak di envman</Text>
                    </Group>
                  </Paper>
                ))}
                {diffData.diff.changed.map((item: { key: string; oldValue: string; newValue: string }) => (
                  <Paper key={item.key} p="xs" radius="sm" style={{ background: 'var(--mantine-color-yellow-light)', borderLeft: '3px solid var(--mantine-color-yellow-5)' }}>
                    <Group gap="xs" mb={4}>
                      <Badge size="xs" color="yellow">~</Badge>
                      <Code fz="xs" fw={600}>{item.key}</Code>
                    </Group>
                    <Stack gap={2}>
                      <Group gap="xs"><Text fz={10} c="dimmed" w={40}>lama</Text><Code fz={10} c="red.5">{item.oldValue || '(kosong)'}</Code></Group>
                      <Group gap="xs"><Text fz={10} c="dimmed" w={40}>baru</Text><Code fz={10} c="teal.5">{item.newValue || '(kosong)'}</Code></Group>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </ScrollArea.Autosize>

            {(diffData.diff.added.length > 0 || diffData.diff.changed.length > 0) && (
              <>
                <Divider />
                <Button fullWidth color="violet" leftSection={<TbCloudUpload size={14} />}
                  onClick={() => { closeDiff(); confirmSync() }}>
                  Lanjut Sync
                </Button>
              </>
            )}
          </Stack>
        ) : (
          <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">{diffData?.error ?? 'Gagal mengambil diff'}</Text>
          </Alert>
        )}
      </Modal>

      {/* ─── Cleanup Modal ────────────────────────────── */}
      <Modal
        opened={cleanupOpen}
        onClose={closeCleanup}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="orange" radius="md"><TbPackage size={13} /></ThemeIcon>
            <Text fw={600} size="sm">Cleanup Docker — {config?.connectionName}</Text>
            <ActionIcon size="sm" variant="subtle" color="gray" loading={imagesFetching} onClick={() => refetchImages()}>
              <TbRefresh size={13} />
            </ActionIcon>
          </Group>
        }
        size="lg"
      >
        <Stack gap="md">
          {/* Dangling images */}
          <Box>
            <Group justify="space-between" mb="xs">
              <Group gap="xs">
                <Text size="sm" fw={600}>Dangling Images</Text>
                {imagesData && (
                  <Badge size="sm" variant="light" color={imagesData.count > 0 ? 'orange' : 'teal'}>
                    {imagesData.count} image — {imagesData.totalSizeMB} MB
                  </Badge>
                )}
              </Group>
              {canEdit && imagesData?.count > 0 && (
                <Button size="xs" color="red" variant="light"
                  leftSection={<TbTrash size={13} />}
                  loading={pruneImages.isPending}
                  onClick={confirmPruneImages}>
                  Prune Images
                </Button>
              )}
            </Group>

            {imagesFetching && !imagesData ? (
              <Group justify="center" py="md"><Loader size="sm" /></Group>
            ) : imagesData?.count === 0 ? (
              <Alert color="teal" icon={<TbCheck size={14} />} p="xs">
                <Text size="xs">Tidak ada dangling images. Docker host bersih!</Text>
              </Alert>
            ) : imagesData?.images ? (
              <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                <ScrollArea.Autosize mah={250}>
                  <Table fz="xs" horizontalSpacing="sm" verticalSpacing={4} highlightOnHover>
                    <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
                      <Table.Tr>
                        <Table.Th>ID</Table.Th>
                        <Table.Th>Tags</Table.Th>
                        <Table.Th>Size</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {imagesData.images.map((img: DanglingImage) => (
                        <Table.Tr key={img.id}>
                          <Table.Td><Code fz={10}>{img.id}</Code></Table.Td>
                          <Table.Td>
                            {img.tags.length > 0
                              ? <Code fz={10}>{img.tags[0]}</Code>
                              : <Text fz="xs" c="dimmed">&lt;none&gt;</Text>}
                          </Table.Td>
                          <Table.Td><Text fz="xs">{fmtBytes(img.size)}</Text></Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
              </Paper>
            ) : null}
          </Box>

          {/* Volumes + Networks */}
          {canEdit && (
            <>
              <Divider label="Cleanup lainnya" labelPosition="center" />
              <Group gap="xs">
                <Button size="xs" variant="light" color="orange" leftSection={<TbTrash size={13} />}
                  loading={pruneVolumes.isPending} onClick={confirmPruneVolumes}>
                  Prune Volumes
                </Button>
                <Button size="xs" variant="light" color="gray" leftSection={<TbTrash size={13} />}
                  loading={pruneNetworks.isPending} onClick={confirmPruneNetworks}>
                  Prune Networks
                </Button>
              </Group>
              {pruneVolumes.isSuccess && (
                <Alert color="teal" icon={<TbCheck size={14} />} p="xs">
                  <Text size="xs">Volumes dihapus: {(pruneVolumes.data as any)?.deletedVolumes?.join(', ') || 'tidak ada yang dihapus'}</Text>
                </Alert>
              )}
              {pruneNetworks.isSuccess && (
                <Alert color="teal" icon={<TbCheck size={14} />} p="xs">
                  <Text size="xs">Networks dihapus: {(pruneNetworks.data as any)?.deletedNetworks?.join(', ') || 'tidak ada yang dihapus'}</Text>
                </Alert>
              )}
            </>
          )}
        </Stack>
      </Modal>
    </>
  )
}
