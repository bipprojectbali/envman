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
  ScrollArea,
  Select,
  Skeleton,
  Stack,
  Stepper,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TbAlertTriangle,
  TbBookmark,
  TbCheck,
  TbChevronRight,
  TbClipboard,
  TbCloud,
  TbCloudUpload,
  TbCode,
  TbCopy,
  TbDownload,
  TbEraser,
  TbExternalLink,
  TbFileText,
  TbHistory,
  TbLock,
  TbPencil,
  TbPlayerPlay,
  TbPlug,
  TbPlugConnected,
  TbPlugConnectedX,
  TbPlus,
  TbRefresh,
  TbRefreshDot,
  TbServer,
  TbTerminal2,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { CodeEditor } from '@/frontend/components/CodeEditor'
import { useSession } from '../hooks/useAuth'

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

interface StackTarget {
  id: string
  stackId: number
  stackName: string
  endpointId: number
  label?: string | null
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
  autoSync?: boolean
  additionalTargets?: StackTarget[]
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
  running: 'teal',
  exited: 'red',
  paused: 'yellow',
  restarting: 'orange',
  dead: 'red',
  created: 'gray',
}

interface DiffItem {
  key: string
  oldValue: string
  newValue: string
}

interface DiffResult {
  added: string[]
  removed: string[]
  changed: DiffItem[]
  unchanged: string[]
  totalCurrent: number
  totalProposed: number
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
  const { data: session } = useSession()
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN'
  const qc = useQueryClient()
  const [setupOpen, { open: openSetup, close: closeSetup }] = useDisclosure(false)
  const [diffOpen, { open: openDiff, close: closeDiff }] = useDisclosure(false)

  const [isEditing, setIsEditing] = useState(false)
  const [step, setStep] = useState(0)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [stacks, setStacks] = useState<PortainerStack[]>([])
  const [selectedStack, setSelectedStack] = useState<PortainerStack | null>(null)
  const [additionalSelectedStacks, setAdditionalSelectedStacks] = useState<PortainerStack[]>([])
  const [probeError, setProbeError] = useState<string | null>(null)

  // Operasi async yang sedang berjalan — persist di localStorage agar tidak hilang saat reload
  const opsKey = `envman:portainer-op:${slug}:${env}`
  type OpState = { type: 'repull' | 'recreate'; startedAt: number; step: string; done: boolean; error: string | null }
  const [activeOp, setActiveOp] = useState<OpState | null>(() => {
    try {
      const s = localStorage.getItem(opsKey)
      return s ? JSON.parse(s) : null
    } catch {
      return null
    }
  })
  const setOp = useCallback(
    (op: OpState | null) => {
      setActiveOp(op)
      if (op) localStorage.setItem(opsKey, JSON.stringify(op))
      else localStorage.removeItem(opsKey)
    },
    [opsKey],
  )

