import { ActionIcon, Badge, Box, Checkbox, Group, ScrollArea, Stack, Text, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbLock } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { type AccessMatrix, type EnvRole, effectiveColor, type ProjectRole, roleColor } from './types'

export function MembersMatrixView({
  slug,
  selected,
  onToggleSelect,
  onToggleAll,
  selectableIds,
}: {
  slug: string
  selected: Set<string>
  onToggleSelect: (userId: string) => void
  onToggleAll: (userIds: string[]) => void
  selectableIds?: Set<string>
}) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'access-matrix', slug],
    queryFn: () => apiFetch<AccessMatrix>(`/api/envman/projects/${slug}/access-matrix`),
    staleTime: 30_000,
  })

  const setEnvRoleMutation = useMutation({
    mutationFn: ({ userId, envName, role }: { userId: string; envName: string; role: EnvRole }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${envName}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    onSuccess: (_d, vars) => {
      notifyOk(`Akses ${vars.envName} diperbarui`)
      qc.invalidateQueries({ queryKey: ['envman', 'access-matrix', slug] })
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
    },
    onError: (e) => notifyErr(e),
  })

  if (isLoading) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        Memuat matrix...
      </Text>
    )
  }
  if (!data) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        Tidak ada data
      </Text>
    )
  }

  if (data.environments.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        Project ini belum punya environment. Tambah environment dulu untuk pakai matrix view.
      </Text>
    )
  }

  const allMemberIds = data.members.map((m) => m.userId)
  const selectableList = selectableIds ? allMemberIds.filter((id) => selectableIds.has(id)) : allMemberIds
  const allSelected = selectableList.length > 0 && selectableList.every((id) => selected.has(id))
  const someSelected = selectableList.some((id) => selected.has(id)) && !allSelected

  const cellWidth = 140
  const memberColWidth = 220

  const ROLE_BTNS: { value: EnvRole; label: string; short: string; color: string }[] = [
    { value: 'inherit', label: 'Inherit (ikut project)', short: '~', color: 'gray' },
    { value: 'VIEWER', label: 'Viewer', short: 'V', color: 'gray' },
    { value: 'EDITOR', label: 'Editor', short: 'E', color: 'teal' },
    { value: 'OWNER', label: 'Owner', short: 'O', color: 'blue' },
    { value: 'denied', label: 'Denied (blokir akses)', short: '✕', color: 'red' },
  ]

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Checkbox
          size="xs"
          checked={allSelected}
          indeterminate={someSelected}
          onChange={() => onToggleAll(selectableList)}
          label={
            <Text size="xs" fw={600}>
              {allSelected ? 'Batal semua' : `Pilih semua (${data.members.length})`}
            </Text>
          }
        />
        <Text size="xs" c="dimmed">
          {data.members.length} user × {data.environments.length} env
        </Text>
      </Group>

      <ScrollArea type="auto" offsetScrollbars>
        <Box style={{ minWidth: memberColWidth + cellWidth * data.environments.length }}>
          {/* Header */}
          <Group
            gap={0}
            wrap="nowrap"
            align="stretch"
            style={{ borderBottom: '2px solid var(--mantine-color-default-border)' }}
          >
            <Box
              style={{
                width: memberColWidth,
                padding: 8,
                position: 'sticky',
                left: 0,
                zIndex: 2,
                background: 'var(--mantine-color-body)',
              }}
            >
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                Anggota
              </Text>
            </Box>
            {data.environments.map((env) => (
              <Box
                key={env.name}
                style={{
                  width: cellWidth,
                  padding: 8,
                  borderLeft: '1px solid var(--mantine-color-default-border)',
                  textAlign: 'center',
                }}
              >
                <Text size="xs" fw={700} truncate>
                  {env.name}
                </Text>
              </Box>
            ))}
          </Group>

          {/* Rows */}
          {data.members.map((m) => (
            <Group
              key={m.userId}
              gap={0}
              wrap="nowrap"
              align="stretch"
              style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
            >
              <Group
                gap="xs"
                wrap="nowrap"
                p={6}
                style={{
                  width: memberColWidth,
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  background: 'var(--mantine-color-body)',
                  borderRight: '1px solid var(--mantine-color-default-border)',
                }}
              >
                <Checkbox
                  size="xs"
                  checked={selected.has(m.userId)}
                  disabled={selectableIds ? !selectableIds.has(m.userId) : false}
                  onChange={() => onToggleSelect(m.userId)}
                />
                <UserAvatar user={m.user} size={22} color={roleColor[m.projectRole]} />
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="xs" fw={600} truncate>
                    {m.user.name}
                  </Text>
                  <Group gap={4}>
                    <Badge size="xs" variant="light" color={roleColor[m.projectRole]}>
                      {m.projectRole}
                    </Badge>
                  </Group>
                </Box>
              </Group>
              {data.environments.map((env) => {
                const cell = m.envAccess[env.name]
                const eff: ProjectRole | 'DENIED' = cell?.effectiveRole ?? 'DENIED'
                const isDenied = cell?.effectiveRole === null
                return (
                  <Box
                    key={env.name}
                    style={{
                      width: cellWidth,
                      padding: 6,
                      borderLeft: '1px solid var(--mantine-color-default-border)',
                    }}
                  >
                    <Stack gap={4} align="center">
                      <Badge
                        size="xs"
                        fullWidth
                        variant={isDenied ? 'filled' : 'light'}
                        color={effectiveColor[eff] ?? 'gray'}
                        leftSection={isDenied ? <TbLock size={9} /> : null}
                      >
                        {eff}
                      </Badge>
                      <Group gap={2} wrap="nowrap">
                        {ROLE_BTNS.map((btn) => {
                          const current = cell?.envRole ?? 'denied'
                          const isActive = current === btn.value
                          return (
                            <Tooltip key={btn.value} label={btn.label} withArrow fz="xs">
                              <ActionIcon
                                size={18}
                                variant={isActive ? 'filled' : 'subtle'}
                                color={isActive ? btn.color : 'gray'}
                                disabled={setEnvRoleMutation.isPending}
                                onClick={() => {
                                  if (!isActive)
                                    setEnvRoleMutation.mutate({ userId: m.userId, envName: env.name, role: btn.value })
                                }}
                                style={{ fontSize: 10, fontWeight: 700 }}
                              >
                                {btn.short}
                              </ActionIcon>
                            </Tooltip>
                          )
                        })}
                      </Group>
                    </Stack>
                  </Box>
                )
              })}
            </Group>
          ))}
        </Box>
      </ScrollArea>
    </Stack>
  )
}
