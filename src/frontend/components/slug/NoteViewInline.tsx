import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import {
  TbBookmark,
  TbBookmarkFilled,
  TbChevronLeft,
  TbChevronRight,
  TbEdit,
  TbTrash,
} from 'react-icons/tb'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { absoluteTime, relTime } from './NoteModals'
import type { Note } from './NoteCard'

interface Props {
  viewNoteId: string
  notes: Note[]
  isLoading: boolean
  isOwner: boolean
  canEdit: boolean
  myUserId: string
  onClose: () => void
  onEdit: (note: Note) => void
  onDelete: (note: Note) => void
  onPin: (note: Note) => void
  onTagClick: (tag: string) => void
}

export function NoteViewInline({ viewNoteId, notes, isLoading, isOwner, canEdit, myUserId, onClose, onEdit, onDelete, onPin, onTagClick }: Props) {
  const viewingNote = notes.find((n) => n.id === viewNoteId)
  const canEditNote = viewingNote ? isOwner || (canEdit && viewingNote.author.id === myUserId) : false

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap={6} align="center" style={{ minWidth: 0, flex: 1 }}>
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={onClose}>
            Notes
          </Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {viewingNote ? viewingNote.title : '...'}
          </Text>
        </Group>
        {viewingNote && canEditNote && (
          <Group gap={4} style={{ flexShrink: 0 }}>
            <Tooltip label={viewingNote.pinned ? 'Lepas pin' : 'Pin note'} withArrow>
              <ActionIcon size="sm" variant="subtle" color={viewingNote.pinned ? 'yellow' : 'gray'} onClick={() => onPin(viewingNote)}>
                {viewingNote.pinned ? <TbBookmarkFilled size={14} /> : <TbBookmark size={14} />}
              </ActionIcon>
            </Tooltip>
            <Button size="xs" variant="light" leftSection={<TbEdit size={12} />} onClick={() => onEdit(viewingNote)}>Edit</Button>
            <Button size="xs" variant="light" color="red" leftSection={<TbTrash size={12} />} onClick={() => onDelete(viewingNote)}>Hapus</Button>
          </Group>
        )}
      </Group>

      {isLoading && !viewingNote ? (
        <Stack gap="sm">
          <Skeleton height={24} width={300} />
          <Skeleton height={300} radius="md" />
        </Stack>
      ) : viewingNote ? (
        <Stack gap="sm">
          {viewingNote.tags.length > 0 && (
            <Group gap={4}>
              {viewingNote.tags.map((t) => (
                <Badge key={t} size="xs" variant="light" color="primary" style={{ cursor: 'pointer' }}
                  onClick={() => { onClose(); onTagClick(t) }}>
                  {t}
                </Badge>
              ))}
            </Group>
          )}
          <Box p="md" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)', overflow: 'auto', maxHeight: 600 }}>
            {viewingNote.body ? (
              <MarkdownRenderer fontSize={13}>{viewingNote.body}</MarkdownRenderer>
            ) : (
              <Text size="sm" c="dimmed" fs="italic">Tidak ada konten.</Text>
            )}
          </Box>
          <Box p="xs" bg="var(--mantine-color-default-hover)" style={{ border: '1px solid var(--mantine-color-default-border)' }}>
            <Text size="xs" c="dimmed">
              Dibuat {absoluteTime(viewingNote.createdAt)} oleh {viewingNote.author.name}
              {new Date(viewingNote.updatedAt).getTime() - new Date(viewingNote.createdAt).getTime() > 60_000 && (
                <> · diedit {relTime(viewingNote.updatedAt)}</>
              )}
            </Text>
          </Box>
        </Stack>
      ) : (
        <Box p="xl" ta="center">
          <Text size="sm" c="dimmed">Note tidak ditemukan.</Text>
          <Button size="xs" variant="subtle" mt="sm" onClick={onClose}>Kembali ke Notes</Button>
        </Box>
      )}
    </Stack>
  )
}
