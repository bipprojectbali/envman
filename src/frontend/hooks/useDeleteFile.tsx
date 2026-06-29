import { Badge, Box, Button, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useQueryClient } from '@tanstack/react-query'
import { TbTrash } from 'react-icons/tb'
import { absoluteTime } from '@/frontend/components/slug/FileCard'
import { type ProjectFile } from '@/frontend/components/slug/FileForm'
import { apiFetch } from '@/frontend/lib/api'
import { getLangColor } from '@/frontend/lib/languages'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export function useDeleteFile(slug: string) {
  const qc = useQueryClient()

  const deleteFile = (f: ProjectFile) => {
    const modalId = `delete-file-${f.id}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md"><TbTrash size={13} /></ThemeIcon>
          <Text fw={600} size="sm">Hapus file</Text>
        </Group>
      ),
      children: (
        <Stack gap="sm">
          <Text size="sm">Hapus <strong>{f.title}</strong>?</Text>
          <Box p="xs" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-default-hover)' }}>
            <Group gap={4} mb={4}>
              {f.files.map((e) => <Badge key={e.filename} size="xs" variant="dot" color={getLangColor(e.language)}>{e.filename}</Badge>)}
            </Group>
            <Text size="xs" c="dimmed">{f.files.length} file · dibuat {absoluteTime(f.createdAt)}</Text>
          </Box>
          <Text size="xs" c="dimmed">Tindakan ini tidak dapat dibatalkan.</Text>
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" color="gray" onClick={() => modals.close(modalId)}>Batal</Button>
            <Button color="red" leftSection={<TbTrash size={13} />}
              onClick={() => apiFetch(`/api/envman/projects/${slug}/files/${f.id}`, { method: 'DELETE' })
                .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'files', slug] }); notifyOk('File dihapus'); modals.close(modalId) })
                .catch(notifyErr)}>
              Hapus Permanen
            </Button>
          </Group>
        </Stack>
      ),
    })
  }

  return { deleteFile }
}
