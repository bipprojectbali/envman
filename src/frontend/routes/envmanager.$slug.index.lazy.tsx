import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Group,
  Kbd,
  Paper,
  Select,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDebouncedValue, useHotkeys } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import {
  TbAlertTriangle,
  TbArrowLeft,
  TbChevronRight,
  TbClock,
  TbFolders,
  TbNote,
  TbFiles,
  TbTerminal2,
  TbPencil,
  TbPlus,
  TbSearch,
  TbSortAscending,
  TbTag,
  TbTrash,
  TbUsers,
  TbVariable,
  TbX,
} from 'react-icons/tb'
import { NoteFormModal, NoteViewModal } from '@/frontend/components/slug/NoteModals'
import type { Note } from '@/frontend/components/slug/NotesPanel'
import { NotesPanel } from '@/frontend/components/slug/NotesPanel'
import { AliasesPanel } from '@/frontend/components/slug/AliasesPanel'
import { FilesPanel } from '@/frontend/components/slug/FilesPanel'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export const Route = createLazyFileRoute('/envmanager/$slug/')({ component: ProjectDetailPage })

interface Environment {
  id: string
  name: string
  createdAt?: string
  _count: { vars: number }
}

const roleColor = { OWNER: 'blue', EDITOR: 'teal', VIEWER: 'gray' } as const

const envColor: Record<string, string> = {
  production: 'red', prod: 'red',
  staging: 'orange', stage: 'orange',
  development: 'blue', dev: 'blue',
  testing: 'grape', test: 'grape',
  qa: 'cyan', uat: 'pink',
}
const getEnvColor = (name: string) => envColor[name.toLowerCase()] ?? 'violet'

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

const ENV_NAME_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/
const ENV_PRESETS = ['production', 'staging', 'development'] as const

const HOVER_STYLES = `
.envman-env-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-env-card:hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-violet-5);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-env-card:focus-visible {
  outline: 2px solid var(--mantine-color-violet-5);
  outline-offset: 2px;
  border-color: var(--mantine-color-violet-5);
}
`

