import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  CopyButton,
  Group,
  Kbd,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDebouncedValue, useHotkeys, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TbAlertTriangle,
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
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
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
  onTagClick: (tag: string) => void
}

export interface NotesPanelProps {
  slug: string
  canEdit: boolean
  canCreate: boolean
  isOwner: boolean
  myUserId: string
  openModal: Note | null | 'new'
  setOpenModal: (n: Note | null | 'new') => void
  viewNote: Note | null
  setViewNote: (n: Note | null) => void
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0 || Number.isNaN(diff)) return ''
  if (diff < 60_000) return 'baru saja'
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}h lalu`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function absoluteTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function stripMarkdown(body: string, max: number): string {
  const cleaned = body
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`[^`]+`/g, m => m.slice(1, -1))
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

const HOVER_STYLES = `
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
    <Group gap={4} wrap="nowrap" onClick={e => e.stopPropagation()}>
      <CopyButton value={note.body} timeout={2000}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Tersalin!' : 'Salin isi note'} position="left">
            <ActionIcon
              size="sm" variant="subtle"
              color={copied ? 'teal' : 'gray'}
              aria-label="Salin isi note"
              onClick={e => { e.stopPropagation(); copy() }}
            >
              {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
      {canEditNote && (
        <Tooltip label={note.pinned ? 'Unpin' : 'Pin'} position="left">
          <ActionIcon
            size="sm" variant="subtle"
            color={note.pinned ? 'yellow' : 'gray'}
            aria-label={note.pinned ? 'Lepas pin note' : 'Pin note'}
            onClick={e => { e.stopPropagation(); onPin() }}
          >
            {note.pinned ? <TbBookmarkFilled size={13} /> : <TbBookmark size={13} />}
          </ActionIcon>
        </Tooltip>
      )}
      {canEditNote && (
        <>
          <Tooltip label="Edit" position="left">
            <ActionIcon
              size="sm" variant="subtle" color="blue"
              aria-label="Edit note"
              onClick={e => { e.stopPropagation(); onEdit() }}
            >
              <TbEdit size={13} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Hapus" position="left">
            <ActionIcon
              size="sm" variant="subtle" color="red"
              aria-label="Hapus note"
              onClick={e => { e.stopPropagation(); onDelete() }}
            >
              <TbTrash size={13} />
            </ActionIcon>
          </Tooltip>
        </>
      )}
      <Tooltip label="Buka note">
        <ActionIcon
          size="sm" variant="subtle" color="gray"
          aria-label="Buka note"
          onClick={e => { e.stopPropagation(); onView() }}
        >
          <TbChevronRight size={13} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}

function NoteCardList({ note, canEdit, isOwner, myUserId, onView, onEdit, onDelete, onPin, onTagClick }: NoteCardProps) {
  const wasEdited = new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 60_000
  return (
    <Card
      withBorder
      p="sm"
      className={`envman-note-card ${note.pinned ? 'envman-note-pinned' : ''}`}
      role="article"
      tabIndex={0}
      aria-label={`Note: ${note.title}`}
      onClick={onView}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView() } }}
      style={{ cursor: 'pointer', borderLeft: note.pinned ? '3px solid var(--mantine-color-yellow-5)' : undefined }}
    >
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" mb={2} wrap="nowrap">
            {note.pinned && <TbBookmarkFilled size={14} color="var(--mantine-color-yellow-5)" style={{ flexShrink: 0 }} />}
            <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {note.title}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {stripMarkdown(note.body, 140)}
          </Text>
          <Group gap={4} mt={4} wrap="wrap" align="center">
            {note.tags.map(t => (
              <Badge
                key={t} size="xs" variant="outline" color="primary"
                className="envman-note-tag"
                onClick={e => { e.stopPropagation(); onTagClick(t) }}
              >
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
        <NoteCardActions
          note={note} canEdit={canEdit} isOwner={isOwner} myUserId={myUserId}
          onView={onView} onEdit={onEdit} onDelete={onDelete} onPin={onPin}
        />
      </Group>
    </Card>
  )
}

function NoteCardGrid({ note, canEdit, isOwner, myUserId, onView, onEdit, onDelete, onPin, onTagClick }: NoteCardProps) {
  const wasEdited = new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 60_000
  return (
    <Card
      withBorder
      p="sm"
      className={`envman-note-card ${note.pinned ? 'envman-note-pinned' : ''}`}
      role="article"
      tabIndex={0}
      aria-label={`Note: ${note.title}`}
      onClick={onView}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView() } }}
      style={{
        cursor: 'pointer',
        borderTop: note.pinned ? '3px solid var(--mantine-color-yellow-5)' : undefined,
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
        <NoteCardActions
          note={note} canEdit={canEdit} isOwner={isOwner} myUserId={myUserId}
          onView={onView} onEdit={onEdit} onDelete={onDelete} onPin={onPin}
        />
      </Group>
      <Text size="xs" c="dimmed" lineClamp={3} lh={1.5} style={{ flex: 1 }}>
        {stripMarkdown(note.body, 240)}
      </Text>
      <Group gap={4} mt="xs" wrap="wrap" style={{ marginTop: 'auto' }} align="center">
        {note.tags.slice(0, 3).map(t => (
          <Badge
            key={t} size="xs" variant="outline" color="primary"
            className="envman-note-tag"
            onClick={e => { e.stopPropagation(); onTagClick(t) }}
          >
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
    </Card>
  )
}

export function NotesPanel({ slug, canEdit, canCreate, isOwner, myUserId, setOpenModal, setViewNote }: NotesPanelProps) {
  const qc = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')

  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated')
  const [view, setView] = useLocalStorage<'list' | 'grid'>({ key: 'envman:notes:view', defaultValue: 'list' })
  const [debouncedSearch] = useDebouncedValue(search, 150)
  const searchRef = useRef<HTMLInputElement>(null)

  useHotkeys([
    ['/', () => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }],
  ])

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
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q)),
      )
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
  }, [notes, debouncedSearch, tagFilter, sort])

  const NOTES_PER_PAGE = 12
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [debouncedSearch, tagFilter, sort])
  const totalPages = Math.ceil(filtered.length / NOTES_PER_PAGE)
  const paginated = filtered.slice((page - 1) * NOTES_PER_PAGE, page * NOTES_PER_PAGE)

  const pinnedCount = notes.filter(n => n.pinned).length
  const myCount = notes.filter(n => n.author.id === myUserId).length
  const hasFilter = debouncedSearch.trim().length > 0 || tagFilter.length > 0

  const addTagFilter = (tag: string) =>
    setTagFilter(prev => prev.includes(tag) ? prev : [...prev, tag])

  const resetFilter = () => { setSearch(''); setTagFilter([]) }

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
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Hapus note</Text>
        </Group>
      ),
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Hapus note <strong>{note.title}</strong>?
          </Text>
          {note.body && (
            <Paper withBorder p="xs" bg="var(--mantine-color-default-hover)">
              <Text size="xs" c="dimmed" lineClamp={3}>
                {stripMarkdown(note.body, 200)}
              </Text>
            </Paper>
          )}
          <Text size="xs" c="dimmed">
            Dibuat {absoluteTime(note.createdAt)} oleh {note.author.name}.
            Tindakan ini tidak dapat dibatalkan.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red', leftSection: <TbTrash size={13} /> },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/notes/${note.id}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] }); notifyOk('Note dihapus') })
          .catch(notifyErr),
    })

  return (
    <Stack gap="sm">
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      {/* ─── Stats inline ───────────────────── */}
      {!isLoading && !isError && notes.length > 0 && (
        <Group gap="md" mb={-4}>
          <Text size="xs" c="dimmed">
            <Text component="span" fw={600} c="default">{notes.length}</Text> note
          </Text>
          {pinnedCount > 0 && (
            <Group gap={4}>
              <TbBookmarkFilled size={11} color="var(--mantine-color-yellow-5)" />
              <Text size="xs" c="dimmed">
                <Text component="span" fw={600} c="default">{pinnedCount}</Text> disematkan
              </Text>
            </Group>
          )}
          {myCount > 0 && (
            <Text size="xs" c="dimmed">
              <Text component="span" fw={600} c="default">{myCount}</Text> saya buat
            </Text>
          )}
        </Group>
      )}

      {/* ─── Toolbar ────────────────────────── */}
      {!isError && (notes.length > 0 || isLoading) && (
        <Paper withBorder radius="md" p="xs">
          <Group gap="xs" wrap="wrap">
            <TextInput
              ref={searchRef}
              size="xs"
              placeholder="Cari judul, isi, atau tag..."
              leftSection={<TbSearch size={13} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              rightSection={
                search ? (
                  <ActionIcon size="xs" variant="subtle" aria-label="Hapus pencarian" onClick={() => setSearch('')}>
                    <TbX size={11} />
                  </ActionIcon>
                ) : (
                  <Tooltip label="Tekan / untuk focus">
                    <Kbd size="xs">/</Kbd>
                  </Tooltip>
                )
              }
              rightSectionWidth={32}
              style={{ flex: '1 1 180px', minWidth: 0 }}
            />
            {!isMobile && allTags.length > 0 && (
              <MultiSelectChips
                size="xs"
                label="Tag"
                icon={<TbTag size={13} />}
                width={130}
                options={allTags}
                value={tagFilter}
                onChange={setTagFilter}
              />
            )}
            <Select
              size="xs"
              w={isMobile ? 130 : 150}
              leftSection={<TbSortAscending size={13} />}
              value={sort}
              onChange={v => setSort((v ?? 'updated') as typeof sort)}
              data={[
                { label: 'Terbaru edit', value: 'updated' },
                { label: 'Terbaru buat', value: 'created' },
                { label: 'Judul A→Z', value: 'title' },
              ]}
              allowDeselect={false}
            />
            <Group gap={2} wrap="nowrap">
              <Tooltip label="Tampilan list">
                <ActionIcon
                  size="sm"
                  variant={view === 'list' ? 'filled' : 'subtle'}
                  color={view === 'list' ? 'violet' : 'gray'}
                  aria-label="Tampilan list"
                  onClick={() => setView('list')}
                >
                  <TbLayoutList size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Tampilan grid">
                <ActionIcon
                  size="sm"
                  variant={view === 'grid' ? 'filled' : 'subtle'}
                  color={view === 'grid' ? 'violet' : 'gray'}
                  aria-label="Tampilan grid"
                  onClick={() => setView('grid')}
                >
                  <TbLayoutGrid size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {canEdit && canCreate && (
              <Button type="button" size="xs" color="primary" leftSection={<TbPlus size={13} />} onClick={() => setOpenModal('new')}>
                New Note
              </Button>
            )}
          </Group>
          {tagFilter.length > 0 && (
            <Group gap="xs" mt="xs" wrap="wrap" align="center">
              <Text size="xs" c="dimmed">Tag aktif:</Text>
              <MultiSelectChipsRow value={tagFilter} onChange={setTagFilter} />
            </Group>
          )}
          {hasFilter && (
            <Group justify="space-between" mt="xs" gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {filtered.length === notes.length
                  ? `Menampilkan semua ${notes.length} note`
                  : `${filtered.length} dari ${notes.length} note`}
              </Text>
              <Button
                size="compact-xs" variant="subtle" color="gray"
                leftSection={<TbX size={11} />}
                onClick={resetFilter}
              >
                Reset filter
              </Button>
            </Group>
          )}
        </Paper>
      )}

      {/* ─── Error state ────────────────────── */}
      {isError && (
        <Card withBorder p="xl" ta="center" style={{ borderColor: 'var(--mantine-color-red-5)' }}>
          <ThemeIcon size={44} radius="xl" variant="light" color="red" mx="auto" mb="sm">
            <TbAlertTriangle size={22} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Gagal memuat notes</Text>
          <Text size="sm" c="dimmed" mb="md">
            {(error as Error)?.message ?? 'Terjadi kesalahan saat memuat notes.'}
          </Text>
          <Button size="xs" variant="light" color="red" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </Card>
      )}

      {/* ─── Note list ────────────────────── */}
      {isLoading ? (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={156} radius="md" />)}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} height={76} radius="md" />)}
          </Stack>
        )
      ) : !isError && notes.length === 0 ? (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="primary" mx="auto" mb="sm">
            <TbNote size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Belum ada notes</Text>
          <Text size="sm" c="dimmed" mb="md" maw={400} mx="auto">
            Notes untuk dokumentasi project: deployment instructions, troubleshooting log,
            runbook, atau apapun yang berguna untuk tim. Mendukung Markdown.
          </Text>
          {canEdit && canCreate && (
            <Button type="button" size="xs" color="primary" leftSection={<TbPlus size={13} />} onClick={() => setOpenModal('new')}>
              Buat Note Pertama
            </Button>
          )}
        </Card>
      ) : !isError && filtered.length === 0 ? (
        <Card withBorder p="md" ta="center" style={{ borderStyle: 'dashed' }}>
          <Text size="sm" c="dimmed" mb="xs">Tidak ada note yang cocok dengan filter saat ini.</Text>
          <Button type="button" size="xs" variant="subtle" leftSection={<TbX size={11} />} onClick={resetFilter}>
            Reset filter
          </Button>
        </Card>
      ) : !isError && view === 'list' ? (
        <>
          <Stack gap="xs">
            {paginated.map(note => (
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
                onTagClick={addTagFilter}
              />
            ))}
          </Stack>
          {totalPages > 1 && (
            <Group justify="center" mt="sm">
              <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
            </Group>
          )}
        </>
      ) : !isError ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            {paginated.map(note => (
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
                onTagClick={addTagFilter}
              />
            ))}
          </SimpleGrid>
          {totalPages > 1 && (
            <Group justify="center" mt="sm">
              <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
            </Group>
          )}
        </>
      ) : null}
    </Stack>
  )
}
