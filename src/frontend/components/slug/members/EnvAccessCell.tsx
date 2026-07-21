import { Badge, Box, Group, Popover, ScrollArea, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { useMemo, useState } from 'react'
import { TbChevronDown, TbSearch } from 'react-icons/tb'
import { AccessRoleCell } from './AccessRoleCell'
import type { EnvRole, ProjectRole } from './types'

type EnvCellData = { envRole: EnvRole; effectiveRole: ProjectRole | null }

// Sel kolom Environments: satu kolom untuk SEMUA environment (skalabel — tak
// peduli 2 atau 100 env, tak ada scroll horizontal). Collapsed menampilkan
// ringkasan; klik membuka popover berisi daftar env (searchable), tiap baris
// punya AccessRoleCell sendiri — pilih env lalu pilih izinnya (2 langkah).
export function EnvAccessCell({
  environments,
  envAccess,
  projectRole,
  disabled,
  onChange,
}: {
  environments: { name: string }[]
  envAccess: Record<string, EnvCellData>
  projectRole: ProjectRole
  disabled?: boolean
  onChange: (envName: string, role: EnvRole) => void
}) {
  const [opened, setOpened] = useState(false)
  const [q, setQ] = useState('')

  // Override = env yang tak inherit (di-set eksplisit: denied atau role override).
  const overrides = useMemo(
    () => environments.filter((e) => (envAccess[e.name]?.envRole ?? 'inherit') !== 'inherit'),
    [environments, envAccess],
  )
  const deniedCount = overrides.filter((e) => envAccess[e.name]?.effectiveRole === null).length

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? environments.filter((e) => e.name.toLowerCase().includes(s)) : environments
  }, [environments, q])

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
        onChange={setOpened}
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
            <Text size="xs" c="dimmed" fw={600}>
              Akses per environment
            </Text>
            {environments.length > 6 && (
              <TextInput
                size="xs"
                placeholder="Cari environment…"
                leftSection={<TbSearch size={12} />}
                value={q}
                onChange={(e) => setQ(e.currentTarget.value)}
              />
            )}
            <ScrollArea.Autosize mah={260} type="auto">
              <Stack gap={2}>
                {filtered.map((env) => {
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
                    </Group>
                  )
                })}
                {filtered.length === 0 && (
                  <Text size="xs" c="dimmed" ta="center" py="xs">
                    Tak ada environment cocok
                  </Text>
                )}
              </Stack>
            </ScrollArea.Autosize>
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
