import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Combobox,
  Divider,
  Group,
  InputBase,
  Menu,
  Select,
  Skeleton,
  Stack,
  Tabs,
  Text,
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
import { useSession } from '@/frontend/hooks/useAuth'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { apiFetch } from '@/frontend/lib/api'
import {
  TbChevronRight,
  TbChevronDown,
  TbPlus,
  TbSearch,
  TbShieldCheck,
  TbSortAscending,
  TbTrash,
  TbUserPlus,
  TbUsers,
  TbVariable,
  TbX,
} from 'react-icons/tb'

export const Route = createFileRoute('/envmanager/$slug/')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ['environments', 'members'].includes(search.tab as string)
      ? (search.tab as 'environments' | 'members')
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
    navigate({ to: '/envmanager/$slug', params: { slug }, search: prev => ({ ...prev, tab: t as 'environments' | 'members' }) })

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
      </Tabs>
    </Box>
  )
}
