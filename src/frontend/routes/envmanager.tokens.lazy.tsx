import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Collapse,
  CopyButton,
  Divider,
  Group,
  Kbd,
  Modal,
  Pagination,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDebouncedValue, useDisclosure, useHotkeys, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TbAlertTriangle,
  TbCalendar,
  TbCheck,
  TbChevronDown,
  TbChevronLeft,
  TbChevronRight,
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
  TbTag,
  TbTrash,
  TbVariable,
  TbX,
} from 'react-icons/tb'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { TokenCard } from '@/frontend/components/tokens/TokenCard'
import { TokenDetailView } from '@/frontend/components/tokens/TokenDetailView'
import type { ApiToken } from '@/frontend/components/tokens/token-utils'
import { expiryStatus, TOKEN_CARD_STYLES, tagColor } from '@/frontend/components/tokens/token-utils'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export const Route = createLazyFileRoute('/envmanager/tokens')({ component: TokensPage })

interface ProjectOption {
  slug: string
  name: string
  environments: { name: string }[]
}

// ── Scope Selector ──────────────────────────────────────────────────────────

interface ScopeSelectorProps {
  projects: ProjectOption[]
  value: string[]
  onChange: (v: string[]) => void
}

const SCOPE_PER_PAGE = 6

function ScopeSelector({ projects, value, onChange }: ScopeSelectorProps) {
  const allAccess = value.length === 0
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [scopeView, setScopeView] = useState<'list' | 'grid'>('list')
  const [scopePage, setScopePage] = useState(1)
  const [scopeSearch, setScopeSearch] = useState('')

  const filteredProjects = scopeSearch.trim()
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(scopeSearch.toLowerCase()) ||
          p.slug.toLowerCase().includes(scopeSearch.toLowerCase()),
      )
    : projects

  const totalPages = Math.ceil(filteredProjects.length / SCOPE_PER_PAGE)
  const paginatedProjects = filteredProjects.slice((scopePage - 1) * SCOPE_PER_PAGE, scopePage * SCOPE_PER_PAGE)

  const toggleExpand = (slug: string) =>
    setExpanded((prev) => {
      const s = new Set(prev)
      s.has(slug) ? s.delete(slug) : s.add(slug)
      return s
    })

  const toggleScope = (scope: string) => {
    if (allAccess) {
      onChange([scope])
      return
    }
    if (value.includes(scope)) {
      onChange(value.filter((s) => s !== scope))
    } else {
      onChange([...value, scope])
    }
  }

  const toggleProject = (p: ProjectOption) => {
    const projectScopes = p.environments.map((e) => `${p.slug}:${e.name}`)
    if (allAccess) {
      onChange(projectScopes)
      return
    }
    const allSelected = projectScopes.every((s) => value.includes(s))
    if (allSelected) onChange(value.filter((s) => !projectScopes.includes(s)))
    else onChange([...value.filter((s) => !projectScopes.includes(s)), ...projectScopes])
  }

  if (projects.length === 0)
    return (
      <Text size="xs" c="dimmed">
        Belum ada project — token akan punya akses global.
      </Text>
    )

  const renderListItem = (p: ProjectOption) => {
    const projectScopes = p.environments.map((e) => `${p.slug}:${e.name}`)
    const selectedCount = allAccess ? 0 : projectScopes.filter((s) => value.includes(s)).length
    const allSelected = !allAccess && selectedCount === projectScopes.length && projectScopes.length > 0
    const someSelected = !allAccess && selectedCount > 0 && !allSelected
    const isOpen = expanded.has(p.slug)
    return (
      <Box
        key={p.slug}
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: '1px solid var(--mantine-color-default-border)',
          overflow: 'hidden',
          opacity: allAccess ? 0.55 : 1,
        }}
      >
        <Group
          gap="xs"
          p="xs"
          style={{
            cursor: 'pointer',
            background: someSelected || allSelected ? 'var(--mantine-color-violet-light)' : undefined,
          }}
          onClick={() => {
            if (p.environments.length > 0) toggleExpand(p.slug)
          }}
        >
          <Checkbox
            size="xs"
            checked={allSelected}
            indeterminate={someSelected}
            onChange={() => toggleProject(p)}
            onClick={(e) => {
              e.stopPropagation()
              toggleProject(p)
            }}
          />
          <TbVariable size={13} style={{ color: 'var(--mantine-color-primary)' }} />
          <Text size="xs" fw={600} style={{ flex: 1 }}>
            {p.name}
          </Text>
          <Code fz="xs" c="dimmed">
            {p.slug}
          </Code>
          {selectedCount > 0 && (
            <Badge size="xs" color="primary" variant="filled">
              {selectedCount}/{projectScopes.length}
            </Badge>
          )}
          {p.environments.length > 0 && (isOpen ? <TbChevronDown size={13} /> : <TbChevronRight size={13} />)}
        </Group>
        <Collapse in={isOpen}>
          <Stack gap={0} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            {p.environments.map((e) => {
              const scope = `${p.slug}:${e.name}`
              const checked = !allAccess && value.includes(scope)
              return (
                <Group
                  key={e.name}
                  gap="xs"
                  px="sm"
                  py={6}
                  style={{ cursor: 'pointer', background: checked ? 'var(--mantine-color-violet-light)' : undefined }}
                  onClick={() => toggleScope(scope)}
                >
                  <Checkbox
                    size="xs"
                    checked={checked}
                    onChange={() => toggleScope(scope)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Code fz="xs">{e.name}</Code>
                  <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                    {scope}
                  </Text>
                </Group>
              )
            })}
            {p.environments.length === 0 && (
              <Text size="xs" c="dimmed" px="sm" py={6}>
                Belum ada environment
              </Text>
            )}
          </Stack>
        </Collapse>
      </Box>
    )
  }

  const renderGridItem = (p: ProjectOption) => {
    const projectScopes = p.environments.map((e) => `${p.slug}:${e.name}`)
    const selectedCount = allAccess ? 0 : projectScopes.filter((s) => value.includes(s)).length
    const allSelected = !allAccess && selectedCount === projectScopes.length && projectScopes.length > 0
    const someSelected = !allAccess && selectedCount > 0 && !allSelected
    return (
      <Box
        key={p.slug}
        p="xs"
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: `1px solid ${allSelected ? 'var(--mantine-color-primary)' : 'var(--mantine-color-default-border)'}`,
          opacity: allAccess ? 0.55 : 1,
          background: allSelected || someSelected ? 'var(--mantine-color-violet-light)' : undefined,
        }}
      >
        <Group gap="xs" mb={6} wrap="nowrap">
          <Checkbox size="xs" checked={allSelected} indeterminate={someSelected} onChange={() => toggleProject(p)} />
          <TbVariable size={12} style={{ color: 'var(--mantine-color-primary)', flexShrink: 0 }} />
          <Text size="xs" fw={700} truncate style={{ flex: 1 }}>
            {p.name}
          </Text>
          <Code fz="xs" c="dimmed">
            {p.slug}
          </Code>
        </Group>
        {p.environments.length === 0 ? (
          <Text size="xs" c="dimmed" fs="italic">
            Belum ada environment
          </Text>
        ) : (
          <Group gap={4} wrap="wrap">
            {p.environments.map((e) => {
              const scope = `${p.slug}:${e.name}`
              const checked = !allAccess && value.includes(scope)
              return (
                <Badge
                  key={e.name}
                  size="xs"
                  variant={checked ? 'filled' : 'outline'}
                  color={checked ? 'primary' : 'gray'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleScope(scope)}
                >
                  {e.name}
                </Badge>
              )
            })}
          </Group>
        )}
        {selectedCount > 0 && (
          <Text size="xs" c="primary" mt={4}>
            {selectedCount}/{projectScopes.length} dipilih
          </Text>
        )}
      </Box>
    )
  }

  return (
    <Stack gap={6}>
      {/* All access toggle */}
      <Box
        p="xs"
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: `1px solid ${allAccess ? 'var(--mantine-color-primary)' : 'var(--mantine-color-default-border)'}`,
          cursor: allAccess ? 'default' : 'pointer',
          background: allAccess ? 'var(--mantine-color-violet-light)' : undefined,
        }}
        onClick={() => {
          if (!allAccess) onChange([])
        }}
      >
        <Group gap="xs">
          <Checkbox size="xs" readOnly checked={allAccess} />
          <Box style={{ flex: 1 }}>
            <Text size="xs" fw={600}>
              Semua project
            </Text>
            <Text size="xs" c="dimmed">
              Akses ke semua project yang kamu miliki — tidak dibatasi
            </Text>
          </Box>
          {!allAccess && (
            <Badge size="xs" color="gray" variant="outline">
              klik untuk reset
            </Badge>
          )}
        </Group>
      </Box>

      {/* Toolbar: search + view toggle */}
      <Group gap="xs" wrap="nowrap">
        <TextInput
          size="xs"
          placeholder="Cari project..."
          leftSection={<TbSearch size={12} />}
          value={scopeSearch}
          onChange={(e) => {
            setScopeSearch(e.target.value)
            setScopePage(1)
          }}
          rightSection={
            scopeSearch ? (
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={() => {
                  setScopeSearch('')
                  setScopePage(1)
                }}
              >
                <TbX size={11} />
              </ActionIcon>
            ) : null
          }
          style={{ flex: 1 }}
        />
        <Group gap={2} style={{ flexShrink: 0 }}>
          <ActionIcon
            size="xs"
            variant={scopeView === 'list' ? 'filled' : 'subtle'}
            color="gray"
            radius="sm"
            onClick={() => {
              setScopeView('list')
              setScopePage(1)
            }}
            aria-label="Tampilan list"
          >
            <TbLayoutList size={12} />
          </ActionIcon>
          <ActionIcon
            size="xs"
            variant={scopeView === 'grid' ? 'filled' : 'subtle'}
            color="gray"
            radius="sm"
            onClick={() => {
              setScopeView('grid')
              setScopePage(1)
            }}
            aria-label="Tampilan grid"
          >
            <TbLayoutGrid size={12} />
          </ActionIcon>
        </Group>
      </Group>
      {filteredProjects.length < projects.length && (
        <Text size="xs" c="dimmed">
          {filteredProjects.length} dari {projects.length} project
          {!allAccess && value.length > 0 && ` · ${value.length} scope dipilih`}
        </Text>
      )}

      {/* Project list / grid */}
      {filteredProjects.length === 0 ? (
        <Text size="xs" c="dimmed" ta="center" py="xs">
          Tidak ada project yang cocok.
        </Text>
      ) : scopeView === 'list' ? (
        <Stack gap={4}>{paginatedProjects.map(renderListItem)}</Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
          {paginatedProjects.map(renderGridItem)}
        </SimpleGrid>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Group justify="center">
          <Pagination value={scopePage} onChange={setScopePage} total={totalPages} size="xs" withEdges />
        </Group>
      )}

      {!allAccess && value.length === 0 && (
        <Text size="xs" c="dimmed">
          Pilih minimal satu environment, atau klik "Semua project" di atas.
        </Text>
      )}
    </Stack>
  )
}

