import { Badge, Box, Menu, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { TbCheck, TbChevronDown, TbLock } from 'react-icons/tb'
import type { EnvRole, ProjectRole } from './types'

// Opsi akses berlabel kata (bukan huruf mono ~ V E O ✕). Tiap opsi punya hint
// singkat supaya self-documenting — menghilangkan kebutuhan legenda terpisah.
const OPTIONS: { value: EnvRole; label: string; hint: string; color: string }[] = [
  { value: 'inherit', label: 'Inherit', hint: 'Ikut role project', color: 'gray' },
  { value: 'VIEWER', label: 'Viewer', hint: 'Lihat saja', color: 'gray' },
  { value: 'EDITOR', label: 'Editor', hint: 'Lihat & ubah', color: 'teal' },
  { value: 'OWNER', label: 'Owner', hint: 'Kontrol penuh', color: 'blue' },
  { value: 'denied', label: 'Denied', hint: 'Blokir akses', color: 'red' },
]

// Satu sel akses yang dipakai bersama oleh matrix Environments & Sections.
// Menampilkan state sebagai pill berlabel; klik membuka menu berisi opsi + hint.
// `locked` untuk anggota ber-role project OWNER (selalu akses penuh via inherit).
export function AccessRoleCell({
  value,
  effectiveRole,
  onChange,
  disabled,
  locked,
}: {
  value: EnvRole
  effectiveRole: ProjectRole | null
  onChange: (role: EnvRole) => void
  disabled?: boolean
  locked?: boolean
}) {
  const opt = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]
  const isInherit = value === 'inherit'
  const isDenied = value === 'denied'

  // Teks pill: inherit menampilkan role efektif yang diwarisi supaya tak ambigu.
  const pillLabel = isInherit ? `Inherit${effectiveRole ? ` · ${roleShort(effectiveRole)}` : ''}` : opt.label

  const pill = (
    <Badge
      variant={isInherit ? 'default' : 'light'}
      color={opt.color}
      size="sm"
      radius="sm"
      leftSection={isDenied ? <TbLock size={10} /> : undefined}
      rightSection={locked ? undefined : <TbChevronDown size={10} style={{ opacity: 0.5 }} />}
      style={{ cursor: locked || disabled ? 'default' : 'pointer', textTransform: 'none', fontWeight: 600 }}
    >
      {pillLabel}
    </Badge>
  )

  // OWNER project: tak bisa di-override (selalu penuh). Tampilkan pill statis + tooltip.
  if (locked) {
    return (
      <Box style={{ display: 'flex', justifyContent: 'center' }}>
        <Tooltip label="OWNER project selalu akses penuh" withArrow fz="xs">
          <Box style={{ opacity: 0.6 }}>{pill}</Box>
        </Tooltip>
      </Box>
    )
  }

  return (
    <Box style={{ display: 'flex', justifyContent: 'center' }}>
      <Menu shadow="md" width={200} position="bottom" withinPortal disabled={disabled}>
        <Menu.Target>
          <UnstyledButton disabled={disabled}>{pill}</UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Akses di kolom ini</Menu.Label>
          {OPTIONS.map((o) => {
            const active = o.value === value
            const hint =
              o.value === 'inherit' && effectiveRole ? `Ikut role project (${roleShort(effectiveRole)})` : o.hint
            return (
              <Menu.Item
                key={o.value}
                leftSection={active ? <TbCheck size={14} /> : <Box w={14} />}
                onClick={() => {
                  if (!active) onChange(o.value)
                }}
              >
                <Text size="sm" fw={600} c={o.color === 'gray' ? undefined : o.color}>
                  {o.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {hint}
                </Text>
              </Menu.Item>
            )
          })}
        </Menu.Dropdown>
      </Menu>
    </Box>
  )
}

function roleShort(role: ProjectRole): string {
  return role === 'OWNER' ? 'Owner' : role === 'EDITOR' ? 'Editor' : 'Viewer'
}
