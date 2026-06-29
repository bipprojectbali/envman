import {
  Badge,
  Box,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { ActionIcon } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import {
  TbCalendar,
  TbChevronLeft,
  TbChevronRight,
  TbClock,
  TbKey,
  TbShieldCheck,
} from 'react-icons/tb'
import type { ApiToken } from './token-utils'
import { absoluteTime, daysUntil, expiryStatus, relativeTime } from './token-utils'
import { TokenDetailActions } from './TokenDetailActions'
import { TokenUsageExamples } from './TokenUsageExamples'

interface TokenDetailViewProps {
  token: ApiToken
  isCopied: boolean
  togglePending: boolean
  copyPending: boolean
  rotatePending: boolean
  onBack: () => void
  onToggle: () => void
  onCopy: () => void
  onCopyCommand: (cmdTemplate: string) => void
  onRotate: () => void
  onEdit: () => void
  onRevoke: () => void
}

export function TokenDetailView({
  token,
  isCopied,
  togglePending,
  copyPending,
  rotatePending,
  onBack,
  onToggle,
  onCopy,
  onCopyCommand,
  onRotate,
  onEdit,
  onRevoke,
}: TokenDetailViewProps) {
  const expiry = expiryStatus(token.expiresAt)
  const isExpired = expiry === 'expired'
  const accentColor = token.canWrite ? 'orange' : 'blue'

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        {/* Breadcrumb */}
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={onBack}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={onBack}>
            Tokens
          </Text>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon size={20} radius="sm" variant="light" color={accentColor}>
              <TbKey size={11} />
            </ThemeIcon>
            <Text size="sm" fw={600} truncate style={{ maxWidth: 320 }}>
              {token.name}
            </Text>
          </Group>
        </Group>
        <Divider />

        {/* Header card */}
        <Box style={{ opacity: token.isDisabled ? 0.7 : 1 }}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <ThemeIcon size={44} radius="md" variant="light" color={accentColor}>
                <TbKey size={22} />
              </ThemeIcon>
              <Box style={{ minWidth: 0 }}>
                <Text fw={700} size="lg" truncate mb={4}>
                  {token.name}
                </Text>
                <Group gap={6} wrap="wrap">
                  <Badge size="sm" variant="light" color={accentColor}>
                    {token.canWrite ? 'read-write' : 'read-only'}
                  </Badge>
                  {token.isDisabled && (
                    <Badge size="sm" color="gray" variant="filled">
                      disabled
                    </Badge>
                  )}
                  {isExpired && (
                    <Badge size="sm" color="red" variant="filled">
                      expired
                    </Badge>
                  )}
                  {expiry === 'soon' && token.expiresAt && (
                    <Badge size="sm" color="yellow" variant="light">
                      expires in {daysUntil(token.expiresAt)}d
                    </Badge>
                  )}
                  {!token.isDisabled && !isExpired && expiry !== 'soon' && (
                    <Badge size="sm" color="teal" variant="light">
                      active
                    </Badge>
                  )}
                </Group>
              </Box>
            </Group>

            {/* Actions */}
            <TokenDetailActions
              isDisabled={token.isDisabled}
              isCopied={isCopied}
              togglePending={togglePending}
              copyPending={copyPending}
              rotatePending={rotatePending}
              onToggle={onToggle}
              onCopy={onCopy}
              onRotate={onRotate}
              onEdit={onEdit}
              onRevoke={onRevoke}
            />
          </Group>

          <Divider my="md" />

          {/* Metadata row */}
          <Group gap="md" wrap="wrap">
            <Stack gap={2}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Dibuat
              </Text>
              <Tooltip label={absoluteTime(token.createdAt)} withArrow>
                <Group gap={4} style={{ cursor: 'default' }}>
                  <TbCalendar size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />
                  <Text size="sm">{relativeTime(token.createdAt)}</Text>
                </Group>
              </Tooltip>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Terakhir dipakai
              </Text>
              <Tooltip label={token.lastUsedAt ? absoluteTime(token.lastUsedAt) : 'Belum pernah dipakai'} withArrow>
                <Group gap={4} style={{ cursor: 'default' }}>
                  <TbClock size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />
                  <Text
                    size="sm"
                    fs={token.lastUsedAt ? undefined : 'italic'}
                    c={token.lastUsedAt ? undefined : 'dimmed'}
                  >
                    {token.lastUsedAt ? relativeTime(token.lastUsedAt) : 'belum dipakai'}
                  </Text>
                </Group>
              </Tooltip>
            </Stack>
            {token.expiresAt && (
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Kedaluwarsa
                </Text>
                <Tooltip label={absoluteTime(token.expiresAt)} withArrow>
                  <Text
                    size="sm"
                    c={isExpired ? 'red' : expiry === 'soon' ? 'yellow' : undefined}
                    style={{ cursor: 'default' }}
                  >
                    {new Date(token.expiresAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                </Tooltip>
              </Stack>
            )}
          </Group>
        </Box>

        {/* Scopes */}
        <Box>
          <Group gap="xs" mb="sm">
            <ThemeIcon size={20} radius="sm" variant="light" color="violet">
              <TbShieldCheck size={11} />
            </ThemeIcon>
            <Text size="sm" fw={600}>
              Scope Akses
            </Text>
            {token.scopes.length > 0 && (
              <Badge size="xs" variant="outline" color="gray">
                {token.scopes.length} scope
              </Badge>
            )}
          </Group>
          {token.scopes.length === 0 ? (
            <Group gap="xs">
              <Badge size="sm" variant="light" color="orange">
                semua project
              </Badge>
              <Text size="xs" c="dimmed">
                Token ini punya akses ke semua project yang dimiliki user.
              </Text>
            </Group>
          ) : (
            <Group gap={6} wrap="wrap">
              {token.scopes.map((s) => {
                const idx = s.indexOf(':')
                const linkable = idx > 0 && idx < s.length - 1
                if (!linkable) {
                  return (
                    <Badge key={s} size="sm" variant="default" style={{ fontFamily: 'monospace' }}>
                      {s}
                    </Badge>
                  )
                }
                const slug = s.slice(0, idx)
                const env = s.slice(idx + 1)
                return (
                  <Tooltip key={s} label={`Buka /envmanager/${slug}/${env}`} openDelay={400} withinPortal>
                    <Link to="/envmanager/$slug/$env" params={{ slug, env }} style={{ textDecoration: 'none' }}>
                      <Badge
                        size="sm"
                        variant="dot"
                        color="primary"
                        style={{ fontFamily: 'monospace', cursor: 'pointer' }}
                      >
                        {s}
                      </Badge>
                    </Link>
                  </Tooltip>
                )
              })}
            </Group>
          )}

          {token.tags.length > 0 && (
            <>
              <Divider my="sm" />
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                Tags
              </Text>
              <Group gap={6} wrap="wrap">
                {token.tags.map((tag) => (
                  <Badge key={tag} size="sm" variant="light">
                    {tag}
                  </Badge>
                ))}
              </Group>
            </>
          )}
        </Box>

        <TokenUsageExamples
          token={token}
          isCopied={isCopied}
          copyPending={copyPending}
          accentColor={accentColor}
          onCopy={onCopy}
          onCopyCommand={onCopyCommand}
        />
      </Stack>
    </Paper>
  )
}
