import { Badge, Button, Group, Modal, Stack, TagsInput, Text, TextInput, ThemeIcon } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { TbPlus, TbVariable } from 'react-icons/tb'
import { ENV_NAME_RE, ENV_PRESETS, getEnvColor } from '@/frontend/lib/project-utils'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { useState } from 'react'

interface Props {
  opened: boolean
  onClose: () => void
  slug: string
  existingNames: string[]
}

export function CreateEnvModal({ opened, onClose, slug, existingNames }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const valid = name.length > 0 && ENV_NAME_RE.test(name)
  const duplicate = name.length > 0 && existingNames.includes(name)
  const error =
    name.length > 0
      ? duplicate
        ? `Environment "${name}" sudah ada`
        : !valid
          ? 'Hanya huruf kecil, angka, dan strip. Tidak diawali/diakhiri strip.'
          : null
      : null

  const addEnv = useMutation({
    mutationFn: (body: { name: string; tags: string[] }) =>
      apiFetch(`/api/envman/projects/${slug}/environments`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_, { name: envName }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
      setName('')
      setTags([])
      onClose()
      notifyOk(`Environment "${envName}" ditambahkan`)
      navigate({ to: '/envmanager/$slug/$env', params: { slug, env: envName } })
    },
    onError: (e) => notifyErr(e),
  })

  const handleClose = () => {
    setName('')
    setTags([])
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="blue" radius="md">
            <TbPlus size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            Buat Environment
          </Text>
        </Group>
      }
      size="sm"
    >
      <Stack gap="sm">
        <TextInput
          label="Nama"
          placeholder="production, staging-eu, dev-alice..."
          value={name}
          onChange={(ev) => setName(ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && valid && !duplicate) addEnv.mutate({ name, tags })
          }}
          leftSection={<TbVariable size={14} />}
          error={error ?? undefined}
          styles={{ input: { fontFamily: 'ui-monospace, monospace' } }}
          autoFocus
        />
        {existingNames.length < ENV_PRESETS.length && (
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              Preset:
            </Text>
            {ENV_PRESETS.filter((p) => !existingNames.includes(p)).map((preset) => (
              <Badge
                key={preset}
                size="sm"
                variant="outline"
                color={getEnvColor(preset)}
                style={{ cursor: 'pointer' }}
                onClick={() => setName(preset)}
              >
                {preset}
              </Badge>
            ))}
          </Group>
        )}
        <TagsInput
          label="Tags"
          description="Opsional — untuk filter dan grouping"
          placeholder="backend, frontend, internal..."
          value={tags}
          onChange={setTags}
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={handleClose}>
            Batal
          </Button>
          <Button
            leftSection={<TbPlus size={14} />}
            onClick={() => addEnv.mutate({ name, tags })}
            loading={addEnv.isPending}
            disabled={!valid || duplicate}
          >
            Buat
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
