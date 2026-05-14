import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Group,
  Select,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLazyFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { apiFetch } from '@/frontend/lib/api'
import { NotesPanel } from '@/frontend/components/slug/NotesPanel'
import { NoteFormModal, NoteViewModal } from '@/frontend/components/slug/NoteModals'
import type { Note } from '@/frontend/components/slug/NotesPanel'
import {
  TbCheck,
  TbChevronRight,
  TbNote,
  TbPlus,
  TbSearch,
  TbSortAscending,
  TbTrash,
  TbVariable,
  TbX,
} from 'react-icons/tb'

export const Route = createLazyFileRoute('/envmanager/$slug/')({ component: ProjectDetailPage })

interface Environment {
  id: string
  name: string
  _count: { vars: number }
}

const roleColor = { OWNER: 'blue', EDITOR: 'teal', VIEWER: 'gray' } as const
const envColor: Record<string, string> = {
  production: 'red', prod: 'red',
  staging: 'orange', stage: 'orange',
  development: 'blue', dev: 'blue',
  testing: 'grape', test: 'grape',
}
const getEnvColor = (name: string) => envColor[name.toLowerCase()] ?? 'violet'

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
  const [envSort, setEnvSort] = useState<'name' | 'vars'>('name')

  const setTab = (t: string) =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: prev => ({ ...prev, tab: t as 'environments' | 'notes' }) })

  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'project', slug],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}`),
    refetchInterval: 15000,
  })

  const project = data?.project
  const envs: Environment[] = project?.environments ?? []

  const filteredEnvs = useMemo(() => {
    let list = [...envs]
    if (envSearch.trim()) list = list.filter(e => e.name.toLowerCase().includes(envSearch.toLowerCase()))
    if (envSort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    if (envSort === 'vars') list.sort((a, b) => (b._count?.vars ?? 0) - (a._count?.vars ?? 0))
    return list
  }, [envs, envSearch, envSort])

  const myRole: string = project?.myRole ?? 'VIEWER'
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'
  const isOwner = myRole === 'OWNER'

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

  const deleteEnv = (name: string) =>
    modals.openConfirmModal({
      title: 'Hapus environment',
      children: (
        <Text size="sm">
          Hapus environment <strong>{name}</strong> dan semua variabelnya?
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/environments/${name}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'project', slug] }); notifyOk(`Environment "${name}" dihapus`) })
          .catch(notifyErr),
    })

  return (
    <Box>
      {/* ─── Header ─────────────────────────── */}
      <Group mb="md" gap="xs">
        <Button variant="subtle" size="xs" px={6} component={Link} to="/envmanager">
          Projects
        </Button>
        <Text size="sm" c="dimmed">/</Text>
        {isLoading ? (
          <Skeleton height={16} width={120} />
        ) : (
          <>
            <Text fw={700} size="sm">{project?.name ?? slug}</Text>
            <Code fz="xs" c="dimmed">{slug}</Code>
            <Badge size="xs" variant="dot" color={roleColor[myRole as keyof typeof roleColor] ?? 'gray'}>
              {myRole}
            </Badge>
          </>
        )}
      </Group>

      {/* ─── Tabs ───────────────────────────── */}
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
        </Tabs.List>

        {/* ── Environments tab ─────────────── */}
        <Tabs.Panel value="environments">
          {isLoading ? (
            <Stack gap="xs">
              {[1, 2, 3].map(i => <Skeleton key={i} height={60} radius="md" />)}
            </Stack>
          ) : envs.length === 0 ? (
            <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
              <ThemeIcon size={40} radius="xl" variant="light" color="violet" mx="auto" mb="sm">
                <TbVariable size={20} />
              </ThemeIcon>
              <Text fw={500} mb={4}>Belum ada environment</Text>
              <Text size="sm" c="dimmed" mb="md">
                Tambah environment seperti <Code fz="xs">production</Code>, <Code fz="xs">staging</Code>, atau <Code fz="xs">development</Code>.
              </Text>
              {canEdit && (
                <Group justify="center" gap="xs">
                  {['production', 'staging', 'development'].map(preset => (
                    <Button
                      key={preset}
                      size="xs"
                      variant="outline"
                      color={getEnvColor(preset)}
                      onClick={() => addEnv.mutate(preset)}
                      loading={addEnv.isPending && addEnv.variables === preset}
                    >
                      + {preset}
                    </Button>
                  ))}
                </Group>
              )}
            </Card>
          ) : (
            <>
              {envs.length > 3 && (
                <Group mb="sm" gap="xs">
                  <TextInput
                    size="xs"
                    placeholder="Cari environment..."
                    leftSection={<TbSearch size={13} />}
                    value={envSearch}
                    onChange={e => setEnvSearch(e.target.value)}
                    rightSection={envSearch ? <ActionIcon size="xs" variant="subtle" onClick={() => setEnvSearch('')}><TbX size={11} /></ActionIcon> : undefined}
                    style={{ flex: 1 }}
                  />
                  <Select
                    size="xs"
                    w={130}
                    leftSection={<TbSortAscending size={13} />}
                    value={envSort}
                    onChange={v => setEnvSort((v ?? 'name') as typeof envSort)}
                    data={[
                      { label: 'Nama A-Z', value: 'name' },
                      { label: 'Terbanyak vars', value: 'vars' },
                    ]}
                    allowDeselect={false}
                  />
                </Group>
              )}
              <Stack gap="xs">
              {filteredEnvs.length === 0 ? (
                <Card withBorder p="md" ta="center" style={{ borderStyle: 'dashed' }}>
                  <Text size="sm" c="dimmed">Tidak ada environment yang cocok.</Text>
                  <Button size="xs" variant="subtle" mt="xs" onClick={() => setEnvSearch('')}>Reset</Button>
                </Card>
              ) : filteredEnvs.map(e => {
                const color = getEnvColor(e.name)
                return (
                  <Card
                    key={e.name}
                    withBorder
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate({ to: '/envmanager/$slug/$env', params: { slug, env: e.name } })}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size={32} radius="md" variant="light" color={color}>
                          <TbVariable size={16} />
                        </ThemeIcon>
                        <Box>
                          <Group gap="xs" mb={2}>
                            <Text fw={600} size="sm">{e.name}</Text>
                            <Badge size="xs" variant="light" color={color}>
                              {e._count?.vars ?? 0} vars
                            </Badge>
                          </Group>
                          <Code fz="xs" c="dimmed">{slug}:{e.name}</Code>
                        </Box>
                      </Group>

                      <Group gap="xs" wrap="nowrap" onClick={ev => ev.stopPropagation()}>
                        {isOwner && (
                          <Tooltip label="Hapus environment" position="left">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              onClick={ev => { ev.stopPropagation(); deleteEnv(e.name) }}
                            >
                              <TbTrash size={13} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Button
                          size="xs"
                          variant="light"
                          color={color}
                          rightSection={<TbChevronRight size={12} />}
                          onClick={ev => { ev.stopPropagation(); navigate({ to: '/envmanager/$slug/$env', params: { slug, env: e.name } }) }}
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
            <Group gap="xs" mt="md">
              <TextInput
                size="xs"
                placeholder="Nama environment baru..."
                value={newEnvName}
                onChange={e => setNewEnvName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                style={{ flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter' && newEnvName) addEnv.mutate(newEnvName) }}
                leftSection={<TbVariable size={13} />}
              />
              <Button
                size="xs"
                leftSection={<TbPlus size={13} />}
                onClick={() => addEnv.mutate(newEnvName)}
                loading={addEnv.isPending}
                disabled={!newEnvName}
              >
                Add
              </Button>
            </Group>
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
      </Tabs>

      {/* ─── Note modals — di luar Tabs agar tidak konflik z-index ── */}
      <NoteFormModal slug={slug} openNote={noteModal} setOpenNote={setNoteModal} />
      <NoteViewModal
        slug={slug}
        note={noteView}
        onClose={() => setNoteView(null)}
        canEditNote={(note) => isOwner || (canEdit && note.author.id === (myUserId ?? ''))}
        onEdit={(note) => { setNoteView(null); setNoteModal(note) }}
        onDelete={(note) => { setNoteView(null) }}
      />
    </Box>
  )
}

