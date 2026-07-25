import {
  ActionIcon,
  Badge,
  Box,
  Divider,
  Group,
  Menu,
  Popover,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useMemo, useState } from 'react'
import { TbChevronDown, TbPlus, TbSearch, TbX } from 'react-icons/tb'
import { AccessRoleCell } from './AccessRoleCell'
import { type EnvRole, envRoleOptions, type ProjectRole } from './types'

type EnvCellData = { envRole: EnvRole; effectiveRole: ProjectRole | null }

// Sel kolom Environments: satu kolom untuk SEMUA environment (skalabel — tak
// peduli 2 atau 100 env, tak ada scroll horizontal). Popover menampilkan env
// yang di-override (bukan inherit) dengan tinggi ter-cap + scroll internal +
// kotak cari + bulk-apply — jadi 100 env pun tak pernah bikin popover memanjang
// menembus layar. Env inherit (mayoritas) implisit ikut role project.
export function EnvAccessCell({
  environments,
  envAccess,
  projectRole,
  disabled,
  onChange,
  onBulkChange,
}: {
  environments: { name: string }[]
  envAccess: Record<string, EnvCellData>
  projectRole: ProjectRole
  disabled?: boolean
  onChange: (envName: string, role: EnvRole) => void
  // Bulk apply role ke banyak env sekaligus (satu invalidate). Fallback ke
  // onChange per-env bila tak disediakan.
  onBulkChange?: (envNames: string[], role: EnvRole) => void
}) {
  const [opened, setOpened] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // Override = env yang tak inherit (di-set eksplisit: denied atau role override).
  const overrides = useMemo(
    () => environments.filter((e) => (envAccess[e.name]?.envRole ?? 'inherit') !== 'inherit'),
    [environments, envAccess],
  )
  const deniedCount = overrides.filter((e) => envAccess[e.name]?.effectiveRole === null).length

  // Ringkasan komposisi override (mis. "18 Denied · 3 Viewer") untuk header.
  const summaryText = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of overrides) {
      const cell = envAccess[e.name]
      const label = cell?.effectiveRole === null ? 'Denied' : roleShort(cell?.effectiveRole ?? 'VIEWER')
      counts[label] = (counts[label] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(' · ')
  }, [overrides, envAccess])

  const filteredOverrides = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return overrides
    return overrides.filter((e) => e.name.toLowerCase().includes(q))
  }, [overrides, query])

  // Kandidat "tambah override" = env yang masih inherit. Dicari via Select
  // (search-on-type) — tak pernah render semua sekaligus.
  const inheritOptions = useMemo(
    () =>
      environments
        .filter((e) => (envAccess[e.name]?.envRole ?? 'inherit') === 'inherit')
        .map((e) => ({ value: e.name, label: e.name })),
    [environments, envAccess],
  )

  const applyBulk = (role: EnvRole) => {
    const names = filteredOverrides.map((e) => e.name)
    if (names.length === 0) return
    if (onBulkChange) onBulkChange(names, role)
    else for (const n of names) onChange(n, role)
  }

  if (environments.length === 0) {
    return (
      <Text size="xs" c="dimmed" ta="center">
        —
      </Text>
    )
  }

  const summary =
    overrides.length === 0 ? (
      <Badge
        variant="default"
        color="gray"
        size="sm"
        radius="sm"
        rightSection={<TbChevronDown size={10} style={{ opacity: 0.5 }} />}
        style={{ cursor: 'pointer', textTransform: 'none', fontWeight: 600 }}
      >
        Inherit{projectRole ? ` · ${roleShort(projectRole)}` : ''}
      </Badge>
    ) : (
      <Badge
        variant="light"
        color={deniedCount > 0 ? 'red' : 'teal'}
        size="sm"
        radius="sm"
        rightSection={<TbChevronDown size={10} style={{ opacity: 0.5 }} />}
        style={{ cursor: 'pointer', textTransform: 'none', fontWeight: 600 }}
      >
        {overrides.length} diatur
      </Badge>
    )

  return (
    <Box style={{ display: 'flex', justifyContent: 'center' }}>
      <Popover
        opened={opened}
        onChange={(o) => {
          setOpened(o)
          if (!o) {
            setAdding(null)
            setQuery('')
          }
        }}
        width={320}
        position="bottom"
        withArrow
        trapFocus
        disabled={disabled}
      >
        <Popover.Target>
          <UnstyledButton disabled={disabled} onClick={() => setOpened((o) => !o)}>
            {summary}
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown p={8}>
          <Stack gap={6}>
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text size="xs" c="dimmed" fw={600}>
                Override environment{overrides.length > 0 ? ` (${overrides.length})` : ''}
              </Text>
              <Text size="xs" c="dimmed" fz={10} style={{ flexShrink: 0 }}>
                {environments.length} env total
              </Text>
            </Group>

            {overrides.length === 0 ? (
              <Text size="xs" c="dimmed" py={2}>
                Belum ada override — semua env mengikuti role project{projectRole ? ` (${roleShort(projectRole)})` : ''}
                .
              </Text>
            ) : (
              <>
                {/* Ringkasan komposisi + bulk apply ke env yang tampil (terfilter). */}
                <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
                  <Text size="xs" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }}>
                    {summaryText}
                  </Text>
                  <Menu position="bottom-end" withinPortal shadow="md" width={160}>
                    <Menu.Target>
                      <UnstyledButton disabled={disabled} style={{ flexShrink: 0 }}>
                        <Badge
                          variant="light"
                          color="gray"
                          size="sm"
                          radius="sm"
                          rightSection={<TbChevronDown size={10} style={{ opacity: 0.5 }} />}
                          style={{ cursor: 'pointer', textTransform: 'none', fontWeight: 600 }}
                        >
                          Set semua tampil
                        </Badge>
                      </UnstyledButton>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>
                        Terapkan ke {filteredOverrides.length} env{query.trim() ? ' (tampil)' : ''}
                      </Menu.Label>
                      {envRoleOptions.map((opt) => (
                        <Menu.Item key={opt.value} onClick={() => applyBulk(opt.value)}>
                          {opt.label}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                </Group>

                {overrides.length > 6 && (
                  <TextInput
                    size="xs"
                    placeholder="Cari env…"
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    leftSection={<TbSearch size={12} />}
                  />
                )}

                <ScrollArea.Autosize mah={260} type="auto">
                  <Stack gap={2}>
                    {filteredOverrides.length === 0 ? (
                      <Text size="xs" c="dimmed" py={4} ta="center">
                        Env tak ditemukan
                      </Text>
                    ) : (
                      filteredOverrides.map((env) => {
                        const cell = envAccess[env.name]
                        const isDenied = cell?.effectiveRole === null
                        return (
                          <Group
                            key={env.name}
                            justify="space-between"
                            wrap="nowrap"
                            gap="xs"
                            px={6}
                            py={3}
                            style={{
                              borderRadius: 6,
                              background: isDenied ? 'var(--mantine-color-red-light)' : undefined,
                            }}
                          >
                            <Text size="xs" fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
                              {env.name}
                            </Text>
                            <AccessRoleCell
                              value={cell?.envRole ?? 'inherit'}
                              effectiveRole={cell?.effectiveRole ?? null}
                              disabled={disabled}
                              onChange={(role) => onChange(env.name, role)}
                            />
                            <Tooltip label="Hapus override (kembali inherit)" withArrow fz="xs">
                              <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="gray"
                                disabled={disabled}
                                onClick={() => onChange(env.name, 'inherit')}
                              >
                                <TbX size={13} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        )
                      })
                    )}
                  </Stack>
                </ScrollArea.Autosize>
              </>
            )}

            <Divider my={2} />

            {/* Tambah override: Select search-on-type — skalabel ke 100+ env
                karena tak me-render semua opsi sekaligus. Pilih env → langsung
                buka menu izin (2 langkah). */}
            {adding === null ? (
              <Select
                size="xs"
                placeholder="+ Tambah override — ketik nama env…"
                data={inheritOptions}
                searchable
                nothingFoundMessage={inheritOptions.length === 0 ? 'Semua env sudah diatur' : 'Env tak ditemukan'}
                value={null}
                disabled={disabled || inheritOptions.length === 0}
                comboboxProps={{ withinPortal: true }}
                leftSection={<TbPlus size={12} />}
                onChange={(val) => setAdding(val)}
              />
            ) : (
              <Group justify="space-between" wrap="nowrap" gap="xs" px={6} py={3}>
                <Text size="xs" fw={600} truncate style={{ flex: 1, minWidth: 0 }}>
                  {adding}
                </Text>
                <AccessRoleCell
                  value="inherit"
                  effectiveRole={envAccess[adding]?.effectiveRole ?? null}
                  disabled={disabled}
                  onChange={(role) => {
                    onChange(adding, role)
                    setAdding(null)
                  }}
                />
              </Group>
            )}

            <Text size="xs" c="dimmed" fz={10}>
              Env yang tak diatur mengikuti role project (inherit).
            </Text>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  )
}

function roleShort(role: ProjectRole): string {
  return role === 'OWNER' ? 'Owner' : role === 'EDITOR' ? 'Editor' : 'Viewer'
}
