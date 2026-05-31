import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Kbd,
  Modal,
  SegmentedControl,
  Select,
  Pagination,
  SimpleGrid,
  Skeleton,
  Stack,
  TagsInput,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDebouncedValue, useDisclosure, useHotkeys, useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TbAlertTriangle,
  TbArrowsSort,
  TbCheck,
  TbChevronRight,
  TbClock,
  TbFolders,
  TbLayoutGrid,
  TbLayoutList,
  TbPencil,
  TbPin,
  TbPinFilled,
  TbPlus,
  TbPower,
  TbSearch,
  TbTag,
  TbTrash,
  TbUsers,
  TbVariable,
  TbX,
} from 'react-icons/tb'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export const Route = createFileRoute('/envmanager/')({
  component: ProjectListPage,
})

interface Project {
  slug: string
  name: string
  description?: string
  tags: string[]
  isActive: boolean
  createdAt?: string
  myRole: 'OWNER' | 'EDITOR' | 'VIEWER'
  _count: { environments: number }
  members?: { id: string }[]
}

const roleColor = { OWNER: 'blue', EDITOR: 'teal', VIEWER: 'gray' } as const

const TAG_COLORS = [
  'red', 'pink', 'grape', 'violet', 'indigo', 'blue',
  'cyan', 'teal', 'green', 'lime', 'yellow', 'orange',
] as const

function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

function relativeDate(iso?: string): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0 || Number.isNaN(ms)) return ''
  if (ms < 60_000) return 'baru saja'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m} mnt lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hari lalu`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} bln lalu`
  return `${Math.floor(mo / 12)} thn lalu`
}

