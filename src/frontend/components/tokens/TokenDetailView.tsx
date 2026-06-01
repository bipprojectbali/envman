import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  TbCalendar,
  TbCheck,
  TbChevronLeft,
  TbChevronRight,
  TbClock,
  TbCopy,
  TbKey,
  TbPencil,
  TbRefresh,
  TbShieldCheck,
  TbToggleLeft,
  TbToggleRight,
  TbTrash,
} from 'react-icons/tb'
import type { ApiToken } from './token-utils'
import { absoluteTime, daysUntil, expiryStatus, relativeTime } from './token-utils'

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
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null)

  const handleCopyCmd = (label: string, cmdTemplate: string) => {
    onCopyCommand(cmdTemplate)
    setCopiedCmd(label)
    setTimeout(() => setCopiedCmd((prev) => (prev === label ? null : prev)), 1500)
  }
  const expiry = expiryStatus(token.expiresAt)
  const isExpired = expiry === 'expired'
  const accentColor = token.canWrite ? 'orange' : 'blue'

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const scope = token.scopes.length > 0 ? token.scopes[0] : 'myapp:production'
  const [scopeProject, scopeEnv] = scope.includes(':') ? scope.split(':') : [scope, 'production']
  const commands = [
    { label: 'Login & simpan config', cmd: `envman login ${origin} --token [TOKEN]` },
    { label: `Inject vars (${scopeProject}:${scopeEnv})`, cmd: `envman -e ${scopeProject}:${scopeEnv} -- bun start` },
    {
      label: 'CI/CD tanpa login',
      cmd: `ENVMAN_SERVER=${origin} ENVMAN_TOKEN=[TOKEN] envman -e ${scopeProject}:${scopeEnv} -- bun start`,
    },
  ]

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
            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
              <Tooltip label={token.isDisabled ? 'Aktifkan' : 'Nonaktifkan'} withArrow>
                <ActionIcon
                  variant="light"
                  size="md"
                  color={token.isDisabled ? 'gray' : 'teal'}
                  loading={togglePending}
                  onClick={onToggle}
                >
                  {token.isDisabled ? <TbToggleLeft size={16} /> : <TbToggleRight size={16} />}
                </ActionIcon>
              </Tooltip>
              <Tooltip label={isCopied ? 'Tersalin!' : 'Copy token value'} withArrow>
                <ActionIcon
                  variant="light"
                  size="md"
                  color={isCopied ? 'teal' : 'blue'}
                  loading={copyPending}
                  onClick={onCopy}
                >
                  {isCopied ? <TbCheck size={15} /> : <TbCopy size={15} />}
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Edit" withArrow>
                <ActionIcon variant="light" size="md" color="gray" onClick={onEdit}>
                  <TbPencil size={15} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Rotate token" withArrow>
                <ActionIcon variant="light" size="md" color="yellow" loading={rotatePending} onClick={onRotate}>
                  <TbRefresh size={15} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Revoke token" withArrow>
                <ActionIcon variant="light" size="md" color="red" onClick={onRevoke}>
                  <TbTrash size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>
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

        {/* Usage examples */}
        <Box>
          <Group gap="xs" mb="sm">
            <ThemeIcon size={20} radius="sm" variant="light" color="gray">
              <TbKey size={11} />
            </ThemeIcon>
            <Text size="sm" fw={600}>
              Cara Penggunaan
            </Text>
          </Group>
          {token.scopes.length === 0 && (
            <Text size="xs" c="dimmed" mb="sm">
              Ganti <Code fz="xs">myapp:production</Code> dengan project:env yang sesuai.
            </Text>
          )}
          <Stack gap="sm">
            {commands.map(({ label, cmd }) => (
              <Box key={label}>
                <Text size="xs" c="dimmed" mb={4} fw={500}>
                  {label}
                </Text>
                <Group gap={6} align="center">
                  <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>
                    {cmd}
                  </Code>
                  <Tooltip label={copiedCmd === label ? 'Copied!' : 'Copy'}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color={copiedCmd === label ? 'teal' : 'gray'}
                      onClick={() => handleCopyCmd(label, cmd)}
                    >
                      {copiedCmd === label ? <TbCheck size={12} /> : <TbCopy size={12} />}
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Box>
            ))}
          </Stack>
          <Divider my="sm" />
          <Button
            size="xs"
            variant="light"
            color={accentColor}
            leftSection={isCopied ? <TbCheck size={13} /> : <TbCopy size={13} />}
            loading={copyPending}
            onClick={onCopy}
          >
            {isCopied ? 'Token tersalin!' : 'Copy nilai token'}
          </Button>
        </Box>
      </Stack>
    </Paper>
  )
}
