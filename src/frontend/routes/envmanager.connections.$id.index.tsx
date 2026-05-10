import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { apiFetch } from '@/frontend/lib/api'
import {
  TbAlertTriangle,
  TbCheck,
  TbChevronLeft,
  TbChevronRight,
  TbCopy,
  TbDownload,
  TbExternalLink,
  TbFileText,
  TbPackage,
  TbPlugConnected,
  TbRefresh,
  TbRefreshDot,
  TbServer,
  TbTrash,
  TbX,
} from 'react-icons/tb'

export const Route = createFileRoute('/envmanager/connections/$id/')({
  component: ConnectionDetailPage,
})

interface LinkedEnv {
  slug: string
  projectName: string
  envName: string
  lastSyncAt: string | null
  lastSyncOk: boolean | null
}

interface StackInfo {
  id: number
  name: string
  status: number
  type: number
  endpointId: number
  createdAt: string
  updatedAt: string
  linkedEnvs: LinkedEnv[]
}

interface ContainerInfo {
  id: string
  shortId: string
  names: string[]
  image: string
  status: string
  state: string
  ports: string[]
}

interface LogLine {
  stream: 'stdout' | 'stderr'
  timestamp: string | null
  message: string
}

const stateColor: Record<string, string> = {
  running: 'teal', exited: 'red', paused: 'yellow',
  restarting: 'orange', dead: 'red', created: 'gray',
}

function fmtBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

function relTime(iso: string | null) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  return `${Math.floor(h / 24)}h lalu`
}

function ConnectionDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')

  // Stack status modal state
  const [statusStack, setStatusStack] = useState<StackInfo | null>(null)
  const [statusOpen, { open: openStatus, close: closeStatus }] = useDisclosure(false)

  // Logs modal state
  const [logsStack, setLogsStack] = useState<StackInfo | null>(null)
  const [logsOpen, { open: openLogs, close: closeLogs }] = useDisclosure(false)
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null)
  const [logTail, setLogTail] = useState(200)
  const [showStdout, setShowStdout] = useState(true)
  const [showStderr, setShowStderr] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logViewportRef = useRef<HTMLDivElement>(null)

  // Cleanup state
  const [cleanupEndpointId, setCleanupEndpointId] = useState(1)

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['portainer', 'connection-detail', id],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/stacks`),
    refetchInterval: 30000,
  })

  const { data: statusData, isFetching: statusFetching, refetch: refetchStatus } = useQuery({
    queryKey: ['portainer', 'stack-status', id, statusStack?.id],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/stacks/${statusStack!.id}/status`),
    enabled: statusOpen && !!statusStack,
    refetchInterval: statusOpen ? 10000 : false,
  })

  const { data: logsData, isFetching: logsFetching, refetch: refetchLogs } = useQuery({
    queryKey: ['portainer', 'container-logs', id, logsStack?.id, selectedContainerId, logTail, showStdout, showStderr],
    queryFn: () => {
      const qs = new URLSearchParams({ tail: String(logTail), stdout: showStdout ? '1' : '0', stderr: showStderr ? '1' : '0', timestamps: '1' })
      return apiFetch(`/api/envman/portainer/connections/${id}/stacks/${logsStack!.id}/logs/${selectedContainerId}?${qs}`)
    },
    enabled: logsOpen && !!logsStack && !!selectedContainerId,
    refetchInterval: autoRefresh ? 5000 : false,
    staleTime: 0,
  })

  const { data: imagesData, isFetching: imagesFetching, refetch: refetchImages } = useQuery({
    queryKey: ['portainer', 'dangling-images', id, cleanupEndpointId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/images/dangling?endpointId=${cleanupEndpointId}`),
    staleTime: 30000,
  })

  const connection = data?.connection
  const stacks: StackInfo[] = data?.stacks ?? []
  const logLines: LogLine[] = logsData?.lines ?? []
  const containers: ContainerInfo[] = statusData?.containers ?? []
  const logsContainers: ContainerInfo[] = statusData?.containers ?? []

  // Auto-select container saat status data tiba untuk logs
  useEffect(() => {
    if (logsOpen && logsContainers.length > 0 && !selectedContainerId) {
      setSelectedContainerId(logsContainers[0].id)
    }
  }, [logsContainers, logsOpen, selectedContainerId])

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logViewportRef.current) {
      logViewportRef.current.scrollTo({ top: logViewportRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [logLines, autoScroll])

  // ─── Mutations ────────────────────────────────────────────────────────────
  const repull = useMutation({
    mutationFn: (stackId: number) => apiFetch(`/api/envman/portainer/connections/${id}/stacks/${stackId}/repull`, { method: 'POST' }),
    onSuccess: (_, stackId) => { notifyOk('Repull berhasil — container restart dengan image terbaru'); qc.invalidateQueries({ queryKey: ['portainer', 'stack-status', id, stackId] }) },
    onError: (e) => notifyErr(e),
  })

  const recreate = useMutation({
    mutationFn: (stackId: number) => apiFetch(`/api/envman/portainer/connections/${id}/stacks/${stackId}/recreate`, { method: 'POST' }),
    onSuccess: () => notifyOk('Force recreate berhasil'),
    onError: (e) => notifyErr(e),
  })

  const pruneImages = useMutation({
    mutationFn: () => apiFetch(`/api/envman/portainer/connections/${id}/prune/images?endpointId=${cleanupEndpointId}`, { method: 'POST' }),
    onSuccess: (d: any) => { notifyOk(`${d.deletedCount} image dihapus — ${d.reclaimedMB} MB dibebaskan`); refetchImages() },
    onError: (e) => notifyErr(e),
  })

  const pruneVolumes = useMutation({
    mutationFn: () => apiFetch(`/api/envman/portainer/connections/${id}/prune/volumes?endpointId=${cleanupEndpointId}`, { method: 'POST' }),
    onSuccess: (d: any) => notifyOk(`Volumes dihapus: ${d.deletedVolumes?.join(', ') || 'tidak ada'}`),
    onError: (e) => notifyErr(e),
  })

  const pruneNetworks = useMutation({
    mutationFn: () => apiFetch(`/api/envman/portainer/connections/${id}/prune/networks?endpointId=${cleanupEndpointId}`, { method: 'POST' }),
    onSuccess: (d: any) => notifyOk(`Networks dihapus: ${d.deletedNetworks?.join(', ') || 'tidak ada'}`),
    onError: (e) => notifyErr(e),
  })

  // ─── Confirm helpers ──────────────────────────────────────────────────────
  const confirmRepull = (stack: StackInfo) =>
    modals.openConfirmModal({
      title: `Repull — ${stack.name}`,
      children: (
        <Stack gap="xs">
          <Text size="sm">Pull image terbaru untuk stack <strong>{stack.name}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Setara <Code fz="xs">docker compose pull && docker compose up -d</Code>. Container akan restart.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Repull & Restart', cancel: 'Batal' },
      confirmProps: { color: 'blue' },
      onConfirm: () => repull.mutate(stack.id),
    })

  const confirmRecreate = (stack: StackInfo) =>
    modals.openConfirmModal({
      title: `Force Recreate — ${stack.name}`,
      children: (
        <Stack gap="xs">
          <Text size="sm">Stop dan start ulang container di stack <strong>{stack.name}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Image tidak di-pull ulang. Setara <Code fz="xs">docker compose stop && up -d</Code>.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Recreate', cancel: 'Batal' },
      confirmProps: { color: 'orange' },
      onConfirm: () => recreate.mutate(stack.id),
    })

  const confirmPruneImages = () =>
    modals.openConfirmModal({
      title: 'Hapus Dangling Images',
      children: (
        <Stack gap="xs">
          <Text size="sm">Hapus <strong>{imagesData?.count ?? 0} dangling image</strong> (~{imagesData?.totalSizeMB ?? 0} MB)?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Hanya image yang tidak dipakai container manapun. Tidak bisa dibatalkan.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => pruneImages.mutate(),
    })

  if (isLoading) {
    return <Group justify="center" py="xl"><Loader /></Group>
  }

  if (!connection) {
    return (
      <Alert color="red" icon={<TbAlertTriangle size={16} />}>
        <Text size="sm">Connection tidak ditemukan.</Text>
        <Button size="xs" mt="xs" component={Link} to="/envmanager/connections">← Kembali</Button>
      </Alert>
    )
  }

  return (
    <Box>
      {/* ─── Header ─────────────────────────────────────── */}
      <Group justify="space-between" mb="lg" wrap="nowrap">
        <Group gap="xs" style={{ minWidth: 0 }}>
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => navigate({ to: '/envmanager/connections' })}>
            <TbChevronLeft size={16} />
          </ActionIcon>
          <ThemeIcon size={36} radius="md" variant="gradient" gradient={{ from: 'violet', to: 'grape' }}>
            <TbPlugConnected size={18} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={700} size="md" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {connection.name}
              </Text>
              <Badge size="sm" variant="light" color="violet">{stacks.length} stack</Badge>
            </Group>
            <Group gap="xs">
              <Text size="xs" c="dimmed" ff="monospace">
                {connection.portainerUrl.replace(/^https?:\/\//, '')}
              </Text>
              <Anchor size="xs" href={connection.portainerUrl} target="_blank" rel="noreferrer" c="dimmed">
                <TbExternalLink size={11} style={{ verticalAlign: 'middle' }} />
              </Anchor>
            </Group>
          </Box>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" loading={isFetching} onClick={() => refetch()}>
          <TbRefresh size={14} />
        </ActionIcon>
      </Group>

      {/* ─── Stacks ─────────────────────────────────────── */}
      <Text fw={600} size="sm" mb="sm">Stacks ({stacks.length})</Text>

      {stacks.length === 0 ? (
        <Alert color="gray" icon={<TbServer size={14} />} p="xs">
          <Text size="xs">Tidak ada stack ditemukan di Portainer instance ini.</Text>
        </Alert>
      ) : (
        <Stack gap="sm" mb="xl">
          {stacks.map(stack => {
            const runningCount = (statusData?.containers as ContainerInfo[] | undefined)?.filter(c => c.state === 'running').length
            return (
              <Paper key={stack.id} withBorder p="md" radius="md">
                {/* Stack header */}
                <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
                  <Group gap="sm" style={{ minWidth: 0 }}>
                    <ThemeIcon
                      size={32} radius="md" variant="light"
                      color={stack.status === 1 ? 'teal' : 'red'}
                    >
                      <TbServer size={16} />
                    </ThemeIcon>
                    <Box style={{ minWidth: 0 }}>
                      <Group gap="xs" mb={2}>
                        <Text fw={600} size="sm">{stack.name}</Text>
                        <Badge size="xs" color={stack.status === 1 ? 'teal' : 'red'} variant="light">
                          {stack.status === 1 ? 'active' : 'inactive'}
                        </Badge>
                        <Badge size="xs" variant="outline" color="gray">
                          {stack.type === 2 ? 'compose' : 'swarm'}
                        </Badge>
                        <Badge size="xs" variant="dot" color="gray">ep#{stack.endpointId}</Badge>
                      </Group>
                      <Text size="xs" c="dimmed">Diperbarui {relTime(stack.updatedAt)}</Text>
                    </Box>
                  </Group>

                  {/* Action buttons */}
                  <Group gap="xs" wrap="nowrap">
                    <Tooltip label="Status containers">
                      <Button size="xs" variant="subtle" color="gray"
                        leftSection={<TbServer size={13} />}
                        onClick={() => { setStatusStack(stack); openStatus(); refetchStatus() }}
                      >
                        Status
                      </Button>
                    </Tooltip>
                    <Tooltip label="Lihat logs container">
                      <Button size="xs" variant="subtle" color="gray"
                        leftSection={<TbFileText size={13} />}
                        onClick={() => {
                          setLogsStack(stack)
                          setSelectedContainerId(null)
                          openLogs()
                          // Trigger status query untuk dapat container list
                          setStatusStack(stack)
                        }}
                      >
                        Logs
                      </Button>
                    </Tooltip>
                    <Tooltip label="Pull image terbaru & restart">
                      <Button size="xs" variant="light" color="blue"
                        leftSection={<TbRefreshDot size={13} />}
                        loading={repull.isPending && (repull.variables as number) === stack.id}
                        onClick={() => confirmRepull(stack)}
                      >
                        Repull
                      </Button>
                    </Tooltip>
                    <Tooltip label="Force recreate (stop→start)">
                      <Button size="xs" variant="light" color="orange"
                        leftSection={<TbRefresh size={13} />}
                        loading={recreate.isPending && (recreate.variables as number) === stack.id}
                        onClick={() => confirmRecreate(stack)}
                      >
                        Recreate
                      </Button>
                    </Tooltip>
                  </Group>
                </Group>

                {/* Linked envman environments */}
                {stack.linkedEnvs.length > 0 && (
                  <Box>
                    <Divider mb="xs" />
                    <Text size="xs" c="dimmed" mb="xs" fw={500}>Terhubung ke envman:</Text>
                    <Group gap="xs" wrap="wrap">
                      {stack.linkedEnvs.map(env => (
                        <Anchor
                          key={`${env.slug}:${env.envName}`}
                          size="xs"
                          component={Link}
                          to="/envmanager/$slug/$env"
                          params={{ slug: env.slug, env: env.envName } as any}
                        >
                          <Badge
                            size="sm" variant="light"
                            color={env.lastSyncOk === true ? 'teal' : env.lastSyncOk === false ? 'red' : 'gray'}
                            leftSection={
                              env.lastSyncOk === true ? <TbCheck size={9} /> :
                              env.lastSyncOk === false ? <TbX size={9} /> : undefined
                            }
                            rightSection={<TbChevronRight size={9} />}
                            style={{ cursor: 'pointer' }}
                          >
                            {env.projectName}:{env.envName}
                          </Badge>
                        </Anchor>
                      ))}
                    </Group>
                  </Box>
                )}
              </Paper>
            )
          })}
        </Stack>
      )}

      {/* ─── Cleanup Section ─────────────────────────────── */}
      <Divider mb="md" label={
        <Group gap="xs">
          <TbPackage size={13} />
          <Text size="xs" fw={500} c="dimmed">Docker Cleanup</Text>
        </Group>
      } labelPosition="left" />

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="md" wrap="wrap" gap="xs">
          <Box>
            <Text fw={600} size="sm" mb={2}>Dangling Images</Text>
            <Text size="xs" c="dimmed">Images yang tidak dipakai container manapun di host ini</Text>
          </Box>
          <Group gap="xs">
            {imagesData && (
              <Badge size="sm" variant="light" color={imagesData.count > 0 ? 'orange' : 'teal'}>
                {imagesData.count} image — {imagesData.totalSizeMB} MB
              </Badge>
            )}
            <ActionIcon size="sm" variant="subtle" color="gray" loading={imagesFetching} onClick={() => refetchImages()}>
              <TbRefresh size={13} />
            </ActionIcon>
            {imagesData?.count > 0 && (
              <Button size="xs" variant="light" color="red" leftSection={<TbTrash size={13} />}
                loading={pruneImages.isPending} onClick={confirmPruneImages}>
                Prune Images
              </Button>
            )}
          </Group>
        </Group>

        {imagesData?.count === 0 ? (
          <Alert color="teal" icon={<TbCheck size={14} />} p="xs">
            <Text size="xs">Tidak ada dangling images. Host Docker bersih!</Text>
          </Alert>
        ) : imagesData?.images && imagesData.images.length > 0 ? (
          <Paper withBorder radius="sm" style={{ overflow: 'hidden' }} mb="md">
            <ScrollArea.Autosize mah={200}>
              <Table fz="xs" horizontalSpacing="sm" verticalSpacing={4} highlightOnHover>
                <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Tag</Table.Th>
                    <Table.Th>Size</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {imagesData.images.map((img: any) => (
                    <Table.Tr key={img.id}>
                      <Table.Td><Code fz={10}>{img.id}</Code></Table.Td>
                      <Table.Td>
                        {img.tags.length > 0 ? <Code fz={10}>{img.tags[0]}</Code> : <Text fz="xs" c="dimmed">&lt;none&gt;</Text>}
                      </Table.Td>
                      <Table.Td><Text fz="xs">{fmtBytes(img.size)}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Paper>
        ) : null}

        <Divider label="Prune lainnya" labelPosition="center" mb="sm" />
        <Group gap="xs">
          <Button size="xs" variant="light" color="orange" leftSection={<TbTrash size={13} />}
            loading={pruneVolumes.isPending} onClick={() =>
              modals.openConfirmModal({
                title: 'Hapus Unused Volumes',
                children: (
                  <Stack gap="xs">
                    <Text size="sm">Hapus semua volume yang tidak dipakai?</Text>
                    <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
                      <Text size="xs" fw={600}>Data di volume yang dihapus tidak bisa dikembalikan.</Text>
                    </Alert>
                  </Stack>
                ),
                labels: { confirm: 'Hapus Volumes', cancel: 'Batal' },
                confirmProps: { color: 'red' },
                onConfirm: () => pruneVolumes.mutate(),
              })
            }
          >
            Prune Volumes
          </Button>
          <Button size="xs" variant="light" color="gray" leftSection={<TbTrash size={13} />}
            loading={pruneNetworks.isPending} onClick={() =>
              modals.openConfirmModal({
                title: 'Hapus Unused Networks',
                children: <Text size="sm">Hapus semua network Docker yang tidak dipakai container?</Text>,
                labels: { confirm: 'Hapus Networks', cancel: 'Batal' },
                confirmProps: { color: 'orange' },
                onConfirm: () => pruneNetworks.mutate(),
              })
            }
          >
            Prune Networks
          </Button>
        </Group>
      </Paper>

      {/* ─── Status Modal ────────────────────────────────── */}
      <Modal
        opened={statusOpen}
        onClose={closeStatus}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="teal" radius="md"><TbServer size={13} /></ThemeIcon>
            <Text fw={600} size="sm">Status — {statusStack?.name}</Text>
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
            <Paper withBorder p="sm" radius="md">
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={600}>Stack Info</Text>
                <Badge size="sm" color={statusData.stack.status === 1 ? 'teal' : 'red'} variant="light">
                  {statusData.stack.status === 1 ? 'Active' : 'Inactive'}
                </Badge>
              </Group>
              <Group gap="xl">
                {[['Type', statusData.stack.type === 2 ? 'Compose' : 'Swarm'], ['Endpoint', `#${statusData.stack.endpointId}`], ['Containers', statusData.containers.length]].map(([label, value]) => (
                  <Box key={String(label)}>
                    <Text size="xs" c="dimmed">{label}</Text>
                    <Text size="sm" fw={600}>{String(value)}</Text>
                  </Box>
                ))}
              </Group>
            </Paper>
            {statusData.containers.length > 0 ? (
              <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                <Table fz="xs" horizontalSpacing="sm" verticalSpacing="xs" highlightOnHover>
                  <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
                    <Table.Tr>
                      <Table.Th>Container</Table.Th>
                      <Table.Th>Image</Table.Th>
                      <Table.Th>State</Table.Th>
                      <Table.Th>Ports</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(statusData.containers as ContainerInfo[]).map(c => (
                      <Table.Tr key={c.id}>
                        <Table.Td>
                          <Text fz="xs" fw={500}>{c.names[0]}</Text>
                          <Code fz={10} c="dimmed">{c.shortId}</Code>
                        </Table.Td>
                        <Table.Td><Text fz="xs" style={{ wordBreak: 'break-all' }}>{c.image.split('/').pop()}</Text></Table.Td>
                        <Table.Td>
                          <Badge size="xs" color={stateColor[c.state] ?? 'gray'} variant="light">{c.state}</Badge>
                        </Table.Td>
                        <Table.Td>
                          {c.ports.length > 0 ? <Code fz={10}>{c.ports.join(', ')}</Code> : <Text fz="xs" c="dimmed">—</Text>}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
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

      {/* ─── Logs Modal ──────────────────────────────────── */}
      <Modal
        opened={logsOpen}
        onClose={() => { closeLogs(); setAutoRefresh(false) }}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="gray" radius="md"><TbFileText size={13} /></ThemeIcon>
            <Text fw={600} size="sm">Logs — {logsStack?.name}</Text>
          </Group>
        }
        size="xl"
        fullScreen={isMobile}
      >
        <Stack gap="sm">
          {/* Container selector dari status data */}
          {statusFetching && (statusData?.containers ?? []).length === 0 ? (
            <Group justify="center" py="xs"><Loader size="xs" /></Group>
          ) : (statusData?.containers ?? []).length === 0 ? (
            <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
              <Text size="xs">Tidak ada container. Klik Status terlebih dahulu untuk load container list.</Text>
            </Alert>
          ) : (
            <Group gap="xs" wrap="wrap">
              {(statusData.containers as ContainerInfo[]).map(c => (
                <Button
                  key={c.id}
                  size="xs"
                  variant={selectedContainerId === c.id ? 'filled' : 'light'}
                  color={stateColor[c.state] ?? 'gray'}
                  onClick={() => setSelectedContainerId(c.id)}
                  leftSection={<Badge size="xs" variant="dot" color={stateColor[c.state] ?? 'gray'} style={{ pointerEvents: 'none' }}>{c.state}</Badge>}
                >
                  {c.names[0]}
                </Button>
              ))}
            </Group>
          )}

          {/* Controls */}
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <NumberInput size="xs" w={90} label="Tail" min={10} max={1000} step={50} value={logTail} onChange={v => setLogTail(Number(v) || 200)} />
              <Stack gap={2} pt={2}>
                <Checkbox size="xs" label="stdout" checked={showStdout} onChange={e => setShowStdout(e.currentTarget.checked)} />
                <Checkbox size="xs" label="stderr" checked={showStderr} onChange={e => setShowStderr(e.currentTarget.checked)} />
              </Stack>
            </Group>
            <Group gap="xs" align="flex-end">
              <Switch size="xs" label="Auto refresh 5s" checked={autoRefresh} onChange={e => setAutoRefresh(e.currentTarget.checked)} />
              <Switch size="xs" label="Auto scroll" checked={autoScroll} onChange={e => setAutoScroll(e.currentTarget.checked)} />
              <ActionIcon size="sm" variant="subtle" color="gray" loading={logsFetching} onClick={() => refetchLogs()}><TbRefresh size={13} /></ActionIcon>
              <Tooltip label="Copy logs">
                <ActionIcon size="sm" variant="subtle" color="gray" disabled={logLines.length === 0}
                  onClick={() => {
                    const text = logLines.map(l => `[${l.stream}] ${l.timestamp ? new Date(l.timestamp).toLocaleTimeString('id-ID') + ' ' : ''}${l.message}`).join('\n')
                    navigator.clipboard.writeText(text)
                  }}>
                  <TbCopy size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Download .log">
                <ActionIcon size="sm" variant="subtle" color="gray" disabled={logLines.length === 0}
                  onClick={() => {
                    const text = logLines.map(l => `[${l.stream.toUpperCase()}] ${l.timestamp ?? ''} ${l.message}`).join('\n')
                    const blob = new Blob([text], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = `${logsStack?.name ?? 'container'}-${selectedContainerId?.slice(0, 8) ?? 'logs'}.log`
                    a.click(); URL.revokeObjectURL(url)
                  }}>
                  <TbDownload size={13} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          {/* Log output */}
          {!selectedContainerId ? (
            <Text size="xs" c="dimmed" ta="center" py="md">Pilih container di atas untuk melihat logs</Text>
          ) : logsFetching && logLines.length === 0 ? (
            <Group justify="center" py="xl"><Loader size="sm" /></Group>
          ) : (
            <Paper withBorder radius="sm" style={{ overflow: 'hidden' }}>
              <Group px="xs" py={4} justify="space-between" style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}>
                <Group gap="xs">
                  <Badge size="xs" color="gray" variant="filled">{logLines.length} baris</Badge>
                  {autoRefresh && <Badge size="xs" color="teal" variant="dot">live</Badge>}
                  {logsFetching && <Loader size={10} color="gray" />}
                </Group>
                <Code fz={10} c="dimmed">{selectedContainerId?.slice(0, 12)}</Code>
              </Group>
              <ScrollArea.Autosize mah={440} viewportRef={logViewportRef}
                onScrollPositionChange={({ y }) => {
                  if (logViewportRef.current) {
                    const { scrollHeight, clientHeight } = logViewportRef.current
                    setAutoScroll(y + clientHeight >= scrollHeight - 20)
                  }
                }}
              >
                <Box p="xs" style={{ background: '#0d1117', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, minHeight: 120 }}>
                  {logLines.length === 0 ? (
                    <Text fz={11} c="dimmed" ff="monospace">(tidak ada log)</Text>
                  ) : (
                    logLines.map((line, i) => (
                      <Box key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        {line.timestamp && (
                          <Text span fz={10} ff="monospace" style={{ color: '#8b949e', flexShrink: 0, userSelect: 'none', paddingTop: 1 }}>
                            {new Date(line.timestamp).toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </Text>
                        )}
                        <Text span fz={9} ff="monospace" style={{ color: line.stream === 'stderr' ? '#ff7b72' : '#7ee787', flexShrink: 0, paddingTop: 2, userSelect: 'none' }}>
                          {line.stream === 'stderr' ? 'ERR' : 'OUT'}
                        </Text>
                        <Text span fz={12} ff="monospace" style={{ color: line.stream === 'stderr' ? '#ff7b72' : '#e6edf3', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                          {line.message}
                        </Text>
                      </Box>
                    ))
                  )}
                </Box>
              </ScrollArea.Autosize>
            </Paper>
          )}
        </Stack>
      </Modal>
    </Box>
  )
}
