import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Divider,
  Group,
  Menu,
  Modal,
  Paper,
  PasswordInput,
  RingProgress,
  ScrollArea,
  Select,
  Stack,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PortainerSync } from '@/frontend/components/PortainerSync'
import { useMemo, useState } from 'react'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { apiFetch } from '@/frontend/lib/api'
import {
  TbAlertTriangle,
  TbCheck,
  TbChevronDown,
  TbChevronRight,
  TbCopy,
  TbDots,
  TbEye,
  TbEyeOff,
  TbFileImport,
  TbFilter,
  TbHome,
  TbLock,
  TbLockOpen,
  TbPencil,
  TbPlus,
  TbRefresh,
  TbSearch,
  TbShieldLock,
  TbSquare,
  TbSquareCheckFilled,
  TbToggleLeft,
  TbToggleRight,
  TbCloud,
  TbTrash,
  TbVariable,
  TbX,
  TbSortAscending,
} from 'react-icons/tb'

export const Route = createFileRoute('/envmanager/$slug/$env')({
  component: VarsPage,
})

interface EnvVar {
  id: string
  key: string
  value: string
  isSecret: boolean
  isDisabled: boolean
  updatedAt: string
}

type FilterType = 'all' | 'plain' | 'secret'

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}j`
  if (d < 30) return `${d}h`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function VarsPage() {
  const { slug, env } = Route.useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [activeTab, setActiveTab] = useLocalStorage<string>({
    key: `envman:tab:${slug}:${env}`,
    defaultValue: 'env',
  })

  // modals
  const [addOpen, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [bulkOpen, { open: openBulk, close: closeBulk }] = useDisclosure(false)
  const [editEnvOpen, { open: openEditEnv, close: closeEditEnv }] = useDisclosure(false)

  // form state
  const [form, setForm] = useState({ key: '', value: '', isSecret: false })
  const [bulkText, setBulkText] = useState('')
  const [bulkAllSecret, setBulkAllSecret] = useState(false)
  const [editEnvText, setEditEnvText] = useState('')

  // table state
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ value: '', isSecret: false })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterDisabled, setFilterDisabled] = useState<'all' | 'active' | 'disabled'>('all')
  const [sort, setSort] = useState<'key-asc' | 'key-desc' | 'newest' | 'oldest'>('key-asc')
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedSelected, setCopiedSelected] = useState(false)

  // queries
  const { data: projectData } = useQuery({
    queryKey: ['envman', 'project', slug],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}`),
  })
  const { data: statusData } = useQuery({
    queryKey: ['envman', 'status'],
    queryFn: () => apiFetch('/api/envman/status'),
    staleTime: 60000,
  })
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['envman', 'vars', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`),
    refetchInterval: 15000,
  })

  const myRole: string = projectData?.project?.myRole ?? 'VIEWER'
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'
  const encryptionEnabled: boolean = statusData?.encryptionEnabled ?? false
  const vars: EnvVar[] = data?.vars ?? []

  const filteredVars = useMemo(() => {
    let list = [...vars]
    if (search) list = list.filter(v => v.key.toLowerCase().includes(search.toLowerCase()) || v.value.toLowerCase().includes(search.toLowerCase()))
    if (filterType === 'plain') list = list.filter(v => !v.isSecret)
    if (filterType === 'secret') list = list.filter(v => v.isSecret)
    if (filterDisabled === 'active') list = list.filter(v => !v.isDisabled)
    if (filterDisabled === 'disabled') list = list.filter(v => v.isDisabled)
    if (sort === 'key-asc') list.sort((a, b) => a.key.localeCompare(b.key))
    if (sort === 'key-desc') list.sort((a, b) => b.key.localeCompare(a.key))
    if (sort === 'newest') list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    if (sort === 'oldest') list.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    return list
  }, [vars, search, filterType, filterDisabled, sort])

  const plainCount = vars.filter(v => !v.isSecret).length
  const secretCount = vars.filter(v => v.isSecret).length
  const disabledCount = vars.filter(v => v.isDisabled).length
  const activeCount = vars.filter(v => !v.isDisabled).length

  const toEnvLine = (v: EnvVar) => {
    const val = v.value === '***' ? '***' : v.value
    const needsQuotes = val.includes(' ') || val.includes('#') || val.includes('"') || val.includes("'")
    return needsQuotes ? `${v.key}="${val.replace(/"/g, '\\"')}"` : `${v.key}=${val}`
  }
  const toEnvText = (list: EnvVar[]) => list.map(toEnvLine).join('\n')
  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) =>
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleSelectAll = () =>
    setSelectedIds(prev => prev.size === filteredVars.length ? new Set() : new Set(filteredVars.map(v => v.id)))
  const clearSelection = () => setSelectedIds(new Set())
  const toggleReveal = (id: string) =>
    setRevealed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const startEdit = (v: EnvVar) => {
    setEditingId(v.id)
    setEditForm({ value: v.isSecret && !revealed.has(v.id) ? '' : v.value, isSecret: v.isSecret })
  }
  const cancelEdit = () => setEditingId(null)

  // mutations
  const addVar = useMutation({
    mutationFn: (body: typeof form) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); closeAdd(); setForm({ key: '', value: '', isSecret: false }); notifyOk('Variabel ditambahkan') },
    onError: (e) => notifyErr(e),
  })

  const deleteVar = (key: string) =>
    modals.openConfirmModal({
      title: 'Hapus variabel',
      children: <Text size="sm">Hapus <Code>{key}</Code>?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars/${key}`, { method: 'DELETE' })
        .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); notifyOk(`${key} dihapus`) })
        .catch(notifyErr),
    })

  const updateVar = useMutation({
    mutationFn: ({ key, value, isSecret }: { key: string; value: string; isSecret: boolean }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, { method: 'POST', body: JSON.stringify({ key, value, isSecret }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); setEditingId(null); notifyOk('Variabel diperbarui') },
    onError: (e) => notifyErr(e),
  })

  const toggleDisabled = useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ isDisabled: boolean }>(`/api/envman/projects/${slug}/environments/${env}/vars/${key}/toggle`, { method: 'PATCH' }),
    onMutate: async (key) => {
      await qc.cancelQueries({ queryKey: ['envman', 'vars', slug, env] })
      const previous = qc.getQueryData(['envman', 'vars', slug, env])
      qc.setQueryData(['envman', 'vars', slug, env], (old: any) => ({
        ...old,
        vars: old?.vars?.map((v: any) => v.key === key ? { ...v, isDisabled: !v.isDisabled } : v) ?? [],
      }))
      return { previous }
    },
    onError: (e, _key, context) => {
      if (context?.previous) qc.setQueryData(['envman', 'vars', slug, env], context.previous)
      notifyErr(e)
    },
    onSuccess: (data) => notifyOk(data.isDisabled ? 'Variabel dinonaktifkan' : 'Variabel diaktifkan'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }),
  })

  const clearAll = useMutation({
    mutationFn: () => Promise.all(vars.map(v =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars/${v.key}`, { method: 'DELETE' }))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); notifyOk('Semua variabel dihapus') },
    onError: (e) => notifyErr(e),
  })

  const bulkToggleType = useMutation({
    mutationFn: (targetSecret: boolean) =>
      Promise.all(vars.filter(v => v.isSecret !== targetSecret && v.value !== '***').map(v =>
        apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, {
          method: 'POST', body: JSON.stringify({ key: v.key, value: v.value, isSecret: targetSecret }),
        }))),
    onSuccess: (_: unknown, targetSecret: boolean) => { qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); notifyOk(targetSecret ? 'Semua variabel ditandai secret' : 'Semua variabel ditandai plain') },
    onError: (e) => notifyErr(e),
  })

  const bulkImport = useMutation({
    mutationFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, {
      method: 'PUT',
      body: JSON.stringify({
        vars: Object.fromEntries(parsedBulk.map(({ key, value }) => [key, value])),
        secrets: bulkAllSecret ? parsedBulk.map(({ key }) => key) : [],
      }),
    }),
    onSuccess: (data: { count: number }) => { qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); closeBulk(); setBulkText(''); setBulkAllSecret(false); notifyOk(`${data.count} variabel berhasil diimpor`) },
    onError: (e) => notifyErr(e),
  })

  const parsedEditEnv = useMemo(() => {
    const result: { key: string; value: string }[] = []
    for (const raw of editEnvText.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      if (!key) continue
      let value = line.slice(eq + 1)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        value = value.slice(1, -1)
      result.push({ key, value })
    }
    return result
  }, [editEnvText])

  const editEnvSave = useMutation({
    mutationFn: () => {
      const secretKeys = vars.filter(v => v.isSecret).map(v => v.key)
      return apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, {
        method: 'PUT',
        body: JSON.stringify({
          vars: Object.fromEntries(parsedEditEnv.map(({ key, value }) => [key, value])),
          secrets: secretKeys.filter(k => parsedEditEnv.some(p => p.key === k)),
        }),
      })
    },
    onSuccess: (data: { count: number }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] })
      closeEditEnv()
      notifyOk(`${data.count} variabel disimpan`)
    },
    onError: (e) => notifyErr(e),
  })

  const openEditEnvModal = () => {
    setEditEnvText(toEnvText(vars.filter(v => v.value !== '***')))
    openEditEnv()
  }

  const parsedBulk = useMemo(() => {
    const result: { key: string; value: string }[] = []
    for (const raw of bulkText.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      if (!key) continue
      let value = line.slice(eq + 1)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        value = value.slice(1, -1)
      result.push({ key, value })
    }
    return result
  }, [bulkText])

  const confirmClearAll = () =>
    modals.openConfirmModal({
      title: 'Hapus semua variabel',
      children: <Text size="sm">Hapus semua <strong>{vars.length} variabel</strong> dari <strong>{slug}:{env}</strong>? Tidak bisa dibatalkan.</Text>,
      labels: { confirm: 'Hapus Semua', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => clearAll.mutate(),
    })

  const confirmBulkToggle = (targetSecret: boolean) =>
    modals.openConfirmModal({
      title: targetSecret ? 'Jadikan semua Secret' : 'Jadikan semua Plain',
      children: (
        <Text size="sm">
          {targetSecret
            ? <>Enkripsi <strong>{plainCount} plain var</strong> menjadi secret?</>
            : <>Dekripsi <strong>{secretCount} secret var</strong> menjadi plain?</>}
        </Text>
      ),
      labels: { confirm: targetSecret ? 'Jadikan Secret' : 'Jadikan Plain', cancel: 'Batal' },
      confirmProps: { color: targetSecret ? 'red' : 'gray' },
      onConfirm: () => bulkToggleType.mutate(targetSecret),
    })

  const cliCommand = `envman -e ${slug}:${env} -- bun dev`
  const allFilteredSelected = filteredVars.length > 0 && filteredVars.every(v => selectedIds.has(v.id))

  return (
    <Box>

      {/* ─── Breadcrumb ─────────────────────── */}

      <Group mb="md" justify="space-between" align="center" gap="xs" wrap="nowrap">
        {/* Kiri: breadcrumb navigasi */}
        <Group gap={4} align="center" style={{ minWidth: 0, flex: 1 }}>
          <Anchor
            size="xs" c="dimmed"
            onClick={() => navigate({ to: '/envmanager' })}
            style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          >
            <TbHome size={12} />
            {!isMobile && 'Projects'}
          </Anchor>
          <TbChevronRight size={12} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
          <Anchor
            size="xs" c="dimmed"
            onClick={() => navigate({ to: '/envmanager/$slug', params: { slug }, search: { tab: 'environments' } })}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? 80 : 160 }}
          >
            {slug}
          </Anchor>
          <TbChevronRight size={12} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
          <Badge size="sm" variant="filled" color="blue" radius="sm" style={{ flexShrink: 0 }}>{env}</Badge>
        </Group>

        {/* Kanan: status badge + refresh */}
        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
          <Tooltip label={encryptionEnabled ? 'AES-256-GCM aktif' : 'MASTER_KEY belum di-set — plaintext mode'}>
            <Badge
              size="sm"
              variant={encryptionEnabled ? 'light' : 'dot'}
              color={encryptionEnabled ? 'teal' : 'orange'}
              leftSection={encryptionEnabled ? <TbShieldLock size={11} /> : <TbAlertTriangle size={11} />}
              style={{ cursor: 'default' }}
            >
              {isMobile
                ? (encryptionEnabled ? 'AES' : '!')
                : (encryptionEnabled ? 'Encrypted' : 'Plaintext')}
            </Badge>
          </Tooltip>
          <Tooltip label="Refresh">
            <ActionIcon size="sm" variant="subtle" color="gray" loading={isFetching} onClick={() => refetch()}>
              <TbRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* ─── Tabs ──────────────────────────── */}
      <Tabs value={activeTab} onChange={v => setActiveTab(v ?? 'env')} mb="sm">
        <Tabs.List>
          <Tabs.Tab value="env" leftSection={<TbVariable size={14} />}>
            Env Vars
            {vars.length > 0 && (
              <Badge size="xs" variant="light" color="blue" ml="xs">{vars.length}</Badge>
            )}
          </Tabs.Tab>
          <Tabs.Tab value="portainer" leftSection={<TbCloud size={14} />}>
            Portainer
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {/* ─── Tab: Portainer ─────────────────── */}
      {activeTab === 'portainer' && (
        <PortainerSync slug={slug} env={env} canEdit={canEdit} secretCount={secretCount} />
      )}

      {/* ─── Tab: Env Vars ─────────────────── */}
      {activeTab === 'env' && <>

      {/* ─── Warning enkripsi ──────────────── */}
      {!encryptionEnabled && secretCount > 0 && (
        <Alert
          color="orange"
          icon={<TbAlertTriangle size={16} />}
          mb="md"
          title="Enkripsi belum aktif"
          styles={{ title: { fontSize: 13 } }}
        >
          <Text size="xs">
            {secretCount} secret var tersimpan sebagai <strong>plaintext</strong>.
            Set <Code fz="xs">MASTER_KEY</Code> → <Code fz="xs">openssl rand -hex 32</Code>
          </Text>
        </Alert>
      )}

      {/* ─── Stats cards (horizontal scroll di mobile) ─── */}
      {vars.length > 0 && (
        <ScrollArea type="never" mb="sm" offsetScrollbars={false}>
          <Group gap="xs" wrap="nowrap" pb={2}>
            {/* Total */}
            <Paper withBorder p="xs" radius="md" style={{ minWidth: 76 }}>
              <Group gap={6} align="center" wrap="nowrap">
                <ThemeIcon size="sm" variant="light" color="blue" radius="sm"><TbVariable size={12} /></ThemeIcon>
                <Box>
                  <Text fz={10} c="dimmed" lh={1}>Total</Text>
                  <Text size="sm" fw={700} lh={1.3}>{vars.length}</Text>
                </Box>
              </Group>
            </Paper>

            {/* Plain — klik filter */}
            <Paper
              withBorder p="xs" radius="md"
              style={{ minWidth: 76, cursor: 'pointer', outline: filterType === 'plain' ? '2px solid var(--mantine-color-gray-5)' : undefined }}
              onClick={() => setFilterType(f => f === 'plain' ? 'all' : 'plain')}
            >
              <Group gap={6} align="center" wrap="nowrap">
                <ThemeIcon size="sm" variant="light" color="gray" radius="sm"><TbLockOpen size={12} /></ThemeIcon>
                <Box>
                  <Text fz={10} c="dimmed" lh={1}>Plain</Text>
                  <Text size="sm" fw={700} lh={1.3}>{plainCount}</Text>
                </Box>
              </Group>
            </Paper>

            {/* Secret — klik filter */}
            <Paper
              withBorder p="xs" radius="md"
              style={{ minWidth: 76, cursor: 'pointer', outline: filterType === 'secret' ? '2px solid var(--mantine-color-red-4)' : undefined }}
              onClick={() => setFilterType(f => f === 'secret' ? 'all' : 'secret')}
            >
              <Group gap={6} align="center" wrap="nowrap">
                <ThemeIcon size="sm" variant="light" color="red" radius="sm"><TbLock size={12} /></ThemeIcon>
                <Box>
                  <Text fz={10} c="dimmed" lh={1}>Secret</Text>
                  <Text size="sm" fw={700} lh={1.3}>{secretCount}</Text>
                </Box>
              </Group>
            </Paper>

            {/* Disabled — hanya tampil jika ada */}
            {disabledCount > 0 && (
              <Paper
                withBorder p="xs" radius="md"
                style={{ minWidth: 80, cursor: 'pointer', outline: filterDisabled === 'disabled' ? '2px solid var(--mantine-color-orange-4)' : undefined }}
                onClick={() => setFilterDisabled(f => f === 'disabled' ? 'all' : 'disabled')}
              >
                <Group gap={6} align="center" wrap="nowrap">
                  <ThemeIcon size="sm" variant="light" color="orange" radius="sm"><TbToggleLeft size={12} /></ThemeIcon>
                  <Box>
                    <Text fz={10} c="dimmed" lh={1}>Off</Text>
                    <Text size="sm" fw={700} lh={1.3}>{disabledCount}</Text>
                  </Box>
                </Group>
              </Paper>
            )}

            {/* Komposisi ring — hanya desktop */}
            {!isMobile && (
              <Paper withBorder p="xs" radius="md" style={{ minWidth: 90 }}>
                <Group gap={6} align="center" wrap="nowrap">
                  <RingProgress size={32} thickness={3} sections={[
                    { value: (plainCount / vars.length) * 100, color: 'gray' },
                    { value: (secretCount / vars.length) * 100, color: 'red' },
                  ]} />
                  <Box>
                    <Text fz={10} c="dimmed" lh={1}>Mix</Text>
                    <Text fz={10} lh={1.4}>
                      <Text span c="gray.6" fw={600}>{plainCount}p</Text>
                      <Text span c="dimmed"> / </Text>
                      <Text span c="red.5" fw={600}>{secretCount}s</Text>
                    </Text>
                  </Box>
                </Group>
              </Paper>
            )}

            {/* CLI — hanya desktop */}
            {!isMobile && (
              <Paper withBorder p="xs" radius="md" style={{ flex: 1, minWidth: 180 }}>
                <Group gap={4} align="center" wrap="nowrap">
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text fz={10} c="dimmed" lh={1} mb={2}>CLI</Text>
                    <Code fz={10} style={{ wordBreak: 'break-all' }}>{cliCommand}</Code>
                  </Box>
                  <CopyButton value={cliCommand}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? 'Copied!' : 'Copy'}>
                        <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} style={{ flexShrink: 0 }}>
                          {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Group>
              </Paper>
            )}
          </Group>
        </ScrollArea>
      )}

      {/* CLI mobile — baris sendiri di bawah stats */}
      {vars.length > 0 && isMobile && (
        <Paper withBorder p="xs" radius="md" mb="sm">
          <Group gap={6} align="center" wrap="nowrap">
            <Code fz={10} style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>{cliCommand}</Code>
            <CopyButton value={cliCommand}>
              {({ copied, copy }) => (
                <ActionIcon size={28} variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} style={{ flexShrink: 0 }}>
                  {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                </ActionIcon>
              )}
            </CopyButton>
          </Group>
        </Paper>
      )}

      {/* ─── Toolbar ───────────────────────── */}
      <Group mb="xs" justify="space-between" gap="xs" wrap="wrap">

        {/* Search + filter badge */}
        <Group gap="xs" style={{ flex: 1, minWidth: isMobile ? '100%' : 160 }}>
          <TextInput
            size="xs"
            placeholder={isMobile ? 'Cari...' : 'Cari key atau value...'}
            leftSection={<TbSearch size={13} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            rightSection={search ? (
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearch('')}>
                <TbX size={12} />
              </ActionIcon>
            ) : undefined}
            style={{ flex: 1, maxWidth: isMobile ? undefined : 260 }}
          />
          {(search || filterType !== 'all' || filterDisabled !== 'all') && (
            <Tooltip label="Reset semua filter">
              <Badge
                size="sm" variant="light" color="blue"
                rightSection={<TbX size={10} />}
                style={{ cursor: 'pointer' }}
                onClick={() => { setSearch(''); setFilterType('all'); setFilterDisabled('all') }}
              >
                {filteredVars.length}/{vars.length}
              </Badge>
            </Tooltip>
          )}
        </Group>

        {/* Aksi kanan */}
        <Group gap={6} wrap="nowrap">

          {/* Sort — icon-only di mobile */}
          {vars.length > 0 && (
            isMobile ? (
              <Menu shadow="md" width={160} position="bottom-end">
                <Menu.Target>
                  <ActionIcon size={34} variant="subtle" color="gray">
                    <TbSortAscending size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Urutan</Menu.Label>
                  {[
                    { label: 'A → Z', value: 'key-asc' },
                    { label: 'Z → A', value: 'key-desc' },
                    { label: 'Terbaru', value: 'newest' },
                    { label: 'Terlama', value: 'oldest' },
                  ].map(o => (
                    <Menu.Item key={o.value} onClick={() => setSort(o.value as typeof sort)}
                      rightSection={sort === o.value ? <TbCheck size={13} /> : undefined}>
                      {o.label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            ) : (
              <Select
                size="xs" w={120}
                leftSection={<TbSortAscending size={13} />}
                value={sort}
                onChange={v => setSort((v ?? 'key-asc') as typeof sort)}
                data={[
                  { label: 'A → Z', value: 'key-asc' },
                  { label: 'Z → A', value: 'key-desc' },
                  { label: 'Terbaru', value: 'newest' },
                  { label: 'Terlama', value: 'oldest' },
                ]}
                allowDeselect={false}
              />
            )
          )}

          {/* Copy dropdown */}
          {vars.length > 0 && (
            <Tooltip label="Export .env">
              <Menu shadow="md" width={210} position="bottom-end">
                <Menu.Target>
                  <ActionIcon size={34} variant="subtle" color={copiedAll || copiedSelected ? 'teal' : 'gray'}>
                    {copiedAll || copiedSelected ? <TbCheck size={15} /> : <TbCopy size={15} />}
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Export sebagai .env</Menu.Label>
                  <Menu.Item
                    leftSection={<TbCopy size={14} />}
                    rightSection={<Badge size="xs" variant="light" color="gray">{vars.length}</Badge>}
                    onClick={() => copyToClipboard(toEnvText(vars), setCopiedAll)}
                  >
                    Semua variabel
                  </Menu.Item>
                  {filteredVars.length < vars.length && (
                    <Menu.Item
                      leftSection={<TbFilter size={14} />}
                      rightSection={<Badge size="xs" variant="light" color="blue">{filteredVars.length}</Badge>}
                      onClick={() => copyToClipboard(toEnvText(filteredVars), setCopiedAll)}
                    >
                      Hasil filter
                    </Menu.Item>
                  )}
                  <Menu.Item
                    leftSection={<TbCopy size={14} />}
                    rightSection={<Badge size="xs" variant="light" color={selectedIds.size > 0 ? 'blue' : 'gray'}>{selectedIds.size}</Badge>}
                    disabled={selectedIds.size === 0}
                    onClick={() => copyToClipboard(toEnvText(vars.filter(v => selectedIds.has(v.id))), setCopiedSelected)}
                  >
                    Yang dipilih
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Tooltip>
          )}

          {canEdit && (
            <>
              {/* .env menu */}
              <Menu shadow="md" width={220} position="bottom-end">
                <Menu.Target>
                  <Button size="xs" variant="light" color="gray"
                    leftSection={<TbFileImport size={13} />}
                    rightSection={<TbChevronDown size={11} />}
                    px={isMobile ? 8 : undefined}
                  >
                    {isMobile ? '' : '.env'}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>File .env</Menu.Label>
                  <Menu.Item leftSection={<TbFileImport size={14} />} onClick={openBulk}>
                    Paste .env
                    <Text size="xs" c="dimmed">Import dari clipboard</Text>
                  </Menu.Item>
                  {vars.length > 0 && (
                    <Menu.Item leftSection={<TbPencil size={14} />} onClick={openEditEnvModal}>
                      Edit .env
                      <Text size="xs" c="dimmed">Edit semua vars sekaligus</Text>
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>

              {/* Tambah Var — CTA */}
              <Button size="xs" leftSection={<TbPlus size={13} />} onClick={openAdd} px={isMobile ? 8 : undefined}>
                {isMobile ? '' : 'Tambah Var'}
              </Button>

              {/* More actions */}
              {vars.length > 0 && (
                <Menu shadow="md" width={230} position="bottom-end">
                  <Menu.Target>
                    <ActionIcon size={34} variant="subtle" color="gray">
                      <TbDots size={15} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Konversi tipe</Menu.Label>
                    {plainCount > 0 && (
                      <Menu.Item
                        leftSection={<TbLock size={14} />}
                        rightSection={<Badge size="xs" variant="light" color="red">{plainCount}</Badge>}
                        onClick={() => confirmBulkToggle(true)}
                      >
                        Semua plain → Secret
                      </Menu.Item>
                    )}
                    {secretCount > 0 && vars.every(v => !v.isSecret || v.value !== '***') && (
                      <Menu.Item
                        leftSection={<TbLockOpen size={14} />}
                        rightSection={<Badge size="xs" variant="light" color="gray">{secretCount}</Badge>}
                        onClick={() => confirmBulkToggle(false)}
                      >
                        Semua secret → Plain
                      </Menu.Item>
                    )}
                    <Menu.Divider />
                    <Menu.Label c="red">Zona berbahaya</Menu.Label>
                    <Menu.Item
                      color="red"
                      leftSection={<TbTrash size={14} />}
                      rightSection={<Badge size="xs" variant="light" color="red">{vars.length}</Badge>}
                      onClick={confirmClearAll}
                    >
                      Hapus semua vars
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}
            </>
          )}
        </Group>
      </Group>

      {/* ─── Selection bar ─────────────────── */}
      {selectedIds.size > 0 && (
        <Paper
          mb="xs" p="xs" radius="md" withBorder
          style={{ borderColor: 'var(--mantine-color-blue-4)', background: 'var(--mantine-color-blue-light)' }}
        >
          <Group gap="xs" align="center" wrap="wrap">
            <Badge size="sm" variant="filled" color="blue">{selectedIds.size} terpilih</Badge>
            <Button
              size="xs" variant="light" color="blue"
              leftSection={copiedSelected ? <TbCheck size={12} /> : <TbCopy size={12} />}
              onClick={() => copyToClipboard(toEnvText(vars.filter(v => selectedIds.has(v.id))), setCopiedSelected)}
            >
              {copiedSelected ? 'Tersalin!' : 'Copy .env'}
            </Button>
            <Button size="xs" variant="subtle" color="gray" onClick={clearSelection} leftSection={<TbX size={11} />}>
              Batal
            </Button>
          </Group>
        </Paper>
      )}

      {/* ─── Empty state ────────────────────── */}
      {vars.length === 0 ? (
        <Paper withBorder p={{ base: 'lg', sm: 'xl' }} radius="md" ta="center">
          <ThemeIcon size={48} variant="light" color="blue" radius="xl" mx="auto" mb="md">
            <TbVariable size={24} />
          </ThemeIcon>
          <Text fw={600} size="md" mb={6}>Environment ini masih kosong</Text>
          <Text size="sm" c="dimmed" mb="lg" maw={320} mx="auto">
            Tambah variabel satu per satu atau paste dari file <Code fz="xs">.env</Code>
          </Text>
          {canEdit && (
            <Group justify="center" gap="xs">
              <Button size="sm" variant="light" leftSection={<TbFileImport size={14} />} onClick={openBulk}>
                Paste .env
              </Button>
              <Button size="sm" leftSection={<TbPlus size={14} />} onClick={openAdd}>
                Tambah Var
              </Button>
            </Group>
          )}
        </Paper>

      ) : filteredVars.length === 0 ? (
        <Paper withBorder p="lg" radius="md" ta="center">
          <TbSearch size={28} style={{ opacity: 0.2, margin: '0 auto 8px' }} />
          <Text size="sm" fw={500} mb={4}>Tidak ada hasil</Text>
          <Text size="xs" c="dimmed" mb="sm">Tidak ada variabel yang cocok.</Text>
          <Button size="xs" variant="subtle" onClick={() => { setSearch(''); setFilterType('all'); setFilterDisabled('all') }} leftSection={<TbX size={12} />}>
            Reset filter
          </Button>
        </Paper>

      ) : isMobile ? (
        /* ══════════════════════════════════════
           MOBILE — Card list view
        ══════════════════════════════════════ */
        <Stack gap="xs">
          {filteredVars.map((v) => {
            if (editingId === v.id) {
              return (
                <Paper key={v.id} withBorder p="sm" radius="md"
                  style={{ background: 'var(--mantine-color-violet-light)', borderColor: 'var(--mantine-color-violet-4)' }}
                >
                  {/* Key + type toggle */}
                  <Group gap={6} mb="xs" wrap="nowrap">
                    <Code fz="xs" fw={700} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
                      {v.key}
                    </Code>
                    <Badge
                      size="xs"
                      variant={editForm.isSecret ? 'filled' : 'outline'}
                      color={editForm.isSecret ? 'red' : 'gray'}
                      leftSection={editForm.isSecret ? <TbLock size={9} /> : <TbLockOpen size={9} />}
                      style={{ cursor: 'pointer', flexShrink: 0 }}
                      onClick={() => setEditForm(f => ({ ...f, isSecret: !f.isSecret }))}
                    >
                      {editForm.isSecret ? 'secret' : 'plain'}
                    </Badge>
                  </Group>
                  {/* Input */}
                  {editForm.isSecret ? (
                    <PasswordInput size="sm" value={editForm.value} placeholder="Nilai baru..." autoFocus
                      onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })
                        if (e.key === 'Escape') cancelEdit()
                      }}
                    />
                  ) : (
                    <TextInput size="sm" value={editForm.value} placeholder="Nilai baru..." autoFocus
                      onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })
                        if (e.key === 'Escape') cancelEdit()
                      }}
                    />
                  )}
                  {/* Aksi simpan/batal */}
                  <Group gap="xs" mt="xs" justify="flex-end">
                    <Button size="sm" variant="filled" color="violet" loading={updateVar.isPending}
                      leftSection={<TbCheck size={13} />}
                      onClick={() => updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })}>
                      Simpan
                    </Button>
                    <Button size="sm" variant="subtle" color="gray" onClick={cancelEdit} leftSection={<TbX size={13} />}>
                      Batal
                    </Button>
                  </Group>
                </Paper>
              )
            }

            return (
              <Paper
                key={v.id} withBorder p="sm" radius="md"
                style={{
                  opacity: v.isDisabled ? 0.5 : 1,
                  background: selectedIds.has(v.id) ? 'var(--mantine-color-blue-light)' : undefined,
                  borderColor: selectedIds.has(v.id) ? 'var(--mantine-color-blue-4)' : undefined,
                  transition: 'opacity 0.15s',
                }}
              >
                {/* Baris 1: checkbox + key + badge + waktu */}
                <Group justify="space-between" mb={6} wrap="nowrap" gap={6}>
                  <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <ActionIcon
                      size={28}
                      variant="subtle"
                      color={selectedIds.has(v.id) ? 'blue' : 'gray'}
                      onClick={() => toggleSelect(v.id)}
                      style={{ flexShrink: 0 }}
                    >
                      {selectedIds.has(v.id) ? <TbSquareCheckFilled size={16} /> : <TbSquare size={16} />}
                    </ActionIcon>
                    <Code
                      fz="xs" fw={700}
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '55vw', flexShrink: 1 }}
                    >
                      {v.key}
                    </Code>
                    {v.isDisabled && <Badge size="xs" variant="dot" color="orange" style={{ flexShrink: 0 }}>off</Badge>}
                    <Badge
                      size="xs"
                      color={v.isSecret ? 'red' : 'gray'}
                      variant={v.isSecret ? 'light' : 'outline'}
                      leftSection={v.isSecret ? <TbLock size={9} /> : undefined}
                      style={{ flexShrink: 0, cursor: canEdit && v.value !== '***' ? 'pointer' : undefined }}
                      onClick={() => { if (!canEdit || v.value === '***') return; updateVar.mutate({ key: v.key, value: v.value, isSecret: !v.isSecret }) }}
                    >
                      {v.isSecret ? 'secret' : 'plain'}
                    </Badge>
                  </Group>
                  <Text fz={10} c="dimmed" style={{ flexShrink: 0 }}>{relTime(v.updatedAt)}</Text>
                </Group>

                {/* Baris 2: value box */}
                <Box mb="xs" px="xs" py={6} style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 6, minHeight: 32 }}>
                  {v.isSecret ? (
                    <Group gap={6} justify="space-between" wrap="nowrap">
                      <Text fz="xs" ff="monospace"
                        c={revealed.has(v.id) ? undefined : 'dimmed'}
                        style={{ letterSpacing: revealed.has(v.id) ? undefined : 3, userSelect: 'none', flex: 1 }}>
                        {revealed.has(v.id) ? v.value : '••••••••••'}
                      </Text>
                      <ActionIcon
                        size={28} variant="subtle"
                        color={revealed.has(v.id) ? 'blue' : 'gray'}
                        onClick={() => toggleReveal(v.id)}
                        style={{ flexShrink: 0 }}
                      >
                        {revealed.has(v.id) ? <TbEyeOff size={14} /> : <TbEye size={14} />}
                      </ActionIcon>
                    </Group>
                  ) : (
                    <Text fz="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                      {v.value || <Text span c="dimmed" fs="italic">(kosong)</Text>}
                    </Text>
                  )}
                </Box>

                {/* Baris 3: action buttons */}
                <Group gap={4} justify="flex-end" wrap="nowrap">
                  <CopyButton value={toEnvLine(v)}>
                    {({ copied, copy }) => (
                      <ActionIcon size={32} variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                        {copied ? <TbCheck size={15} /> : <TbCopy size={15} />}
                      </ActionIcon>
                    )}
                  </CopyButton>
                  {canEdit && (
                    <>
                      <ActionIcon
                        size={32} variant="subtle"
                        color={v.isDisabled ? 'orange' : 'teal'}
                        loading={toggleDisabled.isPending && toggleDisabled.variables === v.key}
                        onClick={() => toggleDisabled.mutate(v.key)}
                      >
                        {v.isDisabled ? <TbToggleLeft size={17} /> : <TbToggleRight size={17} />}
                      </ActionIcon>
                      <ActionIcon size={32} variant="subtle" color="violet" onClick={() => startEdit(v)}>
                        <TbPencil size={15} />
                      </ActionIcon>
                      <ActionIcon size={32} variant="subtle" color="red" onClick={() => deleteVar(v.key)}>
                        <TbTrash size={15} />
                      </ActionIcon>
                    </>
                  )}
                </Group>
              </Paper>
            )
          })}

          <Text size="xs" c="dimmed" ta="center" py="xs">
            {filteredVars.length} dari {vars.length} variabel
            {activeCount < vars.length && ` · ${disabledCount} disabled`}
          </Text>
        </Stack>

      ) : (
        /* ══════════════════════════════════════
           DESKTOP — Table view
        ══════════════════════════════════════ */
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm">
            <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
              <Table.Tr>
                <Table.Th w={36}>
                  <Tooltip label={allFilteredSelected ? 'Batalkan semua' : 'Pilih semua'}>
                    <ActionIcon size="xs" variant="subtle" color={allFilteredSelected ? 'blue' : 'gray'} onClick={toggleSelectAll}>
                      {allFilteredSelected ? <TbSquareCheckFilled size={14} /> : <TbSquare size={14} />}
                    </ActionIcon>
                  </Tooltip>
                </Table.Th>
                <Table.Th w={260} style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mantine-color-dimmed)' }}>
                  Key
                </Table.Th>
                <Table.Th style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mantine-color-dimmed)' }}>
                  Value
                </Table.Th>
                <Table.Th w={90} style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mantine-color-dimmed)' }}>
                  Diperbarui
                </Table.Th>
                <Table.Th w={canEdit ? 130 : 50} style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mantine-color-dimmed)' }}>
                  Aksi
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredVars.map((v) => {
                const isEditing = editingId === v.id

                if (isEditing) {
                  return (
                    <Table.Tr key={v.id} style={{ background: 'var(--mantine-color-violet-light)' }}>
                      <Table.Td />
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Code fz="xs" fw={700} style={{ whiteSpace: 'nowrap' }}>{v.key}</Code>
                          <Tooltip label={editForm.isSecret ? 'Klik → plain' : 'Klik → secret'}>
                            <Badge
                              size="xs"
                              variant={editForm.isSecret ? 'filled' : 'outline'}
                              color={editForm.isSecret ? 'red' : 'gray'}
                              leftSection={editForm.isSecret ? <TbLock size={9} /> : <TbLockOpen size={9} />}
                              style={{ cursor: 'pointer', flexShrink: 0 }}
                              onClick={() => setEditForm(f => ({ ...f, isSecret: !f.isSecret }))}
                            >
                              {editForm.isSecret ? 'secret' : 'plain'}
                            </Badge>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        {editForm.isSecret ? (
                          <PasswordInput size="xs" value={editForm.value} placeholder="Nilai baru..." autoFocus
                            onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })
                              if (e.key === 'Escape') cancelEdit()
                            }}
                          />
                        ) : (
                          <TextInput size="xs" value={editForm.value} placeholder="Nilai baru..." autoFocus
                            onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })
                              if (e.key === 'Escape') cancelEdit()
                            }}
                          />
                        )}
                      </Table.Td>
                      <Table.Td />
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Tooltip label="Simpan (Enter)">
                            <ActionIcon size="sm" variant="filled" color="violet" loading={updateVar.isPending}
                              onClick={() => updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })}>
                              <TbCheck size={13} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Batal (Esc)">
                            <ActionIcon size="sm" variant="subtle" color="gray" onClick={cancelEdit}>
                              <TbX size={13} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )
                }

                return (
                  <Table.Tr key={v.id} style={{
                    opacity: v.isDisabled ? 0.45 : 1,
                    background: selectedIds.has(v.id) ? 'var(--mantine-color-blue-light)' : undefined,
                    transition: 'opacity 0.15s',
                  }}>
                    <Table.Td>
                      <ActionIcon size="xs" variant="subtle" color={selectedIds.has(v.id) ? 'blue' : 'gray'} onClick={() => toggleSelect(v.id)}>
                        {selectedIds.has(v.id) ? <TbSquareCheckFilled size={14} /> : <TbSquare size={14} />}
                      </ActionIcon>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Code fz="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>{v.key}</Code>
                        {v.isDisabled && <Badge size="xs" variant="dot" color="orange" style={{ flexShrink: 0 }}>off</Badge>}
                        {canEdit ? (
                          <Tooltip label={v.isSecret ? 'Klik → plain' : 'Klik → secret'} position="right">
                            <Badge
                              size="xs"
                              color={v.isSecret ? 'red' : 'gray'}
                              variant={v.isSecret ? 'light' : 'outline'}
                              leftSection={v.isSecret ? <TbLock size={9} /> : undefined}
                              style={{ cursor: v.value === '***' ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                              onClick={() => { if (v.value === '***') return; updateVar.mutate({ key: v.key, value: v.value, isSecret: !v.isSecret }) }}
                            >
                              {updateVar.isPending && updateVar.variables?.key === v.key ? '…' : v.isSecret ? 'secret' : 'plain'}
                            </Badge>
                          </Tooltip>
                        ) : v.isSecret ? (
                          <Badge size="xs" color="red" variant="light" leftSection={<TbLock size={9} />}>secret</Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        {v.isSecret ? (
                          <>
                            <Text fz="xs" ff="monospace"
                              c={revealed.has(v.id) ? undefined : 'dimmed'}
                              style={{ letterSpacing: revealed.has(v.id) ? undefined : 3, userSelect: revealed.has(v.id) ? undefined : 'none' }}>
                              {revealed.has(v.id) ? v.value : '••••••••••'}
                            </Text>
                            <Tooltip label={revealed.has(v.id) ? 'Sembunyikan' : 'Tampilkan'}>
                              <ActionIcon size="xs" variant="subtle" color={revealed.has(v.id) ? 'blue' : 'gray'} onClick={() => toggleReveal(v.id)}>
                                {revealed.has(v.id) ? <TbEyeOff size={12} /> : <TbEye size={12} />}
                              </ActionIcon>
                            </Tooltip>
                          </>
                        ) : (
                          <Text fz="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                            {v.value || <Text span c="dimmed" fz="xs" fs="italic">(kosong)</Text>}
                          </Text>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label={new Date(v.updatedAt).toLocaleString('id-ID')} position="left">
                        <Text fz={10} c="dimmed" style={{ whiteSpace: 'nowrap', cursor: 'default' }}>
                          {relTime(v.updatedAt)}
                        </Text>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <CopyButton value={toEnvLine(v)}>
                          {({ copied, copy }) => (
                            <Tooltip label={copied ? 'Tersalin!' : 'Copy KEY=value'}>
                              <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                                {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </CopyButton>
                        {canEdit && (
                          <>
                            <Tooltip label={v.isDisabled ? 'Aktifkan' : 'Nonaktifkan'}>
                              <ActionIcon size="sm" variant="subtle"
                                color={v.isDisabled ? 'orange' : 'teal'}
                                loading={toggleDisabled.isPending && toggleDisabled.variables === v.key}
                                onClick={() => toggleDisabled.mutate(v.key)}
                              >
                                {v.isDisabled ? <TbToggleLeft size={15} /> : <TbToggleRight size={15} />}
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Edit">
                              <ActionIcon size="sm" variant="subtle" color="violet" onClick={() => startEdit(v)}>
                                <TbPencil size={13} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Hapus">
                              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => deleteVar(v.key)}>
                                <TbTrash size={13} />
                              </ActionIcon>
                            </Tooltip>
                          </>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
          {filteredVars.length > 0 && (
            <Box px="sm" py={6} style={{ borderTop: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-default-hover)' }}>
              <Text size="xs" c="dimmed">
                <strong>{filteredVars.length}</strong> dari <strong>{vars.length}</strong> variabel
                {activeCount < vars.length && <> · <strong>{activeCount}</strong> aktif · <strong>{disabledCount}</strong> disabled</>}
              </Text>
            </Box>
          )}
        </Paper>
      )}

      {/* ═══════════════════════════════════════
          MODAL: Paste .env
      ═══════════════════════════════════════ */}
      <Modal
        opened={bulkOpen}
        onClose={closeBulk}
        fullScreen={isMobile}
        size="lg"
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="blue" radius="sm"><TbFileImport size={14} /></ThemeIcon>
            <Text fw={600} size="sm">Paste .env</Text>
          </Group>
        }
      >
        <Stack gap="sm">
          <Textarea
            label="Konten .env"
            description="Komentar (#) dan baris kosong diabaikan."
            placeholder={'DATABASE_URL=postgres://...\nREDIS_URL=redis://...\nAPI_KEY="nilai dengan spasi"'}
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            autosize
            minRows={isMobile ? 4 : 6}
            maxRows={isMobile ? 10 : 16}
            styles={{ input: { fontFamily: 'monospace', fontSize: isMobile ? 13 : 12 } }}
          />
          {parsedBulk.length > 0 && (
            <>
              <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                <Badge variant="light" color="blue" leftSection={<TbCheck size={11} />}>
                  {parsedBulk.length} variabel terdeteksi
                </Badge>
                <Checkbox
                  size="xs"
                  label="Semua sebagai secret"
                  checked={bulkAllSecret}
                  onChange={e => setBulkAllSecret(e.currentTarget.checked)}
                />
              </Group>
              <Paper withBorder radius="sm" style={{ overflow: 'hidden' }}>
                <ScrollArea.Autosize mah={isMobile ? 160 : 200}>
                  <Table fz="xs" horizontalSpacing="xs" verticalSpacing={4} highlightOnHover>
                    <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
                      <Table.Tr>
                        <Table.Th>Key</Table.Th>
                        <Table.Th>Value</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {parsedBulk.map(({ key, value }) => (
                        <Table.Tr key={key}>
                          <Table.Td><Code fz="xs" fw={600}>{key}</Code></Table.Td>
                          <Table.Td>
                            <Text fz="xs" ff="monospace" c={!value ? 'dimmed' : undefined} fs={!value ? 'italic' : undefined}>
                              {bulkAllSecret ? '••••••••' : value || '(kosong)'}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
              </Paper>
            </>
          )}
          {bulkText.trim() && parsedBulk.length === 0 && (
            <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
              <Text size="xs">Tidak ada <Code fz="xs">KEY=value</Code> yang valid.</Text>
            </Alert>
          )}
          <Button
            onClick={() => bulkImport.mutate()}
            loading={bulkImport.isPending}
            disabled={parsedBulk.length === 0}
            leftSection={<TbFileImport size={14} />}
            fullWidth
          >
            {parsedBulk.length > 0 ? `Import ${parsedBulk.length} variabel` : 'Import'}
          </Button>
        </Stack>
      </Modal>

      {/* ═══════════════════════════════════════
          MODAL: Edit .env
      ═══════════════════════════════════════ */}
      <Modal
        opened={editEnvOpen}
        onClose={closeEditEnv}
        fullScreen={isMobile}
        size="lg"
        title={
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon size="sm" variant="light" color="violet" radius="sm"><TbPencil size={14} /></ThemeIcon>
            <Text fw={600} size="sm">Edit .env</Text>
            <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>{slug}:{env}</Badge>
          </Group>
        }
      >
        <Stack gap="sm">
          {secretCount > 0 && (
            <Alert color="orange" icon={<TbAlertTriangle size={14} />} py="xs" title="Secret vars disembunyikan" styles={{ title: { fontSize: 12 } }}>
              <Text size="xs">
                <strong>{secretCount} secret var</strong> tidak ditampilkan — akan tetap dipertahankan.
              </Text>
            </Alert>
          )}
          <Textarea
            label="Konten .env"
            description="Format KEY=value per baris. Komentar (#) diabaikan."
            value={editEnvText}
            onChange={e => setEditEnvText(e.target.value)}
            autosize
            minRows={isMobile ? 6 : 10}
            maxRows={isMobile ? 16 : 24}
            styles={{ input: { fontFamily: 'monospace', fontSize: isMobile ? 13 : 12 } }}
          />
          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            {parsedEditEnv.length > 0 ? (
              <Badge variant="light" color="blue" leftSection={<TbCheck size={11} />}>
                {parsedEditEnv.length} variabel
              </Badge>
            ) : (
              <Text size="xs" c="dimmed">Belum ada variabel valid</Text>
            )}
            {secretCount > 0 && (
              <Text size="xs" c="dimmed">{secretCount} secret dipertahankan</Text>
            )}
          </Group>
          <Button
            onClick={() => editEnvSave.mutate()}
            loading={editEnvSave.isPending}
            disabled={parsedEditEnv.length === 0}
            leftSection={<TbCheck size={14} />}
            fullWidth
          >
            {parsedEditEnv.length > 0 ? `Simpan ${parsedEditEnv.length} variabel` : 'Simpan'}
          </Button>
        </Stack>
      </Modal>

      {/* ═══════════════════════════════════════
          MODAL: Tambah variabel
      ═══════════════════════════════════════ */}
      <Modal
        opened={addOpen}
        onClose={closeAdd}
        fullScreen={isMobile}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="blue" radius="sm"><TbPlus size={14} /></ThemeIcon>
            <Text fw={600} size="sm">Tambah Variabel</Text>
          </Group>
        }
      >
        <Stack gap="sm">
          <TextInput
            label="Key"
            placeholder="DATABASE_URL"
            description="Otomatis dikonversi ke UPPER_SNAKE_CASE"
            value={form.key}
            onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))}
            rightSection={form.key ? <Text fz={9} c="dimmed">{form.key.length}</Text> : undefined}
            styles={{ input: { fontFamily: 'monospace' } }}
            size={isMobile ? 'sm' : 'md'}
          />
          {form.isSecret ? (
            <PasswordInput
              label="Value"
              placeholder="Nilai rahasia..."
              description="Akan dienkripsi sebelum disimpan"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              size={isMobile ? 'sm' : 'md'}
            />
          ) : (
            <TextInput
              label="Value"
              placeholder="Nilai..."
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              size={isMobile ? 'sm' : 'md'}
            />
          )}
          <Paper withBorder p="sm" radius="sm">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={500}>{form.isSecret ? 'Secret' : 'Plain'}</Text>
                <Text size="xs" c="dimmed" style={{ whiteSpace: isMobile ? 'normal' : 'nowrap' }}>
                  {form.isSecret ? 'Nilai dienkripsi, tersembunyi di UI' : 'Nilai terlihat semua member'}
                </Text>
              </Box>
              <ActionIcon
                size={36}
                variant={form.isSecret ? 'filled' : 'light'}
                color={form.isSecret ? 'red' : 'gray'}
                onClick={() => setForm(f => ({ ...f, isSecret: !f.isSecret }))}
                style={{ flexShrink: 0 }}
              >
                {form.isSecret ? <TbLock size={16} /> : <TbLockOpen size={16} />}
              </ActionIcon>
            </Group>
          </Paper>
          <Divider />
          <Button
            onClick={() => addVar.mutate(form)}
            loading={addVar.isPending}
            disabled={!form.key || form.value === ''}
            leftSection={<TbPlus size={14} />}
            fullWidth
            size={isMobile ? 'md' : 'sm'}
          >
            Tambah Variabel
          </Button>
        </Stack>
      </Modal>

      </>}

    </Box>
  )
}
