import { Badge, Box, Checkbox, Group, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbSearch } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { apiFetch } from '@/frontend/lib/api'
import { notifyBulkResult, runBulk } from '@/frontend/lib/bulk'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { AccessRoleCell } from './AccessRoleCell'
import { EnvAccessCell } from './EnvAccessCell'
import { TagScopeEditor } from './TagScopeEditor'
import {
  type AccessMatrix as EnvMatrix,
  type EnvRole,
  type ProjectRole,
  roleColor,
  type SectionMatrix,
  type SectionName,
  type SectionRole,
  sectionLabel,
} from './types'

const ENV_COL_WIDTH = 160
const SECTION_COL_WIDTH = 150
const MEMBER_COL_WIDTH = 220

// Satu matrix akses menyatukan Environments + Sections (Notes/Aliases/Files/
// Storage). Kolom pertama = Environments (satu kolom untuk semua env, via
// EnvAccessCell popover) mengikuti urutan tab; sisanya 4 section tetap.
export function AccessMatrix({
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

  const envQ = useQuery({
    queryKey: ['envman', 'access-matrix', slug],
    queryFn: () => apiFetch<EnvMatrix>(`/api/envman/projects/${slug}/access-matrix`),
    staleTime: 30_000,
  })
  const secQ = useQuery({
    queryKey: ['envman', 'section-matrix', slug],
    queryFn: () => apiFetch<SectionMatrix>(`/api/envman/projects/${slug}/section-matrix`),
    staleTime: 30_000,
  })

  const setEnvRole = useMutation({
    mutationFn: ({ userId, envName, role }: { userId: string; envName: string; role: EnvRole }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${envName}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    onSuccess: (_d, v) => {
      notifyOk(`Akses ${v.envName} diperbarui`)
      qc.invalidateQueries({ queryKey: ['envman', 'access-matrix', slug] })
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
    },
    onError: (e) => notifyErr(e),
  })

  // Bulk apply satu role ke banyak env sekaligus (fan-out PUT via runBulk),
  // lalu satu invalidate + satu notif ringkas — jauh lebih hemat daripada
  // memanggil setEnvRole 21×.
  const setEnvRoleBulk = useMutation({
    mutationFn: async ({ userId, envNames, role }: { userId: string; envNames: string[]; role: EnvRole }) => {
      const summary = await runBulk(envNames, (envName) =>
        apiFetch(`/api/envman/projects/${slug}/environments/${envName}/members/${userId}`, {
          method: 'PUT',
          body: JSON.stringify({ role }),
        }),
      )
      return summary
    },
    onSuccess: (summary) => {
      notifyBulkResult(
        summary,
        (n) => `${n} env diperbarui`,
        (n) => `${n} env gagal`,
      )
      qc.invalidateQueries({ queryKey: ['envman', 'access-matrix', slug] })
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
    },
    onError: (e) => notifyErr(e),
  })

  const setSectionRole = useMutation({
    mutationFn: ({
      userId,
      section,
      role,
      scopeTags,
    }: {
      userId: string
      section: string
      role: SectionRole
      scopeTags?: string[]
    }) =>
      apiFetch(`/api/envman/projects/${slug}/sections/${section}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(scopeTags !== undefined ? { role, scopeTags } : { role }),
      }),
    onSuccess: (_d, v) => {
      notifyOk(`Akses ${sectionLabel[v.section as SectionName]} diperbarui`)
      qc.invalidateQueries({ queryKey: ['envman', 'section-matrix', slug] })
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
    },
    onError: (e) => notifyErr(e),
  })

  // Gabung dua matrix per userId. access-matrix = source kebenaran daftar member.
  const merged = useMemo(() => {
    if (!envQ.data) return []
    const secByUser = new Map((secQ.data?.members ?? []).map((m) => [m.userId, m]))
    return envQ.data.members.map((em) => ({
      userId: em.userId,
      user: em.user,
      projectRole: em.projectRole,
      envAccess: em.envAccess,
      sectionAccess: secByUser.get(em.userId)?.sectionAccess ?? {},
    }))
  }, [envQ.data, secQ.data])

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    if (!q) return merged
    return merged.filter((m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q))
  }, [merged, memberQuery])

  if (envQ.isLoading || secQ.isLoading) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        Memuat matrix…
      </Text>
    )
  }
  if (!envQ.data) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        Tidak ada data
      </Text>
    )
  }

  const environments = envQ.data.environments
  const sections = secQ.data?.sections ?? (['NOTES', 'ALIASES', 'FILES', 'STORAGE'] as SectionName[])
  const availableTags = secQ.data?.availableTags ?? {}

  const allIds = filteredMembers.map((m) => m.userId)
  const selectableList = selectableIds ? allIds.filter((id) => selectableIds.has(id)) : allIds
  const allSelected = selectableList.length > 0 && selectableList.every((id) => selected.has(id))
  const someSelected = selectableList.some((id) => selected.has(id)) && !allSelected

  const gridMinWidth = MEMBER_COL_WIDTH + ENV_COL_WIDTH + SECTION_COL_WIDTH * sections.length

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <TextInput
          size="xs"
          w={240}
          placeholder="Cari anggota…"
          leftSection={<TbSearch size={13} />}
          value={memberQuery}
          onChange={(e) => setMemberQuery(e.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          {filteredMembers.length}/{merged.length} anggota · {environments.length} env · {sections.length} section
        </Text>
      </Group>

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

      <ScrollArea type="auto" offsetScrollbars>
        <Box style={{ minWidth: gridMinWidth }}>
          {/* Header */}
          <Group
            gap={0}
            wrap="nowrap"
            align="stretch"
            style={{ borderBottom: '2px solid var(--mantine-color-default-border)' }}
          >
            <HeaderCell width={MEMBER_COL_WIDTH} sticky label="Anggota" />
            <HeaderCell width={ENV_COL_WIDTH} label="Environments" />
            {sections.map((s) => (
              <HeaderCell key={s} width={SECTION_COL_WIDTH} label={sectionLabel[s]} />
            ))}
          </Group>

          {/* Rows */}
          {filteredMembers.map((m) => {
            const isProjectOwner = m.projectRole === 'OWNER'
            return (
              <Group
                key={m.userId}
                gap={0}
                wrap="nowrap"
                align="stretch"
                style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
              >
                {/* Member (sticky) */}
                <Group
                  gap="xs"
                  wrap="nowrap"
                  p={6}
                  style={{
                    width: MEMBER_COL_WIDTH,
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
                    <Badge size="xs" variant="light" color={roleColor[m.projectRole]}>
                      {m.projectRole}
                    </Badge>
                  </Box>
                </Group>

                {/* Environments (satu kolom untuk semua env) */}
                <Box
                  style={{
                    width: ENV_COL_WIDTH,
                    padding: 6,
                    display: 'flex',
                    alignItems: 'center',
                    borderLeft: '1px solid var(--mantine-color-default-border)',
                  }}
                >
                  <Box style={{ flex: 1 }}>
                    <EnvAccessCell
                      environments={environments}
                      envAccess={m.envAccess}
                      projectRole={m.projectRole as ProjectRole}
                      disabled={setEnvRole.isPending || setEnvRoleBulk.isPending}
                      onChange={(envName, role) => setEnvRole.mutate({ userId: m.userId, envName, role })}
                      onBulkChange={(envNames, role) => setEnvRoleBulk.mutate({ userId: m.userId, envNames, role })}
                    />
                  </Box>
                </Box>

                {/* Sections */}
                {sections.map((section) => {
                  const cell = m.sectionAccess[section]
                  const isDenied = cell?.effectiveRole === null
                  return (
                    <Box
                      key={section}
                      style={{
                        width: SECTION_COL_WIDTH,
                        padding: 6,
                        borderLeft: '1px solid var(--mantine-color-default-border)',
                        background: isDenied ? 'var(--mantine-color-red-light)' : undefined,
                      }}
                    >
                      <AccessRoleCell
                        value={isProjectOwner ? 'inherit' : (cell?.sectionRole ?? 'inherit')}
                        effectiveRole={cell?.effectiveRole ?? null}
                        disabled={setSectionRole.isPending}
                        locked={isProjectOwner}
                        onChange={(role) => setSectionRole.mutate({ userId: m.userId, section, role })}
                      />
                      {/* Tag-scope hanya saat role di-grant EKSPLISIT (bukan inherit/denied). */}
                      {!isProjectOwner && cell && cell.effectiveRole !== null && cell.sectionRole !== 'inherit' && (
                        <Box mt={4} style={{ display: 'flex', justifyContent: 'center' }}>
                          <TagScopeEditor
                            scopeTags={cell.scopeTags ?? []}
                            suggestions={availableTags[section] ?? []}
                            disabled={setSectionRole.isPending}
                            onSave={(tags) =>
                              setSectionRole.mutate({
                                userId: m.userId,
                                section,
                                role: cell.sectionRole,
                                scopeTags: tags,
                              })
                            }
                          />
                        </Box>
                      )}
                    </Box>
                  )
                })}
              </Group>
            )
          })}
        </Box>
      </ScrollArea>
    </Stack>
  )
}

function HeaderCell({ width, label, sticky }: { width: number; label: string; sticky?: boolean }) {
  return (
    <Box
      style={{
        width,
        padding: 8,
        textAlign: sticky ? 'left' : 'center',
        borderLeft: sticky ? undefined : '1px solid var(--mantine-color-default-border)',
        position: sticky ? 'sticky' : undefined,
        left: sticky ? 0 : undefined,
        zIndex: sticky ? 2 : undefined,
        background: sticky ? 'var(--mantine-color-body)' : undefined,
      }}
    >
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" truncate>
        {label}
      </Text>
    </Box>
  )
}
