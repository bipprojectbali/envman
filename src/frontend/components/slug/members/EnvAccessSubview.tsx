import { Badge, Box, Button, Checkbox, Group, Menu, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { useMemo, useState } from 'react'
import { TbArrowLeft, TbChevronDown, TbSearch } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { AccessRoleCell } from './AccessRoleCell'
import { type EnvRole, envRoleOptions, type ProjectRole, roleColor } from './types'

type EnvCellData = { envRole: EnvRole; effectiveRole: ProjectRole | null }
type StateFilter = 'all' | 'override' | 'denied' | 'inherit'

const FILTERS: { value: StateFilter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'override', label: 'Diatur' },
  { value: 'denied', label: 'Denied' },
  { value: 'inherit', label: 'Inherit' },
]

// Editor akses environment full-page (in-place, menggantikan tabel matrix).
// Menggantikan popover 320px yang sempit + rapuh (menu role bersarang di dalam
// popover memicu click-outside → popup tertutup, state hilang). Di sini menu
// role tak punya popover induk, jadi memilih role tak menutup apa pun.
export function EnvAccessSubview({
  member,
  environments,
  envAccess,
  disabled,
  onBack,
  onChange,
  onBulkChange,
}: {
  member: {
    userId: string
    user: { id: string; name: string; email: string; image?: string | null }
    projectRole: ProjectRole
  }
  environments: { name: string }[]
  envAccess: Record<string, EnvCellData>
  disabled?: boolean
  onBack: () => void
  onChange: (envName: string, role: EnvRole) => void
  onBulkChange: (envNames: string[], role: EnvRole) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StateFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return environments.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false
      const cell = envAccess[e.name]
      const envRole = cell?.envRole ?? 'inherit'
      if (filter === 'override') return envRole !== 'inherit'
      if (filter === 'denied') return cell?.effectiveRole === null
      if (filter === 'inherit') return envRole === 'inherit'
      return true
    })
  }, [environments, envAccess, query, filter])

  const filteredNames = filtered.map((e) => e.name)
  const allShownSelected = filteredNames.length > 0 && filteredNames.every((n) => selected.has(n))
  const someShownSelected = filteredNames.some((n) => selected.has(n)) && !allShownSelected

  const toggleAllShown = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allShownSelected)
        filteredNames.forEach((n) => {
          next.delete(n)
        })
      else
        filteredNames.forEach((n) => {
          next.add(n)
        })
      return next
    })
  }
  const toggleOne = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  // Bulk apply ke env yang di-centang; bila tak ada yang di-centang, ke env yang
  // sedang tampil (terfilter).
  const bulkTargets = selected.size > 0 ? filteredNames.filter((n) => selected.has(n)) : filteredNames
  const applyBulk = (role: EnvRole) => {
    if (bulkTargets.length === 0) return
    onBulkChange(bulkTargets, role)
    setSelected(new Set())
  }

  const overrideCount = environments.filter((e) => (envAccess[e.name]?.envRole ?? 'inherit') !== 'inherit').length

  return (
    <Stack
      gap="sm"
      p="md"
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
        background: 'var(--mantine-color-default-hover)',
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <Button size="xs" variant="subtle" color="gray" leftSection={<TbArrowLeft size={14} />} onClick={onBack}>
            Members
          </Button>
          <UserAvatar user={member.user} size={26} color={roleColor[member.projectRole]} />
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={700} truncate>
              Env access: {member.user.name}
            </Text>
            <Text size="xs" c="dimmed">
              {member.projectRole} · {overrideCount}/{environments.length} env diatur
            </Text>
          </Box>
        </Group>
      </Group>

      <Group justify="space-between" align="center" wrap="wrap" gap="xs">
        <Group gap="xs" wrap="nowrap">
          <TextInput
            size="xs"
            w={200}
            placeholder="Cari env…"
            leftSection={<TbSearch size={13} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          <Group gap={4} wrap="nowrap">
            {FILTERS.map((f) => (
              <Badge
                key={f.value}
                variant={filter === f.value ? 'filled' : 'default'}
                color={f.value === 'denied' ? 'red' : 'gray'}
                size="sm"
                radius="sm"
                style={{ cursor: 'pointer', textTransform: 'none', fontWeight: 600 }}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Badge>
            ))}
          </Group>
        </Group>

        <Menu position="bottom-end" withinPortal shadow="md" width={170} disabled={disabled}>
          <Menu.Target>
            <Button
              size="xs"
              variant="light"
              color="gray"
              rightSection={<TbChevronDown size={12} />}
              disabled={disabled || bulkTargets.length === 0}
            >
              Set {selected.size > 0 ? `${bulkTargets.length} terpilih` : `${bulkTargets.length} tampil`}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Terapkan role ke {bulkTargets.length} env</Menu.Label>
            {envRoleOptions.map((opt) => (
              <Menu.Item key={opt.value} onClick={() => applyBulk(opt.value)}>
                {opt.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Checkbox
        size="xs"
        checked={allShownSelected}
        indeterminate={someShownSelected}
        onChange={toggleAllShown}
        label={
          <Text size="xs" fw={600}>
            {allShownSelected ? 'Batal semua' : `Pilih semua (${filteredNames.length})`}
          </Text>
        }
      />

      <ScrollArea.Autosize mah="55vh" type="auto">
        <Stack gap={2}>
          {filtered.length === 0 ? (
            <Text size="xs" c="dimmed" py="md" ta="center">
              Env tak ditemukan
            </Text>
          ) : (
            filtered.map((env) => {
              const cell = envAccess[env.name]
              const isDenied = cell?.effectiveRole === null
              return (
                <Group
                  key={env.name}
                  justify="space-between"
                  wrap="nowrap"
                  gap="xs"
                  px={8}
                  py={5}
                  style={{
                    borderRadius: 6,
                    border: '1px solid var(--mantine-color-default-border)',
                    background: isDenied ? 'var(--mantine-color-red-light)' : 'var(--mantine-color-body)',
                  }}
                >
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Checkbox size="xs" checked={selected.has(env.name)} onChange={() => toggleOne(env.name)} />
                    <Text size="xs" fw={500} truncate style={{ minWidth: 0 }}>
                      {env.name}
                    </Text>
                  </Group>
                  <AccessRoleCell
                    value={cell?.envRole ?? 'inherit'}
                    effectiveRole={cell?.effectiveRole ?? null}
                    disabled={disabled}
                    onChange={(role) => onChange(env.name, role)}
                  />
                </Group>
              )
            })
          )}
        </Stack>
      </ScrollArea.Autosize>

      <Text size="xs" c="dimmed" fz={10}>
        Env yang diset <b>Inherit</b> mengikuti role project ({member.projectRole}). Ubah role langsung dari tiap baris,
        atau centang beberapa lalu pakai tombol <b>Set</b> untuk sekaligus.
      </Text>
    </Stack>
  )
}
