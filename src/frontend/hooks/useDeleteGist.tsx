import { Badge, Box, Button, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useQueryClient } from '@tanstack/react-query'
import { TbTrash } from 'react-icons/tb'
import { absoluteTime, type Gist } from '@/frontend/components/gists/gist-types'
import { apiFetch } from '@/frontend/lib/api'
import { getLangColor } from '@/frontend/lib/languages'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export function useDeleteGist() {
  const qc = useQueryClient()

  const deleteGist = (g: Gist) => {
    const modalId = `delete-gist-${g.id}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Hapus gist</Text>
        </Group>
      ),
      children: (
        <Stack gap="sm">
          <Text size="sm">Hapus gist <strong>{g.title}</strong>?</Text>
          <Box p="xs" bg="var(--mantine-color-default-hover)" style={{ border: '1px solid var(--mantine-color-default-border)' }}>
            <Group gap={4} mb={4}>
              {g.files.map((f) => (
                <Badge key={f.filename} size="xs" variant="dot" color={getLangColor(f.language)}>
                  {f.filename}
                </Badge>
              ))}
            </Group>
            <Text size="xs" c="dimmed">
              {g.files.length} file · dibuat {absoluteTime(g.createdAt)}
              {g.isPublic ? ' · public' : ' · private'}
            </Text>
          </Box>
          <Text size="xs" c="dimmed">Tindakan ini tidak dapat dibatalkan.</Text>
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" color="gray" onClick={() => modals.close(modalId)}>Batal</Button>
            <Button
              color="red"
              leftSection={<TbTrash size={13} />}
              onClick={() =>
                apiFetch(`/api/envman/gists/${g.id}`, { method: 'DELETE' })
                  .then(() => {
                    qc.invalidateQueries({ queryKey: ['envman', 'gists', 'infinite'] })
                    notifyOk('Gist dihapus')
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

  return { deleteGist }
}
