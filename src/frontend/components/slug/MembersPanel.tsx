import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbPlus, TbSearch, TbTrash } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER'

interface Member {
  id: string
  role: ProjectRole
  user: { id: string; name: string; email: string }
}

interface AvailableUser {
  id: string
  name: string
  email: string
}

const roleColor: Record<ProjectRole, string> = { OWNER: 'blue', EDITOR: 'teal', VIEWER: 'gray' }
const roleOptions = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Viewer' },
]

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function MembersPanel({
  slug,
  members,
  isOwner,
  myUserId,
  onRefresh,
}: {
  slug: string
  members: Member[]
  isOwner: boolean
  myUserId: string
  onRefresh: () => void
}) {
  const qc = useQueryClient()

  const [filter, setFilter] = useState('')
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set())
  const [addRole, setAddRole] = useState<ProjectRole>('VIEWER')
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set())

  const { data: availableData, isLoading: loadingAvailable } = useQuery({
    queryKey: ['envman', 'available-users', slug],
    queryFn: () => apiFetch<{ users: AvailableUser[] }>(`/api/envman/projects/${slug}/available-users`),
    enabled: isOwner,
    staleTime: 30_000,
  })

  const allAvailable = availableData?.users ?? []
  const q = filter.trim().toLowerCase()
  const available = q
    ? allAvailable.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : allAvailable

  const allAddSelected = available.length > 0 && available.every((u) => selectedToAdd.has(u.id))
  const someAddSelected = available.some((u) => selectedToAdd.has(u.id)) && !allAddSelected

  const toggleAllAdd = () => setSelectedToAdd(allAddSelected ? new Set() : new Set(available.map((u) => u.id)))

  const ownerCount = members.filter((m) => m.role === 'OWNER').length
  const deletable = members.filter((m) => !(m.role === 'OWNER' && ownerCount === 1))
  const allDeleteSelected = deletable.length > 0 && deletable.every((m) => selectedToDelete.has(m.user.id))
  const someDeleteSelected = deletable.some((m) => selectedToDelete.has(m.user.id)) && !allDeleteSelected

  const toggleAllDelete = () =>
    setSelectedToDelete(allDeleteSelected ? new Set() : new Set(deletable.map((m) => m.user.id)))

  const addMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        [...selectedToAdd].map((userId) =>
          apiFetch(`/api/envman/projects/${slug}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId, role: addRole }),
          }),
        ),
      )
    },
    onSuccess: () => {
      notifyOk(`${selectedToAdd.size} anggota berhasil ditambahkan`)
      setSelectedToAdd(new Set())
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
      qc.invalidateQueries({ queryKey: ['envman', 'available-users', slug] })
      onRefresh()
    },
    onError: (e) => notifyErr(e),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      await Promise.all(
        userIds.map((userId) => apiFetch(`/api/envman/projects/${slug}/members/${userId}`, { method: 'DELETE' })),
      )
    },
    onSuccess: (_d, userIds) => {
      notifyOk(`${userIds.length} anggota berhasil dihapus`)
      setSelectedToDelete(new Set())
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
      onRefresh()
    },
    onError: (e) => notifyErr(e),
  })

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) =>
      apiFetch(`/api/envman/projects/${slug}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
      onRefresh()
    },
    onError: (e) => notifyErr(e),
  })

  const confirmBulkDelete = () => {
    const ids = [...selectedToDelete]
    const names = members.filter((m) => ids.includes(m.user.id)).map((m) => m.user.name)
    modals.openConfirmModal({
      title: `Hapus ${ids.length} Anggota`,
      children: (
        <Text size="sm">
          Hapus <strong>{names.join(', ')}</strong> dari project ini?
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => bulkDeleteMutation.mutate(ids),
    })
  }

  const confirmSingleDelete = (m: Member) =>
    modals.openConfirmModal({
      title: 'Hapus Anggota',
      children: (
        <Text size="sm">
          Hapus <strong>{m.user.name}</strong> dari project ini?
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => bulkDeleteMutation.mutate([m.user.id]),
    })

  return (
    <Stack gap="md">
      {/* ── Add section ── */}
      {isOwner && (
        <Paper withBorder p="sm" radius="md">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="sm" style={{ letterSpacing: '0.06em' }}>
            Tambah Anggota
          </Text>

          {loadingAvailable ? (
            <Text size="sm" c="dimmed">
              Memuat user...
            </Text>
          ) : allAvailable.length === 0 ? (
            <Text size="sm" c="dimmed">
              Semua user sudah menjadi anggota.
            </Text>
          ) : (
            <>
              <TextInput
                size="xs"
                placeholder="Filter nama atau email..."
                value={filter}
                onChange={(e) => setFilter(e.currentTarget.value)}
                leftSection={<TbSearch size={12} />}
                mb="xs"
              />

              <Group justify="space-between" align="center" mb="xs">
                <Checkbox
                  size="xs"
                  label={
                    <Text size="xs" fw={600}>
                      {allAddSelected ? 'Batal semua' : `Pilih semua (${available.length})`}
                    </Text>
                  }
                  checked={allAddSelected}
                  indeterminate={someAddSelected}
                  onChange={toggleAllAdd}
                />
                <Group gap={6} align="center">
                  <Text size="xs" c="dimmed">
                    Role:
                  </Text>
                  <Select
                    size="xs"
                    data={roleOptions}
                    value={addRole}
                    onChange={(v) => v && setAddRole(v as ProjectRole)}
                    w={90}
                    allowDeselect={false}
                  />
                </Group>
              </Group>

              <Divider mb="xs" />

              <ScrollArea.Autosize mah={200} type="scroll">
                <Stack gap={2}>
                  {available.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" py="xs">
                      Tidak ada hasil
                    </Text>
                  ) : (
                    available.map((u) => (
                      <Group
                        key={u.id}
                        gap="xs"
                        wrap="nowrap"
                        align="center"
                        px={4}
                        py={4}
                        style={{ cursor: 'pointer', borderRadius: 'var(--mantine-radius-xs)' }}
                        onClick={() => setSelectedToAdd((prev) => toggle(prev, u.id))}
                      >
                        <Checkbox
                          size="xs"
                          checked={selectedToAdd.has(u.id)}
                          onChange={() => setSelectedToAdd((prev) => toggle(prev, u.id))}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <UserAvatar user={u} size={22} color="blue" />
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Text size="xs" fw={600} truncate>
                            {u.name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {u.email}
                          </Text>
                        </Box>
                      </Group>
                    ))
                  )}
                </Stack>
              </ScrollArea.Autosize>

              {selectedToAdd.size > 0 && (
                <Group justify="flex-end" mt="sm">
                  <Button
                    size="xs"
                    leftSection={<TbPlus size={12} />}
                    loading={addMutation.isPending}
                    onClick={() => addMutation.mutate()}
                  >
                    Tambah {selectedToAdd.size} anggota
                  </Button>
                </Group>
              )}
            </>
          )}
        </Paper>
      )}

      {/* ── Members list ── */}
      <Stack gap="xs">
        {isOwner && members.length > 0 && (
          <Group justify="space-between" align="center">
            <Checkbox
              size="xs"
              label={
                <Text size="xs" fw={600}>
                  Semua ({members.length})
                </Text>
              }
              checked={allDeleteSelected}
              indeterminate={someDeleteSelected}
              onChange={toggleAllDelete}
              disabled={deletable.length === 0}
            />
            {selectedToDelete.size > 0 && (
              <Button
                size="xs"
                color="red"
                variant="light"
                leftSection={<TbTrash size={12} />}
                loading={bulkDeleteMutation.isPending}
                onClick={confirmBulkDelete}
              >
                Hapus {selectedToDelete.size}
              </Button>
            )}
          </Group>
        )}

        {members.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            Belum ada anggota
          </Text>
        ) : (
          members.map((m) => {
            const isSelf = m.user.id === myUserId
            const isLastOwner = m.role === 'OWNER' && ownerCount === 1
            return (
              <Group
                key={m.id}
                gap="sm"
                wrap="nowrap"
                align="center"
                p="xs"
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-sm)',
                }}
              >
                {isOwner && (
                  <Checkbox
                    size="xs"
                    checked={selectedToDelete.has(m.user.id)}
                    disabled={isLastOwner}
                    onChange={() => !isLastOwner && setSelectedToDelete((prev) => toggle(prev, m.user.id))}
                  />
                )}
                <UserAvatar user={m.user} size={32} color={roleColor[m.role]} />
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap" align="center">
                    <Text size="sm" fw={600} truncate>
                      {m.user.name}
                    </Text>
                    {isSelf && (
                      <Badge size="xs" variant="outline" color="gray">
                        kamu
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" truncate>
                    {m.user.email}
                  </Text>
                </Box>
                {isOwner ? (
                  <Select
                    size="xs"
                    data={roleOptions}
                    value={m.role}
                    onChange={(v) => {
                      if (v && v !== m.role) changeRoleMutation.mutate({ userId: m.user.id, role: v as ProjectRole })
                    }}
                    w={100}
                    allowDeselect={false}
                    disabled={isLastOwner}
                  />
                ) : (
                  <Badge size="sm" variant="light" color={roleColor[m.role]}>
                    {m.role}
                  </Badge>
                )}
                {isOwner && (
                  <Tooltip label={isLastOwner ? 'Owner terakhir tidak bisa dihapus' : 'Hapus anggota'} withArrow>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      disabled={isLastOwner}
                      onClick={() => confirmSingleDelete(m)}
                    >
                      <TbTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            )
          })
        )}
      </Stack>
    </Stack>
  )
}
