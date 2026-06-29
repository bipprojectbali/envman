import {
  ActionIcon,
  Badge,
  Box,
  Container,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbFileText, TbRefresh, TbTrash, TbUser } from 'react-icons/tb'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { AdminUser, AuditLogEntry } from './types'

const PAGE_SIZE = 25

const actionBadge: Record<string, { color: string; label: string }> = {
  LOGIN: { color: 'green', label: 'Login' },
  LOGOUT: { color: 'gray', label: 'Logout' },
  LOGIN_FAILED: { color: 'orange', label: 'Login Failed' },
  LOGIN_BLOCKED: { color: 'red', label: 'Login Blocked' },
  ROLE_CHANGED: { color: 'violet', label: 'Role Changed' },
  BLOCKED: { color: 'red', label: 'Blocked' },
  UNBLOCKED: { color: 'teal', label: 'Unblocked' },
}

export function UserLogsPanel() {
  const [actionFilter, setActionFilter] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () =>
      fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()) as Promise<{ users: AdminUser[] }>,
  })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'logs', 'audit', actionFilter, userFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '200' })
      if (actionFilter) params.set('action', actionFilter)
      if (userFilter) params.set('userId', userFilter)
      return fetch(`/api/admin/logs/audit?${params}`, { credentials: 'include' }).then((r) => r.json()) as Promise<{
        logs: AuditLogEntry[]
      }>
    },
  })

  const clearLogs = useMutation({
    mutationFn: () =>
      fetch('/api/admin/logs/audit', { method: 'DELETE', credentials: 'include' }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'logs', 'audit'] })
      notifyOk('Audit logs dihapus')
    },
    onError: (e) => notifyErr(e),
  })

  const logs = data?.logs ?? []
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedLogs = logs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  useEffect(() => {
    setPage(1)
  }, [])
  const userOptions = (usersData?.users ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))
  const actionOptions = Object.entries(actionBadge).map(([key, val]) => ({ value: key, label: val.label }))

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="sm">
            <Title order={3}>User Logs</Title>
            <Badge variant="light" color="gray" size="sm">
              audit trail
            </Badge>
          </Group>
          <Group gap="sm">
            <Tooltip label="Clear all">
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => {
                  if (confirm('Hapus semua audit logs?')) clearLogs.mutate()
                }}
                loading={clearLogs.isPending}
              >
                <TbTrash size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Refresh">
              <ActionIcon variant="subtle" color="gray" onClick={() => refetch()} loading={isFetching}>
                <TbRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Group gap="sm">
          <Select
            placeholder="Filter by user"
            data={userOptions}
            value={userFilter}
            onChange={setUserFilter}
            clearable
            searchable
            size="xs"
            w={250}
            leftSection={<TbUser size={14} />}
          />
          <Select
            placeholder="Filter by action"
            data={actionOptions}
            value={actionFilter}
            onChange={setActionFilter}
            clearable
            size="xs"
            w={200}
            leftSection={<TbFileText size={14} />}
          />
        </Group>

        <Box style={{ border: '1px solid var(--mantine-color-default-border)' }} p={0}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={180}>Time</Table.Th>
                <Table.Th>User</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th>Detail</Table.Th>
                <Table.Th w={120}>IP</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text ta="center" c="dimmed" py="md">
                      Loading...
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {logs.length === 0 && !isLoading && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text ta="center" c="dimmed" py="md">
                      Belum ada log
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {pagedLogs.map((log) => {
                const badge = actionBadge[log.action] ?? { color: 'gray', label: log.action }
                return (
                  <Table.Tr key={log.id}>
                    <Table.Td>
                      <Text size="xs" ff="monospace" c="dimmed">
                        {new Date(log.createdAt).toLocaleString('id-ID', { hour12: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {log.user ? (
                        <div>
                          <Text size="sm" fw={500}>
                            {log.user.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {log.user.email}
                          </Text>
                        </div>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={badge.color} variant="light" size="sm">
                        {badge.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {log.detail ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" ff="monospace" c="dimmed">
                        {log.ip ?? '—'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Box>

        {logs.length > PAGE_SIZE && (
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, logs.length)} of {logs.length}
            </Text>
            <Pagination value={safePage} onChange={setPage} total={totalPages} size="sm" />
          </Group>
        )}
      </Stack>
    </Container>
  )
}
