import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  Pagination,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { useDebouncedValue, useHotkeys, useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TbAlertTriangle,
  TbChevronLeft,
  TbChevronRight,
  TbInfoCircle,
  TbNote,
  TbPlus,
  TbSearch,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { NoteCardGrid, NoteCardList, HOVER_STYLES, stripMarkdown, type Note } from './NoteCard'
import { NoteViewInline } from './NoteViewInline'
import { NotesPanelToolbar } from './NotesPanelToolbar'
import { absoluteTime, NoteForm } from './NoteModals'

export interface NotesPanelProps {
  slug: string
  canEdit: boolean
  canCreate: boolean
  isOwner: boolean
  myUserId: string
}

export function NotesPanel({ slug, canEdit, canCreate, isOwner, myUserId }: NotesPanelProps) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { tab, fileId, fileNew, viewFileId, aliasId, aliasNew, viewAliasId, noteId, noteNew, viewNoteId } = useSearch({
    from: '/envmanager/$slug/',
  })

  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({
    key: `envman:notes:${slug}:tagFilter`,
    defaultValue: [],
  })
  const [sort, setSort] = useLocalStorage<'updated' | 'created' | 'title'>({
    key: `envman:notes:${slug}:sort`,
    defaultValue: 'updated',
  })
  const [view, setView] = useLocalStorage<'list' | 'grid'>({
    key: 'envman:notes:view',
    defaultValue: 'list',
  })
  const [debouncedSearch] = useDebouncedValue(search, 150)
  const searchRef = useRef<HTMLInputElement>(null)

  useHotkeys([['/', () => { searchRef.current?.focus(); searchRef.current?.select() }]])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['envman', 'notes', slug],
    queryFn: () => apiFetch<{ notes: Note[] }>(`/api/envman/projects/${slug}/notes`),
    refetchInterval: 30000,
  })
  const notes: Note[] = data?.notes ?? []

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: `${value} (${count})` }))
  }, [notes])

  const filtered = useMemo(() => {
    let list = [...notes]
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(
        (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (tagFilter.length > 0) list = list.filter((n) => tagFilter.every((t) => n.tags.includes(t)))
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return list
  }, [notes, debouncedSearch, tagFilter, sort])

  const NOTES_PER_PAGE = 12
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [])
  const totalPages = Math.ceil(filtered.length / NOTES_PER_PAGE)
  const paginated = filtered.slice((page - 1) * NOTES_PER_PAGE, page * NOTES_PER_PAGE)

  const pinnedCount = notes.filter((n) => n.pinned).length
  const myCount = notes.filter((n) => n.author.id === myUserId).length
  const hasFilter = debouncedSearch.trim().length > 0 || tagFilter.length > 0

  const addTagFilter = (tag: string) => setTagFilter((prev) => (prev.includes(tag) ? prev : [...prev, tag]))
  const resetFilter = () => { setSearch(''); setTagFilter([]) }

  const navBase = { tab, fileId, fileNew, viewFileId, aliasId, aliasNew, viewAliasId }
  const openNoteView = (note: Note) =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: { ...navBase, noteId: undefined, noteNew: false, viewNoteId: note.id } })
  const openNoteForm = (note: Note | 'new') =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: { ...navBase, noteId: note === 'new' ? undefined : note.id, noteNew: note === 'new', viewNoteId: undefined } })
  const closeNote = () =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: { ...navBase, noteId: undefined, noteNew: false, viewNoteId: undefined } })

  const togglePin = async (note: Note) => {
    await qc.cancelQueries({ queryKey: ['envman', 'notes', slug] })
    const previous = qc.getQueryData<{ notes: Note[] }>(['envman', 'notes', slug])
    qc.setQueryData(['envman', 'notes', slug], (old: any) => ({
      ...old,
      notes: old?.notes?.map((n: Note) => (n.id === note.id ? { ...n, pinned: !n.pinned } : n)) ?? [],
    }))
    apiFetch(`/api/envman/projects/${slug}/notes/${note.id}`, { method: 'PUT', body: JSON.stringify({ pinned: !note.pinned }) })
      .catch(() => { if (previous) qc.setQueryData(['envman', 'notes', slug], previous); notifyErr(new Error('Gagal mengubah pin')) })
      .finally(() => qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] }))
  }

  const deleteNote = (note: Note, onDeleted?: () => void) =>
    modals.openConfirmModal({
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md"><TbTrash size={13} /></ThemeIcon>
          <Text fw={600} size="sm">Hapus note</Text>
        </Group>
      ),
      children: (
        <Stack gap="xs">
          <Text size="sm">Hapus note <strong>{note.title}</strong>?</Text>
          {note.body && (
            <Box p="xs" bg="var(--mantine-color-default-hover)" style={{ border: '1px solid var(--mantine-color-default-border)' }}>
              <Text size="xs" c="dimmed" lineClamp={3}>{stripMarkdown(note.body, 200)}</Text>
            </Box>
          )}
          <Text size="xs" c="dimmed">
            Dibuat {absoluteTime(note.createdAt)} oleh {note.author.name}. Tindakan ini tidak dapat dibatalkan.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red', leftSection: <TbTrash size={13} /> },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/notes/${note.id}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] }); notifyOk('Note dihapus'); onDeleted?.() })
          .catch(notifyErr),
    })

  if (noteNew || noteId) {
    const editingNote = noteId ? notes.find((n) => n.id === noteId) : undefined
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="lg">
          <Group gap={6} align="center">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeNote}><TbChevronLeft size={15} /></ActionIcon>
            <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeNote}>Notes</Anchor>
            <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
            <Text size="sm" fw={600}>{noteId ? (editingNote ? `Edit: ${editingNote.title}` : '...') : 'Buat Note Baru'}</Text>
          </Group>
          <Divider />
          {isLoading && noteId ? <Skeleton height={400} radius="md" /> : <NoteForm slug={slug} note={editingNote} onClose={closeNote} />}
        </Stack>
      </Paper>
    )
  }

  if (viewNoteId) {
    return (
      <NoteViewInline
        viewNoteId={viewNoteId}
        notes={notes}
        isLoading={isLoading}
        isOwner={isOwner}
        canEdit={canEdit}
        myUserId={myUserId}
        onClose={closeNote}
        onEdit={openNoteForm}
        onDelete={(note) => deleteNote(note, closeNote)}
        onPin={togglePin}
        onTagClick={addTagFilter}
      />
    )
  }

  return (
    <Stack gap="sm">
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      <Alert variant="light" color="blue" radius="md" p="xs" icon={<TbInfoCircle size={15} />}
        styles={{ message: { fontSize: 'var(--mantine-font-size-xs)' }, body: { gap: 4 } }}>
        Notes untuk dokumentasi internal: runbook, deployment guide, troubleshooting log, atau catatan tim. Mendukung Markdown.
        Pin note penting agar tampil di atas. Tekan <kbd style={{ fontSize: 11, padding: '0 4px', border: '1px solid var(--mantine-color-default-border)' }}>/</kbd> untuk cari cepat.
      </Alert>

      {!isError && (notes.length > 0 || isLoading) && (
        <NotesPanelToolbar
          search={search}
          onSearchChange={setSearch}
          searchRef={searchRef}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          canEdit={canEdit}
          canCreate={canCreate}
          allTags={allTags}
          notesTotal={notes.length}
          filteredTotal={filtered.length}
          hasFilter={hasFilter}
          pinnedCount={pinnedCount}
          myCount={myCount}
          onNewNote={() => openNoteForm('new')}
          onResetFilter={resetFilter}
        />
      )}

      {isError && (
        <Box p="xl" ta="center" style={{ border: '1px solid var(--mantine-color-red-5)' }}>
          <ThemeIcon size={44} radius="xl" variant="light" color="red" mx="auto" mb="sm"><TbAlertTriangle size={22} /></ThemeIcon>
          <Text fw={600} mb={4}>Gagal memuat notes</Text>
          <Text size="sm" c="dimmed" mb="md">{(error as Error)?.message ?? 'Terjadi kesalahan saat memuat notes.'}</Text>
          <Button size="xs" variant="light" color="red" onClick={() => refetch()}>Coba lagi</Button>
        </Box>
      )}

      {isLoading ? (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={156} radius="md" />)}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={76} radius="md" />)}
          </Stack>
        )
      ) : !isError && notes.length === 0 ? (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="primary" mx="auto" mb="sm"><TbNote size={24} /></ThemeIcon>
          <Text fw={600} mb={4}>Belum ada notes</Text>
          <Text size="sm" c="dimmed" mb="md" maw={400} mx="auto">
            Notes untuk dokumentasi project: deployment instructions, troubleshooting log, runbook, atau apapun yang berguna untuk tim. Mendukung Markdown.
          </Text>
          {canEdit && canCreate && (
            <Button type="button" size="xs" color="primary" leftSection={<TbPlus size={13} />} onClick={() => openNoteForm('new')}>
              Buat Note Pertama
            </Button>
          )}
        </Box>
      ) : !isError && filtered.length === 0 ? (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm"><TbSearch size={22} /></ThemeIcon>
          <Text fw={500} size="sm" mb={4}>Tidak ada note yang cocok</Text>
          <Text size="xs" c="dimmed" mb="sm">Coba ubah filter atau kata kunci pencarian.</Text>
          <Button type="button" size="xs" variant="subtle" leftSection={<TbX size={11} />} onClick={resetFilter}>Reset filter</Button>
        </Box>
      ) : !isError && view === 'list' ? (
        <>
          <Stack gap="xs">
            {paginated.map((note) => (
              <NoteCardList key={note.id} note={note} canEdit={canEdit} isOwner={isOwner} myUserId={myUserId}
                onView={() => openNoteView(note)} onEdit={() => openNoteForm(note)} onDelete={() => deleteNote(note)} onPin={() => togglePin(note)} onTagClick={addTagFilter} />
            ))}
          </Stack>
          {totalPages > 1 && <Group justify="center" mt="sm"><Pagination value={page} onChange={setPage} total={totalPages} size="sm" /></Group>}
        </>
      ) : !isError ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            {paginated.map((note) => (
              <NoteCardGrid key={note.id} note={note} canEdit={canEdit} isOwner={isOwner} myUserId={myUserId}
                onView={() => openNoteView(note)} onEdit={() => openNoteForm(note)} onDelete={() => deleteNote(note)} onPin={() => togglePin(note)} onTagClick={addTagFilter} />
            ))}
          </SimpleGrid>
          {totalPages > 1 && <Group justify="center" mt="sm"><Pagination value={page} onChange={setPage} total={totalPages} size="sm" /></Group>}
        </>
      ) : null}
    </Stack>
  )
}
