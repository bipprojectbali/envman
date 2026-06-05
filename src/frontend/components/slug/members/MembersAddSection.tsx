import { Box, Button, Checkbox, Divider, Group, Paper, ScrollArea, Select, Stack, Text, TextInput } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbPlus, TbSearch } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { type AvailableUser, type ProjectRole, roleOptions, toggle } from './types'

export function MembersAddSection({ slug, onAdded }: { slug: string; onAdded: () => void }) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set())
  const [addRole, setAddRole] = useState<ProjectRole>('VIEWER')

  const { data: availableData, isLoading: loadingAvailable } = useQuery({
    queryKey: ['envman', 'available-users', slug],
    queryFn: () => apiFetch<{ users: AvailableUser[] }>(`/api/envman/projects/${slug}/available-users`),
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
      qc.invalidateQueries({ queryKey: ['envman', 'access-matrix', slug] })
      onAdded()
    },
    onError: (e) => notifyErr(e),
  })

  return (
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
  )
}
