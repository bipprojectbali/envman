import { Alert, Button, Group, Modal, Select, Stack, Textarea, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { TicketListItem } from './ticket-types'

interface Props {
  opened: boolean
  onClose: () => void
  onSubmit: (d: { title: string; description: string; priority: string; route?: string }) => void
  loading: boolean
  error?: string
}

export function CreateTicketModal({ opened, onClose, onSubmit, loading, error }: Props) {
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

// Satisfy TS import — TicketListItem only needed for the parent consumer
export type { TicketListItem }
