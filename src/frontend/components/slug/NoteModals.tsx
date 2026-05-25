import {
  Badge,
  Box,
  Button,
  CopyButton,
  Group,
  Kbd,
  Modal,
  MultiSelect,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TbBookmarkFilled,
  TbCheck,
  TbCopy,
  TbEdit,
  TbEye,
  TbFileText,
  TbNote,
  TbTag,
  TbTrash,
} from 'react-icons/tb'
import { CodeEditor } from '@/frontend/components/CodeEditor'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { Note } from './NotesPanel'

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0 || Number.isNaN(diff)) return ''
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
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

function NoteForm({ slug, note, onClose }: { slug: string; note?: Note; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [preview, setPreview] = useState<'write' | 'preview'>('write')
  const [tagInput, setTagInput] = useState('')

  const save = useMutation({
    mutationFn: () => {
      if (note) {
        return apiFetch(`/api/envman/projects/${slug}/notes/${note.id}`, {
          method: 'PUT',
          body: JSON.stringify({ title, body, tags }),
        })
      }
      return apiFetch(`/api/envman/projects/${slug}/notes`, {
        method: 'POST',
        body: JSON.stringify({ title, body, tags }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] })
      notifyOk(note ? 'Note diperbarui' : 'Note dibuat')
      onClose()
    },
    onError: (e) => notifyErr(e),
  })

  const canSave = !!title.trim() && !save.isPending
  const charCount = body.length
  const lineCount = body ? body.split('\n').length : 0
  const wordCount = body ? body.trim().split(/\s+/).filter(Boolean).length : 0

  return (
    <Stack gap="lg">
      {/* ── Identitas ── */}
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Judul</Text>
        <TextInput
          placeholder="Mis. 'Deployment runbook', 'Troubleshooting auth flow', ..."
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
          data-autofocus
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (canSave) save.mutate()
            }
          }}
        />
      </Stack>

      {/* ── Konten ── */}
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Konten</Text>
            <Text size="xs" c="dimmed">(Markdown didukung)</Text>
          </Group>
          <SegmentedControl
            size="xs"
            value={preview}
            onChange={v => setPreview(v as 'write' | 'preview')}
            data={[
              { label: <Group gap={4}><TbEdit size={12} /><span>Tulis</span></Group>, value: 'write' },
              { label: <Group gap={4}><TbEye size={12} /><span>Preview</span></Group>, value: 'preview' },
            ]}
          />
        </Group>
        {preview === 'write' ? (
          <CodeEditor
            value={body}
            onChange={setBody}
            language="markdown"
            filename="note.md"
            placeholder="# Heading\n\nTulis catatan dalam format Markdown..."
            height={360}
          />
        ) : (
          <Paper withBorder p="md" mih={240} style={{ overflow: 'auto', maxHeight: 480 }}>
            {body ? (
              <MarkdownRenderer fontSize={13}>{body}</MarkdownRenderer>
            ) : (
              <Text size="sm" c="dimmed" fs="italic">Tidak ada konten — klik "Tulis" untuk mulai menulis.</Text>
            )}
          </Paper>
        )}
        <Group gap="md" justify="space-between">
          <Group gap="md">
            <Text size="xs" c="dimmed">{lineCount} baris</Text>
            <Text size="xs" c="dimmed">{wordCount} kata</Text>
            <Text size="xs" c="dimmed">{charCount} karakter</Text>
          </Group>
          <Text size="xs" c="dimmed">
            <Kbd size="xs">⌘</Kbd>+<Kbd size="xs">Enter</Kbd> untuk simpan
          </Text>
        </Group>
      </Stack>

      {/* ── Tags ── */}
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Tags</Text>
        <MultiSelect
          placeholder="Ketik lalu tekan Enter untuk tambah tag baru..."
          data={[...new Set([...tags, ...(tagInput ? [tagInput] : [])])]}
          value={tags}
          onChange={setTags}
          searchable
          searchValue={tagInput}
          onSearchChange={setTagInput}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
              e.preventDefault()
              const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
              if (t && !tags.includes(t)) setTags(prev => [...prev, t])
              setTagInput('')
            }
          }}
          leftSection={<TbTag size={13} />}
          clearable
        />
      </Stack>

      {note && (
        <Paper withBorder p="xs" bg="var(--mantine-color-default-hover)">
          <Text size="xs" c="dimmed">
            Dibuat {absoluteTime(note.createdAt)} oleh {note.author.name}
            {new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 60_000 &&
              <> · diedit {relTime(note.updatedAt)}</>}
          </Text>
        </Paper>
      )}

      <Group justify="flex-end" gap="xs">
        <Button type="button" variant="subtle" color="gray" onClick={onClose} disabled={save.isPending}>
          Batal
        </Button>
        <Button
          type="button"
          color="primary"
          leftSection={<TbFileText size={14} />}
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!canSave}
        >
          {note ? 'Simpan perubahan' : 'Buat Note'}
        </Button>
      </Group>
    </Stack>
  )
}

