import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  CopyButton,
  Group,
  MultiSelect,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  TbBookmark,
  TbBookmarkFilled,
  TbCheck,
  TbChevronRight,
  TbCopy,
  TbEdit,
  TbLayoutGrid,
  TbLayoutList,
  TbNote,
  TbPlus,
  TbSearch,
  TbSortAscending,
  TbTag,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { modals } from '@mantine/modals'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

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
  relTime: (iso: string) => string
}

export interface NotesPanelProps {
  slug: string
  canEdit: boolean
  isOwner: boolean
  myUserId: string
  openModal: Note | null | 'new'
  setOpenModal: (n: Note | null | 'new') => void
  viewNote: Note | null
  setViewNote: (n: Note | null) => void
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}h lalu`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function NoteCardActions({ note, canEdit, isOwner, myUserId, onView, onEdit, onDelete, onPin }: NoteCardProps) {
  const canEditNote = isOwner || (canEdit && note.author.id === myUserId)
  return (
    <Group gap={4} wrap="nowrap" onClick={e => e.stopPropagation()}>
      <CopyButton value={note.body} timeout={2000}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Tersalin!' : 'Copy'} position="left">
            <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={e => { e.stopPropagation(); copy() }}>
              {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
      {(isOwner || (canEdit && note.author.id === myUserId)) && (
        <Tooltip label={note.pinned ? 'Unpin' : 'Pin'} position="left">
          <ActionIcon size="sm" variant="subtle" color={note.pinned ? 'yellow' : 'gray'} onClick={e => { e.stopPropagation(); onPin() }}>
            {note.pinned ? <TbBookmarkFilled size={13} /> : <TbBookmark size={13} />}
          </ActionIcon>
        </Tooltip>
      )}
      {canEditNote && (
        <>
          <Tooltip label="Edit" position="left">
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={e => { e.stopPropagation(); onEdit() }}>
              <TbEdit size={13} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Hapus" position="left">
            <ActionIcon size="sm" variant="subtle" color="red" onClick={e => { e.stopPropagation(); onDelete() }}>
              <TbTrash size={13} />
            </ActionIcon>
          </Tooltip>
        </>
      )}
      <ActionIcon size="sm" variant="subtle" color="gray" onClick={e => { e.stopPropagation(); onView() }}>
        <TbChevronRight size={13} />
      </ActionIcon>
    </Group>
  )
}

function NoteCardList(props: NoteCardProps) {
  const { note, onView } = props
  return (
    <Card
      withBorder
      p="sm"
      style={{ cursor: 'pointer', borderLeft: note.pinned ? '3px solid var(--mantine-color-yellow-5)' : undefined }}
      onClick={onView}
    >
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" mb={2} wrap="nowrap">
            {note.pinned && <TbBookmarkFilled size={14} color="var(--mantine-color-yellow-5)" style={{ flexShrink: 0 }} />}
            <Text fw={600} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {note.title}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" lineClamp={1} style={{ fontFamily: 'monospace' }}>
            {note.body.replace(/#{1,6}\s|[*_`>-]/g, '').slice(0, 120) || '—'}
          </Text>
          <Group gap={4} mt={4} wrap="wrap">
            {note.tags.map(t => <Badge key={t} size="xs" variant="outline" color="violet">{t}</Badge>)}
            <Text size="xs" c="dimmed">{note.author.name} · {relTime(note.updatedAt)}</Text>
          </Group>
        </Box>
        <NoteCardActions {...props} />
      </Group>
    </Card>
  )
}

