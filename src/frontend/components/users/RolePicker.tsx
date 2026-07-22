import { ActionIcon, Group, Tooltip } from '@mantine/core'
import type { EnvRoleValue, ProjectRole } from './types'
import { ROLE_COLOR } from './types'

interface RoleBtn {
  value: EnvRoleValue
  label: string
  short: string
  color: string
}

// Per-env: inherit → deny, semua opsi. Default role: hanya No/V/E/O
// (tak ada konsep inherit/deny di level project).
const ENV_BTNS: RoleBtn[] = [
  { value: 'inherit', label: 'Inherit (ikut project)', short: '~', color: 'gray' },
  { value: 'VIEWER', label: 'Viewer', short: 'V', color: ROLE_COLOR.VIEWER },
  { value: 'EDITOR', label: 'Editor', short: 'E', color: ROLE_COLOR.EDITOR },
  { value: 'OWNER', label: 'Owner', short: 'O', color: ROLE_COLOR.OWNER },
  { value: 'denied', label: 'Denied (blokir akses)', short: '✕', color: 'red' },
]

const DEFAULT_BTNS: RoleBtn[] = [
  { value: 'denied', label: 'No access', short: 'No', color: 'red' },
  { value: 'VIEWER', label: 'Viewer', short: 'V', color: ROLE_COLOR.VIEWER },
  { value: 'EDITOR', label: 'Editor', short: 'E', color: ROLE_COLOR.EDITOR },
  { value: 'OWNER', label: 'Owner', short: 'O', color: ROLE_COLOR.OWNER },
]

/**
 * Baris tombol pemilih role ringkas — satu idiom untuk env override maupun
 * default role project. Mode `includeInheritDeny` menentukan set tombol.
 */
export function RolePicker({
  value,
  onChange,
  disabled = false,
  includeInheritDeny,
}: {
  // Per-env: EnvRoleValue penuh. Default role: null = No access.
  value: EnvRoleValue | ProjectRole | null
  onChange: (v: EnvRoleValue) => void
  disabled?: boolean
  includeInheritDeny: boolean
}) {
  const btns = includeInheritDeny ? ENV_BTNS : DEFAULT_BTNS
  // Default role: null (no access) dipetakan ke tombol 'denied' ("No").
  const current: EnvRoleValue = value ?? 'denied'

  return (
    <Group gap={2} wrap="nowrap">
      {btns.map((btn) => {
        const isActive = current === btn.value
        return (
          <Tooltip key={btn.value} label={btn.label} withArrow fz="xs">
            <ActionIcon
              size={20}
              variant={isActive ? 'filled' : 'subtle'}
              color={isActive ? btn.color : 'gray'}
              disabled={disabled}
              onClick={() => {
                if (!isActive) onChange(btn.value)
              }}
              style={{ fontSize: 10, fontWeight: 700 }}
            >
              {btn.short}
            </ActionIcon>
          </Tooltip>
        )
      })}
    </Group>
  )
}