  // Logs modal
  const [logsOpen, { open: openLogs, close: closeLogs }] = useDisclosure(false)
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null)
  const [logTail, setLogTail] = useState(200)
  const [showStdout, setShowStdout] = useState(true)
  const [showStderr, setShowStderr] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logViewportRef = useRef<HTMLDivElement>(null)

  // Compose editor modal state
  const [composeOpen, { open: openCompose, close: closeCompose }] = useDisclosure(false)
  const [composeContent, setComposeContent] = useState('')

  // Exec modal state
  type ExecContainer = { containerId: string; endpointId: number; containerName: string }
  const [execOpen, { open: openExec, close: closeExec }] = useDisclosure(false)
  const [execContainer, setExecContainer] = useState<ExecContainer | null>(null)
  const [execCommand, setExecCommand] = useState('')
  const [execHistory, setExecHistory] = useState<
    { command: string; stdout: string[]; stderr: string[]; exitCode: number | null; timestamp: number }[]
  >([])
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

  const handleClose = () => {
    closeSetup()
    setIsEditing(false)
    setStep(0)
    setSelectedConnectionId(null)
    setStacks([])
    setSelectedStack(null)
    setAdditionalSelectedStacks([])
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

  const { data: diffData, isFetching: diffFetching } = useQuery({
    queryKey: ['portainer', 'diff', slug, env],
    queryFn: () =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/sync-preview`, { method: 'POST' }),
    enabled: diffOpen,
  })

  const config: PortainerConfig | null = data?.config ?? null
  const connections: PortainerConnection[] = connectionsData?.connections ?? []

  const {
    data: statusData,
    isFetching: statusFetching,
    refetch: _refetchStatus,
  } = useQuery({
    queryKey: ['portainer', 'env-status', slug, env, config?.connectionId, config?.stackId],
    queryFn: () =>
      apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/status`),
    enabled: !!config?.connectionId,
    refetchInterval: 30000,
    staleTime: 20000,
  })

  const containers: ContainerInfo[] = statusData?.containers ?? []

  const {
    data: logsData,
    isFetching: logsFetching,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['portainer', 'env-logs', slug, env, selectedContainerId, logTail, showStdout, showStderr],
    queryFn: () => {
      const qs = new URLSearchParams({
        tail: String(logTail),
        stdout: showStdout ? '1' : '0',
        stderr: showStderr ? '1' : '0',
        timestamps: '1',
      })
      return apiFetch(
        `/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/logs/${selectedContainerId}?${qs}`,
      )
    },
    enabled: logsOpen && !!config?.connectionId && !!selectedContainerId,
    refetchInterval: autoRefresh ? 5000 : false,
    staleTime: 0,
  })

  const logLines: LogLine[] = logsData?.lines ?? []

  const composeQuery = useQuery({
    queryKey: ['portainer', 'compose', config?.connectionId, config?.stackId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/file`),
    enabled: composeOpen && !!config?.connectionId && !!config?.stackId,
    staleTime: 0,
  })
  useEffect(() => {
    if (composeQuery.data?.content !== undefined) setComposeContent(composeQuery.data.content)
  }, [composeQuery.data])

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logViewportRef.current) {
      logViewportRef.current.scrollTo({ top: logViewportRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [autoScroll])

  useEffect(() => {
    if (execOpen && execOutputRef.current) {
      execOutputRef.current.scrollTop = execOutputRef.current.scrollHeight
    }
  }, [execOpen])

  // ─── Mutations ────────────────────────────────────────────────────────────
  const execMutation = useMutation({
    mutationFn: ({ containerId, endpointId, command }: { containerId: string; endpointId: number; command: string }) =>
      apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/exec`, {
        method: 'POST',
        body: JSON.stringify({ containerId, endpointId, command }),
      }),
    onSuccess: (data: any, { command }) => {
      setExecHistory((prev) => [
        {
          command,
          stdout: data.stdout ?? [],
          stderr: data.stderr ?? [],
          exitCode: data.exitCode ?? null,
          timestamp: Date.now(),
        },
        ...prev,
      ])
      setExecCommand('')
    },
    onError: (e: Error) => {
      alert(e.message)
    },
  })

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
    mutationFn: async () => {
      // Save primary config
      await apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, {
        method: 'PUT',
        body: JSON.stringify({
          connectionId: selectedConnectionId,
          stackId: selectedStack!.id,
          stackName: selectedStack!.name,
          endpointId: selectedStack!.endpointId,
        }),
      })
      // Add additional targets
      for (const t of additionalSelectedStacks) {
        await apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, {
          method: 'PATCH',
          body: JSON.stringify({
            addTarget: {
              connectionId: selectedConnectionId,
              stackId: t.id,
              stackName: t.name,
              endpointId: t.endpointId,
            },
          }),
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portainer', slug, env] })
      handleClose()
    },
  })

  const deleteConfig = () =>
    modals.openConfirmModal({
      title: 'Hapus konfigurasi Portainer',
      children: (
        <Text size="sm">
          Hapus konfigurasi Portainer untuk <strong>{env}</strong>?
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, { method: 'DELETE' }).then(() =>
          qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
        ),
    })

  const sync = useMutation({
    mutationFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/sync`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const repull = useMutation({
    mutationFn: () => {
      setOp({ type: 'repull', startedAt: Date.now(), step: 'Pulling image terbaru...', done: false, error: null })
      return apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/repull`, {
        method: 'POST',
      })
    },
    onSuccess: () => {
      setOp({
        type: 'repull',
        startedAt: activeOp?.startedAt ?? Date.now(),
        step: 'Selesai — container restart dengan image terbaru',
        done: true,
        error: null,
      })
      qc.invalidateQueries({ queryKey: ['portainer', 'env-status', slug, env] })
      setTimeout(() => setOp(null), 8000)
    },
    onError: (e: Error) => {
      setOp({
        type: 'repull',
        startedAt: activeOp?.startedAt ?? Date.now(),
        step: e.message,
        done: true,
        error: e.message,
      })
    },
  })

  const recreate = useMutation({
    mutationFn: () => {
      setOp({ type: 'recreate', startedAt: Date.now(), step: 'Menghentikan container...', done: false, error: null })
      return apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/recreate`, {
        method: 'POST',
      })
    },
    onSuccess: () => {
      setOp({
        type: 'recreate',
        startedAt: activeOp?.startedAt ?? Date.now(),
        step: 'Selesai — container berhasil di-recreate',
        done: true,
        error: null,
      })
      qc.invalidateQueries({ queryKey: ['portainer', 'env-status', slug, env] })
      setTimeout(() => setOp(null), 8000)
    },
    onError: (e: Error) => {
      setOp({
        type: 'recreate',
        startedAt: activeOp?.startedAt ?? Date.now(),
        step: e.message,
        done: true,
        error: e.message,
      })
    },
  })

  // Polling elapsed time saat operasi berjalan
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!activeOp || activeOp.done) {
      setElapsed(0)
      return
    }
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - activeOp.startedAt) / 1000)), 1000)
    return () => clearInterval(t)
  }, [activeOp])

  const confirmRepull = () =>
    modals.openConfirmModal({
      title: `Repull — ${config?.stackName}`,
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Pull image terbaru untuk stack <strong>{config?.stackName}</strong>?
          </Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">
              Setara <Code fz="xs">docker compose pull && up -d</Code>. Container akan restart.
            </Text>
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
          <Text size="sm">
            Stop dan start ulang container di stack <strong>{config?.stackName}</strong>?
          </Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">
              Image tidak di-pull ulang. Setara <Code fz="xs">docker compose stop && up -d</Code>.
            </Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Recreate', cancel: 'Batal' },
      confirmProps: { color: 'orange' },
      onConfirm: () => recreate.mutate(),
    })

  const saveCompose = useMutation({
    mutationFn: (content: string) =>
      apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/file`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      closeCompose()
    },
    onError: (e: Error) => {
      alert(e.message)
    },
  })

  const toggleAutoSync = useMutation({
    mutationFn: (autoSync: boolean) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, {
        method: 'PATCH',
        body: JSON.stringify({ autoSync }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const _addTarget = useMutation({
    mutationFn: (target: {
      connectionId?: string
      stackId: number
      stackName: string
      endpointId: number
      label?: string
    }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, {
        method: 'PATCH',
        body: JSON.stringify({ addTarget: target }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const removeTarget = useMutation({
    mutationFn: (targetId: string) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, {
        method: 'PATCH',
        body: JSON.stringify({ removeTargetId: targetId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portainer', slug, env] }),
  })

  const confirmSync = () =>
    modals.openConfirmModal({
      title: 'Sync vars ke Portainer',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Push semua vars{' '}
            <strong>
              {slug}:{env}
            </strong>{' '}
            ke stack <strong>{config?.stackName}</strong>?
          </Text>
          {secretCount > 0 && (
            <Alert color="red" icon={<TbLock size={14} />} p="xs">
              <Text size="xs" fw={600} mb={2}>
                {secretCount} secret var akan di-decrypt
              </Text>
              <Text size="xs" c="dimmed">
                Nilai dikirim sebagai plaintext dan tersimpan di <Code fz="xs">stack.env</Code>.
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
  const diff: DiffResult | undefined = diffData?.diff

  return (
    <>
      {/* ─── Not configured ─────────────────────────────── */}
      {!config ? (
        <Box
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
          }}
        >
          {/* Header strip */}
          <Box
            p="md"
            style={{
              borderBottom: '1px solid var(--mantine-color-default-border)',
              background: 'var(--mantine-color-default-hover)',
            }}
          >
            <Group gap="sm">
              <ThemeIcon size={40} radius="md" variant="light" color="gray">
                <TbPlugConnectedX size={20} />
              </ThemeIcon>
              <Box>
                <Text fw={600} size="sm">
                  Belum terhubung ke Portainer
                </Text>
                <Text size="xs" c="dimmed" mt={2}>
                  {connections.length > 0
                    ? `${connections.length} connection tersedia — hubungkan ke stack Portainer`
                    : 'Belum ada Portainer connection yang dikonfigurasi'}
                </Text>
              </Box>
            </Group>
          </Box>

          {/* Body */}
          <Box p="md">
            <Stack gap="sm">
              <Text size="xs" c="dimmed" lh={1.6}>
                Hubungkan environment{' '}
                <Code fz="xs">
                  {slug}:{env}
                </Code>{' '}
                ke Portainer stack untuk bisa sync env vars langsung ke container. Perubahan vars akan diterapkan saat
                sync tanpa perlu deploy ulang manual.
              </Text>

              {connections.length === 0 ? (
                <Alert color="blue" icon={<TbServer size={14} />} p="sm" radius="md">
                  <Text size="xs" fw={500} mb={4}>
                    Belum ada Portainer connection
                  </Text>
                  <Text size="xs" c="dimmed">
                    Tambah connection di halaman Connections terlebih dahulu, lalu kembali ke sini untuk menghubungkan
                    ke stack.
                  </Text>
                </Alert>
              ) : (
                <Box
                  p="sm"
                  style={{
                    borderRadius: 'var(--mantine-radius-md)',
                    background: 'var(--mantine-color-violet-light)',
                    border: '1px solid var(--mantine-color-violet-3)',
                  }}
                >
                  <Group gap="xs">
                    <TbPlugConnected size={14} color="var(--mantine-color-primary)" />
                    <Text size="xs" c="violet.7" fw={500}>
                      {connections.length} connection siap digunakan
                    </Text>
                  </Group>
                </Box>
              )}

              {canEdit && (
                <Group gap="xs">
                  {connections.length > 0 ? (
                    <Button size="sm" color="primary" leftSection={<TbPlugConnected size={14} />} onClick={openSetup}>
                      Hubungkan ke Stack
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="light"
                      color="gray"
                      leftSection={<TbPlus size={14} />}
                      component="a"
                      href="/envmanager/connections"
                    >
                      Tambah Connection
                    </Button>
                  )}
                  {connections.length > 0 && (
                    <Button
                      size="sm"
                      variant="subtle"
                      color="gray"
                      component="a"
                      href="/envmanager/connections"
                      leftSection={<TbServer size={14} />}
                    >
                      Kelola Connections
                    </Button>
                  )}
                </Group>
              )}
            </Stack>
          </Box>
        </Box>
      ) : (
        /* ─── Configured ────────────────────────────────── */
        <Box
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
          }}
        >
          {/* ── Header ──────────────────────────────────────── */}
          <Stack gap="xs" p="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            {/* Row 1: identity + status + manage */}
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
                {sync.isError && (
                  <Tooltip label={(sync.error as Error).message} position="left" multiline maw={260}>
                    <TbAlertTriangle size={14} style={{ color: 'var(--mantine-color-red-5)', cursor: 'help' }} />
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
                  </>
                )}
              </Group>
            </Group>

            {/* Row 2: action buttons */}
            {canEdit && (
              <Group gap="xs" wrap="wrap">
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<TbPlug size={12} />}
                  onClick={() => openDiff()}
                >
                  Diff
                </Button>
                <Tooltip label="Pull image terbaru & restart container">
                  <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    leftSection={<TbRefreshDot size={12} />}
                    loading={repull.isPending}
                    disabled={!config?.connectionId}
                    onClick={confirmRepull}
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
                    loading={recreate.isPending}
                    disabled={!config?.connectionId}
                    onClick={confirmRecreate}
                  >
                    Recreate
                  </Button>
                </Tooltip>
                {!!config?.connectionId && (
                  <Tooltip label="Edit compose file">
                    <Button
                      size="xs"
                      variant="light"
                      color="violet"
                      leftSection={<TbCode size={12} />}
                      onClick={openCompose}
                    >
                      Compose
                    </Button>
                  </Tooltip>
                )}
                <Button
                  size="xs"
                  color="primary"
                  variant={sync.isPending ? 'filled' : 'light'}
                  leftSection={sync.isPending ? <Loader size={10} color="white" /> : <TbCloudUpload size={12} />}
                  onClick={confirmSync}
                  loading={sync.isPending}
                >
                  Sync Vars
                </Button>
              </Group>
            )}
          </Stack>

          {/* ── Body ────────────────────────────────────────── */}
          <Stack gap="sm" p="sm">
            {/* Stats: Last sync + links */}
            <Group gap="xs" wrap="wrap" justify="space-between" align="flex-start">
              <Group gap="lg" wrap="wrap">
                <Box>
                  <Text size="xs" c="dimmed" fw={500} mb={2}>
                    Last Sync
                  </Text>
                  <Group gap={4}>
                    <TbHistory size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                    <Text size="xs" fw={600}>
                      {config.lastSyncAt ? relativeTime(config.lastSyncAt) : '—'}
                    </Text>
                  </Group>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed" fw={500} mb={2}>
                    Stack
                  </Text>
                  <Text size="xs" fw={600} ff="monospace">
                    {config.stackName}
                  </Text>
                </Box>
                {config.connectionName && (
                  <Box>
                    <Text size="xs" c="dimmed" fw={500} mb={2}>
                      Connection
                    </Text>
                    <Text size="xs" fw={600}>
                      {config.connectionName}
                    </Text>
                  </Box>
                )}
              </Group>
              <Group gap="sm" wrap="wrap">
                <Anchor
                  size="xs"
                  href={`${displayUrl}#!/${config.endpointId}/docker/stacks/${config.stackId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Group gap={4} wrap="nowrap">
                    <TbExternalLink size={12} />
                    <Text size="xs">Portainer</Text>
                  </Group>
                </Anchor>
                {config.connectionId && (
                  <Anchor
                    size="xs"
                    component={Link}
                    to="/envmanager/connections/$id"
                    params={{ id: config.connectionId } as any}
                  >
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
              <Box
                p="xs"
                style={{
                  borderRadius: 'var(--mantine-radius-md)',
                  border: `1px solid ${activeOp.error ? 'var(--mantine-color-red-4)' : activeOp.done ? 'var(--mantine-color-teal-4)' : 'var(--mantine-color-blue-4)'}`,
                  background: activeOp.error
                    ? 'var(--mantine-color-red-light)'
                    : activeOp.done
                      ? 'var(--mantine-color-teal-light)'
                      : 'var(--mantine-color-blue-light)',
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap="xs" style={{ minWidth: 0 }}>
                    <ThemeIcon
                      size={26}
                      radius="md"
                      variant="light"
                      color={activeOp.error ? 'red' : activeOp.done ? 'teal' : 'blue'}
                      style={{ flexShrink: 0 }}
                    >
                      {!activeOp.done ? (
                        <Loader size={12} color="blue" />
                      ) : activeOp.error ? (
                        <TbAlertTriangle size={13} />
                      ) : (
                        <TbCheck size={13} />
                      )}
                    </ThemeIcon>
                    <Box style={{ minWidth: 0 }}>
                      <Group gap="xs" mb={2}>
                        <Badge
                          size="xs"
                          variant="filled"
                          color={activeOp.error ? 'red' : activeOp.done ? 'teal' : 'blue'}
                        >
                          {activeOp.type === 'repull' ? 'Repull' : 'Recreate'}
                        </Badge>
                        {!activeOp.done && (
                          <Text fz={10} c="dimmed">
                            {elapsed}s
                          </Text>
                        )}
                      </Group>
                      <Text size="xs" fw={500} c={activeOp.error ? 'red' : undefined} truncate>
                        {activeOp.step}
                      </Text>
                      {!activeOp.done && (
                        <Text fz={10} c="dimmed" mt={2}>
                          {activeOp.type === 'repull'
                            ? 'Portainer sedang pull image dan restart container...'
                            : 'Portainer sedang stop dan start ulang container...'}
                        </Text>
                      )}
                    </Box>
                  </Group>
                  {activeOp.done && (
                    <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setOp(null)}>
                      <TbX size={12} />
                    </ActionIcon>
                  )}
                </Group>
              </Box>
            )}

            {/* Containers */}
            <Divider
              label={
                <Group gap="xs">
                  <TbServer size={12} />
                  <Text size="xs" c="dimmed" fw={500}>
                    Containers
                  </Text>
                  {statusFetching && <Loader size={10} />}
                  {!statusFetching && containers.length > 0 && (
                    <Badge size="xs" variant="light" color="gray">
                      {containers.length}
                    </Badge>
                  )}
                </Group>
              }
              labelPosition="left"
            />

            {statusFetching && containers.length === 0 ? (
              <Group gap="xs" py="xs">
                <Loader size="xs" />
                <Text size="xs" c="dimmed">
                  Memuat containers...
                </Text>
              </Group>
            ) : !config.connectionId ? (
              <Text size="xs" c="dimmed" py={4}>
                Connection tidak terkonfigurasi.
              </Text>
            ) : containers.length === 0 && !statusFetching ? (
              <Text size="xs" c="dimmed" py={4}>
                Tidak ada container ditemukan di stack ini.
              </Text>
            ) : (
              <Stack gap="xs">
                {containers.map((c) => (
                  <Box
                    key={c.id}
                    p="xs"
                    style={{
                      borderRadius: 'var(--mantine-radius-md)',
                      border: '1px solid var(--mantine-color-default-border)',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setSelectedContainerId(c.id)
                      openLogs()
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Group gap="xs" style={{ minWidth: 0, flex: 1 }} wrap="nowrap">
                        <ThemeIcon
                          size={28}
                          radius="md"
                          variant="light"
                          color={stateColor[c.state] ?? 'gray'}
                          style={{ flexShrink: 0 }}
                        >
                          <TbServer size={13} />
                        </ThemeIcon>
                        <Box style={{ minWidth: 0 }}>
                          <Text size="xs" fw={600} truncate>
                            {c.names[0]}
                          </Text>
                          <Group gap={6} mt={2} wrap="nowrap">
                            <Code fz={10} c="dimmed">
                              {c.shortId}
                            </Code>
                            <Text fz={10} c="dimmed" truncate style={{ maxWidth: 140 }}>
                              {c.image.split('/').pop()}
                            </Text>
                          </Group>
                        </Box>
                      </Group>
                      <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                        <Badge size="xs" color={stateColor[c.state] ?? 'gray'} variant="light">
                          {c.state}
                        </Badge>
                        {c.ports.length > 0 && <Code fz={10}>{c.ports[0]}</Code>}
                        <Tooltip label="Lihat logs">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedContainerId(c.id)
                              openLogs()
                            }}
                          >
                            <TbFileText size={13} />
                          </ActionIcon>
                        </Tooltip>
                        {canEdit && (
                          <Tooltip label="Exec command">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="teal"
                              onClick={(e) => {
                                e.stopPropagation()
                                setExecContainer({
                                  containerId: c.id,
                                  endpointId: config!.endpointId,
                                  containerName: c.names[0],
                                })
                                setExecHistory([])
                                openExec()
                              }}
                            >
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
              <Box
                p="xs"
                style={{ borderRadius: 'var(--mantine-radius-md)', background: 'var(--mantine-color-default-hover)' }}
              >
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Box style={{ minWidth: 0 }}>
                    <Text size="xs" fw={600} mb={2}>
                      Auto-sync
                    </Text>
                    <Text size="xs" c="dimmed">
                      Sync otomatis ke Portainer setiap kali vars disimpan
                    </Text>
                    {config.autoSync && secretCount > 0 && (
                      <Text size="xs" c="orange" mt={2}>
                        Secret vars akan di-decrypt setiap save
                      </Text>
                    )}
                  </Box>
                  <Switch
                    checked={config.autoSync ?? false}
                    onChange={(e) => toggleAutoSync.mutate(e.currentTarget.checked)}
                    size="sm"
                    style={{ flexShrink: 0 }}
                  />
                </Group>
              </Box>
            )}

            {/* Additional stack targets */}
            {config.additionalTargets && config.additionalTargets.length > 0 && (
              <>
                <Divider
                  label={
                    <Text size="xs" c="dimmed">
                      Stack tambahan
                    </Text>
                  }
                  labelPosition="left"
                />
                <Stack gap="xs">
                  {config.additionalTargets.map((t) => (
                    <Box
                      key={t.id}
                      p="xs"
                      style={{
                        borderRadius: 'var(--mantine-radius-md)',
                        border: '1px solid var(--mantine-color-default-border)',
                      }}
                    >
                      <Group justify="space-between" gap="xs" wrap="nowrap">
                        <Group gap="xs" wrap="wrap" style={{ minWidth: 0 }}>
                          <Badge size="xs" variant="outline" color="gray">
                            ep#{t.endpointId}
                          </Badge>
                          <Text size="xs" fw={500} ff="monospace">
                            {t.stackName}
                          </Text>
                          {t.label && (
                            <Text size="xs" c="dimmed">
                              ({t.label})
                            </Text>
                          )}
                        </Group>
                        {canEdit && (
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="red"
                            style={{ flexShrink: 0 }}
                            onClick={() => removeTarget.mutate(t.id)}
                          >
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
                <Text size="xs" fw={500} mb={2}>
                  Belum pernah disync
                </Text>
                <Text size="xs" c="dimmed">
                  Klik <strong>Sync Vars</strong> untuk pertama kali push env vars ke stack Portainer.
                </Text>
              </Alert>
            )}
            {syncStatus === 'failed' && (
              <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs" radius="md">
                <Text size="xs" fw={500} mb={2}>
                  Sync terakhir gagal
                </Text>
                <Text size="xs" c="dimmed">
                  Periksa koneksi ke Portainer dan pastikan stack masih aktif, lalu coba sync ulang.
                </Text>
              </Alert>
            )}
          </Stack>
        </Box>
      )}

      {/* ─── Setup Modal ────────────────────────────────── */}
      <Modal
        opened={setupOpen}
        onClose={handleClose}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="primary" radius="md">
              <TbCloud size={13} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              {isEditing ? 'Edit Portainer' : 'Hubungkan ke Portainer'}
            </Text>
          </Group>
        }
        size="md"
      >
        <Stepper
          active={step}
          size="xs"
          mb="md"
          onStepClick={(s) => {
            if (s < step) setStep(s)
          }}
        >
          <Stepper.Step label="Connection" />
          <Stepper.Step label="Stack" />
        </Stepper>

        {step === 0 && (
          <Stack gap="sm">
            {connections.length === 0 ? (
              <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
                <Text size="xs">
                  Belum ada Portainer connection.{' '}
                  <Anchor size="xs" href="/envmanager/connections">
                    Tambah connection
                  </Anchor>{' '}
                  terlebih dahulu.
                </Text>
              </Alert>
            ) : (
              <>
                <Text size="xs" c="dimmed">
                  Pilih Portainer instance untuk environment{' '}
                  <strong>
                    {slug}:{env}
                  </strong>
                  .
                </Text>
                <Select
                  label="Portainer Connection"
                  placeholder="Pilih connection..."
                  data={connections.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description: c.portainerUrl.replace(/^https?:\/\//, ''),
                  }))}
                  value={selectedConnectionId}
                  onChange={setSelectedConnectionId}
                  searchable
                />
                {probeError && (
                  <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
                    <Text size="xs">{probeError}</Text>
                  </Alert>
                )}
              </>
            )}
            <Group justify="space-between" mt="xs">
              <Button
                size="sm"
                variant="subtle"
                color="gray"
                component="a"
                href="/envmanager/connections"
                leftSection={<TbPlus size={13} />}
              >
                Kelola Connections
              </Button>
              <Group gap="xs">
                <Button variant="subtle" size="sm" color="gray" onClick={handleClose}>
                  Batal
                </Button>
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
                {connections.find((c) => c.id === selectedConnectionId)?.name} — {stacks.length} stack ditemukan
              </Text>
            </Alert>
            <Select
              label="Stack target"
              placeholder="Pilih stack..."
              data={stacks.map((s) => ({
                value: String(s.id),
                label: s.name,
                description: `Endpoint ${s.endpointId}`,
              }))}
              value={selectedStack ? String(selectedStack.id) : null}
              onChange={(v) => setSelectedStack(stacks.find((s) => String(s.id) === v) ?? null)}
              searchable
              nothingFoundMessage="Stack tidak ditemukan"
            />
            {selectedStack && (
              <Box
                p="sm"
                style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-primary)' }}
              >
                <Text size="xs" c="dimmed" mb={6}>
                  Ringkasan
                </Text>
                <Stack gap={4}>
                  {[
                    ['Connection', connections.find((c) => c.id === selectedConnectionId)?.name ?? '—'],
                    ['Project:Env', `${slug}:${env}`],
                    ['Stack (primary)', selectedStack.name],
                    ['Endpoint', `#${selectedStack.endpointId}`],
                  ].map(([label, value]) => (
                    <Group key={label} justify="space-between">
                      <Text size="xs" c="dimmed">
                        {label}
                      </Text>
                      <Code fz="xs">{value}</Code>
                    </Group>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Additional stacks (multi-stack sync) */}
            {stacks.length > 1 && selectedStack && (
              <Box>
                <Text size="xs" c="dimmed" mb={6}>
                  Stack tambahan (opsional)
                </Text>
                <Select
                  placeholder="Tambah stack lain..."
                  data={stacks
                    .filter((s) => s.id !== selectedStack.id && !additionalSelectedStacks.find((a) => a.id === s.id))
                    .map((s) => ({ value: String(s.id), label: s.name }))}
                  value={null}
                  onChange={(v) => {
                    const s = stacks.find((st) => String(st.id) === v)
                    if (s) setAdditionalSelectedStacks((prev) => [...prev, s])
                  }}
                  searchable
                  nothingFoundMessage="Tidak ada stack lain"
                  size="xs"
                />
                {additionalSelectedStacks.length > 0 && (
                  <Stack gap={4} mt="xs">
                    {additionalSelectedStacks.map((s) => (
                      <Group
                        key={s.id}
                        justify="space-between"
                        p="xs"
                        style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 6 }}
                      >
                        <Group gap="xs">
                          <Badge size="xs" variant="outline" color="gray">
                            ep#{s.endpointId}
                          </Badge>
                          <Text size="xs" ff="monospace">
                            {s.name}
                          </Text>
                        </Group>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => setAdditionalSelectedStacks((prev) => prev.filter((a) => a.id !== s.id))}
                        >
                          <TbX size={11} />
                        </ActionIcon>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Box>
            )}
            <Group justify="space-between" mt="xs">
              <Button variant="subtle" size="sm" color="gray" onClick={() => setStep(0)}>
                ← Kembali
              </Button>
              <Button
                size="sm"
                color="primary"
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

      {/* ─── Diff Modal ─────────────────────────────────── */}
      <Modal
        opened={diffOpen}
        onClose={closeDiff}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="blue" radius="md">
              <TbPlug size={13} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              Diff — {slug}:{env} vs Portainer
            </Text>
          </Group>
        }
        size="lg"
      >
        {diffFetching ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : diff ? (
          <Stack gap="md">
            <Group gap="xs">
              {diff.added.length > 0 && (
                <Badge color="teal" variant="light">
                  +{diff.added.length} baru
                </Badge>
              )}
              {diff.removed.length > 0 && (
                <Badge color="red" variant="light">
                  -{diff.removed.length} dihapus
                </Badge>
              )}
              {diff.changed.length > 0 && (
                <Badge color="yellow" variant="light">
                  ~{diff.changed.length} berubah
                </Badge>
              )}
              {diff.unchanged.length > 0 && (
                <Badge color="gray" variant="light">
                  {diff.unchanged.length} sama
                </Badge>
              )}
            </Group>

            {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
              <Alert color="teal" icon={<TbCheck size={14} />} p="xs">
                <Text size="xs">Semua vars sudah sinkron. Tidak perlu sync.</Text>
              </Alert>
            )}

            <ScrollArea.Autosize mah={400}>
              <Stack gap="xs">
                {diff.added.map((key: string) => (
                  <Box
                    key={key}
                    p="xs"
                    style={{
                      borderRadius: 'var(--mantine-radius-sm)',
                      background: 'var(--mantine-color-teal-light)',
                      borderLeft: '3px solid var(--mantine-color-teal-5)',
                    }}
                  >
                    <Group gap="xs">
                      <Badge size="xs" color="teal">
                        +
                      </Badge>
                      <Code fz="xs" fw={600}>
                        {key}
                      </Code>
                      <Text fz="xs" c="dimmed">
                        akan ditambahkan
                      </Text>
                    </Group>
                  </Box>
                ))}
                {diff.removed.map((key: string) => (
                  <Box
                    key={key}
                    p="xs"
                    style={{
                      borderRadius: 'var(--mantine-radius-sm)',
                      background: 'var(--mantine-color-red-light)',
                      borderLeft: '3px solid var(--mantine-color-red-5)',
                    }}
                  >
                    <Group gap="xs">
                      <Badge size="xs" color="red">
                        -
                      </Badge>
                      <Code fz="xs" fw={600}>
                        {key}
                      </Code>
                      <Text fz="xs" c="dimmed">
                        ada di Portainer, tidak di envman
                      </Text>
                    </Group>
                  </Box>
                ))}
                {diff.changed.map((item: DiffItem) => (
                  <Box
                    key={item.key}
                    p="xs"
                    style={{
                      borderRadius: 'var(--mantine-radius-sm)',
                      background: 'var(--mantine-color-yellow-light)',
                      borderLeft: '3px solid var(--mantine-color-yellow-5)',
                    }}
                  >
                    <Group gap="xs" mb={4}>
                      <Badge size="xs" color="yellow">
                        ~
                      </Badge>
                      <Code fz="xs" fw={600}>
                        {item.key}
                      </Code>
                    </Group>
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Text fz={10} c="dimmed" w={40}>
                          lama
                        </Text>
                        <Code fz={10} c="red.5">
                          {item.oldValue || '(kosong)'}
                        </Code>
                      </Group>
                      <Group gap="xs">
                        <Text fz={10} c="dimmed" w={40}>
                          baru
                        </Text>
                        <Code fz={10} c="teal.5">
                          {item.newValue || '(kosong)'}
                        </Code>
                      </Group>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </ScrollArea.Autosize>

            {(diff.added.length > 0 || diff.changed.length > 0) && (
              <Button
                fullWidth
                color="primary"
                leftSection={<TbCloudUpload size={14} />}
                onClick={() => {
                  closeDiff()
                  confirmSync()
                }}
              >
                Lanjut Sync
              </Button>
            )}
          </Stack>
        ) : (
          <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">{diffData?.error ?? 'Gagal mengambil diff'}</Text>
          </Alert>
        )}
      </Modal>

      {/* ─── Logs Modal ─────────────────────────────────── */}
      <Modal
        opened={logsOpen}
        onClose={() => {
          closeLogs()
          setAutoRefresh(false)
          setSelectedContainerId(null)
        }}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="gray" radius="md">
              <TbFileText size={13} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              Logs — {config?.stackName}
            </Text>
            {selectedContainerId && (
              <Badge
                size="xs"
                variant="outline"
                color="gray"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedContainerId(null)}
              >
                ← ganti container
              </Badge>
            )}
          </Group>
        }
        size="xl"
      >
        <Stack gap="sm">
          {/* Step 1: Pilih container */}
          {!selectedContainerId ? (
            <>
              <Text size="xs" c="dimmed" fw={500}>
                Pilih container untuk melihat logs:
              </Text>

              {statusFetching && containers.length === 0 ? (
                <Group gap="xs" align="center" py="md" justify="center">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    Memuat daftar container di stack <strong>{config?.stackName}</strong>...
                  </Text>
                </Group>
              ) : containers.length === 0 ? (
                <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="sm">
                  <Text size="xs">
                    Tidak ada container ditemukan di stack <strong>{config?.stackName}</strong>.
                  </Text>
                </Alert>
              ) : (
                <Stack gap="xs">
                  {containers.map((c) => (
                    <Box
                      key={c.id}
                      p="sm"
                      style={{
                        borderRadius: 'var(--mantine-radius-md)',
                        border: '1px solid var(--mantine-color-default-border)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedContainerId(c.id)}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="sm" style={{ minWidth: 0 }}>
                          <ThemeIcon size={32} radius="md" variant="light" color={stateColor[c.state] ?? 'gray'}>
                            <TbFileText size={16} />
                          </ThemeIcon>
                          <Box style={{ minWidth: 0 }}>
                            <Text
                              size="sm"
                              fw={600}
                              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {c.names[0]}
                            </Text>
                            <Group gap="xs" mt={2}>
                              <Code fz={10} c="dimmed">
                                {c.shortId}
                              </Code>
                              <Text
                                fz={10}
                                c="dimmed"
                                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {c.image.split('/').pop()}
                              </Text>
                            </Group>
                          </Box>
                        </Group>
                        <Group gap="xs" wrap="nowrap">
                          <Badge size="sm" color={stateColor[c.state] ?? 'gray'} variant="light">
                            {c.state}
                          </Badge>
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
            /* Step 2: Tampil logs container yang dipilih */
            <>
              {/* Info container yang dipilih */}
              {(() => {
                const c = containers.find((x) => x.id === selectedContainerId)
                return c ? (
                  <Box
                    p="xs"
                    style={{
                      borderRadius: 'var(--mantine-radius-md)',
                      background: 'var(--mantine-color-default-hover)',
                    }}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Badge size="sm" color={stateColor[c.state] ?? 'gray'} variant="light">
                        {c.state}
                      </Badge>
                      <Text size="xs" fw={600}>
                        {c.names[0]}
                      </Text>
                      <Code fz={10} c="dimmed">
                        {c.shortId}
                      </Code>
                      <Text
                        fz={10}
                        c="dimmed"
                        style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {c.image.split('/').pop()}
                      </Text>
                    </Group>
                  </Box>
                ) : null
              })()}

              {/* Controls */}
              <Group justify="space-between" wrap="wrap" gap="xs">
                <Group gap="xs">
                  <NumberInput
                    size="xs"
                    w={90}
                    label="Tail"
                    min={10}
                    max={1000}
                    step={50}
                    value={logTail}
                    onChange={(v) => setLogTail(Number(v) || 200)}
                  />
                  <Stack gap={2} pt={2}>
                    <Checkbox
                      size="xs"
                      label="stdout"
                      checked={showStdout}
                      onChange={(e) => setShowStdout(e.currentTarget.checked)}
                    />
                    <Checkbox
                      size="xs"
                      label="stderr"
                      checked={showStderr}
                      onChange={(e) => setShowStderr(e.currentTarget.checked)}
                    />
                  </Stack>
                </Group>
                <Group gap="xs" align="flex-end">
                  <Switch
                    size="xs"
                    label="Auto refresh 5s"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.currentTarget.checked)}
                  />
                  <Switch
                    size="xs"
                    label="Auto scroll"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.currentTarget.checked)}
                  />
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    loading={logsFetching}
                    onClick={() => refetchLogs()}
                  >
                    <TbRefresh size={13} />
                  </ActionIcon>
                  <Tooltip label="Copy logs">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      disabled={logLines.length === 0}
                      onClick={() => {
                        const text = logLines
                          .map(
                            (l) =>
                              `[${l.stream}] ${l.timestamp ? `${new Date(l.timestamp).toLocaleTimeString('id-ID')} ` : ''}${l.message}`,
                          )
                          .join('\n')
                        navigator.clipboard.writeText(text)
                      }}
                    >
                      <TbCopy size={13} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Download .log">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      disabled={logLines.length === 0}
                      onClick={() => {
                        const text = logLines
                          .map((l) => `[${l.stream.toUpperCase()}] ${l.timestamp ?? ''} ${l.message}`)
                          .join('\n')
                        const blob = new Blob([text], { type: 'text/plain' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `${config?.stackName ?? 'stack'}-${selectedContainerId?.slice(0, 8) ?? 'logs'}.log`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      <TbDownload size={13} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              {/* Log output */}
              {logsFetching && logLines.length === 0 ? (
                <Group justify="center" py="xl">
                  <Loader size="sm" />
                </Group>
              ) : (
                <Box
                  style={{
                    borderRadius: 'var(--mantine-radius-sm)',
                    border: '1px solid var(--mantine-color-default-border)',
                    overflow: 'hidden',
                  }}
                >
                  <Group
                    px="xs"
                    py={4}
                    justify="space-between"
                    style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}
                  >
                    <Group gap="xs">
                      <Badge size="xs" color="gray" variant="filled">
                        {logLines.length} baris
                      </Badge>
                      {autoRefresh && (
                        <Badge size="xs" color="teal" variant="dot">
                          live
                        </Badge>
                      )}
                      {logsFetching && <Loader size={10} color="gray" />}
                    </Group>
                    <Code fz={10} c="dimmed">
                      {selectedContainerId?.slice(0, 12)}
                    </Code>
                  </Group>
                  <ScrollArea.Autosize
                    mah={400}
                    viewportRef={logViewportRef}
                    onScrollPositionChange={({ y }) => {
                      if (logViewportRef.current) {
                        const { scrollHeight, clientHeight } = logViewportRef.current
                        setAutoScroll(y + clientHeight >= scrollHeight - 20)
                      }
                    }}
                  >
                    <Box
                      p="xs"
                      style={{
                        background: '#0d1117',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        lineHeight: 1.6,
                        minHeight: 120,
                      }}
                    >
                      {logLines.length === 0 ? (
                        <Text fz={11} c="dimmed" ff="monospace">
                          (tidak ada log)
                        </Text>
                      ) : (
                        logLines.map((line, i) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: log lines have no stable id
                          <Box key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            {line.timestamp && (
                              <Text
                                span
                                fz={10}
                                ff="monospace"
                                style={{ color: '#8b949e', flexShrink: 0, userSelect: 'none', paddingTop: 1 }}
                              >
                                {new Date(line.timestamp).toLocaleTimeString('id-ID', {
                                  hour12: false,
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </Text>
                            )}
                            <Text
                              span
                              fz={9}
                              ff="monospace"
                              style={{
                                color: line.stream === 'stderr' ? '#ff7b72' : '#7ee787',
                                flexShrink: 0,
                                paddingTop: 2,
                                userSelect: 'none',
                              }}
                            >
                              {line.stream === 'stderr' ? 'ERR' : 'OUT'}
                            </Text>
                            <Text
                              span
                              fz={12}
                              ff="monospace"
                              style={{
                                color: line.stream === 'stderr' ? '#ff7b72' : '#e6edf3',
                                wordBreak: 'break-all',
                                whiteSpace: 'pre-wrap',
                              }}
                            >
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

      {/* ─── Exec Modal ───────────────────────────────────── */}
      <Modal
        opened={execOpen}
        onClose={() => {
          closeExec()
          setExecCommand('')
          execHistoryIdxRef.current = -1
        }}
        size="xl"
        title={
          <Group gap="sm">
            <ThemeIcon size={32} radius="md" variant="light" color="teal">
              <TbTerminal2 size={16} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="sm" lh={1.3}>
                {execContainer?.containerName}
              </Text>
              <Text size="xs" c="dimmed" lh={1.2}>
                {config?.stackName} — {slug}:{env}
              </Text>
            </Box>
          </Group>
        }
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '70vh', overflow: 'hidden' } }}
      >
        {/* Quick commands */}
        <Box
          style={{
            background: 'var(--mantine-color-default-hover)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
            flexShrink: 0,
          }}
        >
          <Box px="sm" pt="sm" pb="sm">
            <Group gap="xs" justify="space-between" mb={execQuickCommands.length > 0 || execShowQuickAdd ? 'xs' : 0}>
              <Group gap={6} align="center">
                <TbBookmark size={12} style={{ color: 'var(--mantine-color-teal-6)' }} />
                <Text size="xs" fw={600}>
                  Quick Commands
                </Text>
                <Text size="xs" c="dimmed">
                  — tersimpan untuk semua container
                </Text>
              </Group>
              <Group gap={4}>
                {execHistory.length > 0 && (
                  <Tooltip label="Hapus semua riwayat">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => {
                        setExecHistory([])
                        execHistoryIdxRef.current = -1
                      }}
                    >
                      <TbEraser size={12} />
                    </ActionIcon>
                  </Tooltip>
                )}
                {isSuperAdmin && (
                  <Tooltip label={execShowQuickAdd ? 'Batal' : 'Tambah quick command'}>
                    <ActionIcon
                      size="xs"
                      variant={execShowQuickAdd ? 'light' : 'subtle'}
                      color={execShowQuickAdd ? 'red' : 'teal'}
                      onClick={() => {
                        setExecShowQuickAdd((v) => !v)
                        setExecNewQuickLabel('')
                        setExecNewQuickCommand('')
                      }}
                    >
                      {execShowQuickAdd ? <TbX size={12} /> : <TbPlus size={12} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Group>
            {execShowQuickAdd && (
              <Box
                p="xs"
                mb="xs"
                style={{
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '1px solid var(--mantine-color-default-border)',
                  background: 'var(--mantine-color-body)',
                }}
              >
                <Group gap="xs" align="flex-end">
                  <TextInput
                    size="xs"
                    label="Label"
                    placeholder="mis: ps"
                    value={execNewQuickLabel}
                    onChange={(e) => setExecNewQuickLabel(e.target.value)}
                    style={{ width: 100 }}
                  />
                  <TextInput
                    size="xs"
                    label="Command"
                    placeholder="ps aux | grep node"
                    value={execNewQuickCommand}
                    onChange={(e) => setExecNewQuickCommand(e.target.value)}
                    style={{ flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && execNewQuickLabel.trim() && execNewQuickCommand.trim()) {
                        setExecQuickCommands((prev) => [
                          ...prev,
                          {
                            id: crypto.randomUUID(),
                            label: execNewQuickLabel.trim(),
                            command: execNewQuickCommand.trim(),
                          },
                        ])
                        setExecNewQuickLabel('')
                        setExecNewQuickCommand('')
                        setExecShowQuickAdd(false)
                      }
                    }}
                  />
                  <ActionIcon
                    size="sm"
                    variant="filled"
                    color="teal"
                    mb={1}
                    disabled={!execNewQuickLabel.trim() || !execNewQuickCommand.trim()}
                    onClick={() => {
                      setExecQuickCommands((prev) => [
                        ...prev,
                        {
                          id: crypto.randomUUID(),
                          label: execNewQuickLabel.trim(),
                          command: execNewQuickCommand.trim(),
                        },
                      ])
                      setExecNewQuickLabel('')
                      setExecNewQuickCommand('')
                      setExecShowQuickAdd(false)
                    }}
                  >
                    <TbCheck size={12} />
                  </ActionIcon>
                </Group>
              </Box>
            )}
            {execQuickCommands.length > 0 && (
              <Group gap={4} wrap="wrap">
                {execQuickCommands.map((qc) => (
                  <Tooltip
                    key={qc.id}
                    label={
                      <Text size="xs" ff="monospace">
                        {qc.command}
                      </Text>
                    }
                    openDelay={350}
                    multiline
                    maw={280}
                  >
                    <Group gap={0} wrap="nowrap">
                      <Box
                        component="button"
                        onClick={() => {
                          setExecCommand(qc.command)
                          execHistoryIdxRef.current = -1
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          background: 'var(--mantine-color-teal-light)',
                          color: 'var(--mantine-color-teal-text)',
                          border: 'none',
                          borderRadius: isSuperAdmin ? '4px 0 0 4px' : '4px',
                          padding: '2px 7px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          userSelect: 'none',
                          lineHeight: 1.6,
                        }}
                      >
                        <TbTerminal2 size={10} />
                        {qc.label}
                      </Box>
                      {isSuperAdmin && (
                        <Box
                          component="button"
                          onClick={() => setExecQuickCommands((prev) => prev.filter((x) => x.id !== qc.id))}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 18,
                            background: 'var(--mantine-color-teal-light)',
                            border: 'none',
                            borderLeft: '1px solid var(--mantine-color-teal-light-hover)',
                            borderRadius: '0 4px 4px 0',
                            cursor: 'pointer',
                            color: 'var(--mantine-color-teal-text)',
                            fontSize: 13,
                            padding: 0,
                            alignSelf: 'stretch',
                          }}
                        >
                          ×
                        </Box>
                      )}
                    </Group>
                  </Tooltip>
                ))}
              </Group>
            )}
          </Box>
        </Box>

        {/* Terminal output */}
        <Box ref={execOutputRef} style={{ flex: 1, overflowY: 'auto', background: '#0d1117' }}>
          {execHistory.length === 0 && !execMutation.isPending ? (
            <Box p="md">
              <Text fz={12} ff="monospace" style={{ color: '#8b949e' }}>
                Connected to{' '}
                <Text span ff="monospace" style={{ color: '#79c0ff' }}>
                  {execContainer?.containerName}
                </Text>
              </Text>
              <Text fz={11} ff="monospace" mt={6} style={{ color: '#636e7b' }}>
                Ketik command lalu tekan{' '}
                <Text span style={{ color: '#e6edf3', background: '#21262d', padding: '1px 5px', borderRadius: 3 }}>
                  Enter
                </Text>{' '}
                untuk eksekusi. Gunakan{' '}
                <Text span style={{ color: '#e6edf3', background: '#21262d', padding: '1px 5px', borderRadius: 3 }}>
                  ↑↓
                </Text>{' '}
                untuk navigasi riwayat.
              </Text>
            </Box>
          ) : (
            <Box p="sm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...execHistory].reverse().map((entry, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: exec history has no stable id after reverse
                <Box key={i} style={{ borderRadius: 6, border: '1px solid #21262d', overflow: 'hidden' }}>
                  <Group
                    px="sm"
                    py={5}
                    gap="xs"
                    wrap="nowrap"
                    justify="space-between"
                    style={{
                      background: '#161b22',
                      borderBottom:
                        entry.stdout.length > 0 || entry.stderr.length > 0 ? '1px solid #21262d' : undefined,
                    }}
                  >
                    <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                      <Text span fz={12} ff="monospace" style={{ color: '#3fb950', flexShrink: 0 }}>
                        ❯
                      </Text>
                      <Text span fz={12} ff="monospace" style={{ color: '#79c0ff', wordBreak: 'break-all' }}>
                        {entry.command}
                      </Text>
                    </Group>
                    <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Text fz={10} style={{ color: '#636e7b' }}>
                        {new Date(entry.timestamp).toLocaleTimeString('id-ID', { hour12: false })}
                      </Text>
                      <Badge
                        size="xs"
                        variant="dot"
                        color={entry.exitCode === 0 ? 'teal' : entry.exitCode === null ? 'gray' : 'red'}
                      >
                        {entry.exitCode ?? '?'}
                      </Badge>
                      <Tooltip label="Copy output" openDelay={400}>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="gray"
                          onClick={() =>
                            navigator.clipboard.writeText([...entry.stdout, ...entry.stderr].join('\n')).catch(() => {})
                          }
                        >
                          <TbClipboard size={11} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                  {entry.stdout.length === 0 && entry.stderr.length === 0 ? (
                    <Box px="sm" py={6}>
                      <Text fz={11} ff="monospace" style={{ color: '#636e7b', fontStyle: 'italic' }}>
                        (no output)
                      </Text>
                    </Box>
                  ) : (
                    <Box px="sm" py={6}>
                      {[...entry.stdout.entries()].map(([j, line]) => (
                        <Text
                          key={`o${j}`}
                          fz={11}
                          ff="monospace"
                          style={{ color: '#e6edf3', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}
                        >
                          {line}
                        </Text>
                      ))}
                      {[...entry.stderr.entries()].map(([j, line]) => (
                        <Text
                          key={`e${j}`}
                          fz={11}
                          ff="monospace"
                          style={{ color: '#ff7b72', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}
                        >
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
              <Group
                gap="xs"
                px="sm"
                py={8}
                style={{ background: '#161b22', borderRadius: 6, border: '1px solid #21262d' }}
              >
                <Loader size="xs" color="teal" />
                <Text fz={11} ff="monospace" style={{ color: '#636e7b' }}>
                  running{' '}
                  <Text span ff="monospace" style={{ color: '#79c0ff' }}>
                    {execCommand}
                  </Text>{' '}
                  ...
                </Text>
              </Group>
            </Box>
          )}
        </Box>

        {/* Command input */}
        <Box style={{ borderTop: '1px solid #21262d', background: '#010409', flexShrink: 0, padding: '10px 12px 8px' }}>
          <Group gap="xs" wrap="nowrap" align="center">
            <Text fz={14} ff="monospace" style={{ color: '#3fb950', flexShrink: 0, userSelect: 'none' }}>
              ❯
            </Text>
            <TextInput
              style={{ flex: 1 }}
              size="sm"
              placeholder={execMutation.isPending ? 'waiting...' : 'command...'}
              value={execCommand}
              onChange={(e) => {
                execHistoryIdxRef.current = -1
                setExecCommand(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && execCommand.trim() && !execMutation.isPending && execContainer) {
                  execMutation.mutate({
                    containerId: execContainer.containerId,
                    endpointId: execContainer.endpointId,
                    command: execCommand.trim(),
                  })
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
                  fontFamily: 'monospace',
                  fontSize: 13,
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  color: '#e6edf3',
                },
              }}
              disabled={execMutation.isPending}
              autoFocus
            />
            <ActionIcon
              size="lg"
              variant="filled"
              color="teal"
              loading={execMutation.isPending}
              disabled={!execCommand.trim() || execMutation.isPending || !execContainer}
              onClick={() =>
                execContainer &&
                execMutation.mutate({
                  containerId: execContainer.containerId,
                  endpointId: execContainer.endpointId,
                  command: execCommand.trim(),
                })
              }
            >
              <TbPlayerPlay size={15} />
            </ActionIcon>
          </Group>
          <Group mt={5} justify="space-between">
            <Text fz={10} style={{ color: '#636e7b' }}>
              ↑↓ history · Enter jalankan
            </Text>
            {execHistory.length > 0 && (
              <Text fz={10} style={{ color: '#636e7b' }}>
                {execHistory.length} command dijalankan
              </Text>
            )}
          </Group>
        </Box>
      </Modal>
      {/* ─── Compose Editor Modal ────────────────────────── */}
      <Modal
        opened={composeOpen}
        onClose={closeCompose}
        title={
          <Group gap="xs">
            <ThemeIcon size={28} variant="light" color="violet" radius="md">
              <TbCode size={15} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="sm">
                Edit Compose File
              </Text>
              <Code fz="xs">{config?.stackName}</Code>
            </Box>
          </Group>
        }
        size="xl"
        centered
      >
        {composeQuery.isLoading ? (
          <Skeleton height={400} />
        ) : (
          <CodeEditor
            value={composeContent}
            onChange={(v) => setComposeContent(v ?? '')}
            filename="docker-compose.yml"
            height={450}
            noMinimap
          />
        )}
        <Group justify="flex-end" gap="xs" mt="md">
          <Button variant="subtle" color="gray" onClick={closeCompose} disabled={saveCompose.isPending}>
            Batal
          </Button>
          <Button
            color="violet"
            leftSection={<TbCheck size={14} />}
            loading={saveCompose.isPending}
            disabled={composeQuery.isLoading || !composeContent}
            onClick={() => {
              modals.openConfirmModal({
                title: 'Apply & Redeploy?',
                children: (
                  <Text size="sm">
                    Stack <strong>{config?.stackName}</strong> akan di-redeploy dengan compose file baru.
                  </Text>
                ),
                labels: { confirm: 'Apply & Redeploy', cancel: 'Batal' },
                confirmProps: { color: 'violet' },
                onConfirm: () => saveCompose.mutate(composeContent),
              })
            }}
          >
            Apply & Redeploy
          </Button>
        </Group>
      </Modal>
    </>
  )
}
