import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCheck, TbMessagePlus, TbPaperclip, TbRotate } from 'react-icons/tb'
import { PRIORITY_COLOR, STATUS_COLOR, ticketApi, type TicketDetail } from './ticket-types'

interface Props {
  id: string
  onClose: () => void
  canQc: boolean
  canAdmin: boolean
}

export function TicketDetailModal({ id, onClose, canQc, canAdmin }: Props) {
  const queryClient = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tickets', 'detail', id],
    queryFn: () => ticketApi<{ ticket: TicketDetail }>(`/api/tickets/${id}`),
  })

  const [commentBody, setCommentBody] = useState('')
  const [evidenceKind, setEvidenceKind] = useState('screenshot')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceNote, setEvidenceNote] = useState('')

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      ticketApi(`/api/tickets/${id}`, {
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
      ticketApi(`/api/tickets/${id}/comments`, {
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
      ticketApi(`/api/tickets/${id}/evidence`, {
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

          <Box p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
            <Text size="xs" c="dimmed" mb={4}>Description</Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</Text>
          </Box>

          <Group gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">Reporter: {ticket.reporter.name} ({ticket.reporter.role})</Text>
            <Divider orientation="vertical" />
            <Text size="xs" c="dimmed">Assignee: {ticket.assignee?.name ?? '—'}</Text>
            <Divider orientation="vertical" />
            <Text size="xs" c="dimmed">Created: {new Date(ticket.createdAt).toLocaleString()}</Text>
          </Group>

          <Box p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
            <Text size="xs" c="dimmed" mb={6}>Actions</Text>
            <Group gap="xs">
              {canAdmin && ticket.status === 'OPEN' && (
                <Button size="xs" variant="light" onClick={() => patch.mutate({ status: 'IN_PROGRESS' })}>Start work</Button>
              )}
              {canAdmin && ticket.status === 'IN_PROGRESS' && (
                <Button size="xs" variant="light" color="yellow" onClick={() => patch.mutate({ status: 'READY_FOR_QC' })}>Ready for QC</Button>
              )}
              {canAdmin && ticket.status === 'REOPENED' && (
                <Button size="xs" variant="light" onClick={() => patch.mutate({ status: 'IN_PROGRESS' })}>Resume work</Button>
              )}
              {canQc && ticket.status === 'READY_FOR_QC' && (
                <>
                  <Button size="xs" color="green" leftSection={<TbCheck size={14} />} onClick={() => patch.mutate({ status: 'CLOSED' })}>
                    Approve & Close
                  </Button>
                  <Button size="xs" color="orange" variant="light" leftSection={<TbRotate size={14} />} onClick={() => patch.mutate({ status: 'REOPENED' })}>
                    Reopen
                  </Button>
                </>
              )}
              {canQc && ticket.status === 'CLOSED' && (
                <Button size="xs" color="orange" variant="light" onClick={() => patch.mutate({ status: 'REOPENED' })}>Reopen</Button>
              )}
              {canQc && (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS' || ticket.status === 'REOPENED') && (
                <Button size="xs" color="green" variant="subtle" onClick={() => patch.mutate({ status: 'CLOSED' })}>Close</Button>
              )}
              <Menu>
                <Menu.Target>
                  <Button size="xs" variant="subtle">Priority</Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((p) => (
                    <Menu.Item key={p} onClick={() => patch.mutate({ priority: p })}>{p}</Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </Group>
            {patch.error && <Alert color="red" mt="xs">{patch.error.message}</Alert>}
          </Box>

          <Box p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
            <Text size="xs" c="dimmed" mb={6}>Comments ({ticket.comments.length})</Text>
            <Stack gap="xs">
              {ticket.comments.length === 0 && <Text size="xs" c="dimmed">No comments yet</Text>}
              {ticket.comments.map((c) => (
                <Box key={c.id} p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-xs)' }}>
                  <Group gap="xs" mb={2}>
                    <Badge size="xs" color={c.authorTag === 'CLAUDE' ? 'violet' : c.authorTag === 'QC' ? 'yellow' : 'blue'}>{c.authorTag}</Badge>
                    <Text size="xs" c="dimmed">{c.author?.name ?? 'System'}</Text>
                    <Text size="xs" c="dimmed">· {new Date(c.createdAt).toLocaleString()}</Text>
                  </Group>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{c.body}</Text>
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

          <Box p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
            <Text size="xs" c="dimmed" mb={6}>Evidence ({ticket.evidence.length})</Text>
            <Stack gap={4}>
              {ticket.evidence.length === 0 && <Text size="xs" c="dimmed">No evidence attached</Text>}
              {ticket.evidence.map((e) => (
                <Group key={e.id} gap="xs">
                  <Badge size="xs" variant="outline">{e.kind}</Badge>
                  <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>{e.url}</Text>
                  {e.note && <Text size="xs" c="dimmed">— {e.note}</Text>}
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
                onClick={() => addEvidence.mutate({ kind: evidenceKind, url: evidenceUrl.trim(), note: evidenceNote.trim() || undefined })}
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
