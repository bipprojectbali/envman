import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useState } from 'react'
import { TbAlertTriangle, TbClock, TbExternalLink, TbPencil, TbPlugConnected, TbTrash } from 'react-icons/tb'
import { relativeDate } from '@/frontend/lib/project-utils'
import { HealthBadge } from './ConnectionHealthBadge'

export interface Connection {
  id: string
  name: string
  portainerUrl: string
  createdById: string
  createdAt: string
  _count: { configs: number }
}

export interface CardProps {
  connection: Connection
  health?: { totalStacks: number; activeStacks: number; inactiveStacks: number }
  canManage: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

export const HOVER_STYLES = `
.envman-conn-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-conn-card:hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-primary);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-conn-card:focus-visible {
  outline: 2px solid var(--mantine-color-primary);
  outline-offset: 2px;
  border-color: var(--mantine-color-primary);
}
`


export function ConnectionGridCard({ connection: c, health, canManage, onOpen, onEdit, onDelete }: CardProps) {
  return (
    <Paper
      radius={8}
      withBorder
      p="md"
      className="envman-conn-card"
      role="link"
      tabIndex={0}
      aria-label={`Buka connection ${c.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
    >
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <ThemeIcon size={40} radius="md" variant="light" color="primary">
          <TbPlugConnected size={20} />
        </ThemeIcon>
        {canManage && (
          <Group gap={4} onClick={(e) => e.stopPropagation()}>
            <Tooltip label="Edit">
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Edit connection" onClick={onEdit}>
                <TbPencil size={13} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Hapus">
              <ActionIcon size="sm" variant="subtle" color="red" aria-label="Hapus connection" onClick={onDelete}>
                <TbTrash size={13} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>

      <Text
        fw={700}
        size="md"
        mb={2}
        lh={1.3}
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {c.name}
      </Text>
      <Group gap={4} mb="xs" align="center">
        <Code
          fz="xs"
          c="dimmed"
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {c.portainerUrl.replace(/^https?:\/\//, '')}
        </Code>
        <Tooltip label="Buka Portainer UI">
          <ActionIcon
            size="xs"
            variant="subtle"
            color="gray"
            aria-label="Buka Portainer UI"
            component="a"
            href={c.portainerUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <TbExternalLink size={11} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Group
        gap="xs"
        mt="auto"
        pt="xs"
        wrap="wrap"
        style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
      >
        <Tooltip label={`${c._count.configs} environment menggunakan connection ini`}>
          <Badge size="xs" variant="default">
            {c._count.configs} env
          </Badge>
        </Tooltip>
        <HealthBadge health={health} />
        <Tooltip label={`Dibuat ${new Date(c.createdAt).toLocaleString('id-ID')}`}>
          <Group gap={4} style={{ marginLeft: 'auto' }}>
            <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Text size="xs" c="dimmed">
              {relativeDate(c.createdAt)}
            </Text>
          </Group>
        </Tooltip>
      </Group>
    </Paper>
  )
}

export function ConnectionListCard({ connection: c, health, canManage, onOpen, onEdit, onDelete }: CardProps) {
  return (
    <Paper
      radius={8}
      withBorder
      p="sm"
      className="envman-conn-card"
      role="link"
      tabIndex={0}
      aria-label={`Buka connection ${c.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={36} radius="md" variant="light" color="primary">
            <TbPlugConnected size={18} />
          </ThemeIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" mb={2} wrap="nowrap">
              <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </Text>
              <Tooltip label={`${c._count.configs} environment menggunakan connection ini`}>
                <Badge size="xs" variant="default">
                  {c._count.configs} env
                </Badge>
              </Tooltip>
              <HealthBadge health={health} />
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Code
                fz="xs"
                c="dimmed"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}
              >
                {c.portainerUrl.replace(/^https?:\/\//, '')}
              </Code>
              <Tooltip label="Buka Portainer UI">
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  aria-label="Buka Portainer UI"
                  component="a"
                  href={c.portainerUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <TbExternalLink size={11} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={`Dibuat ${new Date(c.createdAt).toLocaleString('id-ID')}`}>
                <Group gap={4}>
                  <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                  <Text size="xs" c="dimmed">
                    {relativeDate(c.createdAt)}
                  </Text>
                </Group>
              </Tooltip>
            </Group>
          </Box>
        </Group>
        {canManage && (
          <Group gap="xs" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
            <Tooltip label="Edit">
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Edit connection" onClick={onEdit}>
                <TbPencil size={13} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Hapus" position="left">
              <ActionIcon size="sm" variant="subtle" color="red" aria-label="Hapus connection" onClick={onDelete}>
                <TbTrash size={13} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>
    </Paper>
  )
}

export function DeleteConnectionConfirm({
  name,
  usedBy,
  onCancel,
  onConfirm,
}: {
  name: string
  usedBy: number
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const canDelete = typed === name

  const handleConfirm = async () => {
    if (!canDelete || loading) return
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm">
        Connection <strong>{name}</strong> akan dihapus.
      </Text>
      {usedBy > 0 && (
        <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
          <Text size="xs">
            <strong>{usedBy}</strong> environment masih menggunakan connection ini. Setelah dihapus, environment
            tersebut perlu dikonfigurasi ulang sebelum bisa sync ke Portainer.
          </Text>
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        Ketik <Code fz="xs">{name}</Code> untuk mengkonfirmasi:
      </Text>
      <TextInput
        size="sm"
        placeholder={name}
        value={typed}
        autoFocus
        data-autofocus
        spellCheck={false}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canDelete) handleConfirm()
        }}
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
        <Button
          color="red"
          leftSection={<TbTrash size={13} />}
          disabled={!canDelete}
          loading={loading}
          onClick={handleConfirm}
        >
          Hapus Permanen
        </Button>
      </Group>
    </Stack>
  )
}
