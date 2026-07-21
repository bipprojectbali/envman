import { Badge, Box, Checkbox, Group, ScrollArea, Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { AccessRoleCell } from './AccessRoleCell'
import { MatrixFilterBar } from './MatrixFilterBar'
import { type AccessMatrix, type EnvRole, roleColor } from './types'

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
  const [memberQuery, setMemberQuery] = useState('')
  const [envQuery, setEnvQuery] = useState('')
  const [envTag, setEnvTag] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'access-matrix', slug],
    queryFn: () => apiFetch<AccessMatrix>(`/api/envman/projects/${slug}/access-matrix`),
    staleTime: 30_000,
  })

  // Tag env unik untuk dropdown filter kolom.
  const envTagOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of data?.environments ?? []) for (const t of e.tags ?? []) set.add(t)
    return [...set].sort().map((t) => ({ value: t, label: t }))
  }, [data])

  // Saran autocomplete: nama anggota & nama env (ketik bebas tetap didukung).
  const memberOptions = useMemo(() => [...new Set((data?.members ?? []).map((m) => m.user.name))].sort(), [data])
  const envOptions = useMemo(() => (data?.environments ?? []).map((e) => e.name).sort(), [data])

  // Filter baris (anggota) by nama/email, dan kolom (env) by nama + tag.
  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    if (!q) return data?.members ?? []
    return (data?.members ?? []).filter(
      (m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q),
    )
  }, [data, memberQuery])

  const filteredEnvs = useMemo(() => {
    const q = envQuery.trim().toLowerCase()
    return (data?.environments ?? []).filter(
      (e) => (!q || e.name.toLowerCase().includes(q)) && (!envTag || (e.tags ?? []).includes(envTag)),
    )
  }, [data, envQuery, envTag])

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

  // "Pilih semua" hanya menyentuh anggota yang lolos filter (terlihat).
  const allMemberIds = filteredMembers.map((m) => m.userId)
  const selectableList = selectableIds ? allMemberIds.filter((id) => selectableIds.has(id)) : allMemberIds
  const allSelected = selectableList.length > 0 && selectableList.every((id) => selected.has(id))
  const someSelected = selectableList.some((id) => selected.has(id)) && !allSelected
  const hasFilter = memberQuery.trim() !== '' || envQuery.trim() !== '' || envTag !== null

  const cellWidth = 150
  const memberColWidth = 220

  return (
    <Stack gap="xs">
      <MatrixFilterBar
        memberQuery={memberQuery}
        setMemberQuery={setMemberQuery}
        envQuery={envQuery}
        setEnvQuery={setEnvQuery}
        envTag={envTag}
        setEnvTag={setEnvTag}
        envTagOptions={envTagOptions}
        memberOptions={memberOptions}
        envOptions={envOptions}
        hasFilter={hasFilter}
        onReset={() => {
          setMemberQuery('')
          setEnvQuery('')
          setEnvTag(null)
        }}
      />

      <Group justify="space-between" align="center">
        <Checkbox
          size="xs"
          checked={allSelected}
          indeterminate={someSelected}
          onChange={() => onToggleAll(selectableList)}
          label={
            <Text size="xs" fw={600}>
              {allSelected ? 'Batal semua' : `Pilih semua (${filteredMembers.length})`}
            </Text>
          }
        />
        <Text size="xs" c="dimmed">
          {hasFilter
            ? `${filteredMembers.length}/${data.members.length} user · ${filteredEnvs.length}/${data.environments.length} env`
            : `${data.members.length} user × ${data.environments.length} env`}
        </Text>
      </Group>

      <ScrollArea type="auto" offsetScrollbars>
        <Box style={{ minWidth: memberColWidth + cellWidth * filteredEnvs.length }}>
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
            {filteredEnvs.map((env) => (
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
          {filteredMembers.map((m) => (
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
              {filteredEnvs.map((env) => {
                const cell = m.envAccess[env.name]
                const isDenied = cell?.effectiveRole === null
                return (
                  <Box
                    key={env.name}
                    style={{
                      width: cellWidth,
                      padding: 6,
                      display: 'flex',
                      alignItems: 'center',
                      borderLeft: '1px solid var(--mantine-color-default-border)',
                      // Tint merah tipis menandai env yang diblokir (denied) — sinyal
                      // keamanan tetap terlihat sekilas.
                      background: isDenied ? 'var(--mantine-color-red-light)' : undefined,
                    }}
                  >
                    <Box style={{ flex: 1 }}>
                      <AccessRoleCell
                        value={cell?.envRole ?? 'inherit'}
                        effectiveRole={cell?.effectiveRole ?? null}
                        disabled={setEnvRoleMutation.isPending}
                        onChange={(role) => setEnvRoleMutation.mutate({ userId: m.userId, envName: env.name, role })}
                      />
                    </Box>
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
