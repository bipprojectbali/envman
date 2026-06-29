import { ActionIcon, Badge, Box, Code, CopyButton, Group, HoverCard, Stack, Text, Tooltip } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { TbCheck, TbCopy } from 'react-icons/tb'
import type { ApiToken } from './token-utils'

export function ScopeBadge({ scope, size = 'xs' }: { scope: string; size?: 'xs' | 'sm' }) {
  const idx = scope.indexOf(':')
  const linkable = idx > 0 && idx < scope.length - 1
  if (!linkable) {
    return (
      <Badge size={size} variant="default" style={{ fontFamily: 'monospace' }}>
        {scope}
      </Badge>
    )
  }
  const slug = scope.slice(0, idx)
  const env = scope.slice(idx + 1)
  return (
    <Tooltip label={`Buka /envmanager/${slug}/${env}`} openDelay={400} withinPortal>
      <Link to="/envmanager/$slug/$env" params={{ slug, env }} style={{ textDecoration: 'none' }}>
        <Badge size={size} variant="dot" color="primary" style={{ fontFamily: 'monospace', cursor: 'pointer' }}>
          {scope}
        </Badge>
      </Link>
    </Tooltip>
  )
}

export function ScopesRow({ scopes }: { scopes: string[] }) {
  if (scopes.length === 0) {
    return (
      <Badge size="xs" variant="default">
        semua project
      </Badge>
    )
  }
  return (
    <>
      {scopes.slice(0, 4).map((s) => (
        <ScopeBadge key={s} scope={s} />
      ))}
      {scopes.length > 4 && (
        <HoverCard width={260} shadow="md" withinPortal position="bottom-start">
          <HoverCard.Target>
            <Badge size="xs" variant="default" style={{ cursor: 'pointer' }}>
              +{scopes.length - 4}
            </Badge>
          </HoverCard.Target>
          <HoverCard.Dropdown>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">
                Scope lainnya:
              </Text>
              <Group gap={4} wrap="wrap">
                {scopes.slice(4).map((s) => (
                  <ScopeBadge key={s} scope={s} />
                ))}
              </Group>
            </Stack>
          </HoverCard.Dropdown>
        </HoverCard>
      )}
    </>
  )
}

export function UsageSection({ token }: { token: ApiToken }) {
  const origin = window.location.origin
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
    <Stack gap={6}>
      {commands.map(({ label, cmd }) => (
        <Box key={label}>
          <Text size="xs" c="dimmed" mb={2}>
            {label}
          </Text>
          <Group gap={4} align="center">
            <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>
              {cmd}
            </Code>
            <CopyButton value={cmd}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied!' : 'Copy'}>
                  <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                    {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
        </Box>
      ))}
      {token.scopes.length === 0 && (
        <Text size="xs" c="dimmed">
          Token ini punya akses ke semua project. Ganti <Code fz="xs">myapp:production</Code> dengan project:env yang
          sesuai.
        </Text>
      )}
    </Stack>
  )
}
