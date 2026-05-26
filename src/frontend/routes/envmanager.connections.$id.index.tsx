import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  Code,
  Divider,
  Drawer,
  Group,
  Loader,
  Modal,
  NumberInput,
  Pagination,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CodeEditor } from '@/frontend/components/CodeEditor'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { apiFetch } from '@/frontend/lib/api'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import {
  TbAlertTriangle,
  TbCheck,
  TbChevronLeft,
  TbChevronRight,
  TbFilter,
  TbFileCode,
  TbLayoutGrid,
  TbLayoutList,
  TbPencil,
  TbSearch,
  TbTool,
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
  TbBox,
  TbDatabase,
  TbNetwork,
  TbTerminal2,
  TbX,
  TbPlus,
  TbPlayerPlay,
  TbBookmark,
  TbClipboard,
  TbEraser,
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
  const { data: sessionData } = useSession()
  const user = sessionData?.user
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const canView = isSuperAdmin || hasCapability(user, 'connection:view')
  const canOperate = isSuperAdmin || hasCapability(user, 'stack:operate')
  const canMutate = isSuperAdmin || hasCapability(user, 'stack:mutate')
  const canPrune = isSuperAdmin || hasCapability(user, 'stack:prune')

  const [activeTab, setActiveTab] = useLocalStorage<string>({
    key: `envman:connection-detail:${id}:tab`,
    defaultValue: 'stacks',
  })

  const [stackView, setStackView] = useLocalStorage<'grid' | 'list'>({
    key: `envman:connection-detail:${id}:view`,
    defaultValue: 'list',
  })

  // Search / filter / pagination
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [filterLinked, setFilterLinked] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  // Compose modal state
  const [composeStack, setComposeStack] = useState<StackInfo | null>(null)
  const [composeOpen, { open: openCompose, close: closeCompose }] = useDisclosure(false)
  const [composeEditing, setComposeEditing] = useState(false)
  const [composeContent, setComposeContent] = useState('')

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
  const [liveLines, setLiveLines] = useState<{ stream: 'stdout' | 'stderr'; timestamp: string | null; message: string }[]>([])
  const lastLogTimestamp = useRef<string | null>(null)

  // Cleanup state — endpointId diambil dari stacks setelah load
  const [cleanupEndpointId, setCleanupEndpointId] = useState<number | null>(null)

  // Exec drawer state
  type ExecContainer = { containerId: string; endpointId: number; containerName: string; stackName: string }
  const [execContainer, setExecContainer] = useState<ExecContainer | null>(null)
  const [execOpen, { open: openExec, close: closeExec }] = useDisclosure(false)
  const [execCommand, setExecCommand] = useState('')
  const [execHistory, setExecHistory] = useState<{ command: string; stdout: string[]; stderr: string[]; exitCode: number | null; timestamp: number }[]>([])
  const [execQuickCommands, setExecQuickCommands] = useLocalStorage<{ id: string; label: string; command: string }[]>({
    key: 'envman:exec:quick-commands',
    defaultValue: [
      { id: 'ps', label: 'ps', command: 'ps aux' },
      { id: 'env', label: 'env', command: 'env | sort' },
      { id: 'df', label: 'df', command: 'df -h' },
      { id: 'free', label: 'free', command: 'free -h 2>/dev/null || cat /proc/meminfo 2>/dev/null' },
      { id: 'netstat', label: 'netstat', command: 'netstat -tlnp 2>/dev/null || ss -tlnp' },
    ],
  })
  const [execShowQuickAdd, setExecShowQuickAdd] = useState(false)
  const [execNewQuickLabel, setExecNewQuickLabel] = useState('')
  const [execNewQuickCommand, setExecNewQuickCommand] = useState('')
  const execHistoryIdxRef = useRef(-1)
  const execOutputRef = useRef<HTMLDivElement>(null)

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['portainer', 'connection-detail', id],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/stacks`),
    refetchInterval: 30000,
  })

  const { data: composeData, isFetching: composeFetching } = useQuery({
    queryKey: ['portainer', 'compose-file', id, composeStack?.id],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/stacks/${composeStack!.id}/file`),
    enabled: composeOpen && !!composeStack,
    staleTime: 0,
  })

  // Sync compose content ke state saat data tiba
  useEffect(() => {
    if (composeData?.content !== undefined && !composeEditing) {
      setComposeContent(composeData.content)
    }
  }, [composeData, composeEditing])

  const { data: logsData, isFetching: logsFetching, refetch: refetchLogs } = useQuery({
    queryKey: ['portainer', 'container-logs', id, logsStack?.id, selectedContainerId, logTail, showStdout, showStderr],
    queryFn: async () => {
      const qs = new URLSearchParams({ tail: String(logTail), stdout: showStdout ? '1' : '0', stderr: showStderr ? '1' : '0', timestamps: '1' })
      const result = await apiFetch(`/api/envman/portainer/connections/${id}/stacks/${logsStack!.id}/logs/${selectedContainerId}?${qs}`)
      // Full load — reset liveLines
      setLiveLines(result.lines ?? [])
      const last = (result.lines ?? []).findLast?.((l: any) => l.timestamp)
      if (last?.timestamp) lastLogTimestamp.current = last.timestamp
      return result
    },
    enabled: logsOpen && !!logsStack && !!selectedContainerId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  // Incremental fetch saat auto-refresh aktif
  useEffect(() => {
    if (!autoRefresh || !logsOpen || !logsStack || !selectedContainerId) return
    const interval = setInterval(async () => {
      try {
        const qs = new URLSearchParams({ stdout: showStdout ? '1' : '0', stderr: showStderr ? '1' : '0', timestamps: '1', tail: '100' })
        if (lastLogTimestamp.current) qs.set('since', lastLogTimestamp.current)
        const result = await apiFetch(`/api/envman/portainer/connections/${id}/stacks/${logsStack.id}/logs/${selectedContainerId}?${qs}`)
        const newLines = (result.lines ?? []) as typeof liveLines
        if (newLines.length > 0) {
          setLiveLines(prev => [...prev, ...newLines].slice(-2000)) // max 2000 baris
          const last = newLines.findLast?.((l: any) => l.timestamp)
          if (last?.timestamp) lastLogTimestamp.current = last.timestamp
        }
      } catch {}
    }, 2000)
    return () => clearInterval(interval)
  }, [autoRefresh, logsOpen, logsStack, selectedContainerId, showStdout, showStderr, id])

  // Auto-scroll exec output ke bawah setiap kali history berubah
  useEffect(() => {
    if (execOpen && execOutputRef.current) {
      execOutputRef.current.scrollTop = execOutputRef.current.scrollHeight
    }
  }, [execHistory, execOpen])

  const { data: imagesData, isFetching: imagesFetching, refetch: refetchImages } = useQuery({
    queryKey: ['portainer', 'dangling-images', id, cleanupEndpointId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/images/dangling?endpointId=${cleanupEndpointId}`),
    enabled: cleanupEndpointId !== null,
    staleTime: 30000,
  })

  const { data: containersData, isFetching: containersFetching, refetch: refetchContainers } = useQuery({
    queryKey: ['portainer', 'stopped-containers', id, cleanupEndpointId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/containers/stopped?endpointId=${cleanupEndpointId}`),
    enabled: cleanupEndpointId !== null,
    staleTime: 30000,
  })

  const { data: volumesData, isFetching: volumesFetching, refetch: refetchVolumes } = useQuery({
    queryKey: ['portainer', 'unused-volumes', id, cleanupEndpointId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/volumes/unused?endpointId=${cleanupEndpointId}`),
    enabled: cleanupEndpointId !== null,
    staleTime: 30000,
  })

  const { data: networksData, isFetching: networksFetching, refetch: refetchNetworks } = useQuery({
    queryKey: ['portainer', 'unused-networks', id, cleanupEndpointId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/networks/unused?endpointId=${cleanupEndpointId}`),
    enabled: cleanupEndpointId !== null,
    staleTime: 30000,
  })

  const connection = data?.connection
  const stacks: StackInfo[] = data?.stacks ?? []
  const logLines: LogLine[] = liveLines

  // Set default endpointId dari stack pertama setelah data tiba
  useEffect(() => {
    if (stacks.length > 0 && cleanupEndpointId === null) {
      setCleanupEndpointId(stacks[0].endpointId)
    }
  }, [stacks, cleanupEndpointId])

  // Unique endpoint IDs dari semua stacks
  const endpointIds = [...new Set(stacks.map(s => s.endpointId))].sort()

  const filteredStacks = useMemo(() => {
    let list = [...stacks]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s => s.name.toLowerCase().includes(q))
    }
    if (filterStatus === 'active') list = list.filter(s => s.status === 1)
    if (filterStatus === 'inactive') list = list.filter(s => s.status !== 1)
    if (filterType === 'compose') list = list.filter(s => s.type === 2)
    if (filterType === 'swarm') list = list.filter(s => s.type !== 2)
    if (filterLinked === 'linked') list = list.filter(s => s.linkedEnvs.length > 0)
    if (filterLinked === 'unlinked') list = list.filter(s => s.linkedEnvs.length === 0)
    return list
  }, [stacks, search, filterStatus, filterType, filterLinked])

  const totalPages = Math.max(1, Math.ceil(filteredStacks.length / PAGE_SIZE))
  const pagedStacks = filteredStacks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const hasFilter = !!search.trim() || !!filterStatus || !!filterType || !!filterLinked

  // Reset ke page 1 saat filter berubah
  useEffect(() => { setPage(1) }, [search, filterStatus, filterType, filterLinked])

  // Query status per stack — langsung aktif, tampil di card tanpa klik apapun
  const stackStatusQueries = useQueries({
    queries: stacks.map(stack => ({
      queryKey: ['portainer', 'stack-status', id, stack.id],
      queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/stacks/${stack.id}/status`),
      enabled: stacks.length > 0,
      refetchInterval: 30000,
      staleTime: 20000,
    })),
  })
  const stackStatusMap = Object.fromEntries(
    stacks.map((stack, i) => [stack.id, {
      containers: (stackStatusQueries[i]?.data?.containers ?? []) as ContainerInfo[],
      isFetching: stackStatusQueries[i]?.isFetching ?? false,
    }])
  )

  // Flatten all containers with their stack info for stats queries
  const allContainersFlat = stacks.flatMap(stack =>
    (stackStatusMap[stack.id]?.containers ?? []).map(c => ({ stackId: stack.id, containerId: c.id }))
  )

  // Container stats — enabled only on Stacks tab, refetch every 10s
  const containerStatsQueries = useQueries({
    queries: allContainersFlat.map(({ stackId, containerId }) => ({
      queryKey: ['portainer', 'container-stats', id, stackId, containerId],
      queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/stacks/${stackId}/containers/${containerId}/stats`),
      enabled: activeTab === 'stacks' && allContainersFlat.length > 0,
      refetchInterval: 10000,
      staleTime: 8000,
      retry: false,
    })),
  })
  const containerStatsMap = Object.fromEntries(
    allContainersFlat.map(({ containerId }, i) => [containerId, containerStatsQueries[i]?.data as {
      cpuPercent: number; memUsageMB: number; memLimitMB: number; memPercent: number; netRxMB: number; netTxMB: number
    } | undefined])
  )

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logViewportRef.current) {
      logViewportRef.current.scrollTo({ top: logViewportRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [logLines, autoScroll])

  // ─── Mutations ────────────────────────────────────────────────────────────
  const saveCompose = useMutation({
    mutationFn: () => apiFetch(`/api/envman/portainer/connections/${id}/stacks/${composeStack!.id}/file`, {
      method: 'PUT', body: JSON.stringify({ content: composeContent }),
    }),
    onSuccess: () => {
      notifyOk('Compose file berhasil disimpan')
      setComposeEditing(false)
      qc.invalidateQueries({ queryKey: ['portainer', 'compose-file', id, composeStack?.id] })
    },
    onError: (e) => notifyErr(e),
  })

  const restartContainer = useMutation({
    mutationFn: ({ stackId, containerId }: { stackId: number; containerId: string }) =>
      apiFetch(`/api/envman/portainer/connections/${id}/stacks/${stackId}/containers/${containerId}/restart`, { method: 'POST' }),
    onSuccess: (_, { stackId }) => {
      notifyOk('Container berhasil di-restart')
      qc.invalidateQueries({ queryKey: ['portainer', 'stack-status', id, stackId] })
    },
    onError: (e) => notifyErr(e),
  })

  const confirmRestartContainer = (stack: StackInfo, containerId: string, containerName: string) =>
    modals.openConfirmModal({
      title: 'Restart Container',
      children: (
        <Stack gap="xs">
          <Text size="sm">Restart container <strong>{containerName}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Container akan stop sebentar lalu start kembali. Request yang sedang berjalan akan terputus.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Restart', cancel: 'Batal' },
      confirmProps: { color: 'orange' },
      onConfirm: () => restartContainer.mutate({ stackId: stack.id, containerId }),
    })

  const confirmSaveCompose = () =>
    modals.openConfirmModal({
      title: 'Simpan Compose File',
      children: (
        <Stack gap="xs">
          <Text size="sm">Simpan perubahan ke stack <strong>{composeStack?.name}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Perubahan langsung diterapkan ke Portainer. Container mungkin tidak otomatis restart — gunakan Recreate jika diperlukan.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Simpan', cancel: 'Batal' },
      confirmProps: { color: 'blue' },
      onConfirm: () => saveCompose.mutate(),
    })

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
    onSuccess: (d: any) => {
      if (d.remaining > 0 && d.stuckByContainers > 0) {
        notifyOk(`${d.deletedCount} image dihapus — ${d.reclaimedMB} MB dibebaskan. ${d.stuckByContainers} image tidak bisa dihapus karena masih direferensi container (termasuk yang stopped).`)
      } else if (d.remaining > 0) {
        notifyOk(`${d.deletedCount} image dihapus — ${d.reclaimedMB} MB dibebaskan. ${d.remaining} image tersisa.`)
      } else {
        notifyOk(`${d.deletedCount} image dihapus — ${d.reclaimedMB} MB dibebaskan`)
      }
      refetchImages()
    },
    onError: (e) => notifyErr(e),
  })

  const pruneContainers = useMutation({
    mutationFn: () => apiFetch(`/api/envman/portainer/connections/${id}/prune/containers?endpointId=${cleanupEndpointId}`, { method: 'POST' }),
    onSuccess: (d: any) => {
      notifyOk(`${d.deletedContainers?.length ?? 0} container dihapus — ${d.reclaimedMB} MB dibebaskan`)
      refetchContainers()
      refetchImages()
    },
    onError: (e) => notifyErr(e),
  })

  const pruneVolumes = useMutation({
    mutationFn: () => apiFetch(`/api/envman/portainer/connections/${id}/prune/volumes?endpointId=${cleanupEndpointId}`, { method: 'POST' }),
    onSuccess: (d: any) => {
      notifyOk(`${d.deletedVolumes?.length ?? 0} volume dihapus — ${d.reclaimedMB} MB dibebaskan`)
      refetchVolumes()
    },
    onError: (e) => notifyErr(e),
  })

  const pruneNetworks = useMutation({
    mutationFn: () => apiFetch(`/api/envman/portainer/connections/${id}/prune/networks?endpointId=${cleanupEndpointId}`, { method: 'POST' }),
    onSuccess: (d: any) => {
      notifyOk(`${d.deletedNetworks?.length ?? 0} network dihapus`)
      refetchNetworks()
    },
    onError: (e) => notifyErr(e),
  })

  const execMutation = useMutation({
    mutationFn: ({ containerId, endpointId, command }: { containerId: string; endpointId: number; command: string }) =>
      apiFetch(`/api/envman/portainer/connections/${id}/exec`, {
        method: 'POST',
        body: JSON.stringify({ containerId, endpointId, command }),
      }),
    onSuccess: (data: any, { command }) => {
      setExecHistory(prev => [{
        command,
        stdout: data.stdout ?? [],
        stderr: data.stderr ?? [],
        exitCode: data.exitCode ?? null,
        timestamp: Date.now(),
      }, ...prev])
      setExecCommand('')
    },
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

  // Capability gate — butuh connection:view minimal
  if (!canView) {
    return (
      <Box p="md">
        <Alert color="yellow" icon={<TbAlertTriangle size={16} />} variant="light">
          <Text size="sm" fw={600} mb={4}>Tidak punya izin lihat connection detail</Text>
          <Text size="xs">Minta SUPER_ADMIN untuk grant capability <code>connection:view</code>.</Text>
          <Button size="xs" mt="sm" component={Link} to="/envmanager/connections">← Kembali</Button>
        </Alert>
      </Box>
    )
  }

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
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => navigate({ to: '/envmanager/connections', search: { tab: 'connections' } })}>
            <TbChevronLeft size={16} />
          </ActionIcon>
          <ThemeIcon size={36} radius="md" variant="gradient">
            <TbPlugConnected size={18} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={700} size="md" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {connection.name}
              </Text>
              <Badge size="sm" variant="light" color="primary">{stacks.length} stack</Badge>
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

      {/* ─── Tabs ───────────────────────────────────────── */}
      <Tabs value={activeTab} onChange={v => setActiveTab(v ?? 'stacks')} mb="sm">
        <Tabs.List>
          <Tabs.Tab value="stacks" leftSection={<TbServer size={14} />}>
            Stacks
            {stacks.length > 0 && <Badge size="xs" variant="light" color="primary" ml="xs">{stacks.length}</Badge>}
          </Tabs.Tab>
          <Tabs.Tab value="maintenance" leftSection={<TbTool size={14} />}>
            Maintenance
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {/* ─── Tab: Stacks ────────────────────────────────── */}
      {activeTab === 'stacks' && <>

      {/* ─── Stacks header ──────────────────────────────── */}
      <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
        <Group gap="xs">
          <Text fw={600} size="sm">Stacks</Text>
          <Badge size="sm" variant="light" color="gray">{filteredStacks.length}{filteredStacks.length !== stacks.length ? `/${stacks.length}` : ''}</Badge>
        </Group>
        {stacks.length > 0 && (
          <Tooltip label={stackView === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setStackView(v => v === 'grid' ? 'list' : 'grid')}>
              {stackView === 'grid' ? <TbLayoutList size={15} /> : <TbLayoutGrid size={15} />}
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      {/* Search + filter toolbar */}
      {stacks.length > 0 && (
        <Group mb="sm" gap="xs" wrap="wrap">
          <TextInput
            size="xs"
            placeholder="Cari nama stack..."
            leftSection={<TbSearch size={13} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            rightSection={search ? <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearch('')}><TbX size={11} /></ActionIcon> : undefined}
            style={{ flex: 1, minWidth: 140 }}
          />
          <Select
            size="xs" w={120} placeholder="Status"
            leftSection={<TbFilter size={12} />}
            data={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
            value={filterStatus} onChange={setFilterStatus}
            clearable
          />
          <Select
            size="xs" w={120} placeholder="Type"
            leftSection={<TbFilter size={12} />}
            data={[{ value: 'compose', label: 'Compose' }, { value: 'swarm', label: 'Swarm' }]}
            value={filterType} onChange={setFilterType}
            clearable
          />
          <Select
            size="xs" w={130} placeholder="Linked envman"
            leftSection={<TbFilter size={12} />}
            data={[{ value: 'linked', label: 'Terhubung' }, { value: 'unlinked', label: 'Tidak terhubung' }]}
            value={filterLinked} onChange={setFilterLinked}
            clearable
          />
          {hasFilter && (
            <Tooltip label="Reset semua filter">
              <Badge size="sm" variant="light" color="blue" rightSection={<TbX size={10} />}
                style={{ cursor: 'pointer' }}
                onClick={() => { setSearch(''); setFilterStatus(null); setFilterType(null); setFilterLinked(null) }}>
                Reset
              </Badge>
            </Tooltip>
          )}
        </Group>
      )}

      {stacks.length === 0 ? (
        <Alert color="gray" icon={<TbServer size={14} />} p="xs">
          <Text size="xs">Tidak ada stack ditemukan di Portainer instance ini.</Text>
        </Alert>
      ) : filteredStacks.length === 0 ? (
        <Box p="lg" ta="center" mb="xl" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
          <TbSearch size={28} style={{ opacity: 0.2, margin: '0 auto 8px' }} />
          <Text size="sm" fw={500} mb={4}>Tidak ada stack yang cocok</Text>
          <Text size="xs" c="dimmed" mb="sm">Coba ubah kata kunci atau reset filter.</Text>
          <Button size="xs" variant="subtle" leftSection={<TbX size={12} />}
            onClick={() => { setSearch(''); setFilterStatus(null); setFilterType(null); setFilterLinked(null) }}>
            Reset filter
          </Button>
        </Box>
      ) : stackView === 'grid' ? (
        <>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb={totalPages > 1 ? 'sm' : 'xl'}>
          {pagedStacks.map(stack => {
            const { containers: stackContainers, isFetching: stackFetching } = stackStatusMap[stack.id] ?? { containers: [], isFetching: false }
            const runningCount = stackContainers.filter(c => c.state === 'running').length
            const totalCount = stackContainers.length
            return (
              <Box key={stack.id} style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>

                {/* ── Stack header ─────────────────────────── */}
                <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-default-hover)' }}>
                  <Group justify="space-between" wrap="wrap" gap="xs">
                    <Group gap="sm" style={{ minWidth: 0 }}>
                      <ThemeIcon size={40} radius="md" variant="light" color={stack.status === 1 ? 'teal' : 'red'}>
                        <TbServer size={20} />
                      </ThemeIcon>
                      <Box style={{ minWidth: 0 }}>
                        <Group gap="xs" mb={4} wrap="nowrap">
                          <Text fw={700} size="md" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {stack.name}
                          </Text>
                          <Badge size="xs" color={stack.status === 1 ? 'teal' : 'red'} variant="light">
                            {stack.status === 1 ? 'active' : 'inactive'}
                          </Badge>
                          <Badge size="xs" variant="outline" color="gray">{stack.type === 2 ? 'compose' : 'swarm'}</Badge>
                          <Badge size="xs" variant="dot" color="gray">ep#{stack.endpointId}</Badge>
                        </Group>
                        <Group gap="xs">
                          <Text size="xs" c="dimmed">Diperbarui {relTime(stack.updatedAt)}</Text>
                          {!stackFetching && totalCount > 0 && (
                            <Badge size="xs" variant="light" color={runningCount === totalCount ? 'teal' : runningCount > 0 ? 'yellow' : 'red'}>
                              {runningCount}/{totalCount} running
                            </Badge>
                          )}
                          {stackFetching && <Loader size={10} />}
                        </Group>
                      </Box>
                    </Group>

                    {/* Stack-level actions */}
                    <Group gap="xs" wrap="nowrap">
                      <Tooltip label="Lihat & edit compose file">
                        <Button size="xs" variant="subtle" color="gray"
                          leftSection={<TbFileCode size={13} />}
                          onClick={() => { setComposeStack(stack); setComposeEditing(false); openCompose() }}
                        >
                          Compose
                        </Button>
                      </Tooltip>
                      {canMutate && (
                        <Tooltip label="Pull image terbaru & restart">
                          <Button size="xs" variant="light" color="blue"
                            leftSection={<TbRefreshDot size={13} />}
                            loading={repull.isPending && (repull.variables as number) === stack.id}
                            onClick={() => confirmRepull(stack)}
                          >
                            Repull
                          </Button>
                        </Tooltip>
                      )}
                      {canMutate && (
                        <Tooltip label="Force recreate (stop→start)">
                          <Button size="xs" variant="light" color="orange"
                            leftSection={<TbRefresh size={13} />}
                            loading={recreate.isPending && (recreate.variables as number) === stack.id}
                            onClick={() => confirmRecreate(stack)}
                          >
                            Recreate
                          </Button>
                        </Tooltip>
                      )}
                    </Group>
                  </Group>
                </Box>

                {/* ── Containers list ──────────────────────── */}
                <Box p="md">
                  <Stack gap="xs">
                    {stackFetching && stackContainers.length === 0 ? (
                      <Group gap="xs" py="xs">
                        <Loader size="xs" />
                        <Text size="xs" c="dimmed">Memuat containers...</Text>
                      </Group>
                    ) : stackContainers.length === 0 ? (
                      <Text size="xs" c="dimmed" py="xs">Tidak ada container di stack ini.</Text>
                    ) : (
                      stackContainers.map(c => (
                        <Box
                          key={c.id} p="sm"
                          style={{ borderRadius: 'var(--mantine-radius-md)', border: `1px solid ${stateColor[c.state] ? `var(--mantine-color-${stateColor[c.state]}-3)` : 'var(--mantine-color-default-border)'}`, cursor: 'pointer' }}
                          onClick={() => { setLogsStack(stack); setSelectedContainerId(c.id); openLogs() }}
                        >
                          <Group justify="space-between" wrap="nowrap" gap="xs">
                            <Group gap="sm" style={{ minWidth: 0 }}>
                              <ThemeIcon size={32} radius="md" variant="light" color={stateColor[c.state] ?? 'gray'}>
                                <TbServer size={15} />
                              </ThemeIcon>
                              <Box style={{ minWidth: 0 }}>
                                <Text size="sm" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.names[0]}
                                </Text>
                                <Group gap="xs" mt={2} wrap="nowrap">
                                  <Code fz={10} c="dimmed">{c.shortId}</Code>
                                  <Text fz={10} c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                                    {c.image.split('/').pop()}
                                  </Text>
                                </Group>
                                {(() => {
                                  const s = containerStatsMap[c.id]
                                  if (!s) return null
                                  return (
                                    <Group gap={6} mt={2} wrap="nowrap">
                                      <Badge size="xs" variant="dot" color={s.cpuPercent > 80 ? 'red' : s.cpuPercent > 50 ? 'orange' : 'teal'}>
                                        CPU {s.cpuPercent.toFixed(1)}%
                                      </Badge>
                                      <Badge size="xs" variant="dot" color={s.memPercent > 80 ? 'red' : s.memPercent > 50 ? 'orange' : 'blue'}>
                                        {s.memUsageMB}MB
                                      </Badge>
                                    </Group>
                                  )
                                })()}
                              </Box>
                            </Group>
                            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                              <Badge size="sm" color={stateColor[c.state] ?? 'gray'} variant="light">{c.state}</Badge>
                              {c.ports.length > 0 && <Code fz={10}>{c.ports[0]}</Code>}
                              {canMutate && (
                                <Tooltip label="Restart container">
                                  <ActionIcon size="sm" variant="subtle" color="orange"
                                    loading={restartContainer.isPending && (restartContainer.variables as any)?.containerId === c.id}
                                    onClick={e => { e.stopPropagation(); confirmRestartContainer(stack, c.id, c.names[0]) }}>
                                    <TbRefresh size={13} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                              <Tooltip label="Lihat logs">
                                <ActionIcon size="sm" variant="subtle" color="gray" onClick={e => { e.stopPropagation(); setLogsStack(stack); setSelectedContainerId(c.id); openLogs() }}>
                                  <TbFileText size={13} />
                                </ActionIcon>
                              </Tooltip>
                              {canOperate && (
                                <Tooltip label="Exec command">
                                  <ActionIcon size="sm" variant="subtle" color="teal"
                                    onClick={e => { e.stopPropagation(); setExecContainer({ containerId: c.id, endpointId: stack.endpointId, containerName: c.names[0], stackName: stack.name }); setExecHistory([]); openExec() }}>
                                    <TbTerminal2 size={13} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </Group>
                          </Group>
                        </Box>
                      ))
                    )}

                    {/* Linked envman environments */}
                    {stack.linkedEnvs.length > 0 && (
                      <>
                        <Divider mt="xs" label={<Text size="xs" c="dimmed" fw={500}>Terhubung ke envman</Text>} labelPosition="left" />
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
                                leftSection={env.lastSyncOk === true ? <TbCheck size={9} /> : env.lastSyncOk === false ? <TbX size={9} /> : undefined}
                                rightSection={<TbChevronRight size={9} />}
                                style={{ cursor: 'pointer' }}
                              >
                                {env.projectName}:{env.envName}
                              </Badge>
                            </Anchor>
                          ))}
                        </Group>
                      </>
                    )}
                  </Stack>
                </Box>
              </Box>
            )
          })}
        </SimpleGrid>
        {totalPages > 1 && (
          <Group justify="center" mb="xl">
            <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
          </Group>
        )}
        </>
      ) : (
        <>
        <Stack gap="md" mb={totalPages > 1 ? 'sm' : 'xl'}>
          {pagedStacks.map(stack => {
            const { containers: stackContainers, isFetching: stackFetching } = stackStatusMap[stack.id] ?? { containers: [], isFetching: false }
            const runningCount = stackContainers.filter(c => c.state === 'running').length
            const totalCount = stackContainers.length
            return (
              <Box key={stack.id} style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
                <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-default-hover)' }}>
                  <Group justify="space-between" wrap="wrap" gap="xs">
                    <Group gap="sm" style={{ minWidth: 0 }}>
                      <ThemeIcon size={40} radius="md" variant="light" color={stack.status === 1 ? 'teal' : 'red'}>
                        <TbServer size={20} />
                      </ThemeIcon>
                      <Box style={{ minWidth: 0 }}>
                        <Group gap="xs" mb={4} wrap="nowrap">
                          <Text fw={700} size="md" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stack.name}</Text>
                          <Badge size="xs" color={stack.status === 1 ? 'teal' : 'red'} variant="light">{stack.status === 1 ? 'active' : 'inactive'}</Badge>
                          <Badge size="xs" variant="outline" color="gray">{stack.type === 2 ? 'compose' : 'swarm'}</Badge>
                          <Badge size="xs" variant="dot" color="gray">ep#{stack.endpointId}</Badge>
                        </Group>
                        <Group gap="xs">
                          <Text size="xs" c="dimmed">Diperbarui {relTime(stack.updatedAt)}</Text>
                          {!stackFetching && totalCount > 0 && (
                            <Badge size="xs" variant="light" color={runningCount === totalCount ? 'teal' : runningCount > 0 ? 'yellow' : 'red'}>
                              {runningCount}/{totalCount} running
                            </Badge>
                          )}
                          {stackFetching && <Loader size={10} />}
                        </Group>
                      </Box>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      <Tooltip label="Pull image terbaru & restart">
                        <Button size="xs" variant="light" color="blue" leftSection={<TbRefreshDot size={13} />}
                          loading={repull.isPending && (repull.variables as number) === stack.id}
                          onClick={() => confirmRepull(stack)}>Repull</Button>
                      </Tooltip>
                      <Tooltip label="Force recreate (stop→start)">
                        <Button size="xs" variant="light" color="orange" leftSection={<TbRefresh size={13} />}
                          loading={recreate.isPending && (recreate.variables as number) === stack.id}
                          onClick={() => confirmRecreate(stack)}>Recreate</Button>
                      </Tooltip>
                    </Group>
                  </Group>
                </Box>
                <Box p="md">
                  <Stack gap="xs">
                    {stackFetching && stackContainers.length === 0 ? (
                      <Group gap="xs" py="xs"><Loader size="xs" /><Text size="xs" c="dimmed">Memuat containers...</Text></Group>
                    ) : stackContainers.length === 0 ? (
                      <Text size="xs" c="dimmed" py="xs">Tidak ada container di stack ini.</Text>
                    ) : (
                      stackContainers.map(c => (
                        <Box key={c.id} p="sm" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', cursor: 'pointer' }}
                          onClick={() => { setLogsStack(stack); setSelectedContainerId(c.id); openLogs() }}>
                          <Group justify="space-between" wrap="nowrap" gap="xs">
                            <Group gap="sm" style={{ minWidth: 0 }}>
                              <ThemeIcon size={32} radius="md" variant="light" color={stateColor[c.state] ?? 'gray'}>
                                <TbServer size={15} />
                              </ThemeIcon>
                              <Box style={{ minWidth: 0 }}>
                                <Text size="sm" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.names[0]}</Text>
                                <Group gap="xs" mt={2} wrap="nowrap">
                                  <Code fz={10} c="dimmed">{c.shortId}</Code>
                                  <Text fz={10} c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{c.image.split('/').pop()}</Text>
                                </Group>
                              </Box>
                            </Group>
                            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                              <Badge size="sm" color={stateColor[c.state] ?? 'gray'} variant="light">{c.state}</Badge>
                              {c.ports.length > 0 && <Code fz={10}>{c.ports[0]}</Code>}
                              {canMutate && (
                                <Tooltip label="Restart container">
                                  <ActionIcon size="sm" variant="subtle" color="orange"
                                    loading={restartContainer.isPending && (restartContainer.variables as any)?.containerId === c.id}
                                    onClick={e => { e.stopPropagation(); confirmRestartContainer(stack, c.id, c.names[0]) }}>
                                    <TbRefresh size={13} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                              <Tooltip label="Lihat logs">
                                <ActionIcon size="sm" variant="subtle" color="gray" onClick={e => { e.stopPropagation(); setLogsStack(stack); setSelectedContainerId(c.id); openLogs() }}>
                                  <TbFileText size={13} />
                                </ActionIcon>
                              </Tooltip>
                              {canOperate && (
                                <Tooltip label="Exec command">
                                  <ActionIcon size="sm" variant="subtle" color="teal"
                                    onClick={e => { e.stopPropagation(); setExecContainer({ containerId: c.id, endpointId: stack.endpointId, containerName: c.names[0], stackName: stack.name }); setExecHistory([]); openExec() }}>
                                    <TbTerminal2 size={13} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </Group>
                          </Group>
                        </Box>
                      ))
                    )}
                    {stack.linkedEnvs.length > 0 && (
                      <>
                        <Divider mt="xs" label={<Text size="xs" c="dimmed" fw={500}>Terhubung ke envman</Text>} labelPosition="left" />
                        <Group gap="xs" wrap="wrap">
                          {stack.linkedEnvs.map(env => (
                            <Anchor key={`${env.slug}:${env.envName}`} size="xs" component={Link} to="/envmanager/$slug/$env" params={{ slug: env.slug, env: env.envName } as any}>
                              <Badge size="sm" variant="light"
                                color={env.lastSyncOk === true ? 'teal' : env.lastSyncOk === false ? 'red' : 'gray'}
                                leftSection={env.lastSyncOk === true ? <TbCheck size={9} /> : env.lastSyncOk === false ? <TbX size={9} /> : undefined}
                                rightSection={<TbChevronRight size={9} />} style={{ cursor: 'pointer' }}>
                                {env.projectName}:{env.envName}
                              </Badge>
                            </Anchor>
                          ))}
                        </Group>
                      </>
                    )}
                  </Stack>
                </Box>
              </Box>
            )
          })}
        </Stack>
        {totalPages > 1 && (
          <Group justify="center" mb="xl">
            <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
          </Group>
        )}
        </>
      )}

      </>}

      {/* ─── Tab: Maintenance ───────────────────────────── */}
      {activeTab === 'maintenance' && <>

      <Divider mb="md" label={
        <Group gap="xs">
          <TbPackage size={13} />
          <Text size="xs" fw={500} c="dimmed">Docker Cleanup</Text>
        </Group>
      } labelPosition="left" />

      <Box p="md" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
        {/* Endpoint selector */}
        {endpointIds.length > 1 && (
          <Group mb="md" gap="xs">
            <Text size="xs" c="dimmed" fw={500}>Endpoint:</Text>
            {endpointIds.map(epId => (
              <Badge
                key={epId} size="sm"
                variant={cleanupEndpointId === epId ? 'filled' : 'outline'}
                color="gray" style={{ cursor: 'pointer' }}
                onClick={() => setCleanupEndpointId(epId)}
              >
                #{epId}
              </Badge>
            ))}
          </Group>
        )}
        {cleanupEndpointId !== null && (
          <Text size="xs" c="dimmed" mb="md">
            Endpoint <strong>#{cleanupEndpointId}</strong>
          </Text>
        )}

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
            {cleanupEndpointId === null && (
              <Text size="xs" c="dimmed">Menunggu data stacks...</Text>
            )}
            <ActionIcon size="sm" variant="subtle" color="gray" loading={imagesFetching} onClick={() => refetchImages()}>
              <TbRefresh size={13} />
            </ActionIcon>
            {imagesData?.count > 0 && canPrune && (
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
          <Box mb="md" style={{ borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
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
          </Box>
        ) : null}

        {/* Info jika ada stuck images setelah prune */}
        {pruneImages.data?.stuckByContainers > 0 && (
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs" mb="sm">
            <Text size="xs" fw={500} mb={2}>
              {pruneImages.data.stuckByContainers} image tidak bisa dihapus
            </Text>
            <Text size="xs" c="dimmed">
              Image masih direferensi oleh container yang stopped. Hapus container tersebut terlebih dahulu dengan <strong>Prune Volumes</strong> atau hapus manual di Portainer, lalu coba prune ulang.
            </Text>
            {pruneImages.data.stuckImages?.length > 0 && (
              <Group gap="xs" mt="xs" wrap="wrap">
                {pruneImages.data.stuckImages.map((img: any) => (
                  <Code key={img.id} fz={10}>{img.tags[0] ?? img.id}</Code>
                ))}
              </Group>
            )}
          </Alert>
        )}

        {/* ─── Stopped Containers ─── */}
        <Divider mb="md" mt="md" label={
          <Group gap={6}><TbBox size={12} /><Text size="xs" fw={500} c="dimmed">Stopped Containers</Text></Group>
        } labelPosition="left" />
        <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
          <Box>
            <Text fw={600} size="sm" mb={2}>Stopped / Dead Containers</Text>
            <Text size="xs" c="dimmed">Container yang sudah berhenti dan belum dihapus</Text>
          </Box>
          <Group gap="xs">
            {containersData && (
              <Badge size="sm" variant="light" color={containersData.count > 0 ? 'orange' : 'teal'}>
                {containersData.count} container{containersData.totalSizeMB > 0 ? ` — ${containersData.totalSizeMB} MB` : ''}
              </Badge>
            )}
            <ActionIcon size="sm" variant="subtle" color="gray" loading={containersFetching} onClick={() => refetchContainers()}>
              <TbRefresh size={13} />
            </ActionIcon>
            {containersData?.count > 0 && canPrune && (
              <Button size="xs" variant="light" color="red" leftSection={<TbTrash size={13} />}
                loading={pruneContainers.isPending}
                onClick={() => modals.openConfirmModal({
                  title: 'Hapus Stopped Containers',
                  children: (
                    <Stack gap="xs">
                      <Text size="sm">Hapus <strong>{containersData.count}</strong> stopped/dead container?</Text>
                      <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
                        <Text size="xs">Container yang dihapus tidak bisa dikembalikan. Image yang dipakai container ini mungkin bisa di-prune setelah ini.</Text>
                      </Alert>
                    </Stack>
                  ),
                  labels: { confirm: 'Hapus Containers', cancel: 'Batal' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => pruneContainers.mutate(),
                })}
              >
                Prune Containers
              </Button>
            )}
          </Group>
        </Group>
        {containersData?.count === 0 ? (
          <Alert color="teal" icon={<TbCheck size={14} />} p="xs" mb="md">
            <Text size="xs">Tidak ada stopped containers.</Text>
          </Alert>
        ) : containersData?.containers?.length > 0 ? (
          <Box mb="md" style={{ borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
            <ScrollArea.Autosize mah={200}>
              <Table fz="xs" horizontalSpacing="sm" verticalSpacing={4} highlightOnHover>
                <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Nama</Table.Th>
                    <Table.Th>Image</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Size</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {containersData.containers.map((c: any) => (
                    <Table.Tr key={c.id}>
                      <Table.Td><Code fz={10}>{c.id}</Code></Table.Td>
                      <Table.Td><Text fz="xs">{c.name || '—'}</Text></Table.Td>
                      <Table.Td><Code fz={10}>{c.image}</Code></Table.Td>
                      <Table.Td>
                        <Badge size="xs" color={stateColor[c.state] ?? 'gray'} variant="light">{c.status}</Badge>
                      </Table.Td>
                      <Table.Td><Text fz="xs">{c.size > 0 ? fmtBytes(c.size) : '—'}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Box>
        ) : null}

        {/* ─── Unused Volumes ─── */}
        <Divider mb="md" mt="xs" label={
          <Group gap={6}><TbDatabase size={12} /><Text size="xs" fw={500} c="dimmed">Unused Volumes</Text></Group>
        } labelPosition="left" />
        <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
          <Box>
            <Text fw={600} size="sm" mb={2}>Unused Volumes</Text>
            <Text size="xs" c="dimmed">Volume yang tidak dipakai container manapun</Text>
          </Box>
          <Group gap="xs">
            {volumesData && (
              <Badge size="sm" variant="light" color={volumesData.count > 0 ? 'orange' : 'teal'}>
                {volumesData.count} volume
              </Badge>
            )}
            <ActionIcon size="sm" variant="subtle" color="gray" loading={volumesFetching} onClick={() => refetchVolumes()}>
              <TbRefresh size={13} />
            </ActionIcon>
            {volumesData?.count > 0 && canPrune && (
              <Button size="xs" variant="light" color="red" leftSection={<TbTrash size={13} />}
                loading={pruneVolumes.isPending}
                onClick={() => modals.openConfirmModal({
                  title: 'Hapus Unused Volumes',
                  children: (
                    <Stack gap="xs">
                      <Text size="sm">Hapus <strong>{volumesData.count}</strong> volume yang tidak dipakai?</Text>
                      <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
                        <Text size="xs" fw={600}>Data di volume yang dihapus tidak bisa dikembalikan.</Text>
                      </Alert>
                    </Stack>
                  ),
                  labels: { confirm: 'Hapus Volumes', cancel: 'Batal' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => pruneVolumes.mutate(),
                })}
              >
                Prune Volumes
              </Button>
            )}
          </Group>
        </Group>
        {volumesData?.count === 0 ? (
          <Alert color="teal" icon={<TbCheck size={14} />} p="xs" mb="md">
            <Text size="xs">Tidak ada unused volumes.</Text>
          </Alert>
        ) : volumesData?.volumes?.length > 0 ? (
          <Box mb="md" style={{ borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
            <ScrollArea.Autosize mah={200}>
              <Table fz="xs" horizontalSpacing="sm" verticalSpacing={4} highlightOnHover>
                <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
                  <Table.Tr>
                    <Table.Th>Nama</Table.Th>
                    <Table.Th>Driver</Table.Th>
                    <Table.Th>Dibuat</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {volumesData.volumes.map((v: any) => (
                    <Table.Tr key={v.name}>
                      <Table.Td><Code fz={10}>{v.name}</Code></Table.Td>
                      <Table.Td><Text fz="xs">{v.driver}</Text></Table.Td>
                      <Table.Td><Text fz="xs">{relTime(v.createdAt)}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Box>
        ) : null}

        {/* ─── Unused Networks ─── */}
        <Divider mb="md" mt="xs" label={
          <Group gap={6}><TbNetwork size={12} /><Text size="xs" fw={500} c="dimmed">Unused Networks</Text></Group>
        } labelPosition="left" />
        <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
          <Box>
            <Text fw={600} size="sm" mb={2}>Dangling Networks</Text>
            <Text size="xs" c="dimmed">Network Docker yang tidak dipakai container manapun</Text>
          </Box>
          <Group gap="xs">
            {networksData && (
              <Badge size="sm" variant="light" color={networksData.count > 0 ? 'orange' : 'teal'}>
                {networksData.count} network
              </Badge>
            )}
            <ActionIcon size="sm" variant="subtle" color="gray" loading={networksFetching} onClick={() => refetchNetworks()}>
              <TbRefresh size={13} />
            </ActionIcon>
            {networksData?.count > 0 && canPrune && (
              <Button size="xs" variant="light" color="orange" leftSection={<TbTrash size={13} />}
                loading={pruneNetworks.isPending}
                onClick={() => modals.openConfirmModal({
                  title: 'Hapus Unused Networks',
                  children: <Text size="sm">Hapus <strong>{networksData.count}</strong> network Docker yang tidak dipakai?</Text>,
                  labels: { confirm: 'Hapus Networks', cancel: 'Batal' },
                  confirmProps: { color: 'orange' },
                  onConfirm: () => pruneNetworks.mutate(),
                })}
              >
                Prune Networks
              </Button>
            )}
          </Group>
        </Group>
        {networksData?.count === 0 ? (
          <Alert color="teal" icon={<TbCheck size={14} />} p="xs" mb="md">
            <Text size="xs">Tidak ada dangling networks.</Text>
          </Alert>
        ) : networksData?.networks?.length > 0 ? (
          <Box mb="md" style={{ borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
            <ScrollArea.Autosize mah={200}>
              <Table fz="xs" horizontalSpacing="sm" verticalSpacing={4} highlightOnHover>
                <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Nama</Table.Th>
                    <Table.Th>Driver</Table.Th>
                    <Table.Th>Scope</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {networksData.networks.map((n: any) => (
                    <Table.Tr key={n.id}>
                      <Table.Td><Code fz={10}>{n.id}</Code></Table.Td>
                      <Table.Td><Text fz="xs">{n.name}</Text></Table.Td>
                      <Table.Td><Text fz="xs">{n.driver}</Text></Table.Td>
                      <Table.Td><Text fz="xs">{n.scope}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Box>
        ) : null}
      </Box>

      </>}

      {/* ─── Compose Modal ──────────────────────────────── */}
      <Modal
        opened={composeOpen}
        onClose={() => { closeCompose(); setComposeEditing(false) }}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="blue" radius="md"><TbFileCode size={13} /></ThemeIcon>
            <Text fw={600} size="sm">Compose — {composeStack?.name}</Text>
            {composeEditing && <Badge size="xs" color="orange" variant="light">editing</Badge>}
          </Group>
        }
        size="xl"
      >
        <Stack gap="sm">
          {composeFetching && !composeContent ? (
            <Group justify="center" py="xl"><Loader size="sm" /></Group>
          ) : (
            <>
              <Group justify="space-between">
                <Group gap="xs">
                  <Badge size="xs" variant="outline" color="gray">docker-compose.yml</Badge>
                  <Text fz={10} c="dimmed">{composeContent.split('\n').length} baris</Text>
                </Group>
                <Group gap="xs">
                  {!composeEditing ? (
                    canMutate && (
                      <Button size="xs" variant="light" color="blue" leftSection={<TbPencil size={13} />}
                        onClick={() => setComposeEditing(true)}>
                        Edit
                      </Button>
                    )
                  ) : (
                    <>
                      <Button size="xs" variant="subtle" color="gray"
                        onClick={() => { setComposeEditing(false); setComposeContent(composeData?.content ?? '') }}>
                        Batal
                      </Button>
                      <Button size="xs" color="blue" leftSection={<TbCheck size={13} />}
                        loading={saveCompose.isPending} onClick={confirmSaveCompose}>
                        Simpan
                      </Button>
                    </>
                  )}
                </Group>
              </Group>
              <Box style={{ borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
                <CodeEditor
                  value={composeContent}
                  onChange={setComposeContent}
                  language="yaml"
                  filename="compose.yml"
                  readOnly={!composeEditing}
                  height={480}
                />
              </Box>
              {composeEditing && (
                <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
                  <Text size="xs">Perubahan langsung ke Portainer. Gunakan <strong>Recreate</strong> atau <strong>Repull</strong> setelah save untuk menerapkan ke container.</Text>
                </Alert>
              )}
            </>
          )}
        </Stack>
      </Modal>

      {/* ─── Logs Modal ──────────────────────────────────── */}
      <Modal
        opened={logsOpen}
        onClose={() => { closeLogs(); setAutoRefresh(false); setSelectedContainerId(null); setLiveLines([]); lastLogTimestamp.current = null }}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="gray" radius="md"><TbFileText size={13} /></ThemeIcon>
            <Text fw={600} size="sm">Logs — {logsStack?.name}</Text>
            {selectedContainerId && (
              <Badge size="xs" variant="outline" color="gray" style={{ cursor: 'pointer' }}
                onClick={() => { setSelectedContainerId(null); setLiveLines([]); lastLogTimestamp.current = null }}>
                ← ganti container
              </Badge>
            )}
          </Group>
        }
        size="xl"
        fullScreen={isMobile}
      >
        <Stack gap="sm">
          {/* Step 1: Pilih container */}
          {!selectedContainerId ? (
            <>
              <Text size="xs" c="dimmed" fw={500}>Pilih container untuk melihat logs:</Text>
              {(() => {
                const s = logsStack ? stackStatusMap[logsStack.id] : undefined
                const logsContainers = s?.containers ?? []
                const logsLoading = s?.isFetching && logsContainers.length === 0
                return logsLoading
              })() ? (
                <Group gap="xs" align="center" py="md" justify="center">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">Memuat daftar container di stack <strong>{logsStack?.name}</strong>...</Text>
                </Group>
              ) : (logsStack ? (stackStatusMap[logsStack.id]?.containers ?? []) : []).length === 0 ? (
                <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="sm">
                  <Text size="xs">Tidak ada container ditemukan di stack <strong>{logsStack?.name}</strong>.</Text>
                </Alert>
              ) : (
                <Stack gap="xs">
                  {(logsStack ? (stackStatusMap[logsStack.id]?.containers ?? []) : []).map(c => (
                    <Box
                      key={c.id} p="sm"
                      style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', cursor: 'pointer' }}
                      onClick={() => setSelectedContainerId(c.id)}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="sm" style={{ minWidth: 0 }}>
                          <ThemeIcon size={32} radius="md" variant="light" color={stateColor[c.state] ?? 'gray'}>
                            <TbFileText size={16} />
                          </ThemeIcon>
                          <Box style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.names[0]}
                            </Text>
                            <Group gap="xs" mt={2}>
                              <Code fz={10} c="dimmed">{c.shortId}</Code>
                              <Text fz={10} c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                {c.image.split('/').pop()}
                              </Text>
                            </Group>
                          </Box>
                        </Group>
                        <Group gap="xs" wrap="nowrap">
                          <Badge size="sm" color={stateColor[c.state] ?? 'gray'} variant="light">{c.state}</Badge>
                          {c.ports.length > 0 && <Code fz={10}>{c.ports[0]}</Code>}
                          <TbChevronRight size={14} color="var(--mantine-color-dimmed)" />
                        </Group>
                      </Group>
                    </Box>
                  ))}
                </Stack>
              )}
            </>
          ) : (
            /* Step 2: Logs container yang dipilih */
            <>
              {/* Info container terpilih */}
              {(() => {
                const c = (logsStack ? (stackStatusMap[logsStack.id]?.containers ?? []) : []).find(x => x.id === selectedContainerId)
                return c ? (
                  <Box p="xs" style={{ borderRadius: 'var(--mantine-radius-md)', background: 'var(--mantine-color-default-hover)' }}>
                    <Group gap="sm" wrap="nowrap">
                      <Badge size="sm" color={stateColor[c.state] ?? 'gray'} variant="light">{c.state}</Badge>
                      <Text size="xs" fw={600}>{c.names[0]}</Text>
                      <Code fz={10} c="dimmed">{c.shortId}</Code>
                      <Text fz={10} c="dimmed" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.image.split('/').pop()}
                      </Text>
                    </Group>
                  </Box>
                ) : null
              })()}

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
                        a.href = url; a.download = `${logsStack?.name ?? 'stack'}-${selectedContainerId.slice(0, 8)}.log`
                        a.click(); URL.revokeObjectURL(url)
                      }}>
                      <TbDownload size={13} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              {/* Log output */}
              {logsFetching && logLines.length === 0 ? (
                <Group justify="center" py="xl"><Loader size="sm" /></Group>
              ) : (
                <Box style={{ borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
                  <Group px="xs" py={4} justify="space-between" style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}>
                    <Group gap="xs">
                      <Badge size="xs" color="gray" variant="filled">{logLines.length} baris</Badge>
                      {autoRefresh && <Badge size="xs" color="teal" variant="dot">live</Badge>}
                      {logsFetching && <Loader size={10} color="gray" />}
                    </Group>
                    <Code fz={10} c="dimmed">{selectedContainerId.slice(0, 12)}</Code>
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
                </Box>
              )}
            </>
          )}
        </Stack>
      </Modal>
      {/* ─── Exec Drawer ─────────────────────────────────── */}
      <Drawer
        opened={execOpen}
        onClose={() => { closeExec(); setExecCommand(''); execHistoryIdxRef.current = -1 }}
        position="right"
        size="xl"
        title={
          <Group gap="sm">
            <ThemeIcon size={32} radius="md" variant="light" color="teal"><TbTerminal2 size={16} /></ThemeIcon>
            <Box>
              <Text fw={700} size="sm" lh={1.3}>{execContainer?.containerName}</Text>
              <Text size="xs" c="dimmed" lh={1.2}>{execContainer?.stackName}</Text>
            </Box>
          </Group>
        }
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' } }}
      >
        {/* ── Quick commands ──────────────────────────────── */}
        <Box style={{ background: 'var(--mantine-color-default-hover)', borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}>
          <Box px="sm" pt="sm" pb="sm">
            <Group gap="xs" justify="space-between" mb={execQuickCommands.length > 0 || execShowQuickAdd ? 'xs' : 0}>
              <Group gap={6} align="center">
                <TbBookmark size={12} style={{ color: 'var(--mantine-color-teal-6)' }} />
                <Text size="xs" fw={600}>Quick Commands</Text>
                <Text size="xs" c="dimmed">— tersimpan untuk semua container</Text>
              </Group>
              <Group gap={4}>
                {execHistory.length > 0 && (
                  <Tooltip label="Hapus semua riwayat">
                    <ActionIcon size="xs" variant="subtle" color="red"
                      onClick={() => { setExecHistory([]); execHistoryIdxRef.current = -1 }}>
                      <TbEraser size={12} />
                    </ActionIcon>
                  </Tooltip>
                )}
                <Tooltip label={execShowQuickAdd ? 'Batal' : 'Tambah quick command'}>
                  <ActionIcon size="xs" variant={execShowQuickAdd ? 'light' : 'subtle'} color={execShowQuickAdd ? 'red' : 'teal'}
                    onClick={() => { setExecShowQuickAdd(v => !v); setExecNewQuickLabel(''); setExecNewQuickCommand('') }}>
                    {execShowQuickAdd ? <TbX size={12} /> : <TbPlus size={12} />}
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>

            {execShowQuickAdd && (
              <Box p="xs" mb="xs" style={{ borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-body)' }}>
                <Group gap="xs" align="flex-end">
                  <TextInput size="xs" label="Label" placeholder="mis: ps" value={execNewQuickLabel}
                    onChange={e => setExecNewQuickLabel(e.target.value)} style={{ width: 100 }} />
                  <TextInput size="xs" label="Command" placeholder="ps aux | grep node"
                    value={execNewQuickCommand} onChange={e => setExecNewQuickCommand(e.target.value)}
                    style={{ flex: 1 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && execNewQuickLabel.trim() && execNewQuickCommand.trim()) {
                        setExecQuickCommands(prev => [...prev, { id: crypto.randomUUID(), label: execNewQuickLabel.trim(), command: execNewQuickCommand.trim() }])
                        setExecNewQuickLabel(''); setExecNewQuickCommand(''); setExecShowQuickAdd(false)
                      }
                    }}
                  />
                  <ActionIcon size="sm" variant="filled" color="teal" mb={1}
                    disabled={!execNewQuickLabel.trim() || !execNewQuickCommand.trim()}
                    onClick={() => {
                      setExecQuickCommands(prev => [...prev, { id: crypto.randomUUID(), label: execNewQuickLabel.trim(), command: execNewQuickCommand.trim() }])
                      setExecNewQuickLabel(''); setExecNewQuickCommand(''); setExecShowQuickAdd(false)
                    }}>
                    <TbCheck size={12} />
                  </ActionIcon>
                </Group>
              </Box>
            )}

            {execQuickCommands.length > 0 && (
              <Group gap={4} wrap="wrap">
                {execQuickCommands.map(qc => (
                  <Tooltip key={qc.id} label={<Text size="xs" ff="monospace">{qc.command}</Text>} openDelay={350} multiline maw={280}>
                    <Group gap={0} wrap="nowrap">
                      <Box
                        component="button"
                        onClick={() => { setExecCommand(qc.command); execHistoryIdxRef.current = -1 }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'var(--mantine-color-teal-light)',
                          color: 'var(--mantine-color-teal-text)',
                          border: 'none', borderRadius: '4px 0 0 4px',
                          padding: '2px 7px', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', userSelect: 'none', lineHeight: 1.6,
                        }}
                      >
                        <TbTerminal2 size={10} />
                        {qc.label}
                      </Box>
                      <Box
                        component="button"
                        onClick={() => setExecQuickCommands(prev => prev.filter(x => x.id !== qc.id))}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 18, background: 'var(--mantine-color-teal-light)',
                          border: 'none', borderLeft: '1px solid var(--mantine-color-teal-light-hover)',
                          borderRadius: '0 4px 4px 0', cursor: 'pointer',
                          color: 'var(--mantine-color-teal-text)', fontSize: 13, lineHeight: 1,
                          padding: 0, alignSelf: 'stretch',
                        }}
                      >
                        ×
                      </Box>
                    </Group>
                  </Tooltip>
                ))}
              </Group>
            )}
          </Box>
        </Box>

        {/* ── Terminal output ─────────────────────────────── */}
        <Box ref={execOutputRef} style={{ flex: 1, overflowY: 'auto', background: '#0d1117' }}>
          {execHistory.length === 0 && !execMutation.isPending ? (
            <Box p="md">
              <Text fz={12} ff="monospace" style={{ color: '#8b949e' }}>
                Connected to{' '}
                <Text span ff="monospace" style={{ color: '#79c0ff' }}>{execContainer?.containerName}</Text>
                <Text span ff="monospace" style={{ color: '#8b949e' }}> ({execContainer?.stackName})</Text>
              </Text>
              <Text fz={11} ff="monospace" mt={6} style={{ color: '#636e7b' }}>
                Ketik command lalu tekan <Text span style={{ color: '#e6edf3', background: '#21262d', padding: '1px 5px', borderRadius: 3 }}>Enter</Text> untuk eksekusi.
                Gunakan <Text span style={{ color: '#e6edf3', background: '#21262d', padding: '1px 5px', borderRadius: 3 }}>↑↓</Text> untuk navigasi riwayat.
              </Text>
            </Box>
          ) : (
            <Box p="sm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...execHistory].reverse().map((entry, i) => (
                <Box key={i} style={{ borderRadius: 6, border: '1px solid #21262d', overflow: 'hidden' }}>
                  {/* Command bar */}
                  <Group
                    px="sm" py={5} gap="xs" wrap="nowrap"
                    justify="space-between"
                    style={{ background: '#161b22', borderBottom: (entry.stdout.length > 0 || entry.stderr.length > 0) ? '1px solid #21262d' : undefined }}
                  >
                    <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                      <Text span fz={12} ff="monospace" style={{ color: '#3fb950', flexShrink: 0 }}>❯</Text>
                      <Text span fz={12} ff="monospace" style={{ color: '#79c0ff', wordBreak: 'break-all' }}>{entry.command}</Text>
                    </Group>
                    <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Text fz={10} style={{ color: '#636e7b' }}>
                        {new Date(entry.timestamp).toLocaleTimeString('id-ID', { hour12: false })}
                      </Text>
                      <Badge size="xs" variant="dot"
                        color={entry.exitCode === 0 ? 'teal' : entry.exitCode === null ? 'gray' : 'red'}>
                        {entry.exitCode === null ? '?' : entry.exitCode}
                      </Badge>
                      <Tooltip label="Copy output" openDelay={400}>
                        <ActionIcon size="xs" variant="subtle" color="gray"
                          onClick={() => {
                            const text = [...entry.stdout, ...entry.stderr].join('\n')
                            navigator.clipboard.writeText(text).catch(() => {})
                          }}>
                          <TbClipboard size={11} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                  {/* Output lines */}
                  {entry.stdout.length === 0 && entry.stderr.length === 0 ? (
                    <Box px="sm" py={6}>
                      <Text fz={11} ff="monospace" style={{ color: '#636e7b', fontStyle: 'italic' }}>(no output)</Text>
                    </Box>
                  ) : (
                    <Box px="sm" py={6}>
                      {entry.stdout.map((line, j) => (
                        <Text key={`o${j}`} fz={11} ff="monospace"
                          style={{ color: '#e6edf3', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>
                          {line}
                        </Text>
                      ))}
                      {entry.stderr.map((line, j) => (
                        <Text key={`e${j}`} fz={11} ff="monospace"
                          style={{ color: '#ff7b72', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>
                          {line}
                        </Text>
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
          {execMutation.isPending && (
            <Box px="sm" pb="sm">
              <Group gap="xs" px="sm" py={8}
                style={{ background: '#161b22', borderRadius: 6, border: '1px solid #21262d' }}>
                <Loader size="xs" color="teal" />
                <Text fz={11} ff="monospace" style={{ color: '#636e7b' }}>
                  running{' '}<Text span ff="monospace" style={{ color: '#79c0ff' }}>{execCommand}</Text>
                  <Text span style={{ color: '#636e7b' }}> ...</Text>
                </Text>
              </Group>
            </Box>
          )}
        </Box>

        {/* ── Command input ───────────────────────────────── */}
        <Box style={{ borderTop: '1px solid #21262d', background: '#010409', flexShrink: 0, padding: '10px 12px 8px' }}>
          <Group gap="xs" wrap="nowrap" align="center">
            <Text fz={14} ff="monospace" style={{ color: '#3fb950', flexShrink: 0, userSelect: 'none' }}>❯</Text>
            <TextInput
              style={{ flex: 1 }}
              size="sm"
              placeholder={execMutation.isPending ? 'waiting...' : 'command...'}
              value={execCommand}
              onChange={e => { execHistoryIdxRef.current = -1; setExecCommand(e.target.value) }}
              onKeyDown={e => {
                if (e.key === 'Enter' && execCommand.trim() && !execMutation.isPending && execContainer) {
                  execMutation.mutate({ containerId: execContainer.containerId, endpointId: execContainer.endpointId, command: execCommand.trim() })
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const newIdx = Math.min(execHistoryIdxRef.current + 1, execHistory.length - 1)
                  execHistoryIdxRef.current = newIdx
                  if (execHistory[newIdx]) setExecCommand(execHistory[newIdx].command)
                  return
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const newIdx = Math.max(execHistoryIdxRef.current - 1, -1)
                  execHistoryIdxRef.current = newIdx
                  setExecCommand(newIdx === -1 ? '' : (execHistory[newIdx]?.command ?? ''))
                }
              }}
              styles={{
                input: {
                  fontFamily: 'monospace', fontSize: 13,
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  color: '#e6edf3',
                },
              }}
              disabled={execMutation.isPending}
              autoFocus
            />
            <ActionIcon
              size="lg" variant="filled" color="teal"
              loading={execMutation.isPending}
              disabled={!execCommand.trim() || execMutation.isPending || !execContainer}
              onClick={() => execContainer && execMutation.mutate({ containerId: execContainer.containerId, endpointId: execContainer.endpointId, command: execCommand.trim() })}
            >
              <TbPlayerPlay size={15} />
            </ActionIcon>
          </Group>
          <Group mt={5} justify="space-between">
            <Text fz={10} style={{ color: '#636e7b' }}>↑↓ history · Enter jalankan · Esc tutup</Text>
            {execHistory.length > 0 && (
              <Text fz={10} style={{ color: '#636e7b' }}>{execHistory.length} command dijalankan</Text>
            )}
          </Group>
        </Box>
      </Drawer>
    </Box>
  )
}
