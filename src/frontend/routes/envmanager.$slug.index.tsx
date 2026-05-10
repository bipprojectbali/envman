import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Combobox,
  CopyButton,
  Divider,
  Group,
  InputBase,
  Menu,
  Modal,
  MultiSelect,
  Paper,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
  useCombobox,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSession } from '@/frontend/hooks/useAuth'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { apiFetch } from '@/frontend/lib/api'
import {
  TbBookmark,
  TbBookmarkFilled,
  TbCheck,
  TbChevronRight,
  TbChevronDown,
  TbCopy,
  TbEdit,
  TbEye,
  TbFileText,
  TbNote,
  TbPlus,
  TbSearch,
  TbShieldCheck,
  TbSortAscending,
  TbTag,
  TbTrash,
  TbUserPlus,
  TbUsers,
  TbVariable,
  TbX,
} from 'react-icons/tb'

export const Route = createFileRoute('/envmanager/$slug/')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ['environments', 'members', 'notes'].includes(search.tab as string)
      ? (search.tab as 'environments' | 'members' | 'notes')
      : 'environments',
  }),
  component: ProjectDetailPage,
})


interface Environment {
  id: string
  name: string
  _count: { vars: number }
}

interface Member {
  id: string
  role: string
  user: { id: string; name: string; email: string }
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
  const [noteModal, setNoteModal] = useState<Note | null | 'new'>(null)
  const [noteView, setNoteView] = useState<Note | null>(null)
  const [newEnvName, setNewEnvName] = useState('')
  const [envSearch, setEnvSearch] = useState('')
  const [envSort, setEnvSort] = useState<'name' | 'vars'>('name')
  const [memberSearch, setMemberSearch] = useState('')
  const [inviteUserId, setInviteUserId] = useState<string | null>(null)
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('VIEWER')
  const [debouncedSearch] = useDebouncedValue(inviteSearch, 300)
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() })

  const setTab = (t: string) =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: prev => ({ ...prev, tab: t as 'environments' | 'members' | 'notes' }) })

  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'project', slug],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}`),
    refetchInterval: 15000,
  })

  const project = data?.project
  const envs: Environment[] = project?.environments ?? []
  const members: Member[] = project?.members ?? []

  const filteredEnvs = useMemo(() => {
    let list = [...envs]
    if (envSearch.trim()) list = list.filter(e => e.name.toLowerCase().includes(envSearch.toLowerCase()))
    if (envSort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    if (envSort === 'vars') list.sort((a, b) => (b._count?.vars ?? 0) - (a._count?.vars ?? 0))
    return list
  }, [envs, envSearch, envSort])

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members
    const q = memberSearch.toLowerCase()
    return members.filter(m => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q))
  }, [members, memberSearch])
  const myRole: string = project?.myRole ?? 'VIEWER'
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'
  const isOwner = myRole === 'OWNER'
  const ownerCount = members.filter(m => m.role === 'OWNER').length

  const memberUserIds = new Set(members.map(m => m.user.id))

  const { data: usersData } = useQuery({
    queryKey: ['envman', 'users', debouncedSearch],
    queryFn: () => apiFetch(`/api/envman/users?q=${encodeURIComponent(debouncedSearch)}`),
    enabled: isOwner,
  })
  const invitableUsers: { id: string; name: string; email: string }[] =
    (usersData?.users ?? []).filter((u: { id: string }) => !memberUserIds.has(u.id))

  const selectedUser = invitableUsers.find(u => u.id === inviteUserId) ??
    (usersData?.users ?? []).find((u: { id: string }) => u.id === inviteUserId)

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

  const addMember = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/projects/${slug}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: inviteUserId, role: inviteRole }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
      setInviteUserId(null)
      setInviteSearch('')
      notifyOk('Member ditambahkan ke project')
    },
    onError: (e) => notifyErr(e),
  })

  const updateMemberRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiFetch(`/api/envman/projects/${slug}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['envman', 'project', slug] }); notifyOk('Role member diperbarui') },
    onError: (e) => notifyErr(e),
  })

  const removeMember = (userId: string, name: string) =>
    modals.openConfirmModal({
      title: 'Hapus member',
      children: <Text size="sm">Hapus <strong>{name}</strong> dari project ini?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/members/${userId}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'project', slug] }); notifyOk(`${name} dihapus dari project`) })
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
          <Tabs.Tab
            value="members"
            leftSection={<TbUsers size={14} />}
            rightSection={!isLoading && members.length > 0 ? (
              <Badge size="xs" variant="filled" color="gray" circle>{members.length}</Badge>
            ) : undefined}
          >
            Members
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

        {/* ── Members tab ──────────────────── */}
        <Tabs.Panel value="members">
          {isLoading ? (
            <Stack gap="xs">
              {[1, 2].map(i => <Skeleton key={i} height={56} radius="md" />)}
            </Stack>
          ) : (
            <Stack gap="xs">
              {/* Role legend */}
              <Card withBorder p="xs" bg="var(--mantine-color-default-hover)">
                <Group gap="lg">
                  {[
                    { role: 'OWNER', desc: 'kontrol penuh', color: 'blue' },
                    { role: 'EDITOR', desc: 'tambah / edit vars', color: 'teal' },
                    { role: 'VIEWER', desc: 'read-only', color: 'gray' },
                  ].map(r => (
                    <Group key={r.role} gap={4}>
                      <Badge size="xs" variant="dot" color={r.color}>{r.role}</Badge>
                      <Text size="xs" c="dimmed">— {r.desc}</Text>
                    </Group>
                  ))}
                </Group>
              </Card>

              {members.length > 0 && (
                <TextInput
                  size="xs"
                  placeholder="Cari member..."
                  leftSection={<TbSearch size={13} />}
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  rightSection={memberSearch ? <ActionIcon size="xs" variant="subtle" onClick={() => setMemberSearch('')}><TbX size={11} /></ActionIcon> : undefined}
                />
              )}

              {members.length === 0 ? (
                <Card withBorder p="lg" ta="center" style={{ borderStyle: 'dashed' }}>
                  <ThemeIcon size={36} radius="xl" variant="light" color="gray" mx="auto" mb="xs">
                    <TbUsers size={18} />
                  </ThemeIcon>
                  <Text size="sm" c="dimmed">Belum ada member lain.</Text>
                </Card>
              ) : filteredMembers.length === 0 ? (
                <Card withBorder p="md" ta="center" style={{ borderStyle: 'dashed' }}>
                  <Text size="sm" c="dimmed">Tidak ada member yang cocok.</Text>
                  <Button size="xs" variant="subtle" mt="xs" onClick={() => setMemberSearch('')}>Reset</Button>
                </Card>
              ) : (
                filteredMembers.map(m => (
                  <Group
                    key={m.id}
                    justify="space-between"
                    p="sm"
                    style={{ borderRadius: 8, border: '1px solid var(--mantine-color-default-border)' }}
                  >
                    <Group gap="sm">
                      <Avatar radius="xl" size="sm" color={roleColor[m.role as keyof typeof roleColor] ?? 'gray'}>
                        {m.user.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box>
                        <Text size="sm" fw={500}>{m.user.name}</Text>
                        <Text size="xs" c="dimmed">{m.user.email}</Text>
                      </Box>
                    </Group>

                    <Group gap="xs">
                      {(() => {
                        const isSelf = m.user.id === myUserId
                        const isLastOwner = m.role === 'OWNER' && ownerCount === 1
                        const canManage = isOwner && !isSelf
                        return (
                          <>
                            {canManage ? (
                              <Menu shadow="sm" width={160}>
                                <Menu.Target>
                                  <Badge
                                    size="sm"
                                    variant="light"
                                    color={roleColor[m.role as keyof typeof roleColor] ?? 'gray'}
                                    style={{ cursor: isLastOwner ? 'not-allowed' : 'pointer' }}
                                    rightSection={
                                      updateMemberRole.isPending && updateMemberRole.variables?.userId === m.user.id
                                        ? undefined
                                        : !isLastOwner ? <TbChevronDown size={10} /> : undefined
                                    }
                                  >
                                    {updateMemberRole.isPending && updateMemberRole.variables?.userId === m.user.id ? '…' : m.role}
                                  </Badge>
                                </Menu.Target>
                                {!isLastOwner && (
                                  <Menu.Dropdown>
                                    <Menu.Label>Ubah role</Menu.Label>
                                    {['VIEWER', 'EDITOR', 'OWNER'].filter(r => r !== m.role).map(r => (
                                      <Menu.Item
                                        key={r}
                                        leftSection={<TbShieldCheck size={13} />}
                                        color={roleColor[r as keyof typeof roleColor]}
                                        onClick={() => updateMemberRole.mutate({ userId: m.user.id, role: r })}
                                      >
                                        {r}
                                      </Menu.Item>
                                    ))}
                                  </Menu.Dropdown>
                                )}
                              </Menu>
                            ) : (
                              <Tooltip label={isSelf ? 'Role kamu sendiri' : isLastOwner ? 'Owner terakhir' : ''} disabled={!isSelf && !isLastOwner}>
                                <Badge size="sm" variant="light" color={roleColor[m.role as keyof typeof roleColor] ?? 'gray'}>
                                  {m.role}
                                </Badge>
                              </Tooltip>
                            )}

                            {canManage && !isLastOwner && (
                              <Tooltip label="Hapus member" position="left">
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color="red"
                                  onClick={() => removeMember(m.user.id, m.user.name)}
                                >
                                  <TbTrash size={13} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </>
                        )
                      })()}
                    </Group>
                  </Group>
                ))
              )}

              {isOwner && (
                <>
                  <Divider my="xs" label={
                    <Group gap="xs">
                      <TbUserPlus size={12} />
                      <Text size="xs">Invite member</Text>
                    </Group>
                  } labelPosition="left" />
                  <Group gap="xs" align="flex-start">
                    <Box style={{ flex: 1 }}>
                    <Combobox
                      store={combobox}
                      onOptionSubmit={val => {
                        setInviteUserId(val)
                        const u = invitableUsers.find(u => u.id === val)
                        setInviteSearch(u ? `${u.name} (${u.email})` : '')
                        combobox.closeDropdown()
                      }}
                    >
                      <Combobox.Target>
                        <InputBase
                          size="xs"
                          placeholder="Cari nama atau email..."
                          value={inviteSearch}
                          onChange={e => {
                            setInviteSearch(e.target.value)
                            setInviteUserId(null)
                            combobox.openDropdown()
                          }}
                          onFocus={() => combobox.openDropdown()}
                          onBlur={() => combobox.closeDropdown()}
                          rightSection={inviteUserId ? <TbUserPlus size={13} color="var(--mantine-color-teal-5)" /> : undefined}
                        />
                      </Combobox.Target>
                      <Combobox.Dropdown>
                        <Combobox.Options>
                          {invitableUsers.length === 0 ? (
                            <Combobox.Empty>
                              {debouncedSearch ? 'User tidak ditemukan' : 'Ketik untuk mencari user'}
                            </Combobox.Empty>
                          ) : (
                            invitableUsers.map(u => (
                              <Combobox.Option key={u.id} value={u.id}>
                                <Group gap="xs">
                                  <Avatar size={22} color="violet" radius="xl">
                                    {u.name?.charAt(0).toUpperCase()}
                                  </Avatar>
                                  <Box>
                                    <Text size="xs" fw={500}>{u.name}</Text>
                                    <Text size="xs" c="dimmed">{u.email}</Text>
                                  </Box>
                                </Group>
                              </Combobox.Option>
                            ))
                          )}
                        </Combobox.Options>
                      </Combobox.Dropdown>
                    </Combobox>
                    </Box>

                    <Select
                      size="xs"
                      value={inviteRole}
                      onChange={v => setInviteRole(v ?? 'VIEWER')}
                      data={[
                        { value: 'VIEWER', label: 'Viewer' },
                        { value: 'EDITOR', label: 'Editor' },
                        { value: 'OWNER', label: 'Owner' },
                      ]}
                      w={95}
                    />
                    <Button
                      size="xs"
                      leftSection={<TbUserPlus size={13} />}
                      onClick={() => addMember.mutate()}
                      loading={addMember.isPending}
                      disabled={!inviteUserId}
                    >
                      Invite
                    </Button>
                  </Group>
                  {addMember.isError && (
                    <Text size="xs" c="red">{(addMember.error as Error).message}</Text>
                  )}
                </>
              )}
            </Stack>
          )}
        </Tabs.Panel>
        {/* ── Notes tab ────────────────────── */}
        <Tabs.Panel value="notes">
          <NotesPanel
            slug={slug}
            canEdit={canEdit}
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

// ─── Notes types ──────────────────────────────────────────────────────────────

interface Note {
  id: string
  title: string
  body: string
  pinned: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
  author: { id: string; name: string }
}

// ─── NoteForm modal ───────────────────────────────────────────────────────────

function NoteForm({
  slug,
  note,
  onClose,
}: {
  slug: string
  note?: Note
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [preview, setPreview] = useState<'write' | 'preview'>('write')
  const [tagInput, setTagInput] = useState('')

  const save = useMutation({
    mutationFn: () => {
      if (note) {
        return apiFetch(`/api/envman/projects/${slug}/notes/${note.id}`, {
          method: 'PUT',
          body: JSON.stringify({ title, body, tags }),
        })
      }
      return apiFetch(`/api/envman/projects/${slug}/notes`, {
        method: 'POST',
        body: JSON.stringify({ title, body, tags }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] })
      notifyOk(note ? 'Note diperbarui' : 'Note dibuat')
      onClose()
    },
    onError: (e) => notifyErr(e),
  })

  const allTags = [...new Set([...tags, ...(tagInput.trim() ? [tagInput.trim()] : [])])]

  return (
    <Stack gap="sm">
      <TextInput
        label="Judul"
        placeholder="Judul note..."
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
      />

      <Box>
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={500}>Konten</Text>
          <SegmentedControl
            size="xs"
            value={preview}
            onChange={v => setPreview(v as 'write' | 'preview')}
            data={[
              { label: <Group gap={4}><TbEdit size={12} /><span>Write</span></Group>, value: 'write' },
              { label: <Group gap={4}><TbEye size={12} /><span>Preview</span></Group>, value: 'preview' },
            ]}
          />
        </Group>
        {preview === 'write' ? (
          <Textarea
            placeholder="Tulis catatan dalam format Markdown..."
            value={body}
            onChange={e => setBody(e.target.value)}
            minRows={12}
            maxRows={20}
            autosize
            styles={{ input: { fontFamily: 'monospace', fontSize: 13 } }}
          />
        ) : (
          <Paper withBorder p="md" mih={200} style={{ overflow: 'auto' }}>
            {body ? (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              </div>
            ) : (
              <Text size="sm" c="dimmed">Tidak ada konten.</Text>
            )}
          </Paper>
        )}
      </Box>

      <MultiSelect
        label="Tags"
        placeholder="Ketik lalu tekan Enter untuk tambah tag baru..."
        data={[...new Set([...tags, ...(tagInput ? [tagInput] : [])])]}
        value={tags}
        onChange={setTags}
        searchable
        searchValue={tagInput}
        onSearchChange={setTagInput}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
            e.preventDefault()
            const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
            if (t && !tags.includes(t)) setTags(prev => [...prev, t])
            setTagInput('')
          }
        }}
        leftSection={<TbTag size={13} />}
        clearable
      />

      <Group justify="flex-end" gap="xs" mt="xs">
        <Button type="button" variant="subtle" color="gray" onClick={onClose}>Batal</Button>
        <Button
          type="button"
          leftSection={<TbFileText size={14} />}
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!title.trim()}
        >
          {note ? 'Simpan' : 'Buat Note'}
        </Button>
      </Group>
    </Stack>
  )
}

