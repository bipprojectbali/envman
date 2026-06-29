import { Box, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useQueryClient } from '@tanstack/react-query'
import { TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { stripMarkdown, type Note } from '@/frontend/components/slug/NoteCard'
import { absoluteTime } from '@/frontend/components/slug/NoteModals'

export function useNoteActions(slug: string) {
  const qc = useQueryClient()

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

  return { togglePin, deleteNote }
}