export function NoteFormModal({ slug, openNote, setOpenNote }: {
  slug: string
  openNote: Note | null | 'new'
  setOpenNote: (n: Note | null | 'new') => void
}) {
  const isMobile = useMediaQuery('(max-width: 48em)')
  const isEdit = openNote && openNote !== 'new'
  return (
    <Modal
      opened={openNote !== null}
      onClose={() => setOpenNote(null)}
      title={
        <Group gap="xs">
          <ThemeIcon size={28} variant={isEdit ? 'light' : 'gradient'} color="primary" radius="md">
            {isEdit ? <TbEdit size={15} /> : <TbNote size={15} />}
          </ThemeIcon>
          <Box>
            <Text fw={700} size="sm">{openNote === 'new' ? 'Buat Note Baru' : 'Edit Note'}</Text>
            <Text size="xs" c="dimmed">
              {openNote === 'new' ? 'Catatan Markdown untuk project ini' : 'Update isi note'}
            </Text>
          </Box>
        </Group>
      }
      size="xl"
      fullScreen={isMobile}
      zIndex={300}
      styles={{ body: { paddingTop: 12 } }}
    >
      {openNote !== null && (
        <NoteForm
          slug={slug}
          note={openNote === 'new' ? undefined : openNote}
          onClose={() => setOpenNote(null)}
        />
      )}
    </Modal>
  )
}

export function NoteViewModal({ slug, note, onClose, canEditNote, onEdit, onDelete }: {
  slug: string
  note: Note | null
  onClose: () => void
  canEditNote: (note: Note) => boolean
  onEdit: (note: Note) => void
  onDelete: (note: Note) => void
}) {
  const qc = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')

  const deleteNote = (n: Note) => {
    const modalId = `view-delete-note-${n.id}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Hapus note</Text>
        </Group>
      ),
      children: (
        <Stack gap="sm">
          <Text size="sm">
            Hapus note <strong>{n.title}</strong>?
          </Text>
          <Text size="xs" c="dimmed">
            Dibuat {absoluteTime(n.createdAt)} oleh {n.author.name}. Tindakan ini tidak dapat dibatalkan.
          </Text>
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" color="gray" onClick={() => modals.close(modalId)}>Batal</Button>
            <Button
              color="red"
              leftSection={<TbTrash size={13} />}
              onClick={() =>
                apiFetch(`/api/envman/projects/${slug}/notes/${n.id}`, { method: 'DELETE' })
                  .then(() => {
                    qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] })
                    onDelete(n)
                    notifyOk('Note dihapus')
                    modals.close(modalId)
                  })
                  .catch(notifyErr)
              }
            >
              Hapus Permanen
            </Button>
          </Group>
        </Stack>
      ),
    })
  }

  const wasEdited = note ? new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 60_000 : false

  return (
    <Modal
      opened={note !== null}
      onClose={onClose}
      title={
        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {note?.pinned && (
            <Tooltip label="Note ini disematkan">
              <Box>
                <TbBookmarkFilled size={18} color="var(--mantine-color-yellow-5)" />
              </Box>
            </Tooltip>
          )}
          <Text fw={700} size="md" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {note?.title}
          </Text>
        </Group>
      }
      size="xl"
      fullScreen={isMobile}
      zIndex={300}
    >
      {note && (
        <Stack gap="sm">
          {/* Metadata strip */}
          <Group gap="xs" wrap="wrap" align="center">
            {note.tags.map(t => (
              <Badge key={t} size="xs" variant="outline" color="primary" leftSection={<TbTag size={9} />}>{t}</Badge>
            ))}
            <Tooltip label={`${wasEdited ? 'Diedit' : 'Dibuat'} ${absoluteTime(note.updatedAt)}`}>
              <Text size="xs" c="dimmed" ml="auto">
                oleh {note.author.name} · {wasEdited ? 'diedit ' : 'dibuat '}{relTime(note.updatedAt)}
              </Text>
            </Tooltip>
          </Group>

          {/* Body */}
          <Paper
            withBorder p="md"
            style={{
              maxHeight: isMobile ? '50vh' : 460,
              overflowY: 'auto',
              minHeight: 200,
            }}
          >
            {note.body ? (
              <MarkdownRenderer fontSize={14}>{note.body}</MarkdownRenderer>
            ) : (
              <Text size="sm" c="dimmed" fs="italic">Tidak ada konten.</Text>
            )}
          </Paper>

          {/* Footer stats */}
          {note.body && (
            <Group gap="md">
              <Text size="xs" c="dimmed">{note.body.split('\n').length} baris</Text>
              <Text size="xs" c="dimmed">{note.body.trim().split(/\s+/).filter(Boolean).length} kata</Text>
              <Text size="xs" c="dimmed">{note.body.length} karakter</Text>
            </Group>
          )}

          {/* Actions */}
          <Group justify="space-between" gap="xs">
            <CopyButton value={note.body} timeout={2000}>
              {({ copied, copy }) => (
                <Button
                  type="button"
                  size="xs"
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
                  leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                  onClick={copy}
                >
                  {copied ? 'Tersalin!' : 'Salin Markdown'}
                </Button>
              )}
            </CopyButton>
            {canEditNote(note) && (
              <Group gap="xs">
                <Button
                  type="button" size="xs" variant="subtle" color="red"
                  leftSection={<TbTrash size={13} />}
                  onClick={() => deleteNote(note)}
                >
                  Hapus
                </Button>
                <Button
                  type="button" size="xs" color="primary"
                  leftSection={<TbEdit size={13} />}
                  onClick={() => onEdit(note)}
                >
                  Edit
                </Button>
              </Group>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
