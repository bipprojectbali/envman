import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Kbd,
  Modal,
  Paper,
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
  border-color: var(--mantine-color-violet-5);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-project-card:focus-visible {
  outline: 2px solid var(--mantine-color-violet-5);
  outline-offset: 2px;
  border-color: var(--mantine-color-violet-5);
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

  const togglePin = (slug: string) =>
    setPinned(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])

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

  const resetFilter = () => { setSearch(''); setTagFilter([]) }

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

    const sorted = [...result]
    if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === 'envs') {
      sorted.sort((a, b) => b._count.environments - a._count.environments)
    }
    // 'recent' uses default API order (createdAt desc)

    return sorted.sort((a, b) => {
      const ap = pinned.includes(a.slug) ? 0 : 1
      const bp = pinned.includes(b.slug) ? 0 : 1
      return ap - bp
    })
  }, [projects, debouncedSearch, tagFilter, sort, pinned])

  const PAGE_SIZE = 24
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [debouncedSearch, tagFilter, sort])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const ownerCount = projects.filter(p => p.myRole === 'OWNER').length
  const totalEnvs = projects.reduce((s, p) => s + p._count.environments, 0)
  const hasFilter = debouncedSearch.trim().length > 0 || tagFilter.length > 0

  const openProject = (slug: string) =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: { tab: 'environments' } })

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover effects */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      {/* ─── Header ─────────────────────────── */}
      <Group justify="space-between" mb="md" wrap="nowrap" align="flex-start">
        <Group gap="sm" style={{ minWidth: 0 }}>
          <ThemeIcon size={38} radius="md" variant="light" color="violet">
            <TbFolders size={20} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="lg" lh={1.2}>Projects</Text>
            {!isLoading && !isError && (
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {projects.length === 0 ? (
                  'Belum ada project'
                ) : (
                  <>
                    {projects.length} project · {totalEnvs} environment
                    {ownerCount > 0 && ` · ${ownerCount} milik saya`}
                  </>
                )}
              </Text>
            )}
          </Box>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {projects.length > 0 && (
            <Tooltip label={view === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
              <ActionIcon
                size="lg" variant="default"
                aria-label="Ganti tampilan"
                onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}
              >
                {view === 'grid' ? <TbLayoutList size={16} /> : <TbLayoutGrid size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
          {canCreateProject && (
            <Button size="sm" leftSection={<TbPlus size={14} />} color="violet" onClick={openCreate}>
              New Project
            </Button>
          )}
        </Group>
      </Group>

      {/* ─── Toolbar: search + filter + sort ─── */}
      {!isLoading && !isError && projects.length > 0 && (
        <Paper withBorder radius="md" p="xs" mb="md">
          <Group gap="xs" wrap="wrap">
            <TextInput
              ref={searchRef}
              size="sm"
              placeholder="Cari nama, slug, deskripsi, atau tag..."
              leftSection={<TbSearch size={14} />}
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
              style={{ flex: '1 1 220px', minWidth: 0 }}
            />
            {allTags.length > 0 && (
              <MultiSelectChips
                size="sm"
                label="Tag"
                icon={<TbTag size={14} />}
                width={140}
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
              w={160}
            />
          </Group>
          {tagFilter.length > 0 && (
            <Group gap="xs" mt="xs" wrap="wrap" align="center">
              <Text size="xs" c="dimmed">Filter aktif:</Text>
              <MultiSelectChipsRow
                value={tagFilter}
                onChange={setTagFilter}
                getColor={tagColor}
              />
            </Group>
          )}
          {hasFilter && (
            <Group justify="space-between" mt="xs" gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {filtered.length === projects.length
                  ? `Menampilkan semua ${projects.length} project`
                  : `${filtered.length} dari ${projects.length} project`}
              </Text>
              <Button
                size="compact-xs" variant="subtle" color="gray"
                leftSection={<TbX size={11} />}
                onClick={resetFilter}
              >
                Reset filter
              </Button>
            </Group>
          )}
        </Paper>
      )}

      {/* ─── Error state ────────────────────── */}
      {isError && (
        <Card withBorder p="xl" ta="center" style={{ borderColor: 'var(--mantine-color-red-5)' }}>
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
        </Card>
      )}

      {/* ─── Loading skeleton ───────────────── */}
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

      {/* ─── Empty state ────────────────────── */}
      {!isLoading && !isError && projects.length === 0 && (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={56} radius="xl" variant="light" color="violet" mx="auto" mb="md">
            <TbFolders size={28} />
          </ThemeIcon>
          <Text fw={600} size="md" mb={6}>Belum ada project</Text>
          {canCreateProject ? (
            <>
              <Text size="sm" c="dimmed" mb="lg" maw={420} mx="auto">
                Buat project pertama untuk mulai mengelola environment variables.
                Setiap project bisa punya beberapa environment (dev, staging, production)
                yang masing-masing menyimpan var sendiri.
              </Text>
              <Button leftSection={<TbPlus size={14} />} color="violet" onClick={openCreate}>
                Buat Project Pertama
              </Button>
            </>
          ) : (
            <Text size="sm" c="dimmed" maw={400} mx="auto">
              Kamu belum ditambahkan ke project manapun. Minta admin untuk mengundangmu ke project.
            </Text>
          )}
        </Card>
      )}

      {/* ─── No results state ───────────────── */}
      {!isLoading && !isError && projects.length > 0 && filtered.length === 0 && (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
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
        </Card>
      )}

      {/* ─── Project list / grid ────────────── */}
      {!isError && filtered.length > 0 && (
        <>
          {view === 'list' ? (
            <Stack gap="xs">
              {paginated.map((p) => (
                <ProjectListCard
                  key={p.slug}
                  project={p}
                  isPinned={pinned.includes(p.slug)}
                  onPin={() => togglePin(p.slug)}
                  onEdit={() => setEditTarget(p)}
                  onDelete={() => deleteProject(p.slug, p.name)}
                  onTagClick={addTagFilter}
                  onClick={() => openProject(p.slug)}
                />
              ))}
            </Stack>
          ) : (
            <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing={{ base: 'xs', sm: 'sm' }}>
              {paginated.map((p) => (
                <ProjectGridCard
                  key={p.slug}
                  project={p}
                  isPinned={pinned.includes(p.slug)}
                  onPin={() => togglePin(p.slug)}
                  onEdit={() => setEditTarget(p)}
                  onDelete={() => deleteProject(p.slug, p.name)}
                  onTagClick={addTagFilter}
                  onClick={() => openProject(p.slug)}
                />
              ))}
            </SimpleGrid>
          )}
          {totalPages > 1 && (
            <Group justify="center" mt="lg">
              <Pagination value={page} onChange={setPage} total={totalPages} />
            </Group>
          )}
        </>
      )}

      {/* ─── Create modal ───────────────────── */}
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

      {/* ─── Edit modal ───────────────────── */}
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
          <ThemeIcon size={28} variant="gradient" gradient={{ from: 'violet', to: 'grape' }} radius="md">
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
        <Paper withBorder p="xs" bg="var(--mantine-color-default-hover)">
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
        </Paper>

        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={isPending}>Batal</Button>
          <Button
            leftSection={<TbPlus size={14} />}
            color="violet"
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

function ProjectGridCard({ project: p, isPinned, onPin, onEdit, onDelete, onTagClick, onClick }: CardProps) {
  return (
    <Card
      withBorder
      p="md"
      className="envman-project-card"
      role="link"
      tabIndex={0}
      aria-label={`Buka project ${p.name}`}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
    >
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <ThemeIcon size={40} radius="md" variant="light" color={roleColor[p.myRole]}>
          <TbVariable size={20} />
        </ThemeIcon>
        <Group gap={4} onClick={e => e.stopPropagation()}>
          <Tooltip label={isPinned ? 'Lepas pin' : 'Pin ke atas'}>
            <ActionIcon
              size="sm" variant="subtle"
              color={isPinned ? 'yellow' : 'gray'}
              aria-label={isPinned ? 'Lepas pin project' : 'Pin project'}
              onClick={e => { e.stopPropagation(); onPin() }}
            >
              {isPinned ? <TbPinFilled size={14} /> : <TbPin size={14} />}
            </ActionIcon>
          </Tooltip>
          {p.myRole === 'OWNER' && (
            <>
              <Tooltip label="Edit project">
                <ActionIcon
                  size="sm" variant="subtle" color="blue"
                  aria-label="Edit project"
                  onClick={e => { e.stopPropagation(); onEdit() }}
                >
                  <TbPencil size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus project">
                <ActionIcon
                  size="sm" variant="subtle" color="red"
                  aria-label="Hapus project"
                  onClick={e => { e.stopPropagation(); onDelete() }}
                >
                  <TbTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          <Badge size="xs" variant="dot" color={roleColor[p.myRole]}>{p.myRole}</Badge>
        </Group>
      </Group>

      <Text fw={700} size="md" mb={2} lh={1.3} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.name}
      </Text>
      <Code fz="xs" c="dimmed" mb="xs" style={{ display: 'inline-block', alignSelf: 'flex-start' }}>{p.slug}</Code>

      {p.description ? (
        <Text size="xs" c="dimmed" mb="xs" lineClamp={2} lh={1.5} style={{ minHeight: '2.4em' }}>
          {p.description}
        </Text>
      ) : (
        <Text size="xs" c="dimmed" fs="italic" mb="xs" style={{ minHeight: '2.4em' }}>
          Belum ada deskripsi
        </Text>
      )}

      {p.tags?.length > 0 && (
        <Group gap={4} mb="xs">
          {p.tags.slice(0, 5).map(tag => (
            <Badge
              key={tag} size="xs" variant="light" color={tagColor(tag)}
              className="envman-tag-chip"
              onClick={e => { e.stopPropagation(); onTagClick(tag) }}
            >
              {tag}
            </Badge>
          ))}
          {p.tags.length > 5 && <Badge size="xs" variant="default">+{p.tags.length - 5}</Badge>}
        </Group>
      )}

      <Group gap="md" mt="auto" pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Tooltip label={`${p._count.environments} environment`}>
          <Group gap={4}>
            <TbVariable size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Text size="xs" c="dimmed">{p._count.environments}</Text>
          </Group>
        </Tooltip>
        {p.members && (
          <Tooltip label={`${p.members.length} anggota`}>
            <Group gap={4}>
              <TbUsers size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />
              <Text size="xs" c="dimmed">{p.members.length}</Text>
            </Group>
          </Tooltip>
        )}
        {p.createdAt && (
          <Tooltip label={`Dibuat ${new Date(p.createdAt).toLocaleString('id-ID')}`}>
            <Group gap={4} style={{ marginLeft: 'auto' }}>
              <TbClock size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />
              <Text size="xs" c="dimmed">{relativeDate(p.createdAt)}</Text>
            </Group>
          </Tooltip>
        )}
      </Group>
    </Card>
  )
}

function ProjectListCard({ project: p, isPinned, onPin, onEdit, onDelete, onTagClick, onClick }: CardProps) {
  return (
    <Card
      withBorder
      p="sm"
      className="envman-project-card"
      role="link"
      tabIndex={0}
      aria-label={`Buka project ${p.name}`}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ cursor: 'pointer' }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={38} radius="md" variant="light" color={roleColor[p.myRole]}>
            <TbVariable size={18} />
          </ThemeIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" mb={2} wrap="nowrap">
              <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </Text>
              <Code fz="xs" c="dimmed">{p.slug}</Code>
              <Badge size="xs" variant="dot" color={roleColor[p.myRole]}>{p.myRole}</Badge>
            </Group>
            <Group gap="md" wrap="wrap">
              {p.description && (
                <Text size="xs" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                  {p.description}
                </Text>
              )}
              <Tooltip label={`${p._count.environments} environment`}>
                <Group gap={4}>
                  <TbVariable size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                  <Text size="xs" c="dimmed">{p._count.environments} env</Text>
                </Group>
              </Tooltip>
              {p.members && (
                <Tooltip label={`${p.members.length} anggota`}>
                  <Group gap={4}>
                    <TbUsers size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                    <Text size="xs" c="dimmed">{p.members.length}</Text>
                  </Group>
                </Tooltip>
              )}
              {p.createdAt && (
                <Tooltip label={`Dibuat ${new Date(p.createdAt).toLocaleString('id-ID')}`}>
                  <Group gap={4}>
                    <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                    <Text size="xs" c="dimmed">{relativeDate(p.createdAt)}</Text>
                  </Group>
                </Tooltip>
              )}
            </Group>
            {p.tags?.length > 0 && (
              <Group gap={4} mt={4}>
                {p.tags.slice(0, 6).map(tag => (
                  <Badge
                    key={tag} size="xs" variant="light" color={tagColor(tag)}
                    className="envman-tag-chip"
                    onClick={e => { e.stopPropagation(); onTagClick(tag) }}
                  >
                    {tag}
                  </Badge>
                ))}
                {p.tags.length > 6 && <Badge size="xs" variant="default">+{p.tags.length - 6}</Badge>}
              </Group>
            )}
          </Box>
        </Group>
        <Group gap="xs" wrap="nowrap" onClick={e => e.stopPropagation()}>
          <Tooltip label={isPinned ? 'Lepas pin' : 'Pin ke atas'}>
            <ActionIcon
              size="sm" variant="subtle"
              color={isPinned ? 'yellow' : 'gray'}
              aria-label={isPinned ? 'Lepas pin project' : 'Pin project'}
              onClick={e => { e.stopPropagation(); onPin() }}
            >
              {isPinned ? <TbPinFilled size={14} /> : <TbPin size={14} />}
            </ActionIcon>
          </Tooltip>
          {p.myRole === 'OWNER' && (
            <>
              <Tooltip label="Edit project" position="left">
                <ActionIcon
                  size="sm" variant="subtle" color="blue"
                  aria-label="Edit project"
                  onClick={e => { e.stopPropagation(); onEdit() }}
                >
                  <TbPencil size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus project" position="left">
                <ActionIcon
                  size="sm" variant="subtle" color="red"
                  aria-label="Hapus project"
                  onClick={e => { e.stopPropagation(); onDelete() }}
                >
                  <TbTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          <ThemeIcon size="sm" variant="subtle" color="gray" radius="xl">
            <TbChevronRight size={13} />
          </ThemeIcon>
        </Group>
      </Group>
    </Card>
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