function NoteCardGrid(props: NoteCardProps) {
  const { note, onView } = props
  return (
    <Card
      withBorder
      p="sm"
      style={{
        cursor: 'pointer',
        borderTop: note.pinned ? '3px solid var(--mantine-color-yellow-5)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        height: 180,
      }}
      onClick={onView}
    >
      <Group justify="space-between" wrap="nowrap" mb={6} gap="xs">
        <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {note.pinned && <TbBookmarkFilled size={12} color="var(--mantine-color-yellow-5)" style={{ flexShrink: 0 }} />}
          <Text fw={600} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {note.title}
          </Text>
        </Group>
        <NoteCardActions {...props} />
      </Group>
      <Text size="xs" c="dimmed" lineClamp={3} style={{ fontFamily: 'monospace', flex: 1 }}>
        {note.body.replace(/#{1,6}\s|[*_`>-]/g, '').replace(/\n/g, ' ').slice(0, 200) || '—'}
      </Text>
      <Group gap={4} mt="xs" wrap="wrap" style={{ marginTop: 'auto' }}>
        {note.tags.slice(0, 3).map(t => <Badge key={t} size="xs" variant="outline" color="violet">{t}</Badge>)}
        {note.tags.length > 3 && <Text size="xs" c="dimmed">+{note.tags.length - 3}</Text>}
        <Text size="xs" c="dimmed" ml="auto">{relTime(note.updatedAt)}</Text>
      </Group>
    </Card>
  )
}

export function NotesPanel({ slug, canEdit, isOwner, myUserId, openModal, setOpenModal, viewNote, setViewNote }: NotesPanelProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated')
  const [view, setView] = useLocalStorage<'list' | 'grid'>({ key: 'envman:notes:view', defaultValue: 'list' })

  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'notes', slug],
    queryFn: () => apiFetch<{ notes: Note[] }>(`/api/envman/projects/${slug}/notes`),
    refetchInterval: 30000,
  })
  const notes: Note[] = data?.notes ?? []

  const allTags = useMemo(() => [...new Set(notes.flatMap(n => n.tags))].sort(), [notes])

  const filtered = useMemo(() => {
    let list = [...notes]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q)))
    }
    if (tagFilter.length > 0) {
      list = list.filter(n => tagFilter.every(t => n.tags.includes(t)))
    }
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return list
  }, [notes, search, tagFilter, sort])

  const togglePin = async (note: Note) => {
    await qc.cancelQueries({ queryKey: ['envman', 'notes', slug] })
    const previous = qc.getQueryData<{ notes: Note[] }>(['envman', 'notes', slug])
    qc.setQueryData(['envman', 'notes', slug], (old: any) => ({
      ...old,
      notes: old?.notes?.map((n: Note) => n.id === note.id ? { ...n, pinned: !n.pinned } : n) ?? [],
    }))
    apiFetch(`/api/envman/projects/${slug}/notes/${note.id}`, {
      method: 'PUT',
      body: JSON.stringify({ pinned: !note.pinned }),
    })
      .catch(() => {
        if (previous) qc.setQueryData(['envman', 'notes', slug], previous)
        notifyErr(new Error('Gagal mengubah pin'))
      })
      .finally(() => qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] }))
  }

  const deleteNote = (note: Note) =>
    modals.openConfirmModal({
      title: 'Hapus note',
      children: <Text size="sm">Hapus note <strong>{note.title}</strong>?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/notes/${note.id}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] }); notifyOk('Note dihapus') })
          .catch(notifyErr),
    })

  const canEditNote = (note: Note) => isOwner || (canEdit && note.author.id === myUserId)

  return (
    <Stack gap="sm">
      {/* ─── Toolbar ────────────────────────── */}
      <Group gap="xs">
        <TextInput
          size="xs"
          placeholder="Cari notes..."
          leftSection={<TbSearch size={13} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          rightSection={search ? <ActionIcon size="xs" variant="subtle" onClick={() => setSearch('')}><TbX size={11} /></ActionIcon> : undefined}
          style={{ flex: 1 }}
        />
        {allTags.length > 0 && (
          <MultiSelect
            size="xs"
            placeholder="Filter tag..."
            data={allTags}
            value={tagFilter}
            onChange={setTagFilter}
            leftSection={<TbTag size={13} />}
            clearable
            w={180}
          />
        )}
        <Select
          size="xs"
          w={130}
          leftSection={<TbSortAscending size={13} />}
          value={sort}
          onChange={v => setSort((v ?? 'updated') as typeof sort)}
          data={[
            { label: 'Terbaru edit', value: 'updated' },
            { label: 'Terbaru buat', value: 'created' },
            { label: 'Judul A-Z', value: 'title' },
          ]}
          allowDeselect={false}
        />
        <Group gap={2}>
          <Tooltip label="List view" position="bottom">
            <ActionIcon
              size="sm"
              variant={view === 'list' ? 'filled' : 'subtle'}
              color={view === 'list' ? 'violet' : 'gray'}
              onClick={() => setView('list')}
            >
              <TbLayoutList size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Grid view" position="bottom">
            <ActionIcon
              size="sm"
              variant={view === 'grid' ? 'filled' : 'subtle'}
              color={view === 'grid' ? 'violet' : 'gray'}
              onClick={() => setView('grid')}
            >
              <TbLayoutGrid size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        {canEdit && (
          <Button type="button" size="xs" leftSection={<TbPlus size={13} />} onClick={() => setOpenModal('new')}>
            New Note
          </Button>
        )}
      </Group>

      {/* ─── Note list ───────────────────── */}
      {isLoading ? (
        <Stack gap="xs">
          {[1, 2, 3].map(i => <Skeleton key={i} height={72} radius="md" />)}
        </Stack>
      ) : notes.length === 0 ? (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={40} radius="xl" variant="light" color="violet" mx="auto" mb="sm">
            <TbNote size={20} />
          </ThemeIcon>
          <Text fw={500} mb={4}>Belum ada notes</Text>
          <Text size="sm" c="dimmed" mb="md">Buat catatan dalam Markdown untuk project ini.</Text>
          {canEdit && (
            <Button type="button" size="xs" leftSection={<TbPlus size={13} />} onClick={() => setOpenModal('new')}>
              Buat Note Pertama
            </Button>
          )}
        </Card>
      ) : filtered.length === 0 ? (
        <Card withBorder p="md" ta="center" style={{ borderStyle: 'dashed' }}>
          <Text size="sm" c="dimmed">Tidak ada note yang cocok.</Text>
          <Button type="button" size="xs" variant="subtle" mt="xs" onClick={() => { setSearch(''); setTagFilter([]) }}>Reset Filter</Button>
        </Card>
      ) : view === 'list' ? (
        <Stack gap="xs">
          {filtered.map(note => (
            <NoteCardList
              key={note.id}
              note={note}
              canEdit={canEdit}
              isOwner={isOwner}
              myUserId={myUserId}
              onView={() => setViewNote(note)}
              onEdit={() => setOpenModal(note)}
              onDelete={() => deleteNote(note)}
              onPin={() => togglePin(note)}
              relTime={relTime}
            />
          ))}
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
          {filtered.map(note => (
            <NoteCardGrid
              key={note.id}
              note={note}
              canEdit={canEdit}
              isOwner={isOwner}
              myUserId={myUserId}
              onView={() => setViewNote(note)}
              onEdit={() => setOpenModal(note)}
              onDelete={() => deleteNote(note)}
              onPin={() => togglePin(note)}
              relTime={relTime}
            />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  )
}
