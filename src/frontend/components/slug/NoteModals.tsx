import {
  Badge,
  Box,
  Button,
  CopyButton,
  Group,
  Modal,
  MultiSelect,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { TbBookmarkFilled, TbCheck, TbCopy, TbEdit, TbEye, TbFileText, TbTag, TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { Note } from './NotesPanel'

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

  return (
    <Stack gap="sm">
      <TextInput
        label="Judul"
        placeholder="Judul note..."
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
      />

      <Box>
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={500}>Konten</Text>
          <SegmentedControl
            size="xs"
            value={preview}
            onChange={v => setPreview(v as 'write' | 'preview')}
            data={[
              { label: <Group gap={4}><TbEdit size={12} /><span>Write</span></Group>, value: 'write' },
              { label: <Group gap={4}><TbEye size={12} /><span>Preview</span></Group>, value: 'preview' },
            ]}
          />
        </Group>
        {preview === 'write' ? (
          <Textarea
            placeholder="Tulis catatan dalam format Markdown..."
            value={body}
            onChange={e => setBody(e.target.value)}
            minRows={12}
            maxRows={20}
            autosize
            styles={{ input: { fontFamily: 'monospace', fontSize: 13 } }}
          />
        ) : (
          <Paper withBorder p="md" mih={200} style={{ overflow: 'auto' }}>
            {body ? (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              </div>
            ) : (
              <Text size="sm" c="dimmed">Tidak ada konten.</Text>
            )}
          </Paper>
        )}
      </Box>

      <MultiSelect
        label="Tags"
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

      <Group justify="flex-end" gap="xs" mt="xs">
        <Button type="button" variant="subtle" color="gray" onClick={onClose}>Batal</Button>
        <Button
          type="button"
          leftSection={<TbFileText size={14} />}
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!title.trim()}
        >
          {note ? 'Simpan' : 'Buat Note'}
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
  return (
    <Modal
      opened={openNote !== null}
      onClose={() => setOpenNote(null)}
      title={openNote === 'new' ? 'Buat Note Baru' : 'Edit Note'}
      size="xl"
      zIndex={300}
      styles={{ body: { paddingTop: 8 } }}
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

export function NoteViewModal({ slug, note, onClose, canEditNote, onEdit, onDelete }: {
  slug: string
  note: Note | null
  onClose: () => void
  canEditNote: (note: Note) => boolean
  onEdit: (note: Note) => void
  onDelete: (note: Note) => void
}) {
  const qc = useQueryClient()

  const deleteNote = (n: Note) =>
    modals.openConfirmModal({
      title: 'Hapus note',
      children: <Text size="sm">Hapus note <strong>{n.title}</strong>?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/notes/${n.id}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] }); onDelete(n); notifyOk('Note dihapus') })
          .catch(notifyErr),
    })

  return (
    <Modal
      opened={note !== null}
      onClose={onClose}
      title={
        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {note?.pinned && <TbBookmarkFilled size={16} color="var(--mantine-color-yellow-5)" />}
          <Text fw={700} size="md" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {note?.title}
          </Text>
        </Group>
      }
      size="xl"
      zIndex={300}
    >
      {note && (
        <Stack gap="sm">
          <Group gap="xs" wrap="wrap">
            {note.tags.map(t => (
              <Badge key={t} size="xs" variant="outline" color="violet" leftSection={<TbTag size={10} />}>{t}</Badge>
            ))}
            <Text size="xs" c="dimmed" ml="auto">
              oleh {note.author.name} · diperbarui {relTime(note.updatedAt)}
            </Text>
          </Group>
          <Paper withBorder p="md" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <div className="markdown-body" style={{ fontSize: 14 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body || '_Tidak ada konten._'}</ReactMarkdown>
            </div>
          </Paper>
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
                  {copied ? 'Tersalin!' : 'Copy'}
                </Button>
              )}
            </CopyButton>
            {canEditNote(note) && (
              <Group gap="xs">
                <Button type="button" size="xs" variant="subtle" color="red" leftSection={<TbTrash size={13} />} onClick={() => deleteNote(note)}>
                  Hapus
                </Button>
                <Button type="button" size="xs" leftSection={<TbEdit size={13} />} onClick={() => onEdit(note)}>
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