function ProjectAvatar({ name, role, size = 40 }: { name: string; role: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  const color = roleColor[role as keyof typeof roleColor] ?? 'gray'
  return (
    <Box style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: `var(--mantine-color-${color}-light)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text size={size > 36 ? 'sm' : 'xs'} fw={800} lh={1}
        style={{ color: `var(--mantine-color-${color}-light-color)` }}>
        {initial}
      </Text>
    </Box>
  )
}

type SortKey = 'recent' | 'name' | 'envs'
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Terbaru' },
  { value: 'name', label: 'Nama A→Z' },
  { value: 'envs', label: 'Env terbanyak' },
]

const HOVER_STYLES = `
.envman-project-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-project-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--mantine-color-primary) 50%, transparent);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-project-card:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--mantine-color-primary) 50%, transparent);
  outline-offset: 2px;
  border-color: color-mix(in srgb, var(--mantine-color-primary) 50%, transparent);
}
.envman-tag-chip {
  cursor: pointer;
  transition: transform 0.1s ease;
}
.envman-tag-chip:hover {
  transform: scale(1.05);
}
`

function ProjectListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: sessionData } = useSession()
  const canCreateProject = hasCapability(sessionData?.user, 'project:create')

  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [form, setForm] = useState({ slug: '', name: '', description: '', tags: [] as string[] })
  const [slugManual, setSlugManual] = useState(false)
  const [editTarget, setEditTarget] = useState<Project | null>(null)

  const [view, setView] = useLocalStorage<'grid' | 'list'>({ key: 'envman:projects:view', defaultValue: 'grid' })
  const [search, setSearch] = useLocalStorage({ key: 'envman:projects:search', defaultValue: '' })
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({ key: 'envman:projects:tagFilter', defaultValue: [] })
  const [sort, setSort] = useLocalStorage<SortKey>({ key: 'envman:projects:sort', defaultValue: 'recent' })
  const [pinned, setPinned] = useLocalStorage<string[]>({ key: 'envman:projects:pinned', defaultValue: [] })
  const [statusFilter, setStatusFilter] = useLocalStorage<'all' | 'active' | 'inactive'>({ key: 'envman:projects:statusFilter', defaultValue: 'all' })

  const [debouncedSearch] = useDebouncedValue(search, 150)
  const searchRef = useRef<HTMLInputElement>(null)

  useHotkeys([
    ['/', () => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }],
  ])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['envman', 'projects'],
    queryFn: () => apiFetch('/api/envman/projects'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  const createProject = useMutation({
    mutationFn: (body: typeof form) =>
      apiFetch('/api/envman/projects', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['envman', 'projects'] })
      closeCreate()
      setForm({ slug: '', name: '', description: '', tags: [] })
      setSlugManual(false)
      notifyOk('Project berhasil dibuat')
      navigate({ to: '/envmanager/$slug', params: { slug: res.project.slug }, search: { tab: 'environments' } })
    },
    onError: (e) => notifyErr(e),
  })

  const editProject = useMutation({
    mutationFn: ({ slug, name, description, tags }: { slug: string; name: string; description: string; tags: string[] }) =>
      apiFetch(`/api/envman/projects/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description, tags }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'projects'] })
      setEditTarget(null)
      notifyOk('Project diperbarui')
    },
    onError: (e) => notifyErr(e),
  })

  const toggleActive = useMutation({
    mutationFn: ({ slug, isActive }: { slug: string; isActive: boolean }) =>
      apiFetch(`/api/envman/projects/${slug}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: (_, { isActive }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'projects'] })
      notifyOk(isActive ? 'Project diaktifkan' : 'Project dinonaktifkan')
    },
    onError: (e) => notifyErr(e),
  })

  const togglePin = (slug: string) =>
    setPinned(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])

  const confirmToggleActive = (slug: string, name: string, currentActive: boolean) => {
    modals.openConfirmModal({
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color={currentActive ? 'orange' : 'teal'} radius="md">
            <TbPower size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">{currentActive ? 'Nonaktifkan project' : 'Aktifkan project'}</Text>
        </Group>
      ),
      children: (
        <Text size="sm">
          {currentActive
            ? <>Project <strong>{name}</strong> akan dinonaktifkan. Environment dan variabelnya tetap tersimpan, tapi project tidak akan muncul di filter "Aktif".</>
            : <>Project <strong>{name}</strong> akan diaktifkan kembali.</>
          }
        </Text>
      ),
      labels: { confirm: currentActive ? 'Nonaktifkan' : 'Aktifkan', cancel: 'Batal' },
      confirmProps: { color: currentActive ? 'orange' : 'teal' },
      onConfirm: () => toggleActive.mutate({ slug, isActive: !currentActive }),
    })
  }

  const deleteProject = (slug: string, name: string) => {
    const id = `delete-project-${slug}`
    modals.open({
      modalId: id,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Hapus project</Text>
        </Group>
      ),
      children: (
        <DeleteProjectConfirm
          name={name}
          slug={slug}
          onCancel={() => modals.close(id)}
          onConfirm={async () => {
            try {
              await apiFetch(`/api/envman/projects/${slug}`, { method: 'DELETE' })
              qc.invalidateQueries({ queryKey: ['envman', 'projects'] })
              setPinned(prev => prev.filter(s => s !== slug))
              notifyOk(`Project "${name}" dihapus`)
              modals.close(id)
            } catch (e) {
              notifyErr(e)
            }
          }}
        />
      ),
    })
  }

  const addTagFilter = (tag: string) =>
    setTagFilter(prev => prev.includes(tag) ? prev : [...prev, tag])

  const resetFilter = () => { setSearch(''); setTagFilter([]); setStatusFilter('all') }

  const projects: Project[] = data?.projects ?? []

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of projects) for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: `${value} (${count})` }))
  }, [projects])

  const filtered = useMemo(() => {
    let result = projects
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false) ||
        (p.tags ?? []).some(t => t.toLowerCase().includes(q))
      )
    }
    if (tagFilter.length > 0) {
      result = result.filter(p => tagFilter.every(t => (p.tags ?? []).includes(t)))
    }
    if (statusFilter === 'active') result = result.filter(p => p.isActive)
    if (statusFilter === 'inactive') result = result.filter(p => !p.isActive)

    const sorted = [...result]
    if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === 'envs') {
      sorted.sort((a, b) => b._count.environments - a._count.environments)
    }
    return sorted
  }, [projects, debouncedSearch, tagFilter, statusFilter, sort])

  // Grouped by status (pinned always first within each group)
  const groups = useMemo(() => {
    const sortGroup = (arr: Project[]) =>
      [...arr].sort((a, b) => (pinned.includes(b.slug) ? 1 : 0) - (pinned.includes(a.slug) ? 1 : 0))
    if (statusFilter !== 'all') {
      return [{ key: statusFilter, label: null as string | null, items: sortGroup(filtered) }]
    }
    const pinnedItems = sortGroup(filtered.filter(p => pinned.includes(p.slug)))
    const activeItems = sortGroup(filtered.filter(p => !pinned.includes(p.slug) && p.isActive))
    const inactiveItems = sortGroup(filtered.filter(p => !pinned.includes(p.slug) && !p.isActive))
    return [
      pinnedItems.length > 0 ? { key: 'pinned', label: 'Pinned', items: pinnedItems } : null,
      activeItems.length > 0 ? { key: 'active', label: pinnedItems.length > 0 || inactiveItems.length > 0 ? 'Aktif' : null, items: activeItems } : null,
      inactiveItems.length > 0 ? { key: 'inactive', label: 'Nonaktif', items: inactiveItems } : null,
    ].filter(Boolean) as { key: string; label: string | null; items: Project[] }[]
  }, [filtered, pinned, statusFilter])

  const PAGE_SIZE = 24
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [debouncedSearch, tagFilter, statusFilter, sort])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  // Paginate across all groups flat
  const paginatedSlugs = useMemo(() => {
    const flat = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(p => p.slug)
    return new Set(flat)
  }, [filtered, page])
  const paginatedGroups = useMemo(() =>
    groups.map(g => ({ ...g, items: g.items.filter(p => paginatedSlugs.has(p.slug)) }))
      .filter(g => g.items.length > 0),
    [groups, paginatedSlugs])

  const ownerCount = projects.filter(p => p.myRole === 'OWNER').length
  const totalEnvs = projects.reduce((s, p) => s + p._count.environments, 0)
  const hasFilter = debouncedSearch.trim().length > 0 || tagFilter.length > 0 || statusFilter !== 'all'

  const openProject = (slug: string) =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: { tab: 'environments' } })

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover effects */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      {/* ─── Header ─── */}
      <Group justify="space-between" mb="md" gap="xs" align="flex-start">
        <Box style={{ minWidth: 0 }}>
          <Text fw={800} size="xl" lh={1.2}>Projects</Text>
          {!isLoading && !isError && projects.length > 0 && (
            <Group gap={4} mt={2} wrap="wrap">
              <Text size="xs" c="dimmed">{projects.length} project</Text>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="xs" c="dimmed">{totalEnvs} environment</Text>
              {ownerCount > 0 && (
                <>
                  <Text size="xs" c="dimmed">·</Text>
                  <Text size="xs" c="dimmed">{ownerCount} milik saya</Text>
                </>
              )}
            </Group>
          )}
        </Box>
        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          {projects.length > 0 && (
            <Tooltip label={view === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
              <ActionIcon
                size="md" variant="default" radius="md"
                aria-label="Ganti tampilan"
                onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}
              >
                {view === 'grid' ? <TbLayoutList size={15} /> : <TbLayoutGrid size={15} />}
              </ActionIcon>
            </Tooltip>
          )}
          {canCreateProject && (
            <Button size="sm" leftSection={<TbPlus size={14} />} color="primary" onClick={openCreate} radius="md">
              New Project
            </Button>
          )}
        </Group>
      </Group>

      {/* Info */}
      {!isLoading && !isError && (
        <Alert variant="light" color="violet" mb="md" p="sm" radius="md" icon={<TbFolders size={16} />}>
          <Text size="sm" fw={500} mb={4}>Apa itu Projects?</Text>
          <Text size="xs" c="dimmed" lh={1.6}>
            Projects adalah unit kerja utama — setiap project punya beberapa <strong>environment</strong> (mis. <Code fz="xs">dev</Code>, <Code fz="xs">staging</Code>, <Code fz="xs">production</Code>) yang masing-masing menyimpan <strong>env vars</strong>.
            Member bisa di-assign sebagai <strong>Owner</strong>, <strong>Editor</strong>, atau <strong>Viewer</strong>.
            Gunakan <Kbd size="xs">K</Kbd> atau <Kbd size="xs">/</Kbd> untuk cari cepat, pin project favorit, dan filter berdasarkan tag atau status aktif.
          </Text>
        </Alert>
      )}

      {/* ─── Toolbar ─── */}
      {!isLoading && !isError && projects.length > 0 && (
        <Stack gap="xs" mb="md">
          <TextInput
            ref={searchRef}
            size="sm"
            placeholder="Cari project, slug, deskripsi, atau tag..."
            leftSection={<TbSearch size={14} />}
            maw={540}
            rightSection={
              search ? (
                <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Hapus pencarian" onClick={() => setSearch('')}>
                  <TbX size={12} />
                </ActionIcon>
              ) : (
                <Tooltip label="Tekan / untuk focus">
                  <Kbd size="xs">/</Kbd>
                </Tooltip>
              )
            }
            rightSectionWidth={36}
            value={search}
            onChange={e => setSearch(e.target.value)}
            radius="md"
          />

          {/* Filter row — wrap di mobile */}
          <Group gap="xs" wrap="wrap">
            {allTags.length > 0 && (
              <MultiSelectChips
                size="sm"
                label="Tag"
                icon={<TbTag size={14} />}
                width={130}
                options={allTags}
                value={tagFilter}
                onChange={setTagFilter}
              />
            )}
            <Select
              size="sm"
              data={SORT_OPTIONS}
              value={sort}
              onChange={v => v && setSort(v as SortKey)}
              leftSection={<TbArrowsSort size={14} />}
              allowDeselect={false}
              w={155}
              radius="md"
            />
            <SegmentedControl
              size="xs"
              value={statusFilter}
              onChange={v => setStatusFilter(v as 'all' | 'active' | 'inactive')}
              data={[
                { value: 'all', label: 'Semua' },
                { value: 'active', label: 'Aktif' },
                { value: 'inactive', label: 'Nonaktif' },
              ]}
              radius="md"
            />
          </Group>

          {/* Active tag chips */}
          {tagFilter.length > 0 && (
            <Group gap={6} wrap="wrap" align="center">
              <MultiSelectChipsRow value={tagFilter} onChange={setTagFilter} getColor={tagColor} />
            </Group>
          )}

          {/* Result count + reset */}
          {hasFilter && (
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {filtered.length === projects.length
                  ? `${projects.length} project`
                  : `${filtered.length} dari ${projects.length} project`}
              </Text>
              <Button size="compact-xs" variant="subtle" color="gray" leftSection={<TbX size={11} />} onClick={resetFilter}>
                Reset filter
              </Button>
            </Group>
          )}
        </Stack>
      )}

      {/* ─── Error state ─── */}
      {isError && (
        <Box p="xl" ta="center" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid color-mix(in srgb, var(--mantine-color-red-5) 35%, transparent)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm">
            <TbAlertTriangle size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Gagal memuat project</Text>
          <Text size="sm" c="dimmed" mb="md">
            {(error as Error)?.message ?? 'Terjadi kesalahan saat memuat daftar project.'}
          </Text>
          <Button size="xs" variant="light" color="red" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </Box>
      )}

      {/* ─── Loading skeleton ─── */}
      {isLoading && (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing={{ base: 'xs', sm: 'sm' }}>
            {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={172} radius="md" />)}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} height={76} radius="md" />)}
          </Stack>
        )
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && !isError && projects.length === 0 && (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
          <ThemeIcon size={56} radius="xl" variant="light" color="primary" mx="auto" mb="md">
            <TbFolders size={28} />
          </ThemeIcon>
          <Text fw={600} size="md" mb={6}>Belum ada project</Text>
          {canCreateProject ? (
            <>
              <Text size="sm" c="dimmed" mb="lg" maw={420} mx="auto">
                Buat project pertama untuk mulai mengelola environment variables.
                Setiap project bisa punya beberapa environment (<Code fz="xs">dev</Code>, <Code fz="xs">stg</Code>, <Code fz="xs">prod</Code>)
                yang masing-masing menyimpan variabel sendiri.
              </Text>
              <Button leftSection={<TbPlus size={14} />} color="primary" onClick={openCreate}>
                Buat Project Pertama
              </Button>
            </>
          ) : (
            <Text size="sm" c="dimmed" maw={400} mx="auto">
              Kamu belum ditambahkan ke project manapun. Minta admin untuk mengundangmu ke project.
            </Text>
          )}
        </Box>
      )}

      {/* ─── No results ─── */}
      {!isLoading && !isError && projects.length > 0 && filtered.length === 0 && (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbSearch size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Tidak ada hasil</Text>
          <Text size="sm" c="dimmed" mb="md">
            Tidak ada project yang cocok dengan filter saat ini.
          </Text>
          <Button size="xs" variant="subtle" leftSection={<TbX size={12} />} onClick={resetFilter}>
            Reset filter
          </Button>
        </Box>
      )}

      {/* ─── Project list / grid ─── */}
      {!isError && filtered.length > 0 && (
        <>
          <Stack gap="md">
            {paginatedGroups.map((group, gi) => (
              <Box key={group.key}>
                {group.label && (
                  <Group gap="xs" mb="xs" mt={gi > 0 ? 4 : 0} align="center">
                    <Text
                      size="xs" fw={700} tt="uppercase"
                      c={group.key === 'pinned' ? 'violet.6' : 'dimmed'}
                      style={{ letterSpacing: '0.06em' }}
                    >
                      {group.label}
                    </Text>
                    <Badge
                      size="xs" variant="light" radius="sm"
                      color={group.key === 'pinned' ? 'violet' : group.key === 'inactive' ? 'gray' : 'teal'}
                    >
                      {group.items.length}
                    </Badge>
                    <Box style={{ flex: 1, height: 1, background: 'var(--mantine-color-default-border)' }} />
                  </Group>
                )}
                {view === 'list' ? (
                  <Stack gap="xs">
                    {group.items.map((p) => (
                      <ProjectListCard
                        key={p.slug}
                        project={p}
                        isPinned={pinned.includes(p.slug)}
                        onPin={() => togglePin(p.slug)}
                        onEdit={() => setEditTarget(p)}
                        onDelete={() => deleteProject(p.slug, p.name)}
                        onToggleActive={() => confirmToggleActive(p.slug, p.name, p.isActive)}
                        onTagClick={addTagFilter}
                        onClick={() => openProject(p.slug)}
                      />
                    ))}
                  </Stack>
                ) : (
                  <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing={{ base: 'xs', sm: 'sm' }}>
                    {group.items.map((p) => (
                      <ProjectGridCard
                        key={p.slug}
                        project={p}
                        isPinned={pinned.includes(p.slug)}
                        onPin={() => togglePin(p.slug)}
                        onEdit={() => setEditTarget(p)}
                        onDelete={() => deleteProject(p.slug, p.name)}
                        onToggleActive={() => confirmToggleActive(p.slug, p.name, p.isActive)}
                        onTagClick={addTagFilter}
                        onClick={() => openProject(p.slug)}
                      />
                    ))}
                  </SimpleGrid>
                )}
              </Box>
            ))}
          </Stack>
          {totalPages > 1 && (
            <Group justify="center" mt="lg">
              <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
            </Group>
          )}
        </>
      )}

      {/* ─── Create modal ─── */}
      <CreateProjectModal
        opened={createOpen}
        form={form}
        setForm={setForm}
        slugManual={slugManual}
        setSlugManual={setSlugManual}
        allTagValues={allTags.map(t => t.value)}
        existingSlugs={projects.map(p => p.slug)}
        isPending={createProject.isPending}
        onClose={() => { closeCreate(); setForm({ slug: '', name: '', description: '', tags: [] }); setSlugManual(false) }}
        onSubmit={() => createProject.mutate(form)}
      />

      {/* ─── Edit modal ─── */}
      <EditProjectModal
        project={editTarget}
        allTagValues={allTags.map(t => t.value)}
        isPending={editProject.isPending}
        onClose={() => setEditTarget(null)}
        onSubmit={(data) => editProject.mutate(data)}
      />
    </Box>
  )
}

// ─── Create Project modal ────────────────────────────────────────────────────

interface CreateProjectModalProps {
  opened: boolean
  form: { slug: string; name: string; description: string; tags: string[] }
  setForm: React.Dispatch<React.SetStateAction<{ slug: string; name: string; description: string; tags: string[] }>>
  slugManual: boolean
  setSlugManual: (v: boolean) => void
  allTagValues: string[]
  existingSlugs: string[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
}

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

function CreateProjectModal({
  opened, form, setForm, slugManual, setSlugManual, allTagValues, existingSlugs, isPending, onClose, onSubmit,
}: CreateProjectModalProps) {
  const slugInvalid = !!form.slug && !SLUG_RE.test(form.slug)
  const slugDuplicate = !!form.slug && existingSlugs.includes(form.slug)
  const slugError = slugDuplicate
    ? `Slug "${form.slug}" sudah dipakai project lain`
    : slugInvalid
      ? 'Hanya huruf kecil, angka, dan strip. Tidak diawali/diakhiri strip.'
      : null
  const canSubmit = !!form.name.trim() && !!form.slug && !slugInvalid && !slugDuplicate && !isPending

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon size={28} variant="gradient" radius="md">
            <TbFolders size={15} />
          </ThemeIcon>
          <Box>
            <Text fw={700} size="sm">Buat Project Baru</Text>
            <Text size="xs" c="dimmed">Wadah untuk environment & env vars</Text>
          </Box>
        </Group>
      }
      size="md"
      centered
    >
      <Stack gap="lg">
        {/* Identity section */}
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Identitas</Text>
          <TextInput
            label="Nama project"
            placeholder="My App, Backend API, Customer Portal, ..."
            value={form.name}
            autoFocus
            data-autofocus
            onChange={e => {
              const name = e.target.value
              setForm(f => ({
                ...f,
                name,
                slug: slugManual ? f.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
              }))
            }}
            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) onSubmit() }}
          />
          <TextInput
            label="Slug"
            placeholder="my-app"
            value={form.slug}
            description={
              <Text component="span" size="xs" c="dimmed">
                Dipakai di CLI: <Code fz="xs">envman -e {form.slug || '<slug>'}:production -- bun run start</Code>
              </Text>
            }
            rightSection={
              form.slug && !slugInvalid && !slugDuplicate ? (
                <Tooltip label="Slug valid"><Box c="teal"><TbCheck size={14} /></Box></Tooltip>
              ) : undefined
            }
            onChange={e => {
              setSlugManual(true)
              setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))
            }}
            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) onSubmit() }}
            error={slugError ?? undefined}
          />
          <TextInput
            label="Deskripsi"
            placeholder="Opsional — penjelasan singkat project ini"
            description="Muncul di card daftar project untuk konteks cepat"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </Stack>

        {/* Tags section */}
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Tags</Text>
          <TagsInput
            placeholder="Tambah tag, tekan Enter"
            description="Opsional — untuk filter dan pengelompokan project"
            value={form.tags}
            onChange={tags => setForm(f => ({ ...f, tags }))}
            data={allTagValues}
            clearable
            splitChars={[',', ' ']}
          />
          {form.tags.length > 0 && (
            <Group gap={4}>
              {form.tags.map(t => (
                <Badge key={t} size="xs" variant="light" color={tagColor(t)}>{t}</Badge>
              ))}
            </Group>
          )}
        </Stack>

        <Divider />

        {/* Summary card */}
        <Box p="xs" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-default-hover)' }}>
          <Text size="xs" fw={600} mb={4}>Setelah dibuat:</Text>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              ✓ Project langsung jadi milikmu (role <strong>OWNER</strong>)
            </Text>
            <Text size="xs" c="dimmed">
              ✓ Kamu akan diarahkan ke halaman environment untuk setup pertama
            </Text>
            <Text size="xs" c="dimmed">
              ✓ Bisa tambah anggota dan environment setelah project dibuat
            </Text>
          </Stack>
        </Box>

        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={isPending}>Batal</Button>
          <Button
            leftSection={<TbPlus size={14} />}
            color="primary"
            onClick={onSubmit}
            loading={isPending}
            disabled={!canSubmit}
          >
            {form.name ? `Buat "${form.name}"` : 'Buat Project'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface CardProps {
  project: Project
  isPinned: boolean
  onPin: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
  onTagClick: (tag: string) => void
  onClick: () => void
}

// ─── Edit Project modal ──────────────────────────────────────────────────────

function EditProjectModal({
  project, allTagValues, isPending, onClose, onSubmit,
}: {
  project: Project | null
  allTagValues: string[]
  isPending: boolean
  onClose: () => void
  onSubmit: (data: { slug: string; name: string; description: string; tags: string[] }) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const initialKeyRef = useRef<string | null>(null)

  // Sync form when target changes (open or switch project)
  if (project && initialKeyRef.current !== project.slug) {
    initialKeyRef.current = project.slug
    setName(project.name)
    setDescription(project.description ?? '')
    setTags(project.tags ?? [])
  }
  if (!project && initialKeyRef.current !== null) {
    initialKeyRef.current = null
  }

  const handleClose = () => {
    initialKeyRef.current = null
    onClose()
  }

  if (!project) return null

  const dirty =
    name !== project.name ||
    description !== (project.description ?? '') ||
    JSON.stringify(tags) !== JSON.stringify(project.tags ?? [])
  const canSubmit = !!name.trim() && dirty && !isPending

  return (
    <Modal
      opened={project !== null}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <ThemeIcon size={28} variant="light" color="blue" radius="md">
            <TbPencil size={15} />
          </ThemeIcon>
          <Box>
            <Text fw={700} size="sm">Edit Project</Text>
            <Code fz="xs" c="dimmed">{project.slug}</Code>
          </Box>
        </Group>
      }
      size="md"
      centered
    >
      <Stack gap="lg">
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Identitas</Text>
          <TextInput
            label="Nama project"
            placeholder="My App, Backend API, ..."
            value={name}
            autoFocus
            data-autofocus
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && canSubmit) onSubmit({ slug: project.slug, name, description, tags })
            }}
          />
          <TextInput
            label="Slug"
            value={project.slug}
            disabled
            description="Slug tidak dapat diubah — akan break CLI / token / Portainer config yang sudah menggunakan."
          />
          <TextInput
            label="Deskripsi"
            placeholder="Opsional — penjelasan singkat project ini"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </Stack>

        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Tags</Text>
          <TagsInput
            placeholder="Tambah tag, tekan Enter"
            value={tags}
            onChange={setTags}
            data={allTagValues}
            clearable
            splitChars={[',', ' ']}
          />
          {tags.length > 0 && (
            <Group gap={4}>
              {tags.map(t => (
                <Badge key={t} size="xs" variant="light" color={tagColor(t)}>{t}</Badge>
              ))}
            </Group>
          )}
        </Stack>

        <Divider />

        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" color="gray" onClick={handleClose} disabled={isPending}>Batal</Button>
          <Button
            leftSection={<TbCheck size={14} />}
            color="blue"
            onClick={() => onSubmit({ slug: project.slug, name, description, tags })}
            loading={isPending}
            disabled={!canSubmit}
          >
            Simpan Perubahan
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function ProjectGridCard({ project: p, isPinned, onPin, onEdit, onDelete, onToggleActive, onTagClick, onClick }: CardProps) {
  const color = roleColor[p.myRole]
  const borderColor = isPinned
    ? 'color-mix(in srgb, var(--mantine-color-violet-4) 50%, var(--mantine-color-default-border))'
    : 'var(--mantine-color-default-border)'
  return (
    <Box
      p="md"
      className="envman-project-card"
      role="link" tabIndex={0}
      aria-label={`Buka project ${p.name}`}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
    >
      {/* Top: avatar + badges + actions */}
      <Group justify="space-between" mb="sm" wrap="nowrap" align="flex-start">
        <Group gap="sm" wrap="nowrap" align="center">
          <ProjectAvatar name={p.name} role={p.myRole} size={38} />
          <Stack gap={3}>
            <Badge size="xs" variant="light" color={color}>{p.myRole}</Badge>
            {!p.isActive && <Badge size="xs" variant="light" color="gray">nonaktif</Badge>}
          </Stack>
        </Group>
        <Group gap={2} onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
          <Tooltip label={isPinned ? 'Lepas pin' : 'Pin'} withArrow>
            <ActionIcon size="sm" variant="subtle" color={isPinned ? 'violet' : 'gray'} onClick={e => { e.stopPropagation(); onPin() }}>
              {isPinned ? <TbPinFilled size={13} /> : <TbPin size={13} />}
            </ActionIcon>
          </Tooltip>
          {p.myRole === 'OWNER' && (
            <>
              <Tooltip label={p.isActive ? 'Nonaktifkan' : 'Aktifkan'} withArrow>
                <ActionIcon size="sm" variant="subtle" color={p.isActive ? 'gray' : 'teal'} onClick={e => { e.stopPropagation(); onToggleActive() }}>
                  <TbPower size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Edit" withArrow>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={e => { e.stopPropagation(); onEdit() }}>
                  <TbPencil size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus" withArrow>
                <ActionIcon size="sm" variant="subtle" color="red" onClick={e => { e.stopPropagation(); onDelete() }}>
                  <TbTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Group>

      {/* Name */}
      <Text fw={700} size="sm" lh={1.3} mb={2} truncate>{p.name}</Text>

      {/* Slug */}
      <Code fz="xs" c="dimmed" mb={6} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.slug}
      </Code>

      {/* Description */}
      <Text
        size="xs" c="dimmed" mb={8} lineClamp={2} lh={1.6}
        fs={p.description ? undefined : 'italic'}
        style={{ flex: 1 }}
      >
        {p.description || 'Belum ada deskripsi'}
      </Text>

      {/* Tags */}
      {p.tags?.length > 0 && (
        <Group gap={4} mb={8}>
          {p.tags.slice(0, 4).map(tag => (
            <Badge key={tag} size="xs" variant="light" color={tagColor(tag)} className="envman-tag-chip"
              onClick={e => { e.stopPropagation(); onTagClick(tag) }}>
              {tag}
            </Badge>
          ))}
          {p.tags.length > 4 && <Badge size="xs" variant="default">+{p.tags.length - 4}</Badge>}
        </Group>
      )}

      {/* Stats footer — wrap-friendly, dot separators */}
      <Group
        gap="xs" wrap="wrap" pt={8}
        style={{ borderTop: '1px solid var(--mantine-color-default-border)', marginTop: 'auto' }}
      >
        <Tooltip label={`${p._count.environments} environment`} withArrow>
          <Group gap={4} style={{ cursor: 'default' }}>
            <TbVariable size={12} style={{ color: `var(--mantine-color-${color}-light-color)` }} />
            <Text size="xs" fw={600}>{p._count.environments}</Text>
            <Text size="xs" c="dimmed">env</Text>
          </Group>
        </Tooltip>
        {p.members && (
          <>
            <Text size="xs" c="dimmed">·</Text>
            <Tooltip label={`${p.members.length} anggota`} withArrow>
              <Group gap={4} style={{ cursor: 'default' }}>
                <TbUsers size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />
                <Text size="xs" c="dimmed">{p.members.length} anggota</Text>
              </Group>
            </Tooltip>
          </>
        )}
        {p.createdAt && (
          <>
            <Text size="xs" c="dimmed">·</Text>
            <Tooltip label={`Dibuat ${new Date(p.createdAt).toLocaleString('id-ID')}`} withArrow>
              <Group gap={4} style={{ cursor: 'default' }}>
                <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                <Text size="xs" c="dimmed">{relativeDate(p.createdAt)}</Text>
              </Group>
            </Tooltip>
          </>
        )}
      </Group>
    </Box>
  )
}

function ProjectListCard({ project: p, isPinned, onPin, onEdit, onDelete, onToggleActive, onTagClick, onClick }: CardProps) {
  const color = roleColor[p.myRole]
  const borderColor = isPinned
    ? 'color-mix(in srgb, var(--mantine-color-violet-4) 50%, var(--mantine-color-default-border))'
    : 'var(--mantine-color-default-border)'
  return (
    <Box
      p="sm"
      className="envman-project-card"
      role="link" tabIndex={0}
      aria-label={`Buka project ${p.name}`}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ cursor: 'pointer', borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
        {/* Left: avatar + info */}
        <Group gap="sm" style={{ flex: 1, minWidth: 0 }} wrap="nowrap" align="flex-start">
          <ProjectAvatar name={p.name} role={p.myRole} size={36} />
          <Box style={{ flex: 1, minWidth: 0 }}>
            {/* Name — truncates if long */}
            <Text fw={700} size="sm" truncate lh={1.3} mb={2}>{p.name}</Text>

            {/* Slug + role + status badges — wrap if narrow */}
            <Group gap={4} mb={p.description || p.tags?.length > 0 || p._count.environments >= 0 ? 3 : 0} wrap="wrap" align="center">
              <Code fz="xs">{p.slug}</Code>
              <Badge size="xs" variant="light" color={color}>{p.myRole}</Badge>
              {!p.isActive && <Badge size="xs" variant="light" color="gray">nonaktif</Badge>}
            </Group>

            {/* Description */}
            {p.description && (
              <Text size="xs" c="dimmed" truncate lh={1.5} mb={3}>{p.description}</Text>
            )}

            {/* Stats — dot separators, wrap on very narrow */}
            <Group gap="xs" wrap="wrap" align="center">
              <Tooltip label={`${p._count.environments} environment`} withArrow>
                <Group gap={3} style={{ cursor: 'default' }}>
                  <TbVariable size={11} color={`var(--mantine-color-${color}-5)`} />
                  <Text size="xs" c="dimmed">{p._count.environments} env</Text>
                </Group>
              </Tooltip>
              {p.members && (
                <>
                  <Text size="xs" c="dimmed">·</Text>
                  <Tooltip label={`${p.members.length} anggota`} withArrow>
                    <Group gap={3} style={{ cursor: 'default' }}>
                      <TbUsers size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                      <Text size="xs" c="dimmed">{p.members.length}</Text>
                    </Group>
                  </Tooltip>
                </>
              )}
              {p.createdAt && (
                <>
                  <Text size="xs" c="dimmed">·</Text>
                  <Tooltip label={`Dibuat ${new Date(p.createdAt).toLocaleString('id-ID')}`} withArrow>
                    <Group gap={3} style={{ cursor: 'default' }}>
                      <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                      <Text size="xs" c="dimmed">{relativeDate(p.createdAt)}</Text>
                    </Group>
                  </Tooltip>
                </>
              )}
            </Group>

            {/* Tags */}
            {p.tags?.length > 0 && (
              <Group gap={4} mt={5}>
                {p.tags.slice(0, 5).map(tag => (
                  <Badge key={tag} size="xs" variant="light" color={tagColor(tag)} className="envman-tag-chip"
                    onClick={e => { e.stopPropagation(); onTagClick(tag) }}>
                    {tag}
                  </Badge>
                ))}
                {p.tags.length > 5 && <Badge size="xs" variant="default">+{p.tags.length - 5}</Badge>}
              </Group>
            )}
          </Box>
        </Group>

        {/* Actions */}
        <Group gap={2} wrap="nowrap" onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
          <Tooltip label={isPinned ? 'Lepas pin' : 'Pin'} withArrow>
            <ActionIcon size="sm" variant="subtle" color={isPinned ? 'violet' : 'gray'} onClick={e => { e.stopPropagation(); onPin() }}>
              {isPinned ? <TbPinFilled size={13} /> : <TbPin size={13} />}
            </ActionIcon>
          </Tooltip>
          {p.myRole === 'OWNER' && (
            <>
              <Tooltip label={p.isActive ? 'Nonaktifkan' : 'Aktifkan'} position="left" withArrow>
                <ActionIcon size="sm" variant="subtle" color={p.isActive ? 'gray' : 'teal'} onClick={e => { e.stopPropagation(); onToggleActive() }}>
                  <TbPower size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Edit" position="left" withArrow>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={e => { e.stopPropagation(); onEdit() }}>
                  <TbPencil size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus" position="left" withArrow>
                <ActionIcon size="sm" variant="subtle" color="red" onClick={e => { e.stopPropagation(); onDelete() }}>
                  <TbTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          <TbChevronRight size={14} style={{ color: 'var(--mantine-color-dimmed)', marginLeft: 2 }} />
        </Group>
      </Group>
    </Box>
  )
}

// ─── Type-to-confirm delete ──────────────────────────────────────────────────

function DeleteProjectConfirm({
  name, slug, onCancel, onConfirm,
}: {
  name: string
  slug: string
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const canDelete = typed === slug

  const handleConfirm = async () => {
    if (!canDelete || loading) return
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
        Akan menghapus <strong>{name}</strong> beserta semua environment, variabel,
        member, dan token terkait. Tindakan ini <strong>tidak dapat dibatalkan</strong>.
      </Text>
      <Text size="xs" c="dimmed">
        Ketik <Code fz="xs">{slug}</Code> untuk mengkonfirmasi:
      </Text>
      <TextInput
        size="sm"
        placeholder={slug}
        value={typed}
        autoFocus
        data-autofocus
        spellCheck={false}
        onChange={e => setTyped(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && canDelete) handleConfirm() }}
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>Batal</Button>
        <Button
          color="red"
          leftSection={<TbTrash size={13} />}
          disabled={!canDelete}
          loading={loading}
          onClick={handleConfirm}
        >
          Hapus Permanen
        </Button>
      </Group>
    </Stack>
  )
}
