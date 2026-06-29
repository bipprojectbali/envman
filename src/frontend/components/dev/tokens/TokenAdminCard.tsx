import { ActionIcon, Badge, Card, Divider, Group, Stack, Text, Tooltip } from '@mantine/core'
import { TbAlertTriangle, TbBan, TbClock, TbShieldOff, TbTrash } from 'react-icons/tb'
import { type AdminToken, STALE_DAYS, tokenStatusColor, tokenStatusLabel, tokenWarnings } from './types'

export function TokenActions({
  t,
  onExpiry,
  toggleDisable,
  revoke,
  revokeLoading,
  toggleLoading,
}: {
  t: AdminToken
  onExpiry: () => void
  toggleDisable: (id: string, isDisabled: boolean) => void
  revoke: (t: AdminToken) => void
  revokeLoading: boolean
  toggleLoading: boolean
}) {
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label={t.isDisabled ? 'Enable' : 'Disable'} withArrow>
        <ActionIcon
          size="sm"
          variant="subtle"
          color={t.isDisabled ? 'green' : 'orange'}
          loading={toggleLoading}
          onClick={() => toggleDisable(t.id, t.isDisabled)}
        >
          <TbBan size={13} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Set expiry" withArrow>
        <ActionIcon size="sm" variant="subtle" color="blue" onClick={onExpiry}>
          <TbClock size={13} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Revoke (hapus permanen)" withArrow>
        <ActionIcon size="sm" variant="subtle" color="red" loading={revokeLoading} onClick={() => revoke(t)}>
          <TbTrash size={13} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}

export function TokenCard({
  t,
  onExpiry,
  toggleDisable,
  revoke,
  revokeLoading,
  toggleLoading,
}: {
  t: AdminToken
  onExpiry: () => void
  toggleDisable: (id: string, isDisabled: boolean) => void
  revoke: (t: AdminToken) => void
  revokeLoading: boolean
  toggleLoading: boolean
}) {
  const w = tokenWarnings(t)
  const rowBg = w.expired
    ? 'var(--mantine-color-red-light)'
    : w.expiring
      ? 'var(--mantine-color-orange-light)'
      : undefined
  return (
    <Card withBorder padding="sm" style={{ background: rowBg }}>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size="xs" fw={600} truncate>
              {t.user.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {t.user.email}
            </Text>
          </Stack>
          <Badge size="xs" color={tokenStatusColor(t)} variant="light">
            {tokenStatusLabel(t)}
          </Badge>
        </Group>
        <Group gap={4} wrap="wrap">
          <Text size="xs" ff="monospace" fw={500}>
            {t.name}
          </Text>
          {t.canWrite && (
            <Badge size="xs" color="orange" variant="light">
              R/W
            </Badge>
          )}
          {w.wide && (
            <Tooltip label="canWrite + scope kosong = akses penuh" withArrow>
              <TbShieldOff size={12} color="var(--mantine-color-red-6)" />
            </Tooltip>
          )}
          {w.stale && (
            <Tooltip label={`Tidak dipakai > ${STALE_DAYS} hari`} withArrow>
              <TbAlertTriangle size={12} color="var(--mantine-color-yellow-6)" />
            </Tooltip>
          )}
          {w.expiring && (
            <Badge size="xs" color="orange" variant="filled">
              Expiring
            </Badge>
          )}
          {w.expired && (
            <Badge size="xs" color="red" variant="filled">
              Expired
            </Badge>
          )}
        </Group>
        {t.disabledReason && (
          <Text size="xs" c="dimmed" fs="italic">
            {t.disabledReason}
          </Text>
        )}
        <Group gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed">
            Used: {t.useCount.toLocaleString()}
          </Text>
          {t.lastUsedAt && (
            <Text size="xs" c="dimmed">
              · {new Date(t.lastUsedAt).toLocaleDateString('id-ID')}
            </Text>
          )}
          {t.expiresAt && (
            <Text size="xs" c={w.expired ? 'red' : w.expiring ? 'orange' : 'dimmed'}>
              · Exp: {new Date(t.expiresAt).toLocaleDateString('id-ID')}
            </Text>
          )}
        </Group>
        <Divider />
        <TokenActions
          t={t}
          onExpiry={onExpiry}
          toggleDisable={toggleDisable}
          revoke={revoke}
          revokeLoading={revokeLoading}
          toggleLoading={toggleLoading}
        />
      </Stack>
    </Card>
  )
}
