import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Group,
  Menu,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbBug, TbCheck, TbChevronRight, TbMessagePlus, TbPaperclip, TbPlus, TbRefresh, TbRotate } from 'react-icons/tb'
import { hasCapability, type Role, useSession } from '@/frontend/hooks/useAuth'

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface TicketUser {
  id: string
  name: string
  email: string
  role: Role
}

interface TicketListItem {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  route: string | null
  reporter: TicketUser
  assignee: TicketUser | null
  createdAt: string
  updatedAt: string
  _count: { comments: number; evidence: number }
}

interface TicketComment {
  id: string
  authorTag: string
  body: string
  createdAt: string
  author: TicketUser | null
}

interface TicketEvidence {
  id: string
  kind: string
  url: string
  note: string | null
  createdAt: string
}

interface TicketDetail extends Omit<TicketListItem, '_count'> {
  comments: TicketComment[]
  evidence: TicketEvidence[]
}

const STATUS_COLOR: Record<TicketStatus, string> = {
  OPEN: 'blue',
  IN_PROGRESS: 'violet',
  READY_FOR_QC: 'yellow',
  REOPENED: 'orange',
  CLOSED: 'green',
}

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

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

  const {
    data: list,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['tickets', statusFilter],
    queryFn: () => {
      const qs = new URLSearchParams()
      if (statusFilter !== 'active' && statusFilter !== 'all') qs.set('status', statusFilter)
      return api<{ tickets: TicketListItem[] }>(`/api/tickets${qs.toString() ? `?${qs}` : ''}`)
    },
    refetchInterval: 15_000,
  })

  const tickets = (list?.tickets ?? []).filter((t) => {
    if (statusFilter === 'active') return t.status !== 'CLOSED'
    return true
  })

  const createMut = useMutation({
    mutationFn: (body: { title: string; description: string; priority: string; route?: string }) =>
      api<{ ticket: TicketListItem }>('/api/tickets', {
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
        {/* Header */}
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

        {/* Mobile: card list */}
        {isMobile ? (
          <Stack gap="xs">
            {isLoading && (
              <Text ta="center" c="dimmed" py="md" size="sm">
                Loading…
              </Text>
            )}
            {!isLoading && tickets.length === 0 && (
              <Box
                p="lg"
                ta="center"
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-md)',
                }}
              >
                <Text size="sm" c="dimmed">
                  Tidak ada ticket
                </Text>
              </Box>
            )}
            {tickets.map((t) => (
              <Box
                key={t.id}
                p="sm"
                style={{
                  cursor: 'pointer',
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-md)',
                }}
                onClick={() => setDetailId(t.id)}
              >
                <Group justify="space-between" mb={6} wrap="nowrap">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <Badge size="xs" color={STATUS_COLOR[t.status]} variant="light" style={{ flexShrink: 0 }}>
                      {t.status.replace('_', ' ')}
                    </Badge>
                    <Badge size="xs" color={PRIORITY_COLOR[t.priority]} variant="outline" style={{ flexShrink: 0 }}>
                      {t.priority}
                    </Badge>
                  </Group>
                  <TbChevronRight size={14} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                </Group>
                <Text size="sm" fw={500} lineClamp={2} mb={4}>
                  {t.title}
                </Text>
                {t.route && (
                  <Text size="xs" c="dimmed" mb={4} lineClamp={1}>
                    {t.route}
                  </Text>
                )}
                <Group gap="xs">
                  <Text size="xs" c="dimmed">
                    {t.reporter.name}
                  </Text>
                  {t.assignee && (
                    <>
                      <Text size="xs" c="dimmed">
                        →
                      </Text>
                      <Text size="xs">{t.assignee.name}</Text>
                    </>
                  )}
                  <Group gap={4} ml="auto">
                    <Badge size="xs" variant="default">
                      {t._count.comments}c
                    </Badge>
                    <Badge size="xs" variant="default">
                      {t._count.evidence}e
                    </Badge>
                  </Group>
                </Group>
              </Box>
            ))}
          </Stack>
        ) : (
          /* Desktop: scrollable table */
          <Box
            p={0}
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
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
                      <Table.Td colSpan={7}>
                        <Text ta="center" c="dimmed" py="md">
                          Loading…
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {!isLoading && tickets.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Text ta="center" c="dimmed" py="md">
                          No tickets
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {tickets.map((t) => (
                    <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(t.id)}>
                      <Table.Td>
                        <Badge size="sm" color={STATUS_COLOR[t.status]} variant="light">
                          {t.status.replace('_', ' ')}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" color={PRIORITY_COLOR[t.priority]} variant="outline">
                          {t.priority}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500} lineClamp={1}>
                          {t.title}
                        </Text>
                        {t.route && (
                          <Text size="xs" c="dimmed">
                            {t.route}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{t.reporter.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c={t.assignee ? undefined : 'dimmed'}>
                          {t.assignee?.name ?? '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <Badge size="xs" variant="default">
                            {t._count.comments}c
                          </Badge>
                          <Badge size="xs" variant="default">
                            {t._count.evidence}e
                          </Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <TbChevronRight size={14} />
                      </Table.Td>
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

function CreateTicketModal({
  opened,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  opened: boolean
  onClose: () => void
  onSubmit: (d: { title: string; description: string; priority: string; route?: string }) => void
  loading: boolean
  error?: string
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [route, setRoute] = useState('')

  const submit = () => {
    if (!title.trim() || !description.trim()) return
    onSubmit({ title: title.trim(), description: description.trim(), priority, route: route.trim() || undefined })
  }

  return (
    <Modal opened={opened} onClose={onClose} title="New Ticket" size="lg">
      <Stack gap="sm">
        {error && <Alert color="red">{error}</Alert>}
        <TextInput label="Title" required value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
        <Textarea
          label="Description"
          description="Repro steps, expected vs actual, screenshots links"
          required
          minRows={6}
          autosize
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <Group grow>
          <Select
            label="Priority"
            value={priority}
            onChange={(v) => setPriority(v || 'MEDIUM')}
            data={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
          />
          <TextInput
            label="Route (optional)"
            placeholder="/dashboard?tab=analytics"
            value={route}
            onChange={(e) => setRoute(e.currentTarget.value)}
          />
        </Group>
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading}>
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function TicketDetailModal({
  id,
  onClose,
  canQc,
  canAdmin,
}: {
  id: string
  onClose: () => void
  canQc: boolean
  canAdmin: boolean
}) {
  const queryClient = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tickets', 'detail', id],
    queryFn: () => api<{ ticket: TicketDetail }>(`/api/tickets/${id}`),
  })

  const [commentBody, setCommentBody] = useState('')
  const [evidenceKind, setEvidenceKind] = useState('screenshot')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceNote, setEvidenceNote] = useState('')

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      refetch()
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const addComment = useMutation({
    mutationFn: (body: string) =>
      api(`/api/tickets/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setCommentBody('')
      refetch()
    },
  })

  const addEvidence = useMutation({
    mutationFn: (body: { kind: string; url: string; note?: string }) =>
      api(`/api/tickets/${id}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setEvidenceUrl('')
      setEvidenceNote('')
      refetch()
    },
  })

  const ticket = data?.ticket

  return (
    <Modal opened onClose={onClose} size="xl" title={ticket ? `#${ticket.id.slice(0, 8)} — ${ticket.title}` : 'Ticket'}>
      {isLoading && <Text c="dimmed">Loading…</Text>}
      {ticket && (
        <Stack gap="md">
          <Group gap="xs">
            <Badge color={STATUS_COLOR[ticket.status]} variant="light">
              {ticket.status.replace('_', ' ')}
            </Badge>
            <Badge color={PRIORITY_COLOR[ticket.priority]} variant="outline">
              {ticket.priority}
            </Badge>
            {ticket.route && (
              <Badge color="gray" variant="default">
                {ticket.route}
              </Badge>
            )}
          </Group>

          <Box
            p="sm"
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-sm)',
            }}
          >
            <Text size="xs" c="dimmed" mb={4}>
              Description
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {ticket.description}
            </Text>
          </Box>

          <Group gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">
              Reporter: {ticket.reporter.name} ({ticket.reporter.role})
            </Text>
            <Divider orientation="vertical" />
            <Text size="xs" c="dimmed">
              Assignee: {ticket.assignee?.name ?? '—'}
            </Text>
            <Divider orientation="vertical" />
            <Text size="xs" c="dimmed">
              Created: {new Date(ticket.createdAt).toLocaleString()}
            </Text>
          </Group>

          {/* Status actions */}
          <Box
            p="sm"
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-sm)',
            }}
          >
            <Text size="xs" c="dimmed" mb={6}>
              Actions
            </Text>
            <Group gap="xs">
              {canAdmin && ticket.status === 'OPEN' && (
                <Button size="xs" variant="light" onClick={() => patch.mutate({ status: 'IN_PROGRESS' })}>
                  Start work
                </Button>
              )}
              {canAdmin && ticket.status === 'IN_PROGRESS' && (
                <Button
                  size="xs"
                  variant="light"
                  color="yellow"
                  onClick={() => patch.mutate({ status: 'READY_FOR_QC' })}
                >
                  Ready for QC
                </Button>
              )}
              {canAdmin && ticket.status === 'REOPENED' && (
                <Button size="xs" variant="light" onClick={() => patch.mutate({ status: 'IN_PROGRESS' })}>
                  Resume work
                </Button>
              )}
              {canQc && ticket.status === 'READY_FOR_QC' && (
                <>
                  <Button
                    size="xs"
                    color="green"
                    leftSection={<TbCheck size={14} />}
                    onClick={() => patch.mutate({ status: 'CLOSED' })}
                  >
                    Approve & Close
                  </Button>
                  <Button
                    size="xs"
                    color="orange"
                    variant="light"
                    leftSection={<TbRotate size={14} />}
                    onClick={() => patch.mutate({ status: 'REOPENED' })}
                  >
                    Reopen
                  </Button>
                </>
              )}
              {canQc && ticket.status === 'CLOSED' && (
                <Button size="xs" color="orange" variant="light" onClick={() => patch.mutate({ status: 'REOPENED' })}>
                  Reopen
                </Button>
              )}
              {canQc &&
                (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS' || ticket.status === 'REOPENED') && (
                  <Button size="xs" color="green" variant="subtle" onClick={() => patch.mutate({ status: 'CLOSED' })}>
                    Close
                  </Button>
                )}
              <Menu>
                <Menu.Target>
                  <Button size="xs" variant="subtle">
                    Priority
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((p) => (
                    <Menu.Item key={p} onClick={() => patch.mutate({ priority: p })}>
                      {p}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </Group>
            {patch.error && (
              <Alert color="red" mt="xs">
                {patch.error.message}
              </Alert>
            )}
          </Box>

          {/* Comments */}
          <Box
            p="sm"
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-sm)',
            }}
          >
            <Text size="xs" c="dimmed" mb={6}>
              Comments ({ticket.comments.length})
            </Text>
            <Stack gap="xs">
              {ticket.comments.length === 0 && (
                <Text size="xs" c="dimmed">
                  No comments yet
                </Text>
              )}
              {ticket.comments.map((c) => (
                <Box
                  key={c.id}
                  p="xs"
                  style={{
                    border: '1px solid var(--mantine-color-default-border)',
                    borderRadius: 'var(--mantine-radius-xs)',
                  }}
                >
                  <Group gap="xs" mb={2}>
                    <Badge
                      size="xs"
                      color={c.authorTag === 'CLAUDE' ? 'violet' : c.authorTag === 'QC' ? 'yellow' : 'blue'}
                    >
                      {c.authorTag}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      {c.author?.name ?? 'System'}
                    </Text>
                    <Text size="xs" c="dimmed">
                      · {new Date(c.createdAt).toLocaleString()}
                    </Text>
                  </Group>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {c.body}
                  </Text>
                </Box>
              ))}
            </Stack>
            <Group mt="sm" align="flex-end">
              <Textarea
                placeholder="Add a comment…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.currentTarget.value)}
                autosize
                minRows={2}
                style={{ flex: 1 }}
              />
              <Button
                leftSection={<TbMessagePlus size={14} />}
                disabled={!commentBody.trim()}
                loading={addComment.isPending}
                onClick={() => addComment.mutate(commentBody.trim())}
              >
                Send
              </Button>
            </Group>
          </Box>

          {/* Evidence */}
          <Box
            p="sm"
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-sm)',
            }}
          >
            <Text size="xs" c="dimmed" mb={6}>
              Evidence ({ticket.evidence.length})
            </Text>
            <Stack gap={4}>
              {ticket.evidence.length === 0 && (
                <Text size="xs" c="dimmed">
                  No evidence attached
                </Text>
              )}
              {ticket.evidence.map((e) => (
                <Group key={e.id} gap="xs">
                  <Badge size="xs" variant="outline">
                    {e.kind}
                  </Badge>
                  <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                    {e.url}
                  </Text>
                  {e.note && (
                    <Text size="xs" c="dimmed">
                      — {e.note}
                    </Text>
                  )}
                </Group>
              ))}
            </Stack>
            <Group mt="sm" align="flex-end">
              <Select
                label="Kind"
                size="xs"
                value={evidenceKind}
                onChange={(v) => setEvidenceKind(v || 'screenshot')}
                data={['screenshot', 'commit', 'test_log', 'trace', 'other']}
                w={130}
              />
              <TextInput
                label="URL / path / hash"
                size="xs"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <TextInput
                label="Note"
                size="xs"
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.currentTarget.value)}
                w={180}
              />
              <Button
                size="xs"
                leftSection={<TbPaperclip size={14} />}
                disabled={!evidenceUrl.trim()}
                loading={addEvidence.isPending}
                onClick={() =>
                  addEvidence.mutate({
                    kind: evidenceKind,
                    url: evidenceUrl.trim(),
                    note: evidenceNote.trim() || undefined,
                  })
                }
              >
                Attach
              </Button>
            </Group>
          </Box>
        </Stack>
      )}
    </Modal>
  )
}
