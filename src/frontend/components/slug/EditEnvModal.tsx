import { Button, Divider, Group, Modal, Stack, TagsInput, Text, TextInput, ThemeIcon } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbPencil, TbVariable } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

interface Environment {
  id: string
  name: string
  tags: string[]
}

interface Props {
  editEnv: Environment | null
  onClose: () => void
  slug: string
  isOwner: boolean
}

export function EditEnvModal({ editEnv, onClose, slug, isOwner }: Props) {
  const qc = useQueryClient()
  const [editName, setEditName] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])

  useEffect(() => {
    if (editEnv) {
      setEditName(editEnv.name)
      setEditTags(editEnv.tags ?? [])
    }
  }, [editEnv?.name, editEnv?.tags])

  const updateEnv = useMutation({
    mutationFn: ({ oldName, name, tags }: { oldName: string; name: string; tags: string[] }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${oldName}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name !== oldName ? name : undefined, tags }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
      onClose()
      notifyOk('Environment diperbarui')
    },
    onError: (e) => notifyErr(e),
  })

  return (
    <Modal
      opened={!!editEnv}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="blue" radius="md">
            <TbPencil size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            Edit Environment
          </Text>
        </Group>
      }
      size="sm"
    >
      {editEnv && (
        <Stack gap="sm">
          {isOwner && (
            <TextInput
              label="Nama"
              value={editName}
              onChange={(ev) => setEditName(ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              leftSection={<TbVariable size={14} />}
              styles={{ input: { fontFamily: 'ui-monospace, monospace' } }}
              error={
                editName.length > 0 && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(editName)
                  ? 'Format tidak valid'
                  : undefined
              }
            />
          )}
          <TagsInput
            label="Tags"
            description="Untuk filter dan grouping"
            placeholder="backend, frontend, internal..."
            value={editTags}
            onChange={setEditTags}
          />
          <Divider />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Batal
            </Button>
            <Button
              onClick={() => updateEnv.mutate({ oldName: editEnv.name, name: editName, tags: editTags })}
              loading={updateEnv.isPending}
              disabled={isOwner && editName.length > 0 && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(editName)}
            >
              Simpan
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