// ─── NoteFormModal (di luar Tabs) ─────────────────────────────────────────────

function NoteFormModal({ slug, openNote, setOpenNote }: { slug: string; openNote: Note | null | 'new'; setOpenNote: (n: Note | null | 'new') => void }) {
  return (
    <Modal
      opened={openNote !== null}
      onClose={() => setOpenNote(null)}
      title={openNote === 'new' ? 'Buat Note Baru' : 'Edit Note'}
      size="xl"
      zIndex={300}
      styles={{ body: { paddingTop: 8 } }}
    >
      {openNote !== null && (
        <NoteForm
          slug={slug}
          note={openNote === 'new' ? undefined : openNote}
          onClose={() => setOpenNote(null)}
        />
      )}
    </Modal>
  )
}

// ─── NoteViewModal (di luar Tabs) ─────────────────────────────────────────────

function NoteViewModal({
  slug,
  note,
  onClose,
  canEditNote,
  onEdit,
  onDelete,
}: {
  slug: string
  note: Note | null
  onClose: () => void
  canEditNote: (note: Note) => boolean
  onEdit: (note: Note) => void
  onDelete: (note: Note) => void
}) {
  const qc = useQueryClient()

  function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'baru saja'
    if (m < 60) return `${m}m lalu`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}j lalu`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}h lalu`
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const deleteNote = (n: Note) =>
    modals.openConfirmModal({
      title: 'Hapus note',
      children: <Text size="sm">Hapus note <strong>{n.title}</strong>?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/notes/${n.id}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] }); onDelete(n); notifyOk('Note dihapus') })
          .catch(notifyErr),
    })

  return (
    <Modal
      opened={note !== null}
      onClose={onClose}
      title={
        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {note?.pinned && <TbBookmarkFilled size={16} color="var(--mantine-color-yellow-5)" />}
          <Text fw={700} size="md" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {note?.title}
          </Text>
        </Group>
      }
      size="xl"
      zIndex={300}
    >
      {note && (
        <Stack gap="sm">
          <Group gap="xs" wrap="wrap">
            {note.tags.map(t => (
              <Badge key={t} size="xs" variant="outline" color="violet" leftSection={<TbTag size={10} />}>{t}</Badge>
            ))}
            <Text size="xs" c="dimmed" ml="auto">
              oleh {note.author.name} · diperbarui {relTime(note.updatedAt)}
            </Text>
          </Group>
          <Paper withBorder p="md" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <div className="markdown-body" style={{ fontSize: 14 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body || '_Tidak ada konten._'}</ReactMarkdown>
            </div>
          </Paper>
          <Group justify="space-between" gap="xs">
            <CopyButton value={note.body} timeout={2000}>
              {({ copied, copy }) => (
                <Button
                  type="button"
                  size="xs"
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
                  leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                  onClick={copy}
                >
                  {copied ? 'Tersalin!' : 'Copy'}
                </Button>
              )}
            </CopyButton>
            {canEditNote(note) && (
              <Group gap="xs">
                <Button type="button" size="xs" variant="subtle" color="red" leftSection={<TbTrash size={13} />} onClick={() => deleteNote(note)}>
                  Hapus
                </Button>
                <Button type="button" size="xs" leftSection={<TbEdit size={13} />} onClick={() => onEdit(note)}>
                  Edit
                </Button>
              </Group>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

// ─── NotesPanel ───────────────────────────────────────────────────────────────

interface NotesPanelProps {
  slug: string
  canEdit: boolean
  isOwner: boolean
  myUserId: string
  openModal: Note | null | 'new'
  setOpenModal: (n: Note | null | 'new') => void
  viewNote: Note | null
  setViewNote: (n: Note | null) => void
}

function NotesPanel({ slug, canEdit, isOwner, myUserId, openModal, setOpenModal, viewNote, setViewNote }: NotesPanelProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated')

  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'notes', slug],
    queryFn: () => apiFetch<{ notes: Note[] }>(`/api/envman/projects/${slug}/notes`),
    refetchInterval: 30000,
  })
  const notes: Note[] = data?.notes ?? []

  const allTags = useMemo(() => [...new Set(notes.flatMap(n => n.tags))].sort(), [notes])

  const filtered = useMemo(() => {
    let list = [...notes]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q)))
    }
    if (tagFilter.length > 0) {
      list = list.filter(n => tagFilter.every(t => n.tags.includes(t)))
    }
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return list
  }, [notes, search, tagFilter, sort])

  const togglePin = (note: Note) =>
    apiFetch(`/api/envman/projects/${slug}/notes/${note.id}`, {
      method: 'PUT',
      body: JSON.stringify({ pinned: !note.pinned }),
    })
      .then(() => qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] }))
      .catch(notifyErr)

  const deleteNote = (note: Note) =>
    modals.openConfirmModal({
      title: 'Hapus note',
      children: <Text size="sm">Hapus note <strong>{note.title}</strong>?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/notes/${note.id}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] }); notifyOk('Note dihapus') })
          .catch(notifyErr),
    })

  const canEditNote = (note: Note) => isOwner || (canEdit && note.author.id === myUserId)

  function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'baru saja'
    if (m < 60) return `${m}m lalu`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}j lalu`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}h lalu`
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <Stack gap="sm">
      {/* ─── Toolbar ────────────────────────── */}
      <Group gap="xs">
        <TextInput
          size="xs"
          placeholder="Cari notes..."
          leftSection={<TbSearch size={13} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          rightSection={search ? <ActionIcon size="xs" variant="subtle" onClick={() => setSearch('')}><TbX size={11} /></ActionIcon> : undefined}
          style={{ flex: 1 }}
        />
        {allTags.length > 0 && (
          <MultiSelect
            size="xs"
            placeholder="Filter tag..."
            data={allTags}
            value={tagFilter}
            onChange={setTagFilter}
            leftSection={<TbTag size={13} />}
            clearable
            w={180}
          />
        )}
        <Select
          size="xs"
          w={130}
          leftSection={<TbSortAscending size={13} />}
          value={sort}
          onChange={v => setSort((v ?? 'updated') as typeof sort)}
          data={[
            { label: 'Terbaru edit', value: 'updated' },
            { label: 'Terbaru buat', value: 'created' },
            { label: 'Judul A-Z', value: 'title' },
          ]}
          allowDeselect={false}
        />
        {canEdit && (
          <Button type="button" size="xs" leftSection={<TbPlus size={13} />} onClick={() => setOpenModal('new')}>
            New Note
          </Button>
        )}
      </Group>

      {/* ─── Note list ───────────────────── */}
      {isLoading ? (
        <Stack gap="xs">
          {[1, 2, 3].map(i => <Skeleton key={i} height={72} radius="md" />)}
        </Stack>
      ) : notes.length === 0 ? (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={40} radius="xl" variant="light" color="violet" mx="auto" mb="sm">
            <TbNote size={20} />
          </ThemeIcon>
          <Text fw={500} mb={4}>Belum ada notes</Text>
          <Text size="sm" c="dimmed" mb="md">Buat catatan dalam Markdown untuk project ini.</Text>
          {canEdit && (
            <Button type="button" size="xs" leftSection={<TbPlus size={13} />} onClick={() => setOpenModal('new')}>
              Buat Note Pertama
            </Button>
          )}
        </Card>
      ) : filtered.length === 0 ? (
        <Card withBorder p="md" ta="center" style={{ borderStyle: 'dashed' }}>
          <Text size="sm" c="dimmed">Tidak ada note yang cocok.</Text>
          <Button type="button" size="xs" variant="subtle" mt="xs" onClick={() => { setSearch(''); setTagFilter([]) }}>Reset Filter</Button>
        </Card>
      ) : (
        <Stack gap="xs">
          {filtered.map(note => (
            <Card
              key={note.id}
              withBorder
              p="sm"
              style={{ cursor: 'pointer', borderLeft: note.pinned ? '3px solid var(--mantine-color-yellow-5)' : undefined }}
              onClick={() => setViewNote(note)}
            >
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs" mb={2} wrap="nowrap">
                    {note.pinned && <TbBookmarkFilled size={14} color="var(--mantine-color-yellow-5)" style={{ flexShrink: 0 }} />}
                    <Text fw={600} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {note.title}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={1} style={{ fontFamily: 'monospace' }}>
                    {note.body.replace(/#{1,6}\s|[*_`>-]/g, '').slice(0, 120) || '—'}
                  </Text>
                  <Group gap={4} mt={4} wrap="wrap">
                    {note.tags.map(t => (
                      <Badge key={t} size="xs" variant="outline" color="violet">{t}</Badge>
                    ))}
                    <Text size="xs" c="dimmed">
                      {note.author.name} · {relTime(note.updatedAt)}
                    </Text>
                  </Group>
                </Box>

                <Group gap={4} wrap="nowrap" onClick={e => e.stopPropagation()}>
                  <CopyButton value={note.body} timeout={2000}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? 'Tersalin!' : 'Copy'} position="left">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color={copied ? 'teal' : 'gray'}
                          onClick={e => { e.stopPropagation(); copy() }}
                        >
                          {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                  {(isOwner || (canEdit && note.author.id === myUserId)) && (
                    <Tooltip label={note.pinned ? 'Unpin' : 'Pin'} position="left">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color={note.pinned ? 'yellow' : 'gray'}
                        onClick={e => { e.stopPropagation(); togglePin(note) }}
                      >
                        {note.pinned ? <TbBookmarkFilled size={13} /> : <TbBookmark size={13} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {canEditNote(note) && (
                    <>
                      <Tooltip label="Edit" position="left">
                        <ActionIcon size="sm" variant="subtle" color="blue" onClick={e => { e.stopPropagation(); setOpenModal(note) }}>
                          <TbEdit size={13} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Hapus" position="left">
                        <ActionIcon size="sm" variant="subtle" color="red" onClick={e => { e.stopPropagation(); deleteNote(note) }}>
                          <TbTrash size={13} />
                        </ActionIcon>
                      </Tooltip>
                    </>
                  )}
                  <ActionIcon size="sm" variant="subtle" color="gray" onClick={e => { e.stopPropagation(); setViewNote(note) }}>
                    <TbChevronRight size={13} />
                  </ActionIcon>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
