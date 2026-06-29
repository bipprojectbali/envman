import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Container,
  Group,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbBug, TbChevronRight, TbPlus, TbRefresh } from 'react-icons/tb'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { CreateTicketModal } from './tickets/CreateTicketModal'
import { TicketDetailModal } from './tickets/TicketDetailModal'
import { PRIORITY_COLOR, STATUS_COLOR, ticketApi, type TicketListItem } from './tickets/ticket-types'

export function TicketsPanel() {
  const { data } = useSession()
  const user = data?.user
  const role = user?.role
  // QC tetap khusus untuk ticket workflow. ADMIN/lainnya butuh capability eksplisit.
  const canCreate = role === 'QC' || role === 'SUPER_ADMIN' || hasCapability(user, 'ticket:create')
  const isQc = role === 'QC' || role === 'SUPER_ADMIN'
  const isMobile = useMediaQuery('(max-width: 48em)')

  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: list, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['tickets', statusFilter],
    queryFn: () => {
      const qs = new URLSearchParams()
      if (statusFilter !== 'active' && statusFilter !== 'all') qs.set('status', statusFilter)
      return ticketApi<{ tickets: TicketListItem[] }>(`/api/tickets${qs.toString() ? `?${qs}` : ''}`)
    },
    refetchInterval: 15_000,
  })

  const tickets = (list?.tickets ?? []).filter((t) => {
    if (statusFilter === 'active') return t.status !== 'CLOSED'
    return true
  })

  const createMut = useMutation({
    mutationFn: (body: { title: string; description: string; priority: string; route?: string }) =>
      ticketApi<{ ticket: TicketListItem }>('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      setCreateOpen(false)
    },
  })

  return (
    <Container size="xl" px={{ base: 0, sm: 'md' }}>
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Group gap="xs">
            <TbBug size={20} />
            <Title order={4}>Tickets</Title>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Select
              size="xs"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v || 'active')}
              data={[
                { value: 'active', label: 'Aktif' },
                { value: 'all', label: 'Semua' },
                { value: 'OPEN', label: 'Open' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'READY_FOR_QC', label: 'QC' },
                { value: 'REOPENED', label: 'Reopened' },
                { value: 'CLOSED', label: 'Closed' },
              ]}
              w={isMobile ? 110 : 150}
              allowDeselect={false}
            />
            <ActionIcon variant="subtle" size="md" onClick={() => refetch()} loading={isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
            {canCreate && (
              <Button size="xs" leftSection={<TbPlus size={14} />} onClick={() => setCreateOpen(true)}>
                {isMobile ? 'Buat' : 'New Ticket'}
              </Button>
            )}
          </Group>
        </Group>

        {isMobile ? (
          <Stack gap="xs">
            {isLoading && <Text ta="center" c="dimmed" py="md" size="sm">Loading…</Text>}
            {!isLoading && tickets.length === 0 && (
              <Box p="lg" ta="center" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
                <Text size="sm" c="dimmed">Tidak ada ticket</Text>
              </Box>
            )}
            {tickets.map((t) => (
              <Box
                key={t.id}
                p="sm"
                style={{ cursor: 'pointer', border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
                onClick={() => setDetailId(t.id)}
              >
                <Group justify="space-between" mb={6} wrap="nowrap">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <Badge size="xs" color={STATUS_COLOR[t.status]} variant="light" style={{ flexShrink: 0 }}>{t.status.replace('_', ' ')}</Badge>
                    <Badge size="xs" color={PRIORITY_COLOR[t.priority]} variant="outline" style={{ flexShrink: 0 }}>{t.priority}</Badge>
                  </Group>
                  <TbChevronRight size={14} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                </Group>
                <Text size="sm" fw={500} lineClamp={2} mb={4}>{t.title}</Text>
                {t.route && <Text size="xs" c="dimmed" mb={4} lineClamp={1}>{t.route}</Text>}
                <Group gap="xs">
                  <Text size="xs" c="dimmed">{t.reporter.name}</Text>
                  {t.assignee && (
                    <>
                      <Text size="xs" c="dimmed">→</Text>
                      <Text size="xs">{t.assignee.name}</Text>
                    </>
                  )}
                  <Group gap={4} ml="auto">
                    <Badge size="xs" variant="default">{t._count.comments}c</Badge>
                    <Badge size="xs" variant="default">{t._count.evidence}e</Badge>
                  </Group>
                </Group>
              </Box>
            ))}
          </Stack>
        ) : (
          <Box p={0} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
            <ScrollArea>
              <Table striped highlightOnHover style={{ minWidth: 680 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 110 }}>Status</Table.Th>
                    <Table.Th style={{ width: 100 }}>Priority</Table.Th>
                    <Table.Th>Title</Table.Th>
                    <Table.Th style={{ width: 130 }}>Reporter</Table.Th>
                    <Table.Th style={{ width: 130 }}>Assignee</Table.Th>
                    <Table.Th style={{ width: 72 }}>Activity</Table.Th>
                    <Table.Th style={{ width: 36 }}></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {isLoading && (
                    <Table.Tr>
                      <Table.Td colSpan={7}><Text ta="center" c="dimmed" py="md">Loading…</Text></Table.Td>
                    </Table.Tr>
                  )}
                  {!isLoading && tickets.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={7}><Text ta="center" c="dimmed" py="md">No tickets</Text></Table.Td>
                    </Table.Tr>
                  )}
                  {tickets.map((t) => (
                    <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(t.id)}>
                      <Table.Td>
                        <Badge size="sm" color={STATUS_COLOR[t.status]} variant="light">{t.status.replace('_', ' ')}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" color={PRIORITY_COLOR[t.priority]} variant="outline">{t.priority}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500} lineClamp={1}>{t.title}</Text>
                        {t.route && <Text size="xs" c="dimmed">{t.route}</Text>}
                      </Table.Td>
                      <Table.Td><Text size="xs">{t.reporter.name}</Text></Table.Td>
                      <Table.Td>
                        <Text size="xs" c={t.assignee ? undefined : 'dimmed'}>{t.assignee?.name ?? '—'}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <Badge size="xs" variant="default">{t._count.comments}c</Badge>
                          <Badge size="xs" variant="default">{t._count.evidence}e</Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td><TbChevronRight size={14} /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Box>
        )}
      </Stack>

      <CreateTicketModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(data) => createMut.mutate(data)}
        loading={createMut.isPending}
        error={createMut.error?.message}
      />

      {detailId && (
        <TicketDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          canQc={isQc}
          canAdmin={role === 'ADMIN' || role === 'SUPER_ADMIN'}
        />
      )}
    </Container>
  )
}
