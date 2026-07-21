import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Popover,
  ScrollArea,
  Stack,
  TagsInput,
  Text,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbLock, TbTag } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { MatrixLegend } from './MatrixLegend'
import { roleColor, type SectionMatrix, type SectionRole, sectionLabel } from './types'

// Matrix member × section (Notes/Aliases/Files/Storage) — analog MembersMatrixView.
// Section kolomnya fixed 4, tanpa filter/tag; ikon role sama persis (~ V E O ✕).
export function SectionMatrixView({ slug }: { slug: string }) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'section-matrix', slug],
    queryFn: () => apiFetch<SectionMatrix>(`/api/envman/projects/${slug}/section-matrix`),
    staleTime: 30_000,
  })

  const setRoleMutation = useMutation({
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
    onSuccess: (_d, vars) => {
      notifyOk(`Akses ${sectionLabel[vars.section as keyof typeof sectionLabel]} diperbarui`)
      qc.invalidateQueries({ queryKey: ['envman', 'section-matrix', slug] })
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

  const cellWidth = 150
  const memberColWidth = 220

  const ROLE_BTNS: { value: SectionRole; label: string; short: string; color: string }[] = [
    { value: 'inherit', label: 'Inherit (ikut project)', short: '~', color: 'gray' },
    { value: 'VIEWER', label: 'Viewer', short: 'V', color: 'gray' },
    { value: 'EDITOR', label: 'Editor', short: 'E', color: 'teal' },
    { value: 'OWNER', label: 'Owner', short: 'O', color: 'blue' },
    { value: 'denied', label: 'Denied (blokir akses)', short: '✕', color: 'red' },
  ]

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="xs" c="dimmed" fw={600}>
          Akses per-section (Notes / Aliases / Files / Storage)
        </Text>
        <Text size="xs" c="dimmed">
          {data.members.length} user × {data.sections.length} section
        </Text>
      </Group>

      <MatrixLegend />

      <ScrollArea type="auto" offsetScrollbars>
        <Box style={{ minWidth: memberColWidth + cellWidth * data.sections.length }}>
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
            {data.sections.map((section) => (
              <Box
                key={section}
                style={{
                  width: cellWidth,
                  padding: 8,
                  borderLeft: '1px solid var(--mantine-color-default-border)',
                  textAlign: 'center',
                }}
              >
                <Text size="xs" fw={700} truncate>
                  {sectionLabel[section]}
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
              {data.sections.map((section) => {
                const cell = m.sectionAccess[section]
                const isDenied = cell?.effectiveRole === null
                return (
                  <Box
                    key={section}
                    style={{
                      width: cellWidth,
                      padding: 6,
                      borderLeft: '1px solid var(--mantine-color-default-border)',
                      background: isDenied ? 'var(--mantine-color-red-light)' : undefined,
                    }}
                  >
                    <Group gap={2} wrap="nowrap" justify="center">
                      {isDenied && (
                        <Tooltip label="Akses diblokir di section ini" withArrow fz="xs">
                          <Text span c="red" style={{ display: 'flex', alignItems: 'center' }}>
                            <TbLock size={11} />
                          </Text>
                        </Tooltip>
                      )}
                      {ROLE_BTNS.map((btn) => {
                        const current = cell?.sectionRole ?? 'denied'
                        const isActive = current === btn.value
                        return (
                          <Tooltip key={btn.value} label={btn.label} withArrow fz="xs">
                            <ActionIcon
                              size={18}
                              variant={isActive ? 'filled' : 'subtle'}
                              color={isActive ? btn.color : 'gray'}
                              disabled={setRoleMutation.isPending}
                              onClick={() => {
                                if (!isActive) setRoleMutation.mutate({ userId: m.userId, section, role: btn.value })
                              }}
                              style={{ fontSize: 10, fontWeight: 700 }}
                            >
                              {btn.short}
                            </ActionIcon>
                          </Tooltip>
                        )
                      })}
                    </Group>
                    {/* Tag-scope editor: hanya saat role di-grant EKSPLISIT di section
                        (bukan denied, bukan inherit). Server mengabaikan scopeTags saat
                        inherit (role dihapus), jadi menampilkan editor di sana menyesatkan. */}
                    {cell && cell.effectiveRole !== null && cell.sectionRole !== 'inherit' && (
                      <Box mt={4} style={{ display: 'flex', justifyContent: 'center' }}>
                        <TagScopeEditor
                          scopeTags={cell.scopeTags ?? []}
                          suggestions={data.availableTags?.[section] ?? []}
                          disabled={setRoleMutation.isPending}
                          onSave={(tags) =>
                            setRoleMutation.mutate({
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
          ))}
        </Box>
      </ScrollArea>
    </Stack>
  )
}

// TagScopeEditor: badge "Full"/"N tag" yang membuka Popover berisi TagsInput.
// Kosong = full access (lihat semua item). Isi = limit-by-tag (OR).
function TagScopeEditor({
  scopeTags,
  suggestions,
  disabled,
  onSave,
}: {
  scopeTags: string[]
  suggestions: string[]
  disabled: boolean
  onSave: (tags: string[]) => void
}) {
  const [opened, setOpened] = useState(false)
  const [draft, setDraft] = useState<string[]>(scopeTags)
  const limited = scopeTags.length > 0

  // Auto-save on every change — no Save button (the suggestion dropdown could
  // cover it in the narrow popover). Each add/remove persists immediately, like
  // the role buttons. Dedupe + trim + drop empties.
  const apply = (tags: string[]) => {
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
    setDraft(clean)
    onSave(clean)
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      width={220}
      position="bottom"
      withArrow
      trapFocus
      onOpen={() => setDraft(scopeTags)}
    >
      <Popover.Target>
        <Tooltip label={limited ? `Limit tag: ${scopeTags.join(', ')}` : 'Full access (semua item)'} withArrow fz="xs">
          <Badge
            size="xs"
            variant={limited ? 'light' : 'outline'}
            color={limited ? 'grape' : 'gray'}
            leftSection={<TbTag size={9} />}
            style={{ cursor: 'pointer' }}
            onClick={() => setOpened((o) => !o)}
          >
            {limited ? `${scopeTags.length} tag` : 'Full'}
          </Badge>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Batasi akses ke item bertag tertentu. Kosongkan = full access.
          </Text>
          <TagsInput
            size="xs"
            placeholder="ketik tag lalu Enter"
            data={suggestions}
            value={draft}
            onChange={apply}
            disabled={disabled}
            clearable
            comboboxProps={{ withinPortal: true }}
          />
          <Text size="xs" c="dimmed" fz={10}>
            Perubahan tersimpan otomatis.
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