const emptyForm = { name: '', canWrite: false, expiresAt: '', scopes: [] as string[], tags: [] as string[] }

function TokensPage() {
  const { token: selectedTokenId, edit: isEditing } = Route.useSearch()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: sessionData } = useSession()
  const canCreateToken = hasCapability(sessionData?.user, 'token:create')
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false)
  const [editingToken, setEditingToken] = useState<ApiToken | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editForm, setEditForm] = useState(emptyForm)
  const [expandedUsage, setExpandedUsage] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useLocalStorage({ key: 'envman:tokens:filterStatus', defaultValue: 'semua' })
  const [filterProjects, setFilterProjects] = useLocalStorage<string[]>({
    key: 'envman:tokens:filterProjects',
    defaultValue: [],
  })
  const [filterTags, setFilterTags] = useLocalStorage<string[]>({ key: 'envman:tokens:filterTags', defaultValue: [] })
  const [sort, setSort] = useLocalStorage({ key: 'envman:tokens:sort', defaultValue: 'terbaru' })
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
    [
      '/',
      () => {
        searchRef.current?.focus()
        searchRef.current?.select()
      },
    ],
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
  const selectedToken = selectedTokenId ? (tokens.find((t) => t.id === selectedTokenId) ?? null) : null
  const activeTokens = tokens.filter((t) => expiryStatus(t.expiresAt) !== 'expired' && !t.isDisabled)
  const expiredTokens = tokens.filter((t) => expiryStatus(t.expiresAt) === 'expired')
  const disabledTokens = tokens.filter((t) => t.isDisabled)

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of tokens) for (const tag of t.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: `${value} (${count})` }))
  }, [tokens])

  const filteredTokens = useMemo(() => {
    let list = [...tokens]
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.scopes.some((s) => s.toLowerCase().includes(q)))
    }
    if (filterStatus === 'aktif') list = list.filter((t) => !t.isDisabled && expiryStatus(t.expiresAt) !== 'expired')
    if (filterStatus === 'expired') list = list.filter((t) => expiryStatus(t.expiresAt) === 'expired')
    if (filterStatus === 'disabled') list = list.filter((t) => t.isDisabled)
    if (filterProjects.length > 0) {
      list = list.filter((t) =>
        t.scopes.length === 0
          ? false
          : filterProjects.some((slug) => t.scopes.some((s) => s === `${slug}:*` || s.startsWith(`${slug}:`))),
      )
    }
    if (filterTags.length > 0) {
      list = list.filter((t) => filterTags.some((tag) => (t.tags ?? []).includes(tag)))
    }
    if (sort === 'nama') list.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'terlama') list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (sort === 'last_used') list.sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
    // default 'terbaru': already sorted by server desc
    return list
  }, [tokens, debouncedSearch, filterStatus, filterProjects, filterTags, sort])

  const TOKENS_PER_PAGE = 20
  const [tokensPage, setTokensPage] = useState(1)
  useEffect(() => setTokensPage(1), [])
  const tokensTotalPages = Math.ceil(filteredTokens.length / TOKENS_PER_PAGE)
  const paginatedTokens = filteredTokens.slice((tokensPage - 1) * TOKENS_PER_PAGE, tokensPage * TOKENS_PER_PAGE)

  const createToken = useMutation({
    mutationFn: (body: typeof form) =>
      apiFetch('/api/envman/tokens', {
        method: 'POST',
        body: JSON.stringify({
          name: body.name,
          canWrite: body.canWrite,
          expiresAt: body.expiresAt || undefined,
          scopes: body.scopes,
        }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      setNewToken(data.token)
      setForm(emptyForm)
      goToList()
      notifyOk('Token berhasil dibuat — salin nilainya sekarang!')
    },
    onError: (e) => notifyErr(e),
  })

  const editToken = useMutation({
    mutationFn: (body: typeof editForm) =>
      apiFetch(`/api/envman/tokens/${editingToken!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: body.name,
          canWrite: body.canWrite,
          expiresAt: body.expiresAt || null,
          scopes: body.scopes,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      if (selectedTokenId) {
        navigate({ to: '/envmanager/tokens', search: { token: editingToken!.id, edit: undefined } })
      } else {
        closeEdit()
        setEditingToken(null)
      }
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
      tags: t.tags ?? [],
    })
    openEdit()
  }

  const toggleToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: (data: { isDisabled: boolean }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      notifyOk(data.isDisabled ? 'Token dinonaktifkan' : 'Token diaktifkan')
    },
    onError: (e) => notifyErr(e),
  })

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revealedValue, setRevealedValue] = useState<{ id: string; token: string } | null>(null)
  const copyToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/reveal`),
    onSuccess: async (data: { token: string }, id) => {
      try {
        await navigator.clipboard.writeText(data.token)
        setCopiedId(id)
        setRevealedValue({ id, token: data.token })
        notifyOk('Token disalin ke clipboard')
        setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500)
      } catch {
        notifyErr(new Error('Gagal akses clipboard — coba browser modern atau HTTPS'))
      }
    },
    onError: (e) => notifyErr(e),
  })

  const handleCopyCommand = async (tokenId: string, cmdTemplate: string) => {
    try {
      let tokenVal: string
      if (revealedValue?.id === tokenId) {
        tokenVal = revealedValue.token
      } else {
        const data: { token: string } = await apiFetch(`/api/envman/tokens/${tokenId}/reveal`)
        tokenVal = data.token
        setRevealedValue({ id: tokenId, token: tokenVal })
        setCopiedId(tokenId)
        setTimeout(() => setCopiedId((prev) => (prev === tokenId ? null : prev)), 1500)
      }
      const resolved = cmdTemplate.replace(/\[TOKEN\]/g, tokenVal)
      await navigator.clipboard.writeText(resolved)
      notifyOk('Command disalin ke clipboard')
    } catch {
      notifyErr(new Error('Gagal akses clipboard — coba browser modern atau HTTPS'))
    }
  }

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
          <Text fw={600} size="sm">
            Rotate token
          </Text>
        </Group>
      ),
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Token <strong>{name}</strong> akan diganti dengan nilai baru. Nilai lama langsung <strong>invalid</strong> —
            semua script/CI yang masih memakai token lama akan gagal autentikasi sampai diganti.
          </Text>
          <Text size="xs" c="dimmed">
            Nilai baru hanya ditampilkan sekali setelah rotate.
          </Text>
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
          <Text fw={600} size="sm">
            Revoke token
          </Text>
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
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Identitas
        </Text>
        <TextInput
          label="Nama token"
          placeholder="ci-github, laptop-bip, deploy-script"
          description="Gunakan nama yang menggambarkan dari mana token ini dipakai"
          value={f.name}
          autoFocus
          onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))}
        />
      </Stack>

      {/* ── Izin akses ── */}
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Izin Akses
        </Text>
        <Box
          p="sm"
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            border: `1px solid ${f.canWrite ? 'var(--mantine-color-orange-5)' : 'var(--mantine-color-default-border)'}`,
            background: f.canWrite ? 'var(--mantine-color-orange-light)' : undefined,
          }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Box style={{ flex: 1 }}>
              <Group gap="xs" mb={2}>
                <Text size="xs" fw={600}>
                  {f.canWrite ? 'Read-Write' : 'Read-Only'}
                </Text>
                {!f.canWrite && (
                  <Badge size="xs" color="blue" variant="light">
                    Recommended
                  </Badge>
                )}
                {f.canWrite && (
                  <Badge size="xs" color="orange" variant="light">
                    Advanced
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                {f.canWrite
                  ? 'Token dapat membaca DAN menulis vars — gunakan hanya untuk automation/deploy script.'
                  : 'Token hanya dapat membaca vars — aman untuk CLI lokal dan CI/CD pipeline.'}
              </Text>
            </Box>
            <Switch
              checked={f.canWrite}
              onChange={(e) => setF((x) => ({ ...x, canWrite: e.target.checked }))}
              color="orange"
            />
          </Group>
        </Box>
      </Stack>

      {/* ── Scope ── */}
      <Stack gap="xs">
        <Group gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
            Scope Akses
          </Text>
          <Tooltip label="Batasi token hanya ke project/environment tertentu untuk keamanan lebih baik">
            <TbInfoCircle size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
          </Tooltip>
        </Group>
        <ScopeSelector projects={projects} value={f.scopes} onChange={(v) => setF((x) => ({ ...x, scopes: v }))} />
      </Stack>

      {/* ── Tags ── */}
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Tags
        </Text>
        <TagsInput
          placeholder="Tambah tag, tekan Enter"
          description="Opsional — untuk pengelompokan dan filter token"
          value={f.tags}
          onChange={(v) => setF((x) => ({ ...x, tags: v }))}
          data={allTags.map((t) => t.value)}
          clearable
          splitChars={[',', ' ']}
        />
      </Stack>

      {/* ── Kedaluwarsa ── */}
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Kedaluwarsa
        </Text>
        <Stack gap="xs">
          <Group gap="xs" wrap="wrap">
            {[
              { label: '7 hari', days: 7 },
              { label: '30 hari', days: 30 },
              { label: '90 hari', days: 90 },
              { label: '1 tahun', days: 365 },
            ].map(({ label, days }) => {
              const d = new Date()
              d.setDate(d.getDate() + days)
              const val = d.toISOString().split('T')[0]
              return (
                <Button
                  key={days}
                  size="compact-xs"
                  variant={f.expiresAt === val ? 'filled' : 'default'}
                  color="primary"
                  leftSection={<TbCalendar size={11} />}
                  onClick={() => setF((x) => ({ ...x, expiresAt: x.expiresAt === val ? '' : val }))}
                >
                  {label}
                </Button>
              )
            })}
            {f.expiresAt && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={() => setF((x) => ({ ...x, expiresAt: '' }))}
              >
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
            onChange={(e) => setF((x) => ({ ...x, expiresAt: e.target.value }))}
            description={
              !f.expiresAt ? 'Kosong = tidak ada batas waktu (tidak direkomendasikan untuk CI/CD)' : undefined
            }
          />
        </Stack>
      </Stack>
    </Stack>
  )

  const hasFilter =
    debouncedSearch.trim().length > 0 || filterStatus !== 'semua' || filterProjects.length > 0 || filterTags.length > 0
  const resetFilter = () => {
    setSearch('')
    setFilterStatus('semua')
    setFilterProjects([])
    setFilterTags([])
  }

  const goToList = () => navigate({ to: '/envmanager/tokens', search: { token: undefined, edit: undefined } })
  const goToNew = () => navigate({ to: '/envmanager/tokens', search: { token: 'new', edit: undefined } })
  const goToDetail = (id: string) => navigate({ to: '/envmanager/tokens', search: { token: id, edit: undefined } })
  const goToEdit = (id: string) => navigate({ to: '/envmanager/tokens', search: { token: id, edit: true } })

  // Sync edit form when entering route-based edit mode
  useEffect(() => {
    if (isEditing && selectedToken && editingToken?.id !== selectedToken.id) {
      setEditingToken(selectedToken)
      setEditForm({
        name: selectedToken.name,
        canWrite: selectedToken.canWrite,
        expiresAt: selectedToken.expiresAt ? new Date(selectedToken.expiresAt).toISOString().split('T')[0] : '',
        scopes: selectedToken.scopes,
        tags: selectedToken.tags ?? [],
      })
    }
  }, [
    isEditing,
    selectedToken?.id,
    selectedToken?.expiresAt,
    selectedToken?.tags,
    selectedToken?.canWrite,
    selectedToken,
    editingToken?.id,
  ])

  if (selectedTokenId === 'new') {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group gap={6} align="center">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={goToList}>
              <TbChevronLeft size={15} />
            </ActionIcon>
            <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={goToList}>
              Tokens
            </Text>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <Text size="sm" fw={600}>
              Buat Token Baru
            </Text>
          </Group>
          <Divider />
          <Box
            p="md"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              border: '1px solid var(--mantine-color-default-border)',
            }}
          >
            {tokenForm(form, setForm)}
            <Divider my="md" />
            <Box
              p="xs"
              mb="md"
              style={{
                borderRadius: 'var(--mantine-radius-md)',
                border: '1px solid var(--mantine-color-default-border)',
                background: 'var(--mantine-color-default-hover)',
              }}
            >
              <Text size="xs" fw={600} mb={4}>
                Ringkasan token:
              </Text>
              <Group gap="xs" wrap="wrap">
                <Badge
                  size="xs"
                  color={form.canWrite ? 'orange' : 'blue'}
                  variant="light"
                  leftSection={form.canWrite ? <TbLockOpen size={9} /> : <TbLock size={9} />}
                >
                  {form.canWrite ? 'read-write' : 'read-only'}
                </Badge>
                <Badge size="xs" color="primary" variant="light">
                  {form.scopes.length === 0 ? 'semua project' : `${form.scopes.length} scope`}
                </Badge>
                <Badge
                  size="xs"
                  color={form.expiresAt ? 'teal' : 'gray'}
                  variant="light"
                  leftSection={<TbCalendar size={9} />}
                >
                  {form.expiresAt ? `exp: ${new Date(form.expiresAt).toLocaleDateString('id-ID')}` : 'tidak ada expiry'}
                </Badge>
              </Group>
            </Box>
            <Group justify="flex-end" gap="xs">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => {
                  setForm(emptyForm)
                  goToList()
                }}
                disabled={createToken.isPending}
              >
                Batal
              </Button>
              <Button
                size="md"
                leftSection={<TbKey size={16} />}
                variant="gradient"
                onClick={() => createToken.mutate(form)}
                loading={createToken.isPending}
                disabled={!form.name.trim() || createToken.isPending}
              >
                {form.name ? `Buat token "${form.name}"` : 'Buat Token'}
              </Button>
            </Group>
            {createToken.isError && (
              <Text size="xs" c="red" mt="xs">
                {(createToken.error as Error).message}
              </Text>
            )}
          </Box>
        </Stack>
      </Paper>
    )
  }

  if (selectedToken && isEditing) {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group gap={6} align="center">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => goToDetail(selectedToken.id)}>
              <TbChevronLeft size={15} />
            </ActionIcon>
            <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={goToList}>
              Tokens
            </Text>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={() => goToDetail(selectedToken.id)}>
              {selectedToken.name}
            </Text>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <Text size="sm" fw={600}>
              Edit
            </Text>
          </Group>
          <Divider />
          <Box
            p="md"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              border: '1px solid var(--mantine-color-default-border)',
            }}
          >
            {tokenForm(editForm, setEditForm)}
            <Divider my="md" />
            <Box
              p="xs"
              mb="md"
              style={{
                borderRadius: 'var(--mantine-radius-md)',
                border: '1px solid var(--mantine-color-default-border)',
                background: 'var(--mantine-color-default-hover)',
              }}
            >
              <Text size="xs" fw={600} mb={4}>
                Ringkasan token:
              </Text>
              <Group gap="xs" wrap="wrap">
                <Badge
                  size="xs"
                  color={editForm.canWrite ? 'orange' : 'blue'}
                  variant="light"
                  leftSection={editForm.canWrite ? <TbLockOpen size={9} /> : <TbLock size={9} />}
                >
                  {editForm.canWrite ? 'read-write' : 'read-only'}
                </Badge>
                <Badge size="xs" color="primary" variant="light">
                  {editForm.scopes.length === 0 ? 'semua project' : `${editForm.scopes.length} scope`}
                </Badge>
                <Badge
                  size="xs"
                  color={editForm.expiresAt ? 'teal' : 'gray'}
                  variant="light"
                  leftSection={<TbCalendar size={9} />}
                >
                  {editForm.expiresAt
                    ? `exp: ${new Date(editForm.expiresAt).toLocaleDateString('id-ID')}`
                    : 'tidak ada expiry'}
                </Badge>
              </Group>
            </Box>
            <Group justify="flex-end" gap="xs">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => goToDetail(selectedToken.id)}
                disabled={editToken.isPending}
              >
                Batal
              </Button>
              <Button
                leftSection={<TbCheck size={14} />}
                onClick={() => editToken.mutate(editForm)}
                loading={editToken.isPending}
                disabled={!editForm.name}
              >
                Simpan Perubahan
              </Button>
            </Group>
            {editToken.isError && (
              <Text size="xs" c="red" mt="xs">
                {(editToken.error as Error).message}
              </Text>
            )}
          </Box>
        </Stack>
      </Paper>
    )
  }

  if (selectedToken) {
    return (
      <TokenDetailView
        token={selectedToken}
        isCopied={copiedId === selectedToken.id}
        togglePending={toggleToken.isPending && toggleToken.variables === selectedToken.id}
        copyPending={copyToken.isPending && copyToken.variables === selectedToken.id}
        rotatePending={rotateToken.isPending && rotateToken.variables === selectedToken.id}
        onBack={goToList}
        onToggle={() => toggleToken.mutate(selectedToken.id)}
        onCopy={() => copyToken.mutate(selectedToken.id)}
        onCopyCommand={(tpl) => handleCopyCommand(selectedToken.id, tpl)}
        onRotate={() => confirmRotate(selectedToken.id, selectedToken.name)}
        onEdit={() => goToEdit(selectedToken.id)}
        onRevoke={() => revokeToken(selectedToken.id, selectedToken.name)}
      />
    )
  }

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: TOKEN_CARD_STYLES }} />

      {/* ─── Header ─────────────────────────── */}
      <Group justify="space-between" mb="md" wrap="nowrap" align="center">
        <Box style={{ minWidth: 0 }}>
          <Text fw={800} size="xl" lh={1.2}>
            API Tokens
          </Text>
          {!isLoading && tokens.length > 0 && (
            <Group gap={4} mt={2} wrap="wrap">
              <Text size="xs" c="dimmed">
                {tokens.length} token
              </Text>
              <Text size="xs" c="dimmed">
                ·
              </Text>
              <Text size="xs" c="dimmed">
                {activeTokens.length} aktif
              </Text>
              {expiredTokens.length > 0 && (
                <>
                  <Text size="xs" c="dimmed">
                    ·
                  </Text>
                  <Text size="xs" c="dimmed">
                    {expiredTokens.length} expired
                  </Text>
                </>
              )}
              {disabledTokens.length > 0 && (
                <>
                  <Text size="xs" c="dimmed">
                    ·
                  </Text>
                  <Text size="xs" c="dimmed">
                    {disabledTokens.length} disabled
                  </Text>
                </>
              )}
            </Group>
          )}
        </Box>
        <Group gap="xs" wrap="nowrap">
          {canCreateToken && (
            <Button size="sm" leftSection={<TbPlus size={14} />} color="primary" radius="md" onClick={goToNew}>
              Buat Token
            </Button>
          )}
        </Group>
      </Group>

      {/* ─── Toolbar ────────────────────────── */}
      {!isError && tokens.length > 0 && (
        <Stack gap="xs" mb="md">
          <TextInput
            ref={searchRef}
            size="sm"
            placeholder="Cari nama atau scope..."
            leftSection={<TbSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maw={540}
            rightSection={
              search ? (
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label="Hapus pencarian"
                  onClick={() => setSearch('')}
                >
                  <TbX size={12} />
                </ActionIcon>
              ) : (
                <Tooltip label="Tekan / untuk focus">
                  <Kbd size="xs">/</Kbd>
                </Tooltip>
              )
            }
            rightSectionWidth={36}
            radius="md"
          />

          {/* Filter row — wrap di mobile */}
          <Group gap="xs" wrap="wrap">
            <Tooltip label={view === 'list' ? 'Tampilan grid' : 'Tampilan list'}>
              <ActionIcon
                size="md"
                variant="default"
                radius="md"
                aria-label="Ganti tampilan"
                onClick={() => setView((v) => (v === 'list' ? 'grid' : 'list'))}
              >
                {view === 'list' ? <TbLayoutGrid size={15} /> : <TbLayoutList size={15} />}
              </ActionIcon>
            </Tooltip>
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
              radius="md"
            />
            {projects.length > 0 && (
              <MultiSelectChips
                size="sm"
                label="Project"
                icon={<TbFilter size={14} />}
                width={130}
                options={projects.map((p) => ({ value: p.slug, label: p.name }))}
                value={filterProjects}
                onChange={setFilterProjects}
              />
            )}
            {allTags.length > 0 && (
              <MultiSelectChips
                size="sm"
                label="Tag"
                icon={<TbTag size={14} />}
                width={130}
                options={allTags}
                value={filterTags}
                onChange={setFilterTags}
              />
            )}
            <Select
              size="sm"
              w={155}
              leftSection={<TbSortAscending size={14} />}
              value={sort}
              onChange={(v) => setSort(v ?? 'terbaru')}
              data={[
                { label: 'Terbaru', value: 'terbaru' },
                { label: 'Terlama', value: 'terlama' },
                { label: 'Nama A→Z', value: 'nama' },
                { label: 'Last used', value: 'last_used' },
              ]}
              allowDeselect={false}
              radius="md"
            />
          </Group>

          {/* Active project chips */}
          {filterProjects.length > 0 && (
            <Group gap={6} wrap="wrap" align="center">
              <MultiSelectChipsRow
                value={filterProjects}
                onChange={setFilterProjects}
                getLabel={(slug) => projects.find((p) => p.slug === slug)?.name ?? slug}
              />
            </Group>
          )}

          {/* Active tag chips */}
          {filterTags.length > 0 && (
            <Group gap={6} wrap="wrap" align="center">
              <MultiSelectChipsRow value={filterTags} onChange={setFilterTags} getColor={tagColor} />
            </Group>
          )}

          {/* Result count + reset */}
          {hasFilter && (
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {filteredTokens.length === tokens.length
                  ? `${tokens.length} token`
                  : `${filteredTokens.length} dari ${tokens.length} token`}
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<TbX size={11} />}
                onClick={resetFilter}
              >
                Reset filter
              </Button>
            </Group>
          )}
        </Stack>
      )}

      <Group gap="xs" mb="md" align="center">
        <TbShieldCheck size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
        <Text size="xs" c="dimmed">
          Token CLI untuk autentikasi tanpa password.
          <Text span c="dimmed">
            {' '}
            ·{' '}
          </Text>
          <Text span fw={600} c="dimmed">
            read-only
          </Text>{' '}
          = pull vars ·{' '}
          <Text span fw={600} c="dimmed">
            read-write
          </Text>{' '}
          = push vars · Scope kosong = akses semua project
        </Text>
      </Group>

      {/* ─── New token banner ───────────────── */}
      {newToken && (
        <Box
          mb="md"
          p="md"
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid var(--mantine-color-teal-5)',
            position: 'relative',
          }}
        >
          <ActionIcon
            size="xs"
            variant="subtle"
            color="gray"
            style={{ position: 'absolute', top: 8, right: 8 }}
            onClick={() => setNewToken(null)}
          >
            <TbX size={12} />
          </ActionIcon>
          <Group gap="xs" mb="xs">
            <ThemeIcon size="sm" radius="xl" color="teal" variant="light">
              <TbCheck size={12} />
            </ThemeIcon>
            <Text size="xs" fw={600} c="teal">
              Token berhasil dibuat — simpan sekarang!
            </Text>
          </Group>
          <Alert color="orange" p="xs" mb="xs" icon={<TbAlertTriangle size={12} />}>
            <Text size="xs">
              Nilai token hanya ditampilkan <strong>sekali ini saja</strong> dan tidak bisa dilihat lagi.
            </Text>
          </Alert>
          <Group gap="xs" mb="xs">
            <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>
              {newToken}
            </Code>
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
          <Text size="xs" c="dimmed" mb={6}>
            Cara penggunaan:
          </Text>
          <Stack gap={6}>
            {[
              { label: 'Login & simpan config', cmd: `envman login ${window.location.origin} --token ${newToken}` },
              { label: 'Inject vars ke command', cmd: `envman -e myapp:production -- bun start` },
              {
                label: 'CI/CD (tanpa login)',
                cmd: `ENVMAN_SERVER=${window.location.origin} ENVMAN_TOKEN=${newToken} envman -e myapp:production -- bun start`,
              },
            ].map(({ label, cmd }) => (
              <Box key={label}>
                <Text size="xs" c="dimmed" mb={2}>
                  {label}
                </Text>
                <Group gap="xs">
                  <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>
                    {cmd}
                  </Code>
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
        </Box>
      )}

      {/* ─── Error state ────────────────────── */}
      {isError && (
        <Box
          p="xl"
          ta="center"
          style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-red-5)' }}
        >
          <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm">
            <TbAlertTriangle size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Gagal memuat tokens
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            {(error as Error)?.message ?? 'Terjadi kesalahan saat memuat daftar token.'}
          </Text>
          <Button size="xs" variant="light" color="red" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </Box>
      )}

      {/* ─── Token list ─────────────────────── */}
      {!isError && isLoading ? (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={140} radius="md" />
            ))}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={76} radius="md" />
            ))}
          </Stack>
        )
      ) : !isError && tokens.length === 0 ? (
        <Box
          p="xl"
          ta="center"
          style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
        >
          <ThemeIcon size={48} radius="xl" variant="light" color="primary" mx="auto" mb="sm">
            <TbKey size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Belum ada API token
          </Text>
          <Text size="sm" c="dimmed" mb="md" maw={420} mx="auto">
            Token dipakai CLI <Code fz="xs">envman</Code> untuk login tanpa password. Cocok untuk CI/CD pipeline, deploy
            script, atau development di laptop pribadi.
          </Text>
          {canCreateToken ? (
            <Button size="sm" color="primary" leftSection={<TbPlus size={14} />} onClick={goToNew}>
              Buat Token Pertama
            </Button>
          ) : (
            <Text size="xs" c="dimmed">
              Tidak punya izin create API token. Hubungi SUPER_ADMIN.
            </Text>
          )}
        </Box>
      ) : !isError && filteredTokens.length === 0 ? (
        <Box
          p="lg"
          ta="center"
          style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
        >
          <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbSearch size={22} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Tidak ada hasil
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            Tidak ada token yang cocok dengan filter.
          </Text>
          <Button size="xs" variant="subtle" leftSection={<TbX size={11} />} onClick={resetFilter}>
            Reset filter
          </Button>
        </Box>
      ) : !isError && view === 'grid' ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {paginatedTokens.map((t) => (
              <TokenCard
                key={t.id}
                token={t}
                isUsageOpen={expandedUsage.has(t.id)}
                isCopied={copiedId === t.id}
                togglePending={toggleToken.isPending && toggleToken.variables === t.id}
                copyPending={copyToken.isPending && copyToken.variables === t.id}
                rotatePending={rotateToken.isPending && rotateToken.variables === t.id}
                onToggle={() => toggleToken.mutate(t.id)}
                onCopy={() => copyToken.mutate(t.id)}
                onRotate={() => confirmRotate(t.id, t.name)}
                onEdit={() => openEditModal(t)}
                onRevoke={() => revokeToken(t.id, t.name)}
                onUsageToggle={() =>
                  setExpandedUsage((prev) => {
                    const s = new Set(prev)
                    s.has(t.id) ? s.delete(t.id) : s.add(t.id)
                    return s
                  })
                }
                onCardClick={() => goToDetail(t.id)}
              />
            ))}
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
            {paginatedTokens.map((t) => (
              <TokenCard
                key={t.id}
                token={t}
                compact
                isUsageOpen={expandedUsage.has(t.id)}
                isCopied={copiedId === t.id}
                togglePending={toggleToken.isPending && toggleToken.variables === t.id}
                copyPending={copyToken.isPending && copyToken.variables === t.id}
                rotatePending={rotateToken.isPending && rotateToken.variables === t.id}
                onToggle={() => toggleToken.mutate(t.id)}
                onCopy={() => copyToken.mutate(t.id)}
                onRotate={() => confirmRotate(t.id, t.name)}
                onEdit={() => openEditModal(t)}
                onRevoke={() => revokeToken(t.id, t.name)}
                onUsageToggle={() =>
                  setExpandedUsage((prev) => {
                    const s = new Set(prev)
                    s.has(t.id) ? s.delete(t.id) : s.add(t.id)
                    return s
                  })
                }
                onCardClick={() => goToDetail(t.id)}
              />
            ))}
          </Stack>
          {tokensTotalPages > 1 && (
            <Group justify="center" mt="sm">
              <Pagination value={tokensPage} onChange={setTokensPage} total={tokensTotalPages} size="sm" />
            </Group>
          )}
        </>
      ) : null}

      {/* ─── Edit modal ─────────────────────── */}
      <Modal
        opened={editOpen}
        onClose={() => {
          closeEdit()
          setEditingToken(null)
        }}
        size="lg"
        fullScreen={isMobile}
        title={
          <Group gap="xs">
            <ThemeIcon size={28} variant="light" color="primary" radius="md">
              <TbPencil size={15} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="sm">
                Edit Token
              </Text>
              <Text size="xs" c="dimmed">
                {editingToken?.name}
              </Text>
            </Box>
          </Group>
        }
      >
        <Stack gap="md">
          {tokenForm(editForm, setEditForm)}
          <Divider />
          <Box
            p="xs"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              border: '1px solid var(--mantine-color-default-border)',
              background: 'var(--mantine-color-default-hover)',
            }}
          >
            <Text size="xs" fw={600} mb={4}>
              Ringkasan token:
            </Text>
            <Group gap="xs" wrap="wrap">
              <Badge
                size="xs"
                color={editForm.canWrite ? 'orange' : 'blue'}
                variant="light"
                leftSection={editForm.canWrite ? <TbLockOpen size={9} /> : <TbLock size={9} />}
              >
                {editForm.canWrite ? 'read-write' : 'read-only'}
              </Badge>
              <Badge size="xs" color="primary" variant="light">
                {editForm.scopes.length === 0 ? 'semua project' : `${editForm.scopes.length} scope`}
              </Badge>
              <Badge
                size="xs"
                color={editForm.expiresAt ? 'teal' : 'gray'}
                variant="light"
                leftSection={<TbCalendar size={9} />}
              >
                {editForm.expiresAt
                  ? `exp: ${new Date(editForm.expiresAt).toLocaleDateString('id-ID')}`
                  : 'tidak ada expiry'}
              </Badge>
            </Group>
          </Box>
          <Button
            
            leftSection={<TbCheck size={14} />}
            onClick={() => editToken.mutate(editForm)}
            loading={editToken.isPending}
            disabled={!editForm.name}
          >
            Simpan Perubahan
          </Button>
          {editToken.isError && (
            <Text size="xs" c="red">
              {(editToken.error as Error).message}
            </Text>
          )}
        </Stack>
      </Modal>
    </Box>
  )
}

// ─── Type-to-confirm revoke ──────────────────────────────────────────────────

function RevokeTokenConfirm({
  name,
  onCancel,
  onConfirm,
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
        Token <strong>{name}</strong> akan dihapus permanen. Semua script/CI yang masih menggunakan token ini akan
        langsung gagal autentikasi.
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
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canConfirm) handleConfirm()
        }}
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
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
