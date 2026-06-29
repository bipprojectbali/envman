import {
  ActionIcon,
  Badge,
  Box,
  CopyButton,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import {
  TbBookmark,
  TbBookmarkFilled,
  TbCheck,
  TbChevronRight,
  TbCopy,
  TbEdit,
  TbTrash,
} from 'react-icons/tb'
import { absoluteTime, relTime } from './NoteModals'

export interface Note {
  id: string
  title: string
  body: string
  pinned: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
  author: { id: string; name: string }
}

export interface NoteCardProps {
  note: Note
  canEdit: boolean
  isOwner: boolean
  myUserId: string
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onPin: () => void
  onTagClick: (tag: string) => void
}

export function stripMarkdown(body: string, max: number): string {
  const cleaned = body
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[image]')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*>\s*/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned || '—'
}

export const HOVER_STYLES = `
.envman-note-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-note-card:hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-primary);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-note-card:focus-visible {
  outline: 2px solid var(--mantine-color-primary);
  outline-offset: 2px;
  border-color: var(--mantine-color-primary);
}
.envman-note-pinned {
  background: linear-gradient(180deg, var(--mantine-color-yellow-light) 0%, transparent 24px);
}
.envman-note-tag {
  cursor: pointer;
  transition: transform 0.1s ease;
}
.envman-note-tag:hover {
  transform: scale(1.05);
}
`

function NoteCardActions({ note, canEdit, isOwner, myUserId, onView, onEdit, onDelete, onPin }: Omit<NoteCardProps, 'onTagClick'>) {
  const canEditNote = isOwner || (canEdit && note.author.id === myUserId)
  return (
    <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
      <CopyButton value={note.body} timeout={2000}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Tersalin!' : 'Salin isi note'} position="left">
            <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} aria-label="Salin isi note"
              onClick={(e) => { e.stopPropagation(); copy() }}>
              {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
      {canEditNote && (
        <Tooltip label={note.pinned ? 'Unpin' : 'Pin'} position="left">
          <ActionIcon size="sm" variant="subtle" color={note.pinned ? 'yellow' : 'gray'}
            aria-label={note.pinned ? 'Lepas pin note' : 'Pin note'}
            onClick={(e) => { e.stopPropagation(); onPin() }}>
            {note.pinned ? <TbBookmarkFilled size={13} /> : <TbBookmark size={13} />}
          </ActionIcon>
        </Tooltip>
      )}
      {canEditNote && (
        <>
          <Tooltip label="Edit" position="left">
            <ActionIcon size="sm" variant="subtle" color="blue" aria-label="Edit note"
              onClick={(e) => { e.stopPropagation(); onEdit() }}>
              <TbEdit size={13} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Hapus" position="left">
            <ActionIcon size="sm" variant="subtle" color="red" aria-label="Hapus note"
              onClick={(e) => { e.stopPropagation(); onDelete() }}>
              <TbTrash size={13} />
            </ActionIcon>
          </Tooltip>
        </>
      )}
      <Tooltip label="Buka note">
        <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Buka note"
          onClick={(e) => { e.stopPropagation(); onView() }}>
          <TbChevronRight size={13} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}

export function NoteCardList({ note, canEdit, isOwner, myUserId, onView, onEdit, onDelete, onPin, onTagClick }: NoteCardProps) {
  const wasEdited = new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 60_000
  return (
    <Box
      p="sm"
      className={`envman-note-card ${note.pinned ? 'envman-note-pinned' : ''}`}
      role="article"
      tabIndex={0}
      aria-label={`Note: ${note.title}`}
      onClick={onView}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView() } }}
      style={{
        cursor: 'pointer',
        border: note.pinned ? '0.1px solid var(--mantine-color-blue-5)' : '1px solid var(--mantine-color-default-border)',
        borderRadius: 9,
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" mb={2} wrap="nowrap">
            {note.pinned && <TbBookmarkFilled size={14} color="var(--mantine-color-yellow-5)" style={{ flexShrink: 0 }} />}
            <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {note.title}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" lineClamp={1}>{stripMarkdown(note.body, 140)}</Text>
          <Group gap={4} mt={4} wrap="wrap" align="center">
            {note.tags.map((t) => (
              <Badge key={t} size="xs" variant="outline" color="primary" className="envman-note-tag"
                onClick={(e) => { e.stopPropagation(); onTagClick(t) }}>
                {t}
              </Badge>
            ))}
            <Tooltip label={`${wasEdited ? 'Diedit' : 'Dibuat'} ${absoluteTime(note.updatedAt)} oleh ${note.author.name}`}>
              <Text size="xs" c="dimmed">
                {note.author.name} · {wasEdited ? 'edit ' : ''}{relTime(note.updatedAt)}
              </Text>
            </Tooltip>
          </Group>
        </Box>
        <NoteCardActions note={note} canEdit={canEdit} isOwner={isOwner} myUserId={myUserId}
          onView={onView} onEdit={onEdit} onDelete={onDelete} onPin={onPin} />
      </Group>
    </Box>
  )
}

export function NoteCardGrid({ note, canEdit, isOwner, myUserId, onView, onEdit, onDelete, onPin, onTagClick }: NoteCardProps) {
  const wasEdited = new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 60_000
  return (
    <Box
      p="sm"
      className={`envman-note-card ${note.pinned ? 'envman-note-pinned' : ''}`}
      role="article"
      tabIndex={0}
      aria-label={`Note: ${note.title}`}
      onClick={onView}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView() } }}
      style={{
        cursor: 'pointer',
        border: note.pinned ? '0.1px solid var(--mantine-color-blue-5)' : '1px solid var(--mantine-color-default-border)',
        borderRadius: 9,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 156,
      }}
    >
      <Group justify="space-between" wrap="nowrap" mb={6} gap="xs">
        <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {note.pinned && <TbBookmarkFilled size={12} color="var(--mantine-color-yellow-5)" style={{ flexShrink: 0 }} />}
          <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {note.title}
          </Text>
        </Group>
        <NoteCardActions note={note} canEdit={canEdit} isOwner={isOwner} myUserId={myUserId}
          onView={onView} onEdit={onEdit} onDelete={onDelete} onPin={onPin} />
      </Group>
      <Text size="xs" c="dimmed" lineClamp={3} lh={1.5} style={{ flex: 1 }}>
        {stripMarkdown(note.body, 240)}
      </Text>
      <Group gap={4} mt="xs" wrap="wrap" style={{ marginTop: 'auto' }} align="center">
        {note.tags.slice(0, 3).map((t) => (
          <Badge key={t} size="xs" variant="outline" color="primary" className="envman-note-tag"
            onClick={(e) => { e.stopPropagation(); onTagClick(t) }}>
            {t}
          </Badge>
        ))}
        {note.tags.length > 3 && (
          <Tooltip label={note.tags.slice(3).join(', ')}>
            <Text size="xs" c="dimmed">+{note.tags.length - 3}</Text>
          </Tooltip>
        )}
        <Tooltip label={`${wasEdited ? 'Diedit' : 'Dibuat'} ${absoluteTime(note.updatedAt)} oleh ${note.author.name}`}>
          <Text size="xs" c="dimmed" ml="auto">
            {wasEdited ? 'edit ' : ''}{relTime(note.updatedAt)}
          </Text>
        </Tooltip>
      </Group>
    </Box>
  )
}

// Re-export SimpleGrid so callers don't need to import Mantine for card layout
export { SimpleGrid }
// Re-export ThemeIcon for empty-state usage in parent
export { ThemeIcon }
