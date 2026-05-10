import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  CopyButton,
  Divider,
  Group,
  Menu,
  Modal,
  PasswordInput,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
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
  TbCopy,
  TbDots,
  TbEye,
  TbEyeOff,
  TbFileImport,
  TbFilter,
  TbKey,
  TbLock,
  TbLockOpen,
  TbPencil,
  TbPlus,
  TbRefresh,
  TbSearch,
  TbSquare,
  TbSquareCheckFilled,
  TbToggleLeft,
  TbToggleRight,
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

function VarsPage() {
  const { slug, env } = Route.useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // modals
  const [addOpen, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [bulkOpen, { open: openBulk, close: closeBulk }] = useDisclosure(false)

  // form state
  const [form, setForm] = useState({ key: '', value: '', isSecret: false })
  const [bulkText, setBulkText] = useState('')
  const [bulkAllSecret, setBulkAllSecret] = useState(false)

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

  // helpers
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
      title: 'Delete variable',
      children: <Text size="sm">Hapus <Code>{key}</Code>?</Text>,
      labels: { confirm: 'Delete', cancel: 'Batal' },
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
      title: 'Clear all variables',
      children: <Text size="sm">Hapus semua <strong>{vars.length} variable(s)</strong> dari <strong>{slug}:{env}</strong>?</Text>,
      labels: { confirm: 'Clear All', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => clearAll.mutate(),
    })

  const confirmBulkToggle = (targetSecret: boolean) =>
    modals.openConfirmModal({
      title: targetSecret ? 'Mark all as Secret' : 'Mark all as Plain',
      children: (
        <Text size="sm">
          {targetSecret
            ? <>Enkripsi <strong>{plainCount} var plain</strong> menjadi secret?</>
            : <>Dekripsi <strong>{secretCount} var secret</strong> menjadi plain?</>}
        </Text>
      ),
      labels: { confirm: targetSecret ? 'Mark Secret' : 'Mark Plain', cancel: 'Batal' },
      confirmProps: { color: targetSecret ? 'red' : 'gray' },
      onConfirm: () => bulkToggleType.mutate(targetSecret),
    })

  const cliCommand = `envman -e ${slug}:${env} -- bun dev`
  const allFilteredSelected = filteredVars.length > 0 && filteredVars.every(v => selectedIds.has(v.id))

  return (
    <Box>
      {/* ─── Header ─────────────────────────── */}
      <Group mb="md" justify="space-between" wrap="nowrap">
        <Group gap={4}>
          <Button variant="subtle" size="xs" px={6} onClick={() => navigate({ to: '/envmanager' })}>
            Projects
          </Button>
          <Text size="sm" c="dimmed">/</Text>
          <Button variant="subtle" size="xs" px={6} onClick={() => navigate({ to: '/envmanager/$slug', params: { slug }, search: { tab: 'environments' } })}>
            {slug}
          </Button>
          <Text size="sm" c="dimmed">/</Text>
          <Text fw={700} size="sm">{env}</Text>
        </Group>

        <Group gap="xs">
          <Tooltip label={encryptionEnabled ? 'AES-256-GCM encryption aktif' : 'MASTER_KEY belum di-set'}>
            <Badge
              size="xs"
              variant="dot"
              color={encryptionEnabled ? 'teal' : 'orange'}
            >
              {encryptionEnabled ? 'encrypted' : 'plaintext'}
            </Badge>
          </Tooltip>
          <ActionIcon size="sm" variant="subtle" color="gray" loading={isFetching} onClick={() => refetch()}>
            <TbRefresh size={14} />
          </ActionIcon>
        </Group>
      </Group>

      {/* ─── Stats row ─────────────────────── */}
      <Group mb="md" gap="md">
        <Group gap="xs">
          <TbVariable size={16} style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size="sm" c="dimmed">
            <Text span fw={600} c="var(--mantine-color-text)">{vars.length}</Text> variables
          </Text>
        </Group>
        {vars.length > 0 && (
          <>
            <Text size="sm" c="dimmed">·</Text>
            <Group gap={6}>
              <Badge
                size="sm"
                variant={filterType === 'plain' ? 'filled' : 'outline'}
                color="gray"
                style={{ cursor: 'pointer' }}
                onClick={() => setFilterType(f => f === 'plain' ? 'all' : 'plain')}
              >
                {plainCount} plain
              </Badge>
              <Badge
                size="sm"
                variant={filterType === 'secret' ? 'filled' : 'light'}
                color="red"
                leftSection={<TbLock size={10} />}
                style={{ cursor: 'pointer' }}
                onClick={() => setFilterType(f => f === 'secret' ? 'all' : 'secret')}
              >
                {secretCount} secret
              </Badge>
              {vars.some(v => v.isDisabled) && (
                <Badge
                  size="sm"
                  variant={filterDisabled === 'disabled' ? 'filled' : 'dot'}
                  color="gray"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setFilterDisabled(f => f === 'disabled' ? 'all' : 'disabled')}
                >
                  {vars.filter(v => v.isDisabled).length} disabled
                </Badge>
              )}
            </Group>
          </>
        )}
        <Text size="sm" c="dimmed">·</Text>
        <Group gap={4}>
          <Code fz="xs" c="dimmed">{cliCommand}</Code>
          <CopyButton value={cliCommand}>
            {({ copied, copy }) => (
              <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
              </ActionIcon>
            )}
          </CopyButton>
        </Group>
      </Group>

      {/* ─── Warning ───────────────────────── */}
      {!encryptionEnabled && secretCount > 0 && (
        <Alert color="orange" icon={<TbAlertTriangle size={14} />} mb="md" py="xs">
          <Text size="xs">
            <strong>MASTER_KEY belum di-set</strong> — {secretCount} secret var tersimpan plaintext.
            Generate: <Code fz="xs">openssl rand -hex 32</Code> → tambah ke <Code fz="xs">.env</Code>
          </Text>
        </Alert>
      )}

      {/* ─── Toolbar ───────────────────────── */}
      <Group mb="xs" justify="space-between" wrap="nowrap">
        <Group gap="xs" style={{ flex: 1 }}>
          <TextInput
            size="xs"
            placeholder="Search key atau value..."
            leftSection={<TbSearch size={13} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            rightSection={search ? (
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearch('')}>
                <TbX size={12} />
              </ActionIcon>
            ) : undefined}
            style={{ minWidth: 180, maxWidth: 260 }}
          />
          {(search || filterType !== 'all' || filterDisabled !== 'all') && (
            <Badge
              size="xs"
              variant="light"
              color="blue"
              rightSection={<TbX size={10} style={{ cursor: 'pointer' }} />}
              style={{ cursor: 'pointer' }}
              onClick={() => { setSearch(''); setFilterType('all'); setFilterDisabled('all') }}
            >
              {filteredVars.length}/{vars.length}
            </Badge>
          )}
        </Group>

        <Group gap="xs">
          {/* Copy dropdown */}
          {vars.length > 0 && (
            <Menu shadow="sm" width={200}>
              <Menu.Target>
                <Button size="xs" variant="subtle" leftSection={<TbCopy size={13} />} rightSection={<TbChevronDown size={12} />}>
                  {copiedAll || copiedSelected ? <TbCheck size={13} /> : 'Copy'}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<TbCopy size={14} />}
                  onClick={() => copyToClipboard(toEnvText(vars), setCopiedAll)}
                >
                  Copy all ({vars.length})
                </Menu.Item>
                <Menu.Item
                  leftSection={<TbCopy size={14} />}
                  disabled={selectedIds.size === 0}
                  onClick={() => copyToClipboard(toEnvText(vars.filter(v => selectedIds.has(v.id))), setCopiedSelected)}
                >
                  Copy selected {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                </Menu.Item>
                {filteredVars.length < vars.length && (
                  <Menu.Item
                    leftSection={<TbFilter size={14} />}
                    onClick={() => copyToClipboard(toEnvText(filteredVars), setCopiedAll)}
                  >
                    Copy filtered ({filteredVars.length})
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}

          {vars.length > 0 && (
            <Select
              size="xs"
              w={120}
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
          )}

          {canEdit && (
            <>
              <Button size="xs" variant="subtle" leftSection={<TbFileImport size={13} />} onClick={openBulk}>
                Paste .env
              </Button>
              <Button size="xs" leftSection={<TbPlus size={13} />} onClick={openAdd}>
                Add Var
              </Button>
              {vars.length > 0 && (
                <Menu shadow="sm" width={200}>
                  <Menu.Target>
                    <ActionIcon size="sm" variant="subtle" color="gray">
                      <TbDots size={15} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {plainCount > 0 && (
                      <Menu.Item
                        leftSection={<TbLock size={14} />}
                        onClick={() => confirmBulkToggle(true)}
                      >
                        All → Secret ({plainCount})
                      </Menu.Item>
                    )}
                    {secretCount > 0 && vars.every(v => !v.isSecret || v.value !== '***') && (
                      <Menu.Item
                        leftSection={<TbLockOpen size={14} />}
                        onClick={() => confirmBulkToggle(false)}
                      >
                        All → Plain ({secretCount})
                      </Menu.Item>
                    )}
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<TbTrash size={14} />}
                      onClick={confirmClearAll}
                    >
                      Clear all vars
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
        <Group mb="xs" gap="xs" p="xs" style={{ borderRadius: 6, background: 'var(--mantine-color-blue-light)', border: '1px solid var(--mantine-color-blue-3)' }}>
          <Text size="xs" fw={500}>{selectedIds.size} selected</Text>
          <Button
            size="xs"
            variant="light"
            color="blue"
            leftSection={copiedSelected ? <TbCheck size={12} /> : <TbCopy size={12} />}
            onClick={() => copyToClipboard(toEnvText(vars.filter(v => selectedIds.has(v.id))), setCopiedSelected)}
          >
            {copiedSelected ? 'Copied!' : 'Copy selected'}
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={clearSelection}>
            Clear selection
          </Button>
        </Group>
      )}

      {/* ─── Table / Empty state ────────────── */}
      {vars.length === 0 ? (
        <Card withBorder p="xl" ta="center">
          <TbVariable size={40} style={{ opacity: 0.15, margin: '0 auto 12px' }} />
          <Text fw={500} mb={4}>Belum ada variabel</Text>
          <Text size="sm" c="dimmed" mb="md">
            Tambah variabel satu per satu atau paste langsung dari file <Code fz="xs">.env</Code>
          </Text>
          {canEdit && (
            <Group justify="center" gap="xs">
              <Button size="sm" variant="subtle" leftSection={<TbFileImport size={14} />} onClick={openBulk}>
                Paste .env
              </Button>
              <Button size="sm" leftSection={<TbPlus size={14} />} onClick={openAdd}>
                Add Var
              </Button>
            </Group>
          )}
        </Card>
      ) : filteredVars.length === 0 ? (
        <Card withBorder p="lg" ta="center">
          <Text size="sm" c="dimmed">Tidak ada var yang cocok dengan filter.</Text>
          <Button size="xs" variant="subtle" mt="xs" onClick={() => { setSearch(''); setFilterType('all') }}>Reset filter</Button>
        </Card>
      ) : (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={32}>
                <ActionIcon size="xs" variant="subtle" color={allFilteredSelected ? 'blue' : 'gray'} onClick={toggleSelectAll}>
                  {allFilteredSelected ? <TbSquareCheckFilled size={14} /> : <TbSquare size={14} />}
                </ActionIcon>
              </Table.Th>
              <Table.Th>Key</Table.Th>
              <Table.Th>Value</Table.Th>
              <Table.Th w={canEdit ? 120 : 40} />
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
                      <Group gap="xs">
                        <Code fz="xs" fw={700}>{v.key}</Code>
                        <Button
                          size="xs"
                          variant={editForm.isSecret ? 'filled' : 'outline'}
                          color="red"
                          px={6}
                          h={20}
                          fz={10}
                          leftSection={<TbKey size={10} />}
                          onClick={() => setEditForm(f => ({ ...f, isSecret: !f.isSecret }))}
                        >
                          {editForm.isSecret ? 'secret' : 'plain'}
                        </Button>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {editForm.isSecret ? (
                        <PasswordInput
                          size="xs"
                          value={editForm.value}
                          placeholder="New value..."
                          autoFocus
                          onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })
                            if (e.key === 'Escape') cancelEdit()
                          }}
                        />
                      ) : (
                        <TextInput
                          size="xs"
                          value={editForm.value}
                          autoFocus
                          onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })
                            if (e.key === 'Escape') cancelEdit()
                          }}
                        />
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Tooltip label="Save (Enter)">
                          <ActionIcon size="sm" variant="filled" color="violet" loading={updateVar.isPending}
                            onClick={() => updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })}>
                            <TbCheck size={13} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Cancel (Esc)">
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
                <Table.Tr key={v.id} style={{ opacity: v.isDisabled ? 0.4 : 1, ...(selectedIds.has(v.id) ? { background: 'var(--mantine-color-blue-light)' } : {}) }}>
                  <Table.Td>
                    <ActionIcon size="xs" variant="subtle" color={selectedIds.has(v.id) ? 'blue' : 'gray'} onClick={() => toggleSelect(v.id)}>
                      {selectedIds.has(v.id) ? <TbSquareCheckFilled size={14} /> : <TbSquare size={14} />}
                    </ActionIcon>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <Code fz="xs" fw={600}>{v.key}</Code>
                      {canEdit ? (
                        <Tooltip label={v.isSecret ? 'Klik → plain' : 'Klik → secret'} position="right">
                          <Badge
                            size="xs"
                            color={v.isSecret ? 'red' : 'gray'}
                            variant={v.isSecret ? 'light' : 'outline'}
                            leftSection={v.isSecret ? <TbLock size={9} /> : undefined}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              if (v.value === '***') return
                              updateVar.mutate({ key: v.key, value: v.value, isSecret: !v.isSecret })
                            }}
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
                    <Group gap="xs">
                      {v.isSecret ? (
                        <>
                          <Text fz="xs" ff="monospace" c={revealed.has(v.id) ? undefined : 'dimmed'} style={{ letterSpacing: revealed.has(v.id) ? undefined : 2 }}>
                            {revealed.has(v.id) ? v.value : '••••••••'}
                          </Text>
                          <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => toggleReveal(v.id)}>
                            {revealed.has(v.id) ? <TbEyeOff size={12} /> : <TbEye size={12} />}
                          </ActionIcon>
                        </>
                      ) : (
                        <Text fz="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>{v.value || <Text span c="dimmed" fz="xs">(empty)</Text>}</Text>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <CopyButton value={toEnvLine(v)}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Copied!' : 'Copy KEY=value'}>
                            <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                              {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                      {canEdit && (
                        <>
                          <Tooltip label={v.isDisabled ? 'Aktifkan' : 'Nonaktifkan'}>
                            <ActionIcon
                              size="sm" variant="subtle"
                              color={v.isDisabled ? 'gray' : 'teal'}
                              loading={toggleDisabled.isPending}
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
                          <Tooltip label="Delete">
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
      )}

      {/* ─── Paste .env modal ───────────────── */}
      <Modal opened={bulkOpen} onClose={closeBulk} title="Paste .env" size="lg">
        <Stack gap="sm">
          <Textarea
            label="Paste konten .env"
            description="Komentar (#) dan baris kosong diabaikan. Nilai dengan spasi bisa dikutip."
            placeholder={'DATABASE_URL=postgres://...\nREDIS_URL=redis://...\n# komentar diabaikan\nAPI_KEY="nilai dengan spasi"'}
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            autosize
            minRows={5}
            maxRows={14}
            styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
          />
          {parsedBulk.length > 0 && (
            <>
              <Group justify="space-between" align="center">
                <Badge variant="light" color="blue">{parsedBulk.length} variabel terdeteksi</Badge>
                <Checkbox
                  size="xs"
                  label="Tandai semua sebagai secret"
                  checked={bulkAllSecret}
                  onChange={e => setBulkAllSecret(e.currentTarget.checked)}
                />
              </Group>
              <ScrollArea.Autosize mah={200}>
                <Table fz="xs" horizontalSpacing="xs" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Key</Table.Th>
                      <Table.Th>Value</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {parsedBulk.map(({ key, value }) => (
                      <Table.Tr key={key}>
                        <Table.Td><Code fz="xs">{key}</Code></Table.Td>
                        <Table.Td>
                          <Text fz="xs" ff="monospace" c={!value ? 'dimmed' : undefined}>
                            {bulkAllSecret ? '••••••••' : value || '(empty)'}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            </>
          )}
          {bulkText.trim() && parsedBulk.length === 0 && (
            <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
              <Text size="xs">Tidak ada KEY=value yang valid ditemukan.</Text>
            </Alert>
          )}
          <Button
            onClick={() => bulkImport.mutate()}
            loading={bulkImport.isPending}
            disabled={parsedBulk.length === 0}
            leftSection={<TbFileImport size={14} />}
          >
            Import {parsedBulk.length > 0 ? `${parsedBulk.length} variable(s)` : ''}
          </Button>
        </Stack>
      </Modal>

      {/* ─── Add var modal ──────────────────── */}
      <Modal opened={addOpen} onClose={closeAdd} title="Tambah Variable">
        <Stack gap="sm">
          <TextInput
            label="Key"
            placeholder="DATABASE_URL"
            description="Huruf besar, angka, dan underscore"
            value={form.key}
            onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))}
            rightSection={form.key ? <Code fz={9}>{form.key.length}</Code> : undefined}
          />
          {form.isSecret ? (
            <PasswordInput
              label="Value"
              placeholder="Nilai rahasia..."
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
            />
          ) : (
            <TextInput
              label="Value"
              placeholder="Nilai..."
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
            />
          )}
          <Group gap="xs" justify="space-between">
            <Button
              size="xs"
              variant={form.isSecret ? 'filled' : 'outline'}
              color="red"
              leftSection={form.isSecret ? <TbLock size={12} /> : <TbLockOpen size={12} />}
              onClick={() => setForm(f => ({ ...f, isSecret: !f.isSecret }))}
            >
              {form.isSecret ? 'Secret — nilai dienkripsi' : 'Plain — nilai terlihat'}
            </Button>
          </Group>
          <Divider />
          <Button
            onClick={() => addVar.mutate(form)}
            loading={addVar.isPending}
            disabled={!form.key || form.value === ''}
            leftSection={<TbPlus size={14} />}
          >
            Tambah Variable
          </Button>
        </Stack>
      </Modal>

      <PortainerSync slug={slug} env={env} canEdit={canEdit} secretCount={secretCount} />
    </Box>
  )
}
