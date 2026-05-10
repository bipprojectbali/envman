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
  Modal,
  Select,
  Stack,
  Stepper,
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
  TbCloud,
  TbCloudUpload,
  TbExternalLink,
  TbLock,
  TbPencil,
  TbPlus,
  TbPlugConnected,
  TbPlugConnectedX,
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

export function PortainerSync({ slug, env, canEdit, secretCount }: Props) {
  const qc = useQueryClient()
  const [setupOpen, { open: openSetup, close: closeSetup }] = useDisclosure(false)
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

  // Probe stacks from selected connection
  const probe = useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch(`/api/envman/portainer/connections/${connectionId}/probe`, { method: 'POST' }),
    onSuccess: (data) => {
      setStacks(data.stacks)
      setProbeError(null)
      setStep(1)
    },
    onError: (e: Error) => {
      setStacks([])
      setProbeError(e.message)
    },
  })

  const saveConfig = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, {
        method: 'PUT',
        body: JSON.stringify({
          connectionId: selectedConnectionId,
          stackId: selectedStack!.id,
          stackName: selectedStack!.name,
          endpointId: selectedStack!.endpointId,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portainer', slug, env] })
      handleClose()
    },
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
    mutationFn: () =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/sync`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const confirmSync = () =>
    modals.openConfirmModal({
      title: 'Sync ke Portainer',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Push semua vars <strong>{slug}:{env}</strong> ke stack <strong>{config?.stackName}</strong>?
          </Text>
          {secretCount > 0 && (
            <Alert color="red" icon={<TbLock size={14} />} p="xs">
              <Text size="xs" fw={600} mb={2}>{secretCount} secret var akan di-decrypt</Text>
              <Text size="xs" c="dimmed">
                Nilai dikirim sebagai plaintext dan tersimpan di <Code fz="xs">stack.env</Code> — tidak terenkripsi di sisi Portainer.
              </Text>
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

  if (isLoading) return null

  const syncStatus = config?.lastSyncOk === true ? 'success' : config?.lastSyncOk === false ? 'failed' : 'never'
  const displayUrl = config?.portainerUrl ?? ''

  return (
    <>
      <Divider mt="xl" mb="sm" label={
        <Group gap="xs">
          <TbCloud size={13} />
          <Text size="xs" fw={500} c="dimmed">Portainer</Text>
        </Group>
      } labelPosition="left" />

      {!config ? (
        <Card withBorder p="sm" radius="md" style={{ borderStyle: 'dashed' }}>
          <Group justify="space-between">
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
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
            <ThemeIcon
              size={32}
              radius="md"
              variant="light"
              color={syncStatus === 'failed' ? 'red' : syncStatus === 'success' ? 'teal' : 'gray'}
            >
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
              </Group>
            </Box>
          </Group>

          <Group gap="xs" wrap="nowrap">
            {sync.isError && (
              <Tooltip label={(sync.error as Error).message} position="left" multiline maw={260}>
                <Badge size="xs" color="red" variant="light" leftSection={<TbAlertTriangle size={10} />} style={{ cursor: 'help' }}>error</Badge>
              </Tooltip>
            )}
            {canEdit && (
              <>
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
                <Button
                  size="xs"
                  color="violet"
                  variant={sync.isPending ? 'filled' : 'light'}
                  leftSection={sync.isPending ? <Loader size={11} color="white" /> : <TbCloudUpload size={13} />}
                  onClick={confirmSync}
                  loading={sync.isPending}
                >
                  Sync
                </Button>
              </>
            )}
          </Group>
        </Group>
      )}

      {/* ─── Setup Modal ─────────────────────── */}
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
                  <Anchor size="xs" href="/envmanager/connections">Tambah connection</Anchor>{' '}
                  terlebih dahulu, lalu kembali ke sini.
                </Text>
              </Alert>
            ) : (
              <>
                <Text size="xs" c="dimmed">
                  Pilih Portainer instance yang akan digunakan untuk environment <strong>{slug}:{env}</strong>.
                </Text>
                <Select
                  label="Portainer Connection"
                  placeholder="Pilih connection..."
                  data={connections.map(c => ({
                    value: c.id,
                    label: c.name,
                    description: c.portainerUrl.replace(/^https?:\/\//, ''),
                  }))}
                  value={selectedConnectionId}
                  onChange={setSelectedConnectionId}
                  searchable
                />
                {selectedConnectionId && (
                  <Alert color="blue" p="xs" icon={<TbServer size={14} />}>
                    <Text size="xs">
                      {connections.find(c => c.id === selectedConnectionId)?.portainerUrl}
                    </Text>
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
                <Button
                  size="sm"
                  disabled={!selectedConnectionId || connections.length === 0}
                  loading={probe.isPending}
                  leftSection={<TbPlugConnected size={14} />}
                  onClick={() => selectedConnectionId && probe.mutate(selectedConnectionId)}
                >
                  Load Stacks
                </Button>
              </Group>
            </Group>
          </Stack>
        )}

        {step === 1 && (
          <Stack gap="sm">
            <Alert color="teal" p="xs" icon={<TbCheck size={14} />}>
              <Text size="xs" fw={500}>
                {connections.find(c => c.id === selectedConnectionId)?.name} — {stacks.length} stack ditemukan
              </Text>
            </Alert>

            <Select
              label="Stack target"
              placeholder="Pilih stack..."
              data={stacks.map(s => ({ value: String(s.id), label: s.name, description: `Endpoint ${s.endpointId}` }))}
              value={selectedStack ? String(selectedStack.id) : null}
              onChange={v => setSelectedStack(stacks.find(s => String(s.id) === v) ?? null)}
              searchable
              nothingFoundMessage="Stack tidak ditemukan"
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
              <Button
                size="sm"
                color="violet"
                disabled={!selectedStack}
                loading={saveConfig.isPending}
                leftSection={<TbCheck size={14} />}
                onClick={() => saveConfig.mutate()}
              >
                {isEditing ? 'Update' : 'Simpan & Hubungkan'}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
