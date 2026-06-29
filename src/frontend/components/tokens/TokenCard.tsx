import {
  ActionIcon,
  Badge,
  Box,
  Collapse,
  Divider,
  Group,
  Menu,
  Paper,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import {
  TbCalendar,
  TbCheck,
  TbClock,
  TbCopy,
  TbDots,
  TbKey,
  TbPencil,
  TbRefresh,
  TbTerminal,
  TbToggleLeft,
  TbToggleRight,
  TbTrash,
} from 'react-icons/tb'
import type { ApiToken } from './token-utils'
import { absoluteTime, daysUntil, expiryStatus, relativeTime, tagColor } from './token-utils'
import { ScopesRow, UsageSection } from './TokenScopeList'

export interface TokenCardProps {
  token: ApiToken
  compact?: boolean
  isUsageOpen: boolean
  isCopied: boolean
  togglePending: boolean
  copyPending: boolean
  rotatePending: boolean
  onToggle: () => void
  onCopy: () => void
  onRotate: () => void
  onEdit: () => void
  onRevoke: () => void
  onUsageToggle: () => void
  onCardClick?: () => void
}

export function TokenCard({
  token,
  compact = false,
  isUsageOpen,
  isCopied,
  togglePending,
  copyPending,
  rotatePending: _rotatePending,
  onToggle,
  onCopy,
  onRotate,
  onEdit,
  onRevoke,
  onUsageToggle,
  onCardClick,
}: TokenCardProps) {
  const expiry = expiryStatus(token.expiresAt)
  const isExpired = expiry === 'expired'
  const accentColor = token.canWrite ? 'orange' : 'blue'
  const _borderColor = `var(--mantine-color-${accentColor}-5)`

  const statusBadges = (
    <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
      <Badge size="xs" variant="light" color={accentColor}>
        {token.canWrite ? 'rw' : 'ro'}
      </Badge>
      {token.isDisabled && (
        <Badge size="xs" color="gray" variant="filled">
          off
        </Badge>
      )}
      {isExpired && (
        <Badge size="xs" color="red" variant="filled">
          expired
        </Badge>
      )}
      {expiry === 'soon' && token.expiresAt && (
        <Badge size="xs" color="yellow" variant="light">
          {daysUntil(token.expiresAt)}d
        </Badge>
      )}
    </Group>
  )

  const metaRow = (
    <Group gap={6} wrap="wrap" mt={2}>
      <Tooltip
        label={token.lastUsedAt ? `Terakhir dipakai ${absoluteTime(token.lastUsedAt)}` : 'Belum pernah dipakai'}
        withArrow
      >
        <Group gap={3} style={{ cursor: 'default' }}>
          <TbClock size={10} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="xs" c="dimmed">
            {token.lastUsedAt ? (
              relativeTime(token.lastUsedAt)
            ) : (
              <Text component="span" fs="italic" size="xs" c="dimmed">
                belum dipakai
              </Text>
            )}
          </Text>
        </Group>
      </Tooltip>
      <Text size="xs" c="dimmed">
        ·
      </Text>
      <Tooltip label={`Dibuat ${absoluteTime(token.createdAt)}`} withArrow>
        <Group gap={3} style={{ cursor: 'default' }}>
          <TbCalendar size={10} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="xs" c="dimmed">
            {relativeTime(token.createdAt)}
          </Text>
        </Group>
      </Tooltip>
      {token.expiresAt && !isExpired && (
        <Tooltip label={absoluteTime(token.expiresAt)}>
          <Text size="xs" c={expiry === 'soon' ? 'yellow' : 'dimmed'} style={{ cursor: 'default' }}>
            · expires{' '}
            {new Date(token.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </Tooltip>
      )}
      {isExpired && token.expiresAt && (
        <Tooltip label={absoluteTime(token.expiresAt)}>
          <Text size="xs" c="red" style={{ cursor: 'default' }}>
            · expired{' '}
            {new Date(token.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </Tooltip>
      )}
    </Group>
  )

  const actions = (
    <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <Tooltip label={token.isDisabled ? 'Aktifkan' : 'Nonaktifkan'} withArrow>
        <ActionIcon
          size="sm"
          variant="subtle"
          color={token.isDisabled ? 'gray' : 'teal'}
          loading={togglePending}
          onClick={onToggle}
        >
          {token.isDisabled ? <TbToggleLeft size={15} /> : <TbToggleRight size={15} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label={isCopied ? 'Tersalin!' : 'Copy token'} withArrow>
        <ActionIcon
          size="sm"
          variant="subtle"
          color={isCopied ? 'teal' : 'gray'}
          loading={copyPending}
          onClick={onCopy}
        >
          {isCopied ? <TbCheck size={13} /> : <TbCopy size={13} />}
        </ActionIcon>
      </Tooltip>
      <Menu withinPortal shadow="md" width={160} position="bottom-end">
        <Menu.Target>
          <ActionIcon size="sm" variant="subtle" color="gray">
            <TbDots size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<TbTerminal size={13} />} onClick={onUsageToggle}>
            {isUsageOpen ? 'Tutup usage' : 'Lihat usage'}
          </Menu.Item>
          <Menu.Item leftSection={<TbPencil size={13} />} onClick={onEdit}>
            Edit
          </Menu.Item>
          <Menu.Item leftSection={<TbRefresh size={13} />} color="yellow" onClick={onRotate}>
            Rotate
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item leftSection={<TbTrash size={13} />} color="red" onClick={onRevoke}>
            Revoke
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  )

  const cardClass = `envman-token-card ${token.isDisabled ? 'is-disabled' : ''} ${isExpired ? 'is-expired' : ''}`
  const cardStyle = {
    opacity: token.isDisabled ? 0.55 : isExpired ? 0.65 : 1,
    overflow: 'hidden' as const,
    cursor: onCardClick ? 'pointer' : undefined,
  }

  if (compact) {
    return (
      <Paper withBorder radius={8} p="sm" className={cardClass} style={{ ...cardStyle }} onClick={onCardClick}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="sm" style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
            <ThemeIcon size={28} radius="md" variant="light" color={accentColor} style={{ flexShrink: 0 }}>
              <TbKey size={14} />
            </ThemeIcon>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Group gap={6} wrap="nowrap" align="center" mb={2}>
                <Text size="sm" fw={700} truncate style={{ flex: 1, minWidth: 0 }}>
                  {token.name}
                </Text>
                {statusBadges}
              </Group>
              <Group gap={4} wrap="wrap">
                <ScopesRow scopes={token.scopes} />
                {token.tags.map((tag) => (
                  <Badge key={tag} size="xs" variant="light" color={tagColor(tag)}>
                    {tag}
                  </Badge>
                ))}
              </Group>
              {metaRow}
            </Box>
          </Group>
          {actions}
        </Group>
        <Collapse in={isUsageOpen}>
          <Divider my="xs" />
          <UsageSection token={token} />
        </Collapse>
      </Paper>
    )
  }

  return (
    <Paper withBorder radius={8} className={cardClass} style={{ ...cardStyle }} onClick={onCardClick}>
      <Box p="sm">
        <Group justify="space-between" mb={8} wrap="nowrap">
          <Group gap={6} align="center">
            <ThemeIcon size={28} radius="md" variant="light" color={accentColor}>
              <TbKey size={14} />
            </ThemeIcon>
            {statusBadges}
          </Group>
          {actions}
        </Group>
        <Text fw={700} size="sm" mb={4} truncate>
          {token.name}
        </Text>
        <Group gap={4} wrap="wrap" mb={2}>
          <ScopesRow scopes={token.scopes} />
          {token.tags.map((tag) => (
            <Badge key={tag} size="xs" variant="light" color={tagColor(tag)}>
              {tag}
            </Badge>
          ))}
        </Group>
        {metaRow}
        <Collapse in={isUsageOpen}>
          <Divider my="xs" />
          <UsageSection token={token} />
        </Collapse>
      </Box>
    </Paper>
  )
}