function ProjectDetailPage() {
  const { slug } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: sessionData } = useSession()
  const myUserId = sessionData?.user?.id
  const canCreateNote = hasCapability(sessionData?.user, 'note:create')

  const [noteModal, setNoteModal] = useState<Note | null | 'new'>(null)
  const [noteView, setNoteView] = useState<Note | null>(null)
  const [newEnvName, setNewEnvName] = useState('')
  const [envSearch, setEnvSearch] = useState('')
  const [envSort, setEnvSort] = useState<'name' | 'vars' | 'recent'>('name')
  const searchRef = useRef<HTMLInputElement>(null)
  const [debouncedSearch] = useDebouncedValue(envSearch, 120)

  const setTab = (t: string) =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: prev => ({ ...prev, tab: t as 'environments' | 'notes' }) })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['envman', 'project', slug],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}`),
    refetchInterval: 15000,
  })

  const project = data?.project
  const envs: Environment[] = project?.environments ?? []
  const totalVars = envs.reduce((s, e) => s + (e._count?.vars ?? 0), 0)
  const memberCount: number = project?.members?.length ?? 0
  const projectTags: string[] = project?.tags ?? []

  const filteredEnvs = useMemo(() => {
    let list = [...envs]
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(e => e.name.toLowerCase().includes(q))
    }
    if (envSort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    else if (envSort === 'vars') list.sort((a, b) => (b._count?.vars ?? 0) - (a._count?.vars ?? 0))
    else if (envSort === 'recent') {
      list.sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return bt - at
      })
    }
    return list
  }, [envs, debouncedSearch, envSort])

  useHotkeys([
    ['/', () => {
      if (tab !== 'environments') setTab('environments')
      // defer focus until after re-render if we just switched tabs
      requestAnimationFrame(() => {
        searchRef.current?.focus()
        searchRef.current?.select()
      })
    }],
  ])

  const myRole: string = project?.myRole ?? 'VIEWER'
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'
  const isOwner = myRole === 'OWNER'

  const newEnvValid = newEnvName.length > 0 && ENV_NAME_RE.test(newEnvName)
  const newEnvDuplicate = newEnvName.length > 0 && envs.some(e => e.name === newEnvName)
  const newEnvError = newEnvName.length > 0
    ? newEnvDuplicate
      ? `Environment "${newEnvName}" sudah ada`
      : !newEnvValid
        ? 'Hanya huruf kecil, angka, dan strip. Tidak diawali/diakhiri strip.'
        : null
    : null

  const addEnv = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/api/envman/projects/${slug}/environments`, { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: (_, name) => {
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
      setNewEnvName('')
      notifyOk(`Environment "${name}" ditambahkan`)
      navigate({ to: '/envmanager/$slug/$env', params: { slug, env: name } })
    },
    onError: (e) => notifyErr(e),
  })

  const renameEnv = (oldName: string, varCount: number) => {
    const modalId = `rename-env-${oldName}`
    const otherNames = envs.filter(e => e.name !== oldName).map(e => e.name)
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="blue" radius="md">
            <TbPencil size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Rename environment</Text>
        </Group>
      ),
      children: (
        <RenameEnvForm
          oldName={oldName}
          varCount={varCount}
          otherNames={otherNames}
          onCancel={() => modals.close(modalId)}
          onConfirm={async (newName) => {
            try {
              await apiFetch(`/api/envman/projects/${slug}/environments/${oldName}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: newName }),
              })
              qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
              notifyOk(`Environment "${oldName}" di-rename jadi "${newName}"`)
              modals.close(modalId)
            } catch (e) {
              notifyErr(e)
            }
          }}
        />
      ),
    })
  }

  const deleteEnv = (name: string, varCount: number) => {
    const id = `delete-env-${name}`
    modals.open({
      modalId: id,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Hapus environment</Text>
        </Group>
      ),
      children: (
        <DeleteEnvConfirm
          name={name}
          varCount={varCount}
          onCancel={() => modals.close(id)}
          onConfirm={async () => {
            try {
              await apiFetch(`/api/envman/projects/${slug}/environments/${name}`, { method: 'DELETE' })
              qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
              notifyOk(`Environment "${name}" dihapus`)
              modals.close(id)
            } catch (e) {
              notifyErr(e)
            }
          }}
        />
      ),
    })
  }

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      {/* ─── Header ─────────────────────────── */}
      <Group mb="sm" gap={4} wrap="nowrap">
        <Button
          variant="subtle" size="xs" px={6} color="gray"
          component={Link} to="/envmanager"
          leftSection={<TbArrowLeft size={13} />}
        >
          Projects
        </Button>
        <Text size="sm" c="dimmed">/</Text>
        {isLoading ? (
          <Skeleton height={16} width={120} />
        ) : (
          <Text size="sm" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project?.name ?? slug}
          </Text>
        )}
      </Group>

      {isLoading ? (
        <Skeleton height={88} mb="md" radius="md" />
      ) : isError ? (
        <Card withBorder p="xl" ta="center" mb="md" style={{ borderColor: 'var(--mantine-color-red-5)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm">
            <TbAlertTriangle size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Gagal memuat project</Text>
          <Text size="sm" c="dimmed" mb="md">
            {(error as Error)?.message ?? 'Project tidak ditemukan atau tidak ada akses.'}
          </Text>
          <Group justify="center" gap="xs">
            <Button size="xs" variant="subtle" color="gray" component={Link} to="/envmanager">
              Kembali ke daftar
            </Button>
            <Button size="xs" variant="light" color="red" onClick={() => refetch()}>
              Coba lagi
            </Button>
          </Group>
        </Card>
      ) : project && (
        <Paper withBorder radius="md" p="md" mb="md">
          <Group gap="md" wrap="nowrap" align="flex-start">
            <ThemeIcon size={48} radius="md" variant="light" color={roleColor[myRole as keyof typeof roleColor] ?? 'gray'}>
              <TbFolders size={26} />
            </ThemeIcon>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs" mb={4} wrap="nowrap">
                <Text fw={700} size="xl" lh={1.2} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {project.name}
                </Text>
                <Code fz="xs" c="dimmed">{slug}</Code>
                <Badge size="sm" variant="dot" color={roleColor[myRole as keyof typeof roleColor] ?? 'gray'}>
                  {myRole}
                </Badge>
              </Group>
              {project.description ? (
                <Text size="sm" c="dimmed" mb="sm" lh={1.5}>
                  {project.description}
                </Text>
              ) : (
                <Text size="sm" c="dimmed" fs="italic" mb="sm">
                  Belum ada deskripsi
                </Text>
              )}
              {projectTags.length > 0 && (
                <Group gap={4} mb="sm">
                  <TbTag size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />
                  {projectTags.map(t => (
                    <Badge key={t} size="xs" variant="light" color={tagColor(t)}>{t}</Badge>
                  ))}
                </Group>
              )}
              <Group gap="lg">
                <Tooltip label={`${envs.length} environment`}>
                  <Group gap={4}>
                    <TbVariable size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
                    <Text size="xs" c="dimmed">{envs.length} env</Text>
                  </Group>
                </Tooltip>
                <Tooltip label={`${totalVars} variabel total di semua env`}>
                  <Group gap={4}>
                    <Box w={3} h={3} bg="var(--mantine-color-dimmed)" style={{ borderRadius: '50%' }} />
                    <Text size="xs" c="dimmed">{totalVars} vars</Text>
                  </Group>
                </Tooltip>
                <Tooltip label={`${memberCount} anggota`}>
                  <Group gap={4}>
                    <TbUsers size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
                    <Text size="xs" c="dimmed">{memberCount} member</Text>
                  </Group>
                </Tooltip>
                {project.createdAt && (
                  <Tooltip label={`Dibuat ${new Date(project.createdAt).toLocaleString('id-ID')}`}>
                    <Group gap={4} style={{ marginLeft: 'auto' }}>
                      <TbClock size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
                      <Text size="xs" c="dimmed">{relativeDate(project.createdAt)}</Text>
                    </Group>
                  </Tooltip>
                )}
              </Group>
            </Box>
          </Group>
        </Paper>
      )}

      {/* ─── Tabs ───────────────────────────── */}
      {!isError && (
        <Tabs value={tab} onChange={v => setTab(v ?? 'environments')}>
          <Tabs.List mb="md">
            <Tabs.Tab
              value="environments"
              leftSection={<TbVariable size={14} />}
              rightSection={!isLoading && envs.length > 0 ? (
                <Badge size="xs" variant="filled" color="violet" circle>{envs.length}</Badge>
              ) : undefined}
            >
              Environments
            </Tabs.Tab>
            <Tabs.Tab value="notes" leftSection={<TbNote size={14} />}>
              Notes
            </Tabs.Tab>
            <Tabs.Tab value="aliases" leftSection={<TbTerminal2 size={14} />}>
              Aliases
            </Tabs.Tab>
            <Tabs.Tab value="files" leftSection={<TbFiles size={14} />}>
              Files
            </Tabs.Tab>
          </Tabs.List>

          {/* ── Environments tab ─────────────── */}
          <Tabs.Panel value="environments">
            {isLoading ? (
              <Stack gap="xs">
                {[0, 1, 2].map(i => <Skeleton key={i} height={64} radius="md" />)}
              </Stack>
            ) : envs.length === 0 ? (
              <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
                <ThemeIcon size={48} radius="xl" variant="light" color="violet" mx="auto" mb="sm">
                  <TbVariable size={24} />
                </ThemeIcon>
                <Text fw={600} mb={4}>Belum ada environment</Text>
                <Text size="sm" c="dimmed" mb="md" maw={420} mx="auto">
                  Environment adalah wadah untuk environment variables.
                  Biasanya kamu butuh <Code fz="xs">production</Code>, <Code fz="xs">staging</Code>, dan <Code fz="xs">development</Code>.
                </Text>
                {canEdit && (
                  <>
                    <Group justify="center" gap="xs" mb="sm">
                      {ENV_PRESETS.map(preset => (
                        <Button
                          key={preset}
                          size="xs"
                          variant="light"
                          color={getEnvColor(preset)}
                          leftSection={<TbPlus size={12} />}
                          onClick={() => addEnv.mutate(preset)}
                          loading={addEnv.isPending && addEnv.variables === preset}
                        >
                          {preset}
                        </Button>
                      ))}
                    </Group>
                    <Text size="xs" c="dimmed">atau buat nama custom di bawah</Text>
                  </>
                )}
              </Card>
            ) : (
              <>
                {envs.length > 2 && (
                  <Group mb="sm" gap="xs">
                    <TextInput
                      ref={searchRef}
                      size="xs"
                      placeholder="Cari environment..."
                      leftSection={<TbSearch size={13} />}
                      value={envSearch}
                      onChange={e => setEnvSearch(e.target.value)}
                      rightSection={
                        envSearch ? (
                          <ActionIcon size="xs" variant="subtle" aria-label="Hapus pencarian" onClick={() => setEnvSearch('')}>
                            <TbX size={11} />
                          </ActionIcon>
                        ) : (
                          <Tooltip label="Tekan / untuk focus">
                            <Kbd size="xs">/</Kbd>
                          </Tooltip>
                        )
                      }
                      rightSectionWidth={32}
                      style={{ flex: 1 }}
                    />
                    <Select
                      size="xs"
                      w={150}
                      leftSection={<TbSortAscending size={13} />}
                      value={envSort}
                      onChange={v => setEnvSort((v ?? 'name') as typeof envSort)}
                      data={[
                        { label: 'Nama A→Z', value: 'name' },
                        { label: 'Terbanyak vars', value: 'vars' },
                        { label: 'Terbaru', value: 'recent' },
                      ]}
                      allowDeselect={false}
                    />
                  </Group>
                )}
                <Stack gap="xs">
                  {filteredEnvs.length === 0 ? (
                    <Card withBorder p="md" ta="center" style={{ borderStyle: 'dashed' }}>
                      <Text size="sm" c="dimmed" mb="xs">
                        Tidak ada environment yang cocok dengan "{envSearch}"
                      </Text>
                      <Button size="xs" variant="subtle" leftSection={<TbX size={11} />} onClick={() => setEnvSearch('')}>
                        Reset pencarian
                      </Button>
                    </Card>
                  ) : filteredEnvs.map(e => {
                    const color = getEnvColor(e.name)
                    const goTo = () => navigate({ to: '/envmanager/$slug/$env', params: { slug, env: e.name } })
                    return (
                      <Card
                        key={e.name}
                        withBorder
                        className="envman-env-card"
                        role="link"
                        tabIndex={0}
                        aria-label={`Kelola environment ${e.name}`}
                        onClick={goTo}
                        onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goTo() } }}
                        style={{ cursor: 'pointer' }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                            <ThemeIcon size={36} radius="md" variant="light" color={color}>
                              <TbVariable size={18} />
                            </ThemeIcon>
                            <Box style={{ flex: 1, minWidth: 0 }}>
                              <Group gap="xs" mb={2} wrap="nowrap">
                                <Text fw={700} size="sm">{e.name}</Text>
                                <Tooltip label={`${e._count?.vars ?? 0} variabel`}>
                                  <Badge size="xs" variant="light" color={color}>
                                    {e._count?.vars ?? 0} vars
                                  </Badge>
                                </Tooltip>
                              </Group>
                              <Group gap="md">
                                <Code fz="xs" c="dimmed">{slug}:{e.name}</Code>
                                {e.createdAt && (
                                  <Tooltip label={`Dibuat ${new Date(e.createdAt).toLocaleString('id-ID')}`}>
                                    <Group gap={4}>
                                      <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                                      <Text size="xs" c="dimmed">{relativeDate(e.createdAt)}</Text>
                                    </Group>
                                  </Tooltip>
                                )}
                              </Group>
                            </Box>
                          </Group>

                          <Group gap="xs" wrap="nowrap" onClick={ev => ev.stopPropagation()}>
                            {isOwner && (
                              <>
                                <Tooltip label="Rename environment" position="left">
                                  <ActionIcon
                                    size="sm" variant="subtle" color="blue"
                                    aria-label="Rename environment"
                                    onClick={ev => { ev.stopPropagation(); renameEnv(e.name, e._count?.vars ?? 0) }}
                                  >
                                    <TbPencil size={13} />
                                  </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Hapus environment" position="left">
                                  <ActionIcon
                                    size="sm" variant="subtle" color="red"
                                    aria-label="Hapus environment"
                                    onClick={ev => { ev.stopPropagation(); deleteEnv(e.name, e._count?.vars ?? 0) }}
                                  >
                                    <TbTrash size={13} />
                                  </ActionIcon>
                                </Tooltip>
                              </>
                            )}
                            <Button
                              size="xs"
                              variant="light"
                              color={color}
                              rightSection={<TbChevronRight size={12} />}
                              onClick={ev => { ev.stopPropagation(); goTo() }}
                            >
                              Manage
                            </Button>
                          </Group>
                        </Group>
                      </Card>
                    )
                  })}
                </Stack>
              </>
            )}

            {canEdit && (
              <Paper withBorder radius="md" p="sm" mt="md" bg="var(--mantine-color-default-hover)">
                <Group gap="xs" align="flex-start">
                  <Box style={{ flex: 1 }}>
                    <TextInput
                      size="xs"
                      placeholder="Nama environment baru (mis. production, staging-eu)..."
                      value={newEnvName}
                      onChange={ev => setNewEnvName(ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      onKeyDown={ev => { if (ev.key === 'Enter' && newEnvValid && !newEnvDuplicate) addEnv.mutate(newEnvName) }}
                      leftSection={<TbVariable size={13} />}
                      error={newEnvError ?? undefined}
                    />
                    {envs.length > 0 && envs.length < ENV_PRESETS.length && (
                      <Group gap={4} mt="xs">
                        <Text size="xs" c="dimmed">Quick add:</Text>
                        {ENV_PRESETS.filter(p => !envs.some(e => e.name === p)).map(preset => (
                          <Badge
                            key={preset}
                            size="sm" variant="light" color={getEnvColor(preset)}
                            style={{ cursor: 'pointer' }}
                            onClick={() => addEnv.mutate(preset)}
                          >
                            + {preset}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </Box>
                  <Button
                    size="xs"
                    leftSection={<TbPlus size={13} />}
                    onClick={() => addEnv.mutate(newEnvName)}
                    loading={addEnv.isPending}
                    disabled={!newEnvValid || newEnvDuplicate}
                  >
                    Add
                  </Button>
                </Group>
              </Paper>
            )}
          </Tabs.Panel>

          {/* ── Notes tab ────────────────────── */}
          <Tabs.Panel value="notes">
            <NotesPanel
              slug={slug}
              canEdit={canEdit}
              canCreate={canCreateNote}
              isOwner={isOwner}
              myUserId={myUserId ?? ''}
              openModal={noteModal}
              setOpenModal={setNoteModal}
              viewNote={noteView}
              setViewNote={setNoteView}
            />
          </Tabs.Panel>

          {/* ── Aliases tab ──────────────────── */}
          <Tabs.Panel value="aliases">
            <AliasesPanel slug={slug} isOwner={isOwner} />
          </Tabs.Panel>

          {/* ── Files tab ────────────────────── */}
          <Tabs.Panel value="files">
            <FilesPanel slug={slug} isOwner={isOwner} myUserId={myUserId ?? ''} canEdit={canEdit} />
          </Tabs.Panel>
        </Tabs>
      )}

      {/* ─── Note modals — di luar Tabs agar tidak konflik z-index ── */}
      <NoteFormModal slug={slug} openNote={noteModal} setOpenNote={setNoteModal} />
      <NoteViewModal
        slug={slug}
        note={noteView}
        onClose={() => setNoteView(null)}
        canEditNote={(note) => isOwner || (canEdit && note.author.id === (myUserId ?? ''))}
        onEdit={(note) => { setNoteView(null); setNoteModal(note) }}
        onDelete={() => { setNoteView(null) }}
      />
    </Box>
  )
}

// ─── Rename environment ──────────────────────────────────────────────────────

function RenameEnvForm({
  oldName, varCount, otherNames, onCancel, onConfirm,
}: {
  oldName: string
  varCount: number
  otherNames: string[]
  onCancel: () => void
  onConfirm: (newName: string) => Promise<void> | void
}) {
  const [name, setName] = useState(oldName)
  const [loading, setLoading] = useState(false)
  const normalized = name.toLowerCase().replace(/[^a-z0-9-]/g, '')
  const valid = normalized.length > 0 && ENV_NAME_RE.test(normalized)
  const unchanged = normalized === oldName
  const duplicate = !unchanged && otherNames.includes(normalized)
  const error = name.length === 0
    ? null
    : duplicate
      ? `Environment "${normalized}" sudah ada`
      : !valid
        ? 'Hanya huruf kecil, angka, dan strip. Tidak diawali/diakhiri strip.'
        : null
  const canSubmit = valid && !duplicate && !unchanged && !loading

  const handleConfirm = async () => {
    if (!canSubmit) return
    setLoading(true)
    try {
      await onConfirm(normalized)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm">
        Rename <Code fz="xs">{oldName}</Code>
        {varCount > 0 && <> dengan <strong>{varCount} variabel</strong></>}.
      </Text>
      <TextInput
        label="Nama baru"
        placeholder={oldName}
        value={name}
        autoFocus
        data-autofocus
        spellCheck={false}
        leftSection={<TbVariable size={13} />}
        onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        onKeyDown={e => { if (e.key === 'Enter' && canSubmit) handleConfirm() }}
        error={error ?? undefined}
      />
      <Alert color="yellow" icon={<TbAlertTriangle size={13} />} p="xs">
        <Text size="xs">
          Semua CLI / CI yang masih pakai <Code fz="xs">{oldName}</Code> akan langsung gagal —
          mereka harus diupdate ke <Code fz="xs">{normalized || '<nama-baru>'}</Code> setelah rename.
        </Text>
      </Alert>
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>Batal</Button>
        <Button
          color="blue"
          leftSection={<TbPencil size={13} />}
          disabled={!canSubmit}
          loading={loading}
          onClick={handleConfirm}
        >
          Rename
        </Button>
      </Group>
    </Stack>
  )
}

// ─── Type-to-confirm delete env ──────────────────────────────────────────────

function DeleteEnvConfirm({
  name, varCount, onCancel, onConfirm,
}: {
  name: string
  varCount: number
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const canDelete = typed === name

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
        Akan menghapus environment <strong>{name}</strong>
        {varCount > 0 ? <> beserta <strong>{varCount} variabel</strong></> : ' (kosong)'}.
        Tindakan ini <strong>tidak dapat dibatalkan</strong>.
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
