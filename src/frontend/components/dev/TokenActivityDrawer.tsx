import { Badge, Box, Drawer, Group, Pagination, ScrollArea, Select, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
// biome-ignore lint/correctness/noUnusedImports: false-positive — TbPlayerPlay dipakai sebagai value di ACTION_CONFIG
import { TbFile, TbKey, TbPlayerPlay, TbRefresh, TbTrash, TbVariable } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'

interface ActivityLog {
  id: string
  tokenId: string
  userId: string | null
  tokenName: string | null
  action: string
  projectSlug: string | null
  envName: string | null
  detail: string | null
  ip: string | null
  createdAt: string
}

interface TokenMeta {
  id: string
  name: string
  user: { name: string; email: string }
}

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof TbVariable }> = {
  vars_fetch: { label: 'Fetch Vars', color: 'blue', icon: TbVariable },
  var_set: { label: 'Set Var', color: 'teal', icon: TbVariable },
  var_delete: { label: 'Delete Var', color: 'red', icon: TbTrash },
  alias_resolve: { label: 'Run Alias', color: 'violet', icon: TbPlayerPlay },
  file_exec: { label: 'Exec File', color: 'orange', icon: TbFile },
}

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action] ?? { label: action, color: 'gray', icon: TbKey }
  const Icon = cfg.icon
  return (
    <Badge size="xs" color={cfg.color} variant="light" leftSection={<Icon size={10} />}>
      {cfg.label}
    </Badge>
  )
}

interface Props {
  token: TokenMeta | null
  opened: boolean
  onClose: () => void
}

export function TokenActivityDrawer({ token, opened, onClose }: Props) {
  const [page, setPage] = useState(1)
  const [filterAction, setFilterAction] = useState<string | null>(null)
  const pageSize = 25

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'token-activity', token?.id, page, filterAction],
    queryFn: () =>
      apiFetch<{ logs: ActivityLog[]; total: number }>(
        `/api/admin/tokens/${token!.id}/activity?limit=${pageSize}&offset=${(page - 1) * pageSize}${filterAction ? `&action=${filterAction}` : ''}`,
      ),
    enabled: opened && !!token,
  })

  const logs = data?.logs ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      title={
        token ? (
          <Stack gap={2}>
            <Group gap="xs">
              <TbKey size={16} />
              <Title order={5}>{token.name}</Title>
            </Group>
            <Text size="xs" c="dimmed">
              {token.user.name} · {token.user.email}
            </Text>
          </Stack>
        ) : (
          'Activity Log'
        )
      }
    >
      <Stack gap="sm" h="100%">
        {/* Toolbar */}
        <Group gap="xs">
          <Select
            size="xs"
            placeholder="Semua aksi"
            clearable
            value={filterAction}
            onChange={(v) => {
              setFilterAction(v)
              setPage(1)
            }}
            data={Object.entries(ACTION_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label }))}
            w={160}
          />
          <Text size="xs" c="dimmed">
            {total} aktivitas
          </Text>
        </Group>

        {/* Timeline */}
        <ScrollArea style={{ flex: 1 }}>
          {isLoading ? (
            <Text c="dimmed" size="sm">
              Loading...
            </Text>
          ) : logs.length === 0 ? (
            <Text c="dimmed" size="sm" ta="center" py="xl">
              Belum ada aktivitas tercatat.
            </Text>
          ) : (
            <Stack gap={0}>
              {logs.map((log, i) => {
                const cfg = ACTION_CONFIG[log.action] ?? { color: 'gray', icon: TbKey }
                const Icon = cfg.icon
                const isLast = i === logs.length - 1
                return (
                  <Group
                    key={log.id}
                    gap="sm"
                    align="flex-start"
                    wrap="nowrap"
                    pb={isLast ? 0 : 'sm'}
                    style={{ borderBottom: isLast ? undefined : '1px solid var(--mantine-color-default-border)' }}
                  >
                    <ThemeIcon size="sm" variant="light" color={cfg.color} style={{ flexShrink: 0, marginTop: 2 }}>
                      <Icon size={12} />
                    </ThemeIcon>
                    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                      <Group gap="xs" wrap="wrap">
                        <ActionBadge action={log.action} />
                        {log.projectSlug && (
                          <Badge size="xs" variant="dot" color="blue">
                            {log.projectSlug}
                          </Badge>
                        )}
                        {log.envName && (
                          <Badge size="xs" variant="dot" color="teal">
                            {log.envName}
                          </Badge>
                        )}
                        {log.detail && (
                          <Text size="xs" ff="monospace" c="dimmed">
                            {log.detail}
                          </Text>
                        )}
                      </Group>
                      <Group gap="xs">
                        <Text size="xs" c="dimmed">
                          {new Date(log.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </Text>
                        {log.ip && (
                          <Text size="xs" c="dimmed">
                            · {log.ip}
                          </Text>
                        )}
                      </Group>
                    </Stack>
                  </Group>
                )
              })}
            </Stack>
          )}
        </ScrollArea>

        {/* Pagination */}
        {total > pageSize && (
          <Box pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            <Group justify="space-between" align="center">
              <Text size="xs" c="dimmed">
                hal {page}/{totalPages}
              </Text>
              <Pagination value={page} onChange={setPage} total={totalPages} size="xs" withEdges />
            </Group>
          </Box>
        )}
      </Stack>
    </Drawer>
  )
}
