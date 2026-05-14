import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Modal,
  MultiSelect,
  SimpleGrid,
  Skeleton,
  Stack,
  TagsInput,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { apiFetch } from '@/frontend/lib/api'
import { useSession, hasCapability } from '@/frontend/hooks/useAuth'
import {
  TbChevronRight,
  TbFolders,
  TbLayoutGrid,
  TbLayoutList,
  TbPlus,
  TbSearch,
  TbTag,
  TbTrash,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'

export const Route = createFileRoute('/envmanager/')({
  component: ProjectListPage,
})


interface Project {
  slug: string
  name: string
  description?: string
  tags: string[]
  myRole: 'OWNER' | 'EDITOR' | 'VIEWER'
  _count: { environments: number }
  members?: { id: string }[]
}

const roleColor = { OWNER: 'blue', EDITOR: 'teal', VIEWER: 'gray' } as const

const TAG_COLORS = ['red','pink','grape','violet','indigo','blue','cyan','teal','green','lime','yellow','orange'] as const

function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

function ProjectListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: sessionData } = useSession()
  const canCreateProject = hasCapability(sessionData?.user, 'project:create')
  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [form, setForm] = useState({ slug: '', name: '', description: '', tags: [] as string[] })
  const [slugManual, setSlugManual] = useState(false)
  const [view, setView] = useLocalStorage<'grid' | 'list'>({ key: 'envman:projects:view', defaultValue: 'grid' })
  const [search, setSearch] = useLocalStorage({ key: 'envman:projects:search', defaultValue: '' })
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({ key: 'envman:projects:tagFilter', defaultValue: [] })

  const { data, isLoading } = useQuery({
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

  const deleteProject = (slug: string, name: string) =>
    modals.openConfirmModal({
      title: 'Hapus project',
      children: (
        <Text size="sm">
          Hapus <strong>{name}</strong> beserta semua environment dan variabelnya?
          Tindakan ini tidak dapat dibatalkan.
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'projects'] }); notifyOk(`Project "${name}" dihapus`) })
          .catch(notifyErr),
    })

  const projects: Project[] = data?.projects ?? []

  const allTags = useMemo(
    () => [...new Set(projects.flatMap(p => p.tags ?? []))].sort(),
    [projects]
  )

  const filtered = useMemo(() => {
    let result = projects
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false)
      )
    }
    if (tagFilter.length > 0) {
      result = result.filter(p => tagFilter.every(t => (p.tags ?? []).includes(t)))
    }
    return result
  }, [projects, search, tagFilter])

  const ownerCount = filtered.filter(p => p.myRole === 'OWNER').length
  const memberCount = filtered.filter(p => p.myRole !== 'OWNER').length

  return (
    <Box>
      {/* ─── Header ─────────────────────────── */}
      <Group justify="space-between" mb="md" wrap="nowrap">
        <Group gap="xs" style={{ minWidth: 0 }}>
          <ThemeIcon size={28} radius="md" variant="light" color="violet">
            <TbFolders size={15} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="sm">Projects</Text>
            {!isLoading && projects.length > 0 && (
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {ownerCount > 0 && `${ownerCount} milik saya`}
                {ownerCount > 0 && memberCount > 0 && ' · '}
                {memberCount > 0 && `${memberCount} member`}
              </Text>
            )}
          </Box>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Tooltip label={view === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
            <ActionIcon
              size="sm" variant="subtle" color="gray"
              onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}
            >
              {view === 'grid' ? <TbLayoutList size={15} /> : <TbLayoutGrid size={15} />}
            </ActionIcon>
          </Tooltip>
          {canCreateProject && (
            <Button size="xs" leftSection={<TbPlus size={13} />} color="violet" onClick={openCreate}>
              New Project
            </Button>
          )}
        </Group>
      </Group>

      {/* ─── Search + Filter ────────────────── */}
      {!isLoading && projects.length > 0 && (
        <Stack gap="xs" mb="md">
          <Group gap="xs" grow>
            <TextInput
              size="xs"
              placeholder="Cari project..."
              leftSection={<TbSearch size={13} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {allTags.length > 0 && (
              <MultiSelect
                size="xs"
                placeholder="Filter tag"
                leftSection={<TbTag size={13} />}
                data={allTags}
                value={tagFilter}
                onChange={setTagFilter}
                clearable
                maxDropdownHeight={200}
              />
            )}
          </Group>
          {(search.trim() || tagFilter.length > 0) && filtered.length < projects.length && (
            <Text size="xs" c="dimmed">
              {filtered.length} dari {projects.length} project
            </Text>
          )}
        </Stack>
      )}

      {/* ─── Loading skeleton ───────────────── */}
      {isLoading && (
        <Stack gap="xs">
          {[1, 2, 3].map(i => <Skeleton key={i} height={72} radius="md" />)}
        </Stack>
      )}

      {/* ─── Empty state ────────────────────── */}
      {!isLoading && projects.length === 0 && (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbFolders size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Belum ada project</Text>
          {canCreateProject ? (
            <>
              <Text size="sm" c="dimmed" mb="lg" maw={320} mx="auto">
                Buat project untuk mulai mengelola environment variables.
                Setiap project bisa punya beberapa environment (dev, staging, production).
              </Text>
              <Button leftSection={<TbPlus size={14} />} onClick={openCreate}>
                Buat Project Pertama
              </Button>
            </>
          ) : (
            <Text size="sm" c="dimmed" maw={320} mx="auto">
              Kamu belum ditambahkan ke project manapun. Minta admin untuk mengundangmu ke project.
            </Text>
          )}
        </Card>
      )}

      {/* ─── No results state ───────────────── */}
      {!isLoading && projects.length > 0 && filtered.length === 0 && (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbSearch size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Tidak ada hasil</Text>
          <Text size="sm" c="dimmed">Coba ubah kata kunci atau filter tag.</Text>
        </Card>
      )}

      {/* ─── Project list / grid ────────────── */}
      {filtered.length > 0 && (
        view === 'list' ? (
          <Stack gap="xs">
            {filtered.map((p) => (
              <Card
                key={p.slug}
                withBorder
                p="sm"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate({ to: '/envmanager/$slug', params: { slug: p.slug }, search: { tab: 'environments' } })}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                    <ThemeIcon size={36} radius="md" variant="light" color={roleColor[p.myRole]}>
                      <TbVariable size={18} />
                    </ThemeIcon>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" mb={2}>
                        <Text fw={600} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </Text>
                        <Code fz="xs" c="dimmed">{p.slug}</Code>
                        <Badge size="xs" variant="dot" color={roleColor[p.myRole]}>{p.myRole}</Badge>
                      </Group>
                      <Group gap="md">
                        {p.description && (
                          <Text size="xs" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                            {p.description}
                          </Text>
                        )}
                        <Group gap="xs">
                          <TbVariable size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                          <Text size="xs" c="dimmed">{p._count.environments} env</Text>
                        </Group>
                        {p.members && (
                          <Group gap="xs">
                            <TbUsers size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                            <Text size="xs" c="dimmed">{p.members.length} member</Text>
                          </Group>
                        )}
                      </Group>
                      {p.tags?.length > 0 && (
                        <Group gap={4} mt={4}>
                          {p.tags.map(tag => (
                            <Badge key={tag} size="xs" variant="light" color={tagColor(tag)}>{tag}</Badge>
                          ))}
                        </Group>
                      )}
                    </Box>
                  </Group>
                  <Group gap="xs" wrap="nowrap" onClick={e => e.stopPropagation()}>
                    {p.myRole === 'OWNER' && (
                      <Tooltip label="Hapus project" position="left">
                        <ActionIcon size="sm" variant="subtle" color="red"
                          onClick={e => { e.stopPropagation(); deleteProject(p.slug, p.name) }}>
                          <TbTrash size={13} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <ThemeIcon size="sm" variant="subtle" color="gray" radius="xl">
                      <TbChevronRight size={13} />
                    </ThemeIcon>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        ) : (
          <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing={{ base: 'xs', sm: 'sm' }}>
            {filtered.map((p) => (
              <Card
                key={p.slug}
                withBorder
                p="md"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate({ to: '/envmanager/$slug', params: { slug: p.slug }, search: { tab: 'environments' } })}
              >
                <Group justify="space-between" mb="xs" wrap="nowrap">
                  <ThemeIcon size={38} radius="md" variant="light" color={roleColor[p.myRole]}>
                    <TbVariable size={20} />
                  </ThemeIcon>
                  <Group gap={4} onClick={e => e.stopPropagation()}>
                    {p.myRole === 'OWNER' && (
                      <Tooltip label="Hapus project">
                        <ActionIcon size="xs" variant="subtle" color="red"
                          onClick={e => { e.stopPropagation(); deleteProject(p.slug, p.name) }}>
                          <TbTrash size={12} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Badge size="xs" variant="dot" color={roleColor[p.myRole]}>{p.myRole}</Badge>
                  </Group>
                </Group>

                <Text fw={700} size="sm" mb={2} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </Text>
                <Code fz="xs" c="dimmed" mb="xs" style={{ display: 'block' }}>{p.slug}</Code>

                {p.description && (
                  <Text size="xs" c="dimmed" mb="xs" lineClamp={2} lh={1.5}>
                    {p.description}
                  </Text>
                )}

                {p.tags?.length > 0 && (
                  <Group gap={4} mb="xs">
                    {p.tags.map(tag => (
                      <Badge key={tag} size="xs" variant="light" color={tagColor(tag)}>{tag}</Badge>
                    ))}
                  </Group>
                )}

                <Group gap="md" mt="auto">
                  <Group gap={4}>
                    <TbVariable size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                    <Text size="xs" c="dimmed">{p._count.environments} env</Text>
                  </Group>
                  {p.members && (
                    <Group gap={4}>
                      <TbUsers size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                      <Text size="xs" c="dimmed">{p.members.length} member</Text>
                    </Group>
                  )}
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        )
      )}

      {/* ─── Create modal ───────────────────── */}
      <Modal
        opened={createOpen}
        onClose={() => { closeCreate(); setForm({ slug: '', name: '', description: '', tags: [] }); setSlugManual(false) }}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="violet" radius="md"><TbFolders size={13} /></ThemeIcon>
            <Text fw={600} size="sm">Buat Project Baru</Text>
          </Group>
        }
      >
        <Stack gap="sm">
          <TextInput
            label="Nama project"
            placeholder="My App, Backend API, ..."
            value={form.name}
            autoFocus
            onChange={e => {
              const name = e.target.value
              setForm(f => ({
                ...f,
                name,
                slug: slugManual ? f.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
              }))
            }}
          />
          <TextInput
            label="Slug"
            placeholder="my-app"
            value={form.slug}
            description={
              <Text component="span" size="xs" c="dimmed">
                Dipakai di CLI: <Code fz="xs">envman -e {form.slug || 'slug'}:env -- cmd</Code>
              </Text>
            }
            onChange={e => { setSlugManual(true); setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })) }}
            error={form.slug && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(form.slug) && form.slug.length > 1 ? 'Hanya huruf kecil, angka, dan strip' : undefined}
          />
          <TextInput
            label="Deskripsi"
            placeholder="Opsional — penjelasan singkat project ini"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <TagsInput
            label="Tags"
            placeholder="Tambah tag, tekan Enter"
            description="Opsional — untuk filter dan pengelompokan"
            value={form.tags}
            onChange={tags => setForm(f => ({ ...f, tags }))}
            data={allTags}
            clearable
          />
          <Divider />
          <Button
            fullWidth
            leftSection={<TbPlus size={14} />}
            onClick={() => createProject.mutate(form)}
            loading={createProject.isPending}
            disabled={!form.slug || !form.name || (form.slug.length > 1 && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(form.slug))}
          >
            Buat Project
          </Button>
        </Stack>
      </Modal>
    </Box>
  )
}
