import { Badge, Box, Text, UnstyledButton } from '@mantine/core'
import { useMemo } from 'react'
import { TbChevronRight } from 'react-icons/tb'
import type { EnvRole, ProjectRole } from './types'

type EnvCellData = { envRole: EnvRole; effectiveRole: ProjectRole | null }

// Sel kolom Environments: satu kolom untuk SEMUA environment (skalabel — tak
// peduli 2 atau 100 env, tak ada scroll horizontal). Menampilkan ringkasan;
// klik membuka sub-view editor full-page in-place (EnvAccessSubview) — bukan
// popover sempit yang rapuh terhadap click-outside.
export function EnvAccessCell({
  environments,
  envAccess,
  projectRole,
  disabled,
  onOpen,
}: {
  environments: { name: string }[]
  envAccess: Record<string, EnvCellData>
  projectRole: ProjectRole
  disabled?: boolean
  onOpen: () => void
}) {
  const overrides = useMemo(
    () => environments.filter((e) => (envAccess[e.name]?.envRole ?? 'inherit') !== 'inherit'),
    [environments, envAccess],
  )
  const deniedCount = overrides.filter((e) => envAccess[e.name]?.effectiveRole === null).length

  if (environments.length === 0) {
    return (
      <Text size="xs" c="dimmed" ta="center">
        —
      </Text>
    )
  }

  const badge =
    overrides.length === 0 ? (
      <Badge
        variant="default"
        color="gray"
        size="sm"
        radius="sm"
        rightSection={<TbChevronRight size={10} style={{ opacity: 0.5 }} />}
        style={{ cursor: disabled ? 'default' : 'pointer', textTransform: 'none', fontWeight: 600 }}
      >
        Inherit{projectRole ? ` · ${roleShort(projectRole)}` : ''}
      </Badge>
    ) : (
      <Badge
        variant="light"
        color={deniedCount > 0 ? 'red' : 'teal'}
        size="sm"
        radius="sm"
        rightSection={<TbChevronRight size={10} style={{ opacity: 0.5 }} />}
        style={{ cursor: disabled ? 'default' : 'pointer', textTransform: 'none', fontWeight: 600 }}
      >
        {overrides.length} diatur
      </Badge>
    )

  return (
    <Box style={{ display: 'flex', justifyContent: 'center' }}>
      <UnstyledButton disabled={disabled} onClick={onOpen}>
        {badge}
      </UnstyledButton>
    </Box>
  )
}

function roleShort(role: ProjectRole): string {
  return role === 'OWNER' ? 'Owner' : role === 'EDITOR' ? 'Editor' : 'Viewer'
}
