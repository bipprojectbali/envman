import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Collapse,
  CopyButton,
  Divider,
  Group,
  HoverCard,
  Kbd,
  Modal,
  Paper,
  SegmentedControl,
  Pagination,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDebouncedValue, useDisclosure, useHotkeys, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createLazyFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { apiFetch } from '@/frontend/lib/api'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import {
  TbAlertTriangle,
  TbCalendar,
  TbCheck,
  TbChevronDown,
  TbChevronRight,
  TbClock,
  TbCopy,
  TbFilter,
  TbInfoCircle,
  TbKey,
  TbLayoutGrid,
  TbLayoutList,
  TbLock,
  TbLockOpen,
  TbPencil,
  TbPlus,
  TbRefresh,
  TbSearch,
  TbShieldCheck,
  TbSortAscending,
  TbTerminal,
  TbToggleLeft,
  TbToggleRight,
  TbTrash,
  TbVariable,
  TbX,
} from 'react-icons/tb'

export const Route = createLazyFileRoute('/envmanager/tokens')({ component: TokensPage })

interface ApiToken {
  id: string
  name: string
  scopes: string[]
  canWrite: boolean
  isDisabled: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

interface ProjectOption {
  slug: string
  name: string
  environments: { name: string }[]
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hari lalu`
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function absoluteTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function expiryStatus(expiresAt: string | null): 'none' | 'active' | 'soon' | 'expired' {
  if (!expiresAt) return 'none'
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff < 0) return 'expired'
  if (diff < 7 * 24 * 60 * 60 * 1000) return 'soon'
  return 'active'
}

function daysUntil(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

const HOVER_STYLES = `
.envman-token-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-token-card:not(.is-disabled):not(.is-expired):hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-violet-5);
  box-shadow: var(--mantine-shadow-sm);
}
`

// ── Scope Badge (clickable link to associated env vars page) ───────────────

function ScopeBadge({ scope, size = 'xs' }: { scope: string; size?: 'xs' | 'sm' }) {
  const idx = scope.indexOf(':')
  const linkable = idx > 0 && idx < scope.length - 1
  if (!linkable) {
    return <Badge size={size} variant="default" style={{ fontFamily: 'monospace' }}>{scope}</Badge>
  }
  const slug = scope.slice(0, idx)
  const env = scope.slice(idx + 1)
  return (
    <Tooltip label={`Buka /envmanager/${slug}/${env}`} openDelay={400} withinPortal>
      <Link to="/envmanager/$slug/$env" params={{ slug, env }} style={{ textDecoration: 'none' }}>
        <Badge
          size={size}
          variant="dot"
          color="violet"
          style={{ fontFamily: 'monospace', cursor: 'pointer' }}
        >
          {scope}
        </Badge>
      </Link>
    </Tooltip>
  )
}

// ── Scope Selector ──────────────────────────────────────────────────────────

interface ScopeSelectorProps {
  projects: ProjectOption[]
  value: string[]
  onChange: (v: string[]) => void
}

function ScopeSelector({ projects, value, onChange }: ScopeSelectorProps) {
  const allAccess = value.length === 0
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (slug: string) => setExpanded(prev => {
    const s = new Set(prev)
    s.has(slug) ? s.delete(slug) : s.add(slug)
    return s
  })

  // When in all-access mode, clicking a scope switches to specific mode with just that scope
  const toggleScope = (scope: string) => {
    if (allAccess) { onChange([scope]); return }
    if (value.includes(scope)) {
      const next = value.filter(s => s !== scope)
      onChange(next) // if empty after removal, stays specific (user can click "Semua project" to reset)
    } else {
      onChange([...value, scope])
    }
  }

  const toggleProject = (p: ProjectOption) => {
    const projectScopes = p.environments.map(e => `${p.slug}:${e.name}`)
    if (allAccess) { onChange(projectScopes); return }
    const allSelected = projectScopes.every(s => value.includes(s))
    if (allSelected) onChange(value.filter(s => !projectScopes.includes(s)))
    else onChange([...value.filter(s => !projectScopes.includes(s)), ...projectScopes])
  }

  if (projects.length === 0) return (
    <Text size="xs" c="dimmed">Belum ada project — token akan punya akses global.</Text>
  )

  return (
    <Stack gap={4}>
      {/* All access toggle */}
      <Paper
        withBorder p="xs"
        style={{
          cursor: allAccess ? 'default' : 'pointer',
          borderColor: allAccess ? 'var(--mantine-color-violet-5)' : undefined,
          background: allAccess ? 'var(--mantine-color-violet-light)' : undefined,
        }}
        onClick={() => { if (!allAccess) onChange([]) }}
      >
        <Group gap="xs">
          <Checkbox size="xs" readOnly checked={allAccess} />
          <Box style={{ flex: 1 }}>
            <Text size="xs" fw={600}>Semua project</Text>
            <Text size="xs" c="dimmed">Akses ke semua project yang kamu miliki — tidak dibatasi</Text>
          </Box>
          {!allAccess && <Badge size="xs" color="gray" variant="outline">klik untuk reset</Badge>}
        </Group>
      </Paper>

      {/* Per-project selector — always visible */}
      {projects.map(p => {
        const projectScopes = p.environments.map(e => `${p.slug}:${e.name}`)
        const selectedCount = allAccess ? 0 : projectScopes.filter(s => value.includes(s)).length
        const allSelected = !allAccess && selectedCount === projectScopes.length && projectScopes.length > 0
        const someSelected = !allAccess && selectedCount > 0 && !allSelected
        const isOpen = expanded.has(p.slug)

        return (
          <Paper key={p.slug} withBorder p={0} style={{ overflow: 'hidden', opacity: allAccess ? 0.55 : 1 }}>
            <Group
              gap="xs" p="xs"
              style={{ cursor: 'pointer', background: someSelected || allSelected ? 'var(--mantine-color-violet-light)' : undefined }}
              onClick={() => { if (p.environments.length > 0) toggleExpand(p.slug) }}
            >
              <Checkbox
                size="xs"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={() => toggleProject(p)}
                onClick={e => { e.stopPropagation(); toggleProject(p) }}
              />
              <TbVariable size={13} style={{ color: 'var(--mantine-color-violet-6)' }} />
              <Text size="xs" fw={600} style={{ flex: 1 }}>{p.name}</Text>
              <Code fz="xs" c="dimmed">{p.slug}</Code>
              {selectedCount > 0 && <Badge size="xs" color="violet" variant="filled">{selectedCount}/{projectScopes.length}</Badge>}
              {p.environments.length > 0 && (isOpen ? <TbChevronDown size={13} /> : <TbChevronRight size={13} />)}
            </Group>

            <Collapse in={isOpen}>
              <Stack gap={0} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                {p.environments.map(e => {
                  const scope = `${p.slug}:${e.name}`
                  const checked = !allAccess && value.includes(scope)
                  return (
                    <Group
                      key={e.name} gap="xs" px="sm" py={6}
                      style={{ cursor: 'pointer', background: checked ? 'var(--mantine-color-violet-light)' : undefined }}
                      onClick={() => toggleScope(scope)}
                    >
                      <Checkbox size="xs" checked={checked} onChange={() => toggleScope(scope)} onClick={e => e.stopPropagation()} />
                      <Code fz="xs">{e.name}</Code>
                      <Text size="xs" c="dimmed" style={{ flex: 1 }}>{scope}</Text>
                    </Group>
                  )
                })}
                {p.environments.length === 0 && (
                  <Text size="xs" c="dimmed" px="sm" py={6}>Belum ada environment</Text>
                )}
              </Stack>
            </Collapse>
          </Paper>
        )
      })}

      {!allAccess && (
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {value.length === 0 ? 'Pilih minimal satu environment, atau klik "Semua project" di atas.' : `${value.length} scope dipilih`}
          </Text>
          {value.length > 0 && (
            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => onChange([])}>
              Semua project
            </Button>
          )}
        </Group>
      )}
    </Stack>
  )
}

const emptyForm = { name: '', canWrite: false, expiresAt: '', scopes: [] as string[] }

function TokensPage() {
  const qc = useQueryClient()
  const { data: sessionData } = useSession()
  const canCreateToken = hasCapability(sessionData?.user, 'token:create')
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false)
  const [editingToken, setEditingToken] = useState<ApiToken | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editForm, setEditForm] = useState(emptyForm)
  const [expandedUsage, setExpandedUsage] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('semua')
  const [filterProjects, setFilterProjects] = useState<string[]>([])
  const [sort, setSort] = useState('terbaru')
  const [view, setView] = useLocalStorage<'grid' | 'list'>({ key: 'envman:tokens:view', defaultValue: 'list' })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['envman', 'tokens'],
    queryFn: () => apiFetch('/api/envman/tokens'),
    staleTime: 2 * 60_000,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
  })
  const [debouncedSearch] = useDebouncedValue(search, 150)
  const searchRef = useRef<HTMLInputElement>(null)

  useHotkeys([
    ['/', () => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }],
  ])

  const { data: projectsData } = useQuery({
    queryKey: ['envman', 'projects'],
    queryFn: () => apiFetch('/api/envman/projects'),
  })
  const projects: ProjectOption[] = (projectsData?.projects ?? []).map((p: any) => ({
    slug: p.slug,
    name: p.name,
    environments: p.environments ?? [],
  }))

  const tokens: ApiToken[] = data?.tokens ?? []
  const activeTokens = tokens.filter(t => expiryStatus(t.expiresAt) !== 'expired' && !t.isDisabled)
  const expiredTokens = tokens.filter(t => expiryStatus(t.expiresAt) === 'expired')
  const disabledTokens = tokens.filter(t => t.isDisabled)

  const filteredTokens = useMemo(() => {
    let list = [...tokens]
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.scopes.some(s => s.toLowerCase().includes(q)))
    }
    if (filterStatus === 'aktif') list = list.filter(t => !t.isDisabled && expiryStatus(t.expiresAt) !== 'expired')
    if (filterStatus === 'expired') list = list.filter(t => expiryStatus(t.expiresAt) === 'expired')
    if (filterStatus === 'disabled') list = list.filter(t => t.isDisabled)
    if (filterProjects.length > 0) {
      list = list.filter(t =>
        t.scopes.length === 0
          ? false
          : filterProjects.some(slug => t.scopes.some(s => s === `${slug}:*` || s.startsWith(`${slug}:`)))
      )
    }
    if (sort === 'nama') list.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'terlama') list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (sort === 'last_used') list.sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
    // default 'terbaru': already sorted by server desc
    return list
  }, [tokens, debouncedSearch, filterStatus, filterProjects, sort])

  const TOKENS_PER_PAGE = 20
  const [tokensPage, setTokensPage] = useState(1)
  useEffect(() => setTokensPage(1), [debouncedSearch, filterStatus, filterProjects, sort])
  const tokensTotalPages = Math.ceil(filteredTokens.length / TOKENS_PER_PAGE)
  const paginatedTokens = filteredTokens.slice((tokensPage - 1) * TOKENS_PER_PAGE, tokensPage * TOKENS_PER_PAGE)

  const createToken = useMutation({
    mutationFn: (body: typeof form) =>
      apiFetch('/api/envman/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: body.name, canWrite: body.canWrite, expiresAt: body.expiresAt || undefined, scopes: body.scopes }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      setNewToken(data.token)
      closeCreate()
      setForm(emptyForm)
      notifyOk('Token berhasil dibuat — salin nilainya sekarang!')
    },
    onError: (e) => notifyErr(e),
  })

  const editToken = useMutation({
    mutationFn: (body: typeof editForm) =>
      apiFetch(`/api/envman/tokens/${editingToken!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: body.name, canWrite: body.canWrite, expiresAt: body.expiresAt || null, scopes: body.scopes }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      closeEdit()
      setEditingToken(null)
      notifyOk('Token diperbarui')
    },
    onError: (e) => notifyErr(e),
  })

  const openEditModal = (t: ApiToken) => {
    setEditingToken(t)
    setEditForm({
      name: t.name,
      canWrite: t.canWrite,
      expiresAt: t.expiresAt ? new Date(t.expiresAt).toISOString().split('T')[0] : '',
      scopes: t.scopes,
    })
    openEdit()
  }

  const toggleToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: (data: { isDisabled: boolean }) => { qc.invalidateQueries({ queryKey: ['envman', 'tokens'] }); notifyOk(data.isDisabled ? 'Token dinonaktifkan' : 'Token diaktifkan') },
    onError: (e) => notifyErr(e),
  })

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/reveal`),
    onSuccess: async (data: { token: string }, id) => {
      try {
        await navigator.clipboard.writeText(data.token)
        setCopiedId(id)
        notifyOk('Token disalin ke clipboard')
        setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1500)
      } catch {
        notifyErr(new Error('Gagal akses clipboard — coba browser modern atau HTTPS'))
      }
    },
    onError: (e) => notifyErr(e),
  })

  const rotateToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/rotate`, { method: 'POST' }),
    onSuccess: (data: { token: string }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      setNewToken(data.token)
      notifyOk('Token di-rotate — salin nilai baru sekarang!')
    },
    onError: (e) => notifyErr(e),
  })

  const confirmRotate = (id: string, name: string) => {
    modals.openConfirmModal({
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="yellow" radius="md">
            <TbRefresh size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Rotate token</Text>
        </Group>
      ),
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Token <strong>{name}</strong> akan diganti dengan nilai baru.
            Nilai lama langsung <strong>invalid</strong> — semua script/CI yang masih
            memakai token lama akan gagal autentikasi sampai diganti.
          </Text>
          <Text size="xs" c="dimmed">Nilai baru hanya ditampilkan sekali setelah rotate.</Text>
        </Stack>
      ),
      labels: { confirm: 'Rotate token', cancel: 'Batal' },
      confirmProps: { color: 'yellow', leftSection: <TbRefresh size={13} /> },
      onConfirm: () => rotateToken.mutate(id),
    })
  }

  const revokeToken = (id: string, name: string) => {
    const modalId = `revoke-token-${id}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Revoke token</Text>
        </Group>
      ),
      children: (
        <RevokeTokenConfirm
          name={name}
          onCancel={() => modals.close(modalId)}
          onConfirm={async () => {
            try {
              await apiFetch(`/api/envman/tokens/${id}`, { method: 'DELETE' })
              qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
              notifyOk(`Token "${name}" direvoke`)
              modals.close(modalId)
            } catch (e) {
              notifyErr(e)
            }
          }}
        />
      ),
    })
  }

  const tokenForm = (f: typeof form, setF: typeof setForm) => (
    <Stack gap="lg">

      {/* ── Identitas ── */}
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Identitas</Text>
        <TextInput
          label="Nama token"
          placeholder="ci-github, laptop-bip, deploy-script"
          description="Gunakan nama yang menggambarkan dari mana token ini dipakai"
          value={f.name}
          autoFocus
          onChange={e => setF(x => ({ ...x, name: e.target.value }))}
        />
      </Stack>

      {/* ── Izin akses ── */}
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Izin Akses</Text>
        <Paper withBorder p="sm" style={{ background: f.canWrite ? 'var(--mantine-color-orange-light)' : undefined, borderColor: f.canWrite ? 'var(--mantine-color-orange-5)' : undefined }}>
          <Group justify="space-between" wrap="nowrap">
            <Box style={{ flex: 1 }}>
              <Group gap="xs" mb={2}>
                <Text size="xs" fw={600}>{f.canWrite ? 'Read-Write' : 'Read-Only'}</Text>
                {!f.canWrite && <Badge size="xs" color="blue" variant="light">Recommended</Badge>}
                {f.canWrite && <Badge size="xs" color="orange" variant="light">Advanced</Badge>}
              </Group>
              <Text size="xs" c="dimmed">
                {f.canWrite
                  ? 'Token dapat membaca DAN menulis vars — gunakan hanya untuk automation/deploy script.'
                  : 'Token hanya dapat membaca vars — aman untuk CLI lokal dan CI/CD pipeline.'}
              </Text>
            </Box>
            <Switch
              checked={f.canWrite}
              onChange={e => setF(x => ({ ...x, canWrite: e.target.checked }))}
              color="orange"
            />
          </Group>
        </Paper>
      </Stack>

      {/* ── Scope ── */}
      <Stack gap="xs">
        <Group gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Scope Akses</Text>
          <Tooltip label="Batasi token hanya ke project/environment tertentu untuk keamanan lebih baik">
            <TbInfoCircle size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
          </Tooltip>
        </Group>
        <ScopeSelector
          projects={projects}
          value={f.scopes}
          onChange={v => setF(x => ({ ...x, scopes: v }))}
        />
      </Stack>

      {/* ── Kedaluwarsa ── */}
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Kedaluwarsa</Text>
        <Stack gap="xs">
          <Group gap="xs" wrap="wrap">
            {[
              { label: '7 hari', days: 7 },
              { label: '30 hari', days: 30 },
              { label: '90 hari', days: 90 },
              { label: '1 tahun', days: 365 },
            ].map(({ label, days }) => {
              const d = new Date(); d.setDate(d.getDate() + days)
              const val = d.toISOString().split('T')[0]
              return (
                <Button
                  key={days}
                  size="compact-xs"
                  variant={f.expiresAt === val ? 'filled' : 'default'}
                  color="violet"
                  leftSection={<TbCalendar size={11} />}
                  onClick={() => setF(x => ({ ...x, expiresAt: x.expiresAt === val ? '' : val }))}
                >
                  {label}
                </Button>
              )
            })}
            {f.expiresAt && (
              <Button size="compact-xs" variant="subtle" color="red" onClick={() => setF(x => ({ ...x, expiresAt: '' }))}>
                Hapus batas
              </Button>
            )}
          </Group>
          <TextInput
            type="date"
            placeholder="Atau pilih tanggal custom..."
            leftSection={<TbCalendar size={13} />}
            min={new Date().toISOString().split('T')[0]}
            value={f.expiresAt}
            onChange={e => setF(x => ({ ...x, expiresAt: e.target.value }))}
            description={!f.expiresAt ? 'Kosong = tidak ada batas waktu (tidak direkomendasikan untuk CI/CD)' : undefined}
          />
        </Stack>
      </Stack>

    </Stack>
  )

  const hasFilter = debouncedSearch.trim().length > 0 || filterStatus !== 'semua' || filterProjects.length > 0
  const resetFilter = () => { setSearch(''); setFilterStatus('semua'); setFilterProjects([]) }

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      {/* ─── Header ─────────────────────────── */}
      <Group justify="space-between" mb="md" wrap="nowrap" align="center">
        <Box style={{ minWidth: 0 }}>
          <Text fw={800} size="xl" lh={1.2}>API Tokens</Text>
          {!isLoading && tokens.length > 0 && (
            <Text size="xs" c="dimmed" mt={2}>
              {tokens.length} total · {activeTokens.length} aktif
              {expiredTokens.length > 0 && ` · ${expiredTokens.length} expired`}
              {disabledTokens.length > 0 && ` · ${disabledTokens.length} disabled`}
            </Text>
          )}
        </Box>
        <Group gap="xs" wrap="nowrap">
          {tokens.length > 0 && (
            <Tooltip label={view === 'list' ? 'Tampilan grid' : 'Tampilan list'}>
              <ActionIcon size="md" variant="default" radius="md" aria-label="Ganti tampilan"
                onClick={() => setView(v => v === 'list' ? 'grid' : 'list')}>
                {view === 'list' ? <TbLayoutGrid size={15} /> : <TbLayoutList size={15} />}
              </ActionIcon>
            </Tooltip>
          )}
          {canCreateToken && (
            <Button size="sm" leftSection={<TbPlus size={14} />} color="violet" radius="md" onClick={openCreate}>
              Buat Token
            </Button>
          )}
        </Group>
      </Group>

      {/* ─── Toolbar ────────────────────────── */}
      {!isError && tokens.length > 0 && (
        <Box mb="md">
          <Group gap="xs" wrap="wrap">
            <TextInput
              ref={searchRef}
              size="xs"
              placeholder="Cari nama atau scope..."
              leftSection={<TbSearch size={13} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              rightSection={
                search ? (
                  <ActionIcon size="xs" variant="subtle" aria-label="Hapus pencarian" onClick={() => setSearch('')}>
                    <TbX size={11} />
                  </ActionIcon>
                ) : (
                  <Tooltip label="Tekan / untuk focus">
                    <Kbd size="xs">/</Kbd>
                  </Tooltip>
                )
              }
              rightSectionWidth={32}
              style={{ flex: '1 1 180px', minWidth: 0 }}
            />
            {isMobile ? (
              <Select
                size="xs"
                value={filterStatus}
                onChange={v => setFilterStatus(v ?? 'semua')}
                data={[
                  { label: `Semua (${tokens.length})`, value: 'semua' },
                  { label: `Aktif (${activeTokens.length})`, value: 'aktif' },
                  { label: `Expired (${expiredTokens.length})`, value: 'expired' },
                  { label: `Disabled (${disabledTokens.length})`, value: 'disabled' },
                ]}
                allowDeselect={false}
                w={130}
              />
            ) : (
              <SegmentedControl
                size="xs"
                value={filterStatus}
                onChange={setFilterStatus}
                data={[
                  { label: `Semua ${tokens.length}`, value: 'semua' },
                  { label: `Aktif ${activeTokens.length}`, value: 'aktif' },
                  { label: `Expired ${expiredTokens.length}`, value: 'expired' },
                  { label: `Disabled ${disabledTokens.length}`, value: 'disabled' },
                ]}
              />
            )}
            {projects.length > 0 && (
              <MultiSelectChips
                size="xs"
                label="Project"
                icon={<TbFilter size={13} />}
                width={130}
                options={projects.map(p => ({ value: p.slug, label: p.name }))}
                value={filterProjects}
                onChange={setFilterProjects}
              />
            )}
            <Select
              size="xs"
              w={isMobile ? 130 : 150}
              leftSection={<TbSortAscending size={13} />}
              value={sort}
              onChange={v => setSort(v ?? 'terbaru')}
              data={[
                { label: 'Terbaru', value: 'terbaru' },
                { label: 'Terlama', value: 'terlama' },
                { label: 'Nama A→Z', value: 'nama' },
                { label: 'Last used', value: 'last_used' },
              ]}
              allowDeselect={false}
            />
          </Group>
          {filterProjects.length > 0 && (
            <Group gap="xs" mt="xs" wrap="wrap" align="center">
              <Text size="xs" c="dimmed">Project aktif:</Text>
              <MultiSelectChipsRow
                value={filterProjects}
                onChange={setFilterProjects}
                getLabel={slug => projects.find(p => p.slug === slug)?.name ?? slug}
              />
            </Group>
          )}
          {hasFilter && (
            <Group justify="space-between" mt={6} gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {filteredTokens.length === tokens.length
                  ? `${tokens.length} token`
                  : `${filteredTokens.length} dari ${tokens.length} token`}
              </Text>
              <Button size="compact-xs" variant="subtle" color="gray" leftSection={<TbX size={11} />} onClick={resetFilter}>
                Reset
              </Button>
            </Group>
          )}
        </Box>
      )}

      <Group gap="xs" mb="md" align="center">
        <TbShieldCheck size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
        <Text size="xs" c="dimmed">
          Token CLI untuk autentikasi tanpa password.
          <Text span c="dimmed"> · </Text>
          <Text span fw={600} c="dimmed">read-only</Text> = pull vars ·{' '}
          <Text span fw={600} c="dimmed">read-write</Text> = push vars ·{' '}
          Scope kosong = akses semua project
        </Text>
      </Group>

      {/* ─── New token banner ───────────────── */}
      {newToken && (
        <Card withBorder mb="md" p="md" style={{ borderColor: 'var(--mantine-color-teal-5)', position: 'relative' }}>
          <ActionIcon size="xs" variant="subtle" color="gray" style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => setNewToken(null)}>
            <TbX size={12} />
          </ActionIcon>
          <Group gap="xs" mb="xs">
            <ThemeIcon size="sm" radius="xl" color="teal" variant="light"><TbCheck size={12} /></ThemeIcon>
            <Text size="xs" fw={600} c="teal">Token berhasil dibuat — simpan sekarang!</Text>
          </Group>
          <Alert color="orange" p="xs" mb="xs" icon={<TbAlertTriangle size={12} />}>
            <Text size="xs">Nilai token hanya ditampilkan <strong>sekali ini saja</strong> dan tidak bisa dilihat lagi.</Text>
          </Alert>
          <Group gap="xs" mb="xs">
            <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>{newToken}</Code>
            <CopyButton value={newToken}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied!' : 'Copy token'}>
                  <ActionIcon size="sm" variant="filled" color={copied ? 'teal' : 'blue'} onClick={copy}>
                    {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Divider mb="xs" />
          <Text size="xs" c="dimmed" mb={6}>Cara penggunaan:</Text>
          <Stack gap={6}>
            {[
              { label: 'Login & simpan config', cmd: `envman login ${window.location.origin} --token ${newToken}` },
              { label: 'Inject vars ke command', cmd: `envman -e myapp:production -- bun start` },
              { label: 'CI/CD (tanpa login)', cmd: `ENVMAN_SERVER=${window.location.origin} ENVMAN_TOKEN=${newToken} envman -e myapp:production -- bun start` },
            ].map(({ label, cmd }) => (
              <Box key={label}>
                <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                <Group gap="xs">
                  <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>{cmd}</Code>
                  <CopyButton value={cmd}>
                    {({ copied, copy }) => (
                      <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                        {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                      </ActionIcon>
                    )}
                  </CopyButton>
                </Group>
              </Box>
            ))}
          </Stack>
        </Card>
      )}

      {/* ─── Error state ────────────────────── */}
      {isError && (
        <Card withBorder p="xl" ta="center" style={{ borderColor: 'var(--mantine-color-red-5)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm">
            <TbAlertTriangle size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Gagal memuat tokens</Text>
          <Text size="sm" c="dimmed" mb="md">
            {(error as Error)?.message ?? 'Terjadi kesalahan saat memuat daftar token.'}
          </Text>
          <Button size="xs" variant="light" color="red" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </Card>
      )}

      {/* ─── Token list ─────────────────────── */}
      {!isError && isLoading ? (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} height={140} radius="md" />)}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} height={76} radius="md" />)}
          </Stack>
        )
      ) : !isError && tokens.length === 0 ? (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="violet" mx="auto" mb="sm">
            <TbKey size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Belum ada API token</Text>
          <Text size="sm" c="dimmed" mb="md" maw={420} mx="auto">
            Token dipakai CLI <Code fz="xs">envman</Code> untuk login tanpa password.
            Cocok untuk CI/CD pipeline, deploy script, atau development di laptop pribadi.
          </Text>
          {canCreateToken ? (
            <Button size="sm" color="violet" leftSection={<TbPlus size={14} />} onClick={openCreate}>
              Buat Token Pertama
            </Button>
          ) : (
            <Text size="xs" c="dimmed">Tidak punya izin create API token. Hubungi SUPER_ADMIN.</Text>
          )}
        </Card>
      ) : !isError && filteredTokens.length === 0 ? (
        <Card withBorder p="lg" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbSearch size={22} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Tidak ada hasil</Text>
          <Text size="sm" c="dimmed" mb="md">Tidak ada token yang cocok dengan filter.</Text>
          <Button size="xs" variant="subtle" leftSection={<TbX size={11} />} onClick={resetFilter}>
            Reset filter
          </Button>
        </Card>
      ) : !isError && view === 'grid' ? (
        <>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {paginatedTokens.map((t) => {
            const expiry = expiryStatus(t.expiresAt)
            const isExpired = expiry === 'expired'
            return (
              <Card
                key={t.id} withBorder radius="lg" p="sm"
                className={`envman-token-card ${t.isDisabled ? 'is-disabled' : ''} ${isExpired ? 'is-expired' : ''}`}
                style={{
                  opacity: t.isDisabled ? 0.55 : isExpired ? 0.65 : 1,
                  borderColor: isExpired ? 'var(--mantine-color-red-3)' : undefined,
                }}
              >
                {/* Top: access icon + actions */}
                <Group justify="space-between" mb={8} wrap="nowrap">
                  <Group gap={6} align="center">
                    <ThemeIcon size={28} radius="md" variant="light" color={t.canWrite ? 'orange' : 'blue'}>
                      <TbKey size={14} />
                    </ThemeIcon>
                    <Badge size="xs" variant="light" color={t.canWrite ? 'orange' : 'blue'}>
                      {t.canWrite ? 'rw' : 'ro'}
                    </Badge>
                    {t.isDisabled && <Badge size="xs" color="gray" variant="filled">off</Badge>}
                    {isExpired && <Badge size="xs" color="red" variant="filled">expired</Badge>}
                    {expiry === 'soon' && t.expiresAt && (
                      <Badge size="xs" color="yellow" variant="light">{daysUntil(t.expiresAt)}h</Badge>
                    )}
                  </Group>
                  <Group gap={2}>
                    <Tooltip label={t.isDisabled ? 'Aktifkan' : 'Nonaktifkan'} withArrow>
                      <ActionIcon size="xs" variant="subtle" color={t.isDisabled ? 'gray' : 'teal'}
                        loading={toggleToken.isPending && toggleToken.variables === t.id}
                        onClick={() => toggleToken.mutate(t.id)}>
                        {t.isDisabled ? <TbToggleLeft size={13} /> : <TbToggleRight size={13} />}
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={copiedId === t.id ? 'Tersalin!' : 'Copy token'} withArrow>
                      <ActionIcon size="xs" variant="subtle" color={copiedId === t.id ? 'teal' : 'gray'}
                        loading={copyToken.isPending && copyToken.variables === t.id}
                        onClick={() => copyToken.mutate(t.id)}>
                        {copiedId === t.id ? <TbCheck size={12} /> : <TbCopy size={12} />}
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Rotate" withArrow>
                      <ActionIcon size="xs" variant="subtle" color="yellow"
                        loading={rotateToken.isPending && rotateToken.variables === t.id}
                        onClick={() => confirmRotate(t.id, t.name)}>
                        <TbRefresh size={12} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Usage" withArrow>
                      <ActionIcon size="xs" variant="subtle" color="gray"
                        onClick={() => setExpandedUsage(prev => { const s = new Set(prev); s.has(t.id) ? s.delete(t.id) : s.add(t.id); return s })}>
                        <TbTerminal size={12} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Edit" withArrow>
                      <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => openEditModal(t)}>
                        <TbPencil size={12} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Revoke" withArrow>
                      <ActionIcon size="xs" variant="subtle" color="red" onClick={() => revokeToken(t.id, t.name)}>
                        <TbTrash size={12} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>

                {/* Token name — primary element */}
                <Text fw={700} size="sm" mb={6} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</Text>
                <Group gap={4} mb={6} wrap="wrap">
                  {t.scopes.length === 0 ? (
                    <Badge size="xs" variant="default">semua project</Badge>
                  ) : (
                    <>
                      {t.scopes.slice(0, 3).map(s => <ScopeBadge key={s} scope={s} />)}
                      {t.scopes.length > 3 && (
                        <HoverCard width={260} shadow="md" withinPortal position="bottom-start">
                          <HoverCard.Target>
                            <Badge size="xs" variant="default" style={{ cursor: 'pointer' }}>+{t.scopes.length - 3}</Badge>
                          </HoverCard.Target>
                          <HoverCard.Dropdown>
                            <Stack gap={4}>
                              <Text size="xs" c="dimmed">Scope lainnya:</Text>
                              <Group gap={4} wrap="wrap">
                                {t.scopes.slice(3).map(s => <ScopeBadge key={s} scope={s} />)}
                              </Group>
                            </Stack>
                          </HoverCard.Dropdown>
                        </HoverCard>
                      )}
                    </>
                  )}
                </Group>
                <Tooltip label={t.lastUsedAt ? `Terakhir dipakai ${absoluteTime(t.lastUsedAt)}` : 'Belum pernah dipakai'} withArrow>
                  <Group gap={4} style={{ cursor: 'default' }}>
                    <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                    <Text size="xs" c="dimmed">
                      {t.lastUsedAt ? relativeTime(t.lastUsedAt) : <Text component="span" fs="italic">belum dipakai</Text>}
                    </Text>
                  </Group>
                </Tooltip>

                <Collapse in={expandedUsage.has(t.id)}>
                  <Divider my="xs" />
                  <Stack gap={6}>
                    {(() => {
                      const origin = window.location.origin
                      const scope = t.scopes.length > 0 ? t.scopes[0] : 'myapp:production'
                      const [scopeProject, scopeEnv] = scope.includes(':') ? scope.split(':') : [scope, 'production']
                      return [
                        { label: 'Login & simpan config', cmd: `envman login ${origin} --token <TOKEN>` },
                        { label: `Inject vars (${scopeProject}:${scopeEnv})`, cmd: `envman -e ${scopeProject}:${scopeEnv} -- bun start` },
                        { label: 'CI/CD tanpa login', cmd: `ENVMAN_SERVER=${origin} ENVMAN_TOKEN=<TOKEN> envman -e ${scopeProject}:${scopeEnv} -- bun start` },
                      ].map(({ label, cmd }) => (
                        <Box key={label}>
                          <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                          <Group gap={4} align="center">
                            <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>{cmd}</Code>
                            <CopyButton value={cmd}>
                              {({ copied, copy }) => (
                                <Tooltip label={copied ? 'Copied!' : 'Copy'}>
                                  <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                                    {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </CopyButton>
                          </Group>
                        </Box>
                      ))
                    })()}
                    {t.scopes.length === 0 && (
                      <Text size="xs" c="dimmed">Token ini punya akses ke semua project. Ganti <Code fz="xs">myapp:production</Code> dengan project:env yang sesuai.</Text>
                    )}
                  </Stack>
                </Collapse>
              </Card>
            )
          })}
        </SimpleGrid>
        {tokensTotalPages > 1 && (
          <Group justify="center" mt="sm">
            <Pagination value={tokensPage} onChange={setTokensPage} total={tokensTotalPages} size="sm" />
          </Group>
        )}
        </>
      ) : !isError ? (
        <>
        <Stack gap="xs">
          {paginatedTokens.map((t) => {
            const expiry = expiryStatus(t.expiresAt)
            const isExpired = expiry === 'expired'
            return (
              <Card
                key={t.id} withBorder radius="md" p="sm"
                className={`envman-token-card ${t.isDisabled ? 'is-disabled' : ''} ${isExpired ? 'is-expired' : ''}`}
                style={{
                  opacity: t.isDisabled ? 0.55 : isExpired ? 0.65 : 1,
                  borderColor: isExpired ? 'var(--mantine-color-red-3)' : undefined,
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  <Group gap="sm" style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
                    <ThemeIcon size={32} radius="md" variant="light" color={t.canWrite ? 'orange' : 'blue'}>
                      <TbKey size={15} />
                    </ThemeIcon>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap={6} mb={3} wrap="nowrap" align="center">
                        <Text size="sm" fw={700} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</Text>
                        <Badge size="xs" color={t.canWrite ? 'orange' : 'blue'} variant="light" style={{ flexShrink: 0 }}>
                          {t.canWrite ? 'rw' : 'ro'}
                        </Badge>
                        {t.isDisabled && <Badge size="xs" color="gray" variant="filled" style={{ flexShrink: 0 }}>off</Badge>}
                        {expiry === 'expired' && <Badge size="xs" color="red" variant="filled" style={{ flexShrink: 0 }}>expired</Badge>}
                        {expiry === 'soon' && t.expiresAt && (
                          <Tooltip label={`Expired ${absoluteTime(t.expiresAt)}`} withArrow>
                            <Badge size="xs" color="yellow" variant="light" style={{ flexShrink: 0 }}>
                              {daysUntil(t.expiresAt)}h
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                      <Group gap="xs" wrap="wrap">
                        {t.scopes.length === 0 ? (
                          <Badge size="xs" variant="default">semua project</Badge>
                        ) : (
                          <>
                            {t.scopes.slice(0, 4).map(s => <ScopeBadge key={s} scope={s} />)}
                            {t.scopes.length > 4 && (
                              <HoverCard width={260} shadow="md" withinPortal position="bottom-start">
                                <HoverCard.Target>
                                  <Badge size="xs" variant="default" style={{ cursor: 'pointer' }}>+{t.scopes.length - 4}</Badge>
                                </HoverCard.Target>
                                <HoverCard.Dropdown>
                                  <Stack gap={4}>
                                    <Text size="xs" c="dimmed">Scope lainnya:</Text>
                                    <Group gap={4} wrap="wrap">
                                      {t.scopes.slice(4).map(s => <ScopeBadge key={s} scope={s} />)}
                                    </Group>
                                  </Stack>
                                </HoverCard.Dropdown>
                              </HoverCard>
                            )}
                          </>
                        )}
                        <Tooltip label={t.lastUsedAt ? `Terakhir dipakai ${absoluteTime(t.lastUsedAt)}` : 'Belum pernah dipakai'} withArrow>
                          <Group gap={3} style={{ cursor: 'default' }}>
                            <TbClock size={10} style={{ color: 'var(--mantine-color-dimmed)' }} />
                            <Text size="xs" c="dimmed">
                              {t.lastUsedAt ? relativeTime(t.lastUsedAt) : <Text component="span" fs="italic">belum dipakai</Text>}
                            </Text>
                          </Group>
                        </Tooltip>
                        <Tooltip label={`Dibuat ${absoluteTime(t.createdAt)}`} withArrow>
                          <Text size="xs" c="dimmed" style={{ cursor: 'default' }}>{relativeTime(t.createdAt)}</Text>
                        </Tooltip>
                        {t.expiresAt && !isExpired && (
                          <Tooltip label={absoluteTime(t.expiresAt)}>
                            <Text size="xs" c={expiry === 'soon' ? 'yellow' : 'dimmed'}>
                              expires: {new Date(t.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </Text>
                          </Tooltip>
                        )}
                        {isExpired && t.expiresAt && (
                          <Tooltip label={absoluteTime(t.expiresAt)}>
                            <Text size="xs" c="red">expired: {new Date(t.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                          </Tooltip>
                        )}
                      </Group>
                    </Box>
                  </Group>
                  <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Tooltip label={t.isDisabled ? 'Aktifkan' : 'Nonaktifkan'} withArrow>
                      <ActionIcon size="sm" variant="subtle" color={t.isDisabled ? 'gray' : 'teal'}
                        loading={toggleToken.isPending && toggleToken.variables === t.id}
                        onClick={() => toggleToken.mutate(t.id)}>
                        {t.isDisabled ? <TbToggleLeft size={15} /> : <TbToggleRight size={15} />}
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={copiedId === t.id ? 'Tersalin!' : 'Copy token'} withArrow>
                      <ActionIcon size="sm" variant="subtle" color={copiedId === t.id ? 'teal' : 'gray'}
                        loading={copyToken.isPending && copyToken.variables === t.id}
                        onClick={() => copyToken.mutate(t.id)}>
                        {copiedId === t.id ? <TbCheck size={13} /> : <TbCopy size={13} />}
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Rotate" withArrow>
                      <ActionIcon size="sm" variant="subtle" color="yellow"
                        loading={rotateToken.isPending && rotateToken.variables === t.id}
                        onClick={() => confirmRotate(t.id, t.name)}>
                        <TbRefresh size={13} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Usage" withArrow>
                      <ActionIcon size="sm" variant="subtle" color="gray"
                        onClick={() => setExpandedUsage(prev => { const s = new Set(prev); s.has(t.id) ? s.delete(t.id) : s.add(t.id); return s })}>
                        <TbTerminal size={13} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Edit" withArrow>
                      <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => openEditModal(t)}>
                        <TbPencil size={13} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Revoke" withArrow>
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => revokeToken(t.id, t.name)}>
                        <TbTrash size={13} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>

                <Collapse in={expandedUsage.has(t.id)}>
                  <Divider my="xs" />
                  <Stack gap={6}>
                    {(() => {
                      const origin = window.location.origin
                      const scope = t.scopes.length > 0 ? t.scopes[0] : 'myapp:production'
                      const [scopeProject, scopeEnv] = scope.includes(':') ? scope.split(':') : [scope, 'production']
                      return [
                        { label: 'Login & simpan config', cmd: `envman login ${origin} --token <TOKEN>` },
                        { label: `Inject vars (${scopeProject}:${scopeEnv})`, cmd: `envman -e ${scopeProject}:${scopeEnv} -- bun start` },
                        { label: 'CI/CD tanpa login', cmd: `ENVMAN_SERVER=${origin} ENVMAN_TOKEN=<TOKEN> envman -e ${scopeProject}:${scopeEnv} -- bun start` },
                      ].map(({ label, cmd }) => (
                        <Box key={label}>
                          <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                          <Group gap={4} align="center">
                            <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>{cmd}</Code>
                            <CopyButton value={cmd}>
                              {({ copied, copy }) => (
                                <Tooltip label={copied ? 'Copied!' : 'Copy'}>
                                  <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                                    {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </CopyButton>
                          </Group>
                        </Box>
                      ))
                    })()}
                    {t.scopes.length === 0 && (
                      <Text size="xs" c="dimmed">Token ini punya akses ke semua project. Ganti <Code fz="xs">myapp:production</Code> dengan project:env yang sesuai.</Text>
                    )}
                  </Stack>
                </Collapse>
              </Card>
            )
          })}
        </Stack>
        {tokensTotalPages > 1 && (
          <Group justify="center" mt="sm">
            <Pagination value={tokensPage} onChange={setTokensPage} total={tokensTotalPages} size="sm" />
          </Group>
        )}
        </>
      ) : null}

      {/* ─── Create modal ───────────────────── */}
      <Modal
        opened={createOpen}
        onClose={() => { closeCreate(); setForm(emptyForm) }}
        size="lg"
        fullScreen={isMobile}
        title={
          <Group gap="xs">
            <ThemeIcon size={28} variant="gradient" gradient={{ from: 'violet', to: 'grape' }} radius="md">
              <TbKey size={15} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="sm">Buat API Token</Text>
              <Text size="xs" c="dimmed">Token untuk CLI, CI/CD, atau automation script</Text>
            </Box>
          </Group>
        }
      >
        <Stack gap="md">
          {tokenForm(form, setForm)}
          <Divider />
          {/* Summary */}
          <Paper withBorder p="xs" bg="var(--mantine-color-default-hover)">
            <Text size="xs" fw={600} mb={4}>Ringkasan token:</Text>
            <Group gap="xs" wrap="wrap">
              <Badge size="xs" color={form.canWrite ? 'orange' : 'blue'} variant="light" leftSection={form.canWrite ? <TbLockOpen size={9} /> : <TbLock size={9} />}>
                {form.canWrite ? 'read-write' : 'read-only'}
              </Badge>
              <Badge size="xs" color="violet" variant="light">
                {form.scopes.length === 0 ? 'semua project' : `${form.scopes.length} scope`}
              </Badge>
              <Badge size="xs" color={form.expiresAt ? 'teal' : 'gray'} variant="light" leftSection={<TbCalendar size={9} />}>
                {form.expiresAt ? `exp: ${new Date(form.expiresAt).toLocaleDateString('id-ID')}` : 'tidak ada expiry'}
              </Badge>
            </Group>
          </Paper>
          <Button
            fullWidth
            size="md"
            leftSection={<TbKey size={16} />}
            variant="gradient"
            gradient={{ from: 'violet', to: 'grape' }}
            onClick={() => createToken.mutate(form)}
            loading={createToken.isPending}
            disabled={!form.name.trim() || createToken.isPending}
          >
            {form.name ? `Buat token "${form.name}"` : 'Buat Token'}
          </Button>
          {createToken.isError && <Text size="xs" c="red">{(createToken.error as Error).message}</Text>}
        </Stack>
      </Modal>

      {/* ─── Edit modal ─────────────────────── */}
      <Modal
        opened={editOpen}
        onClose={() => { closeEdit(); setEditingToken(null) }}
        size="lg"
        fullScreen={isMobile}
        title={
          <Group gap="xs">
            <ThemeIcon size={28} variant="light" color="violet" radius="md">
              <TbPencil size={15} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="sm">Edit Token</Text>
              <Text size="xs" c="dimmed">{editingToken?.name}</Text>
            </Box>
          </Group>
        }
      >
        <Stack gap="md">
          {tokenForm(editForm, setEditForm)}
          <Divider />
          <Paper withBorder p="xs" bg="var(--mantine-color-default-hover)">
            <Text size="xs" fw={600} mb={4}>Ringkasan token:</Text>
            <Group gap="xs" wrap="wrap">
              <Badge size="xs" color={editForm.canWrite ? 'orange' : 'blue'} variant="light" leftSection={editForm.canWrite ? <TbLockOpen size={9} /> : <TbLock size={9} />}>
                {editForm.canWrite ? 'read-write' : 'read-only'}
              </Badge>
              <Badge size="xs" color="violet" variant="light">
                {editForm.scopes.length === 0 ? 'semua project' : `${editForm.scopes.length} scope`}
              </Badge>
              <Badge size="xs" color={editForm.expiresAt ? 'teal' : 'gray'} variant="light" leftSection={<TbCalendar size={9} />}>
                {editForm.expiresAt ? `exp: ${new Date(editForm.expiresAt).toLocaleDateString('id-ID')}` : 'tidak ada expiry'}
              </Badge>
            </Group>
          </Paper>
          <Button fullWidth leftSection={<TbCheck size={14} />} onClick={() => editToken.mutate(editForm)} loading={editToken.isPending} disabled={!editForm.name}>
            Simpan Perubahan
          </Button>
          {editToken.isError && <Text size="xs" c="red">{(editToken.error as Error).message}</Text>}
        </Stack>
      </Modal>
    </Box>
  )
}

// ─── Type-to-confirm revoke ──────────────────────────────────────────────────

function RevokeTokenConfirm({
  name, onCancel, onConfirm,
}: {
  name: string
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const canConfirm = typed === name

  const handleConfirm = async () => {
    if (!canConfirm || loading) return
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm">
        Token <strong>{name}</strong> akan dihapus permanen. Semua script/CI yang masih
        menggunakan token ini akan langsung gagal autentikasi.
      </Text>
      <Text size="xs" c="dimmed">
        Ketik <Code fz="xs">{name}</Code> untuk mengkonfirmasi:
      </Text>
      <TextInput
        size="sm"
        placeholder={name}
        value={typed}
        autoFocus
        data-autofocus
        spellCheck={false}
        onChange={e => setTyped(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && canConfirm) handleConfirm() }}
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>Batal</Button>
        <Button
          color="red"
          leftSection={<TbTrash size={13} />}
          disabled={!canConfirm}
          loading={loading}
          onClick={handleConfirm}
        >
          Revoke Permanen
        </Button>
      </Group>
    </Stack>
  )
}
