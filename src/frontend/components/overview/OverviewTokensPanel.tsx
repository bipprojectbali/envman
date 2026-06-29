import { Badge, Button, Divider, Group, Paper, Skeleton, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { TbArrowRight, TbKey, TbLock, TbLockOpen, TbShieldCheck } from 'react-icons/tb'
import { absoluteTime, relativeTime } from '@/frontend/lib/overview-utils'

interface Props {
  tokens: any[]
  activeTokens: any[]
  recentTokens: any[]
  loadingTokens: boolean
}

export function OverviewTokensPanel({ tokens, activeTokens, recentTokens, loadingTokens }: Props) {
  const navigate = useNavigate()

  return (
    <Paper
      p="md"
      style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <ThemeIcon size={24} radius="sm" variant="light" color="orange">
            <TbKey size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">API Tokens</Text>
        </Group>
        <Button
          size="compact-xs" variant="subtle" color="orange" rightSection={<TbArrowRight size={12} />}
          onClick={() => navigate({ to: '/envmanager/tokens', search: { token: undefined, edit: undefined } })}
        >
          Kelola
        </Button>
      </Group>

      {loadingTokens ? (
        <Stack gap="xs">
          {[1, 2].map((i) => <Skeleton key={i} height={40} radius="md" />)}
        </Stack>
      ) : tokens.length === 0 ? (
        <Text size="xs" c="dimmed" ta="center" py="sm">Belum ada token</Text>
      ) : (
        <Stack gap="xs">
          <Group gap="lg">
            <Group gap={5}>
              <TbShieldCheck size={13} style={{ color: 'var(--mantine-color-teal-6)' }} />
              <Text size="xs" fw={600}>{activeTokens.length}</Text>
              <Text size="xs" c="dimmed">aktif</Text>
            </Group>
            <Group gap={5}>
              <TbLockOpen size={13} style={{ color: 'var(--mantine-color-orange-5)' }} />
              <Text size="xs" fw={600}>{tokens.filter((t: any) => t.canWrite).length}</Text>
              <Text size="xs" c="dimmed">read-write</Text>
            </Group>
            {tokens.some((t: any) => t.isDisabled) && (
              <Group gap={5}>
                <Text size="xs" fw={600} c="dimmed">{tokens.filter((t: any) => t.isDisabled).length}</Text>
                <Text size="xs" c="dimmed">disabled</Text>
              </Group>
            )}
          </Group>

          {recentTokens.length > 0 && (
            <>
              <Divider />
              <Text size="xs" c="dimmed" fw={500}>Terakhir digunakan</Text>
              {recentTokens.map((t: any) => (
                <Group key={t.id} justify="space-between">
                  <Group gap={6}>
                    <Badge
                      size="xs" color={t.canWrite ? 'orange' : 'blue'} variant="light"
                      leftSection={t.canWrite ? <TbLockOpen size={9} /> : <TbLock size={9} />}
                    >
                      {t.canWrite ? 'rw' : 'ro'}
                    </Badge>
                    <Text
                      size="xs" fw={500}
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}
                    >
                      {t.name}
                    </Text>
                  </Group>
                  <Tooltip label={`Terakhir dipakai ${absoluteTime(t.lastUsedAt)}`} withArrow>
                    <Text size="xs" c="dimmed">{relativeTime(t.lastUsedAt)}</Text>
                  </Tooltip>
                </Group>
              ))}
            </>
          )}
        </Stack>
      )}
    </Paper>
  )
}
