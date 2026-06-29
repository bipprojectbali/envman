import { Badge, Button, Divider, Group, Stack, TagsInput, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { TbCheck } from 'react-icons/tb'
import { tagColor } from '@/frontend/lib/project-utils'

interface Project {
  slug: string
  name: string
  description?: string
  tags: string[]
}

interface Props {
  project: Project
  allTagValues: string[]
  isPending: boolean
  onClose: () => void
  onSubmit: (data: { slug: string; name: string; description: string; tags: string[] }) => void
}

export function EditProjectForm({ project, allTagValues, isPending, onClose, onSubmit }: Props) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [tags, setTags] = useState<string[]>(project.tags ?? [])

  const dirty =
    name !== project.name ||
    description !== (project.description ?? '') ||
    JSON.stringify(tags) !== JSON.stringify(project.tags ?? [])
  const canSubmit = !!name.trim() && dirty && !isPending

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Identitas
        </Text>
        <TextInput
          label="Nama project"
          placeholder="My App, Backend API, ..."
          value={name}
          autoFocus
          data-autofocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) onSubmit({ slug: project.slug, name, description, tags })
          }}
        />
        <TextInput
          label="Slug"
          value={project.slug}
          disabled
          description="Slug tidak dapat diubah — akan break CLI / token / Portainer config yang sudah menggunakan."
        />
        <TextInput
          label="Deskripsi"
          placeholder="Opsional — penjelasan singkat project ini"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Stack>

      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Tags
        </Text>
        <TagsInput
          placeholder="Tambah tag, tekan Enter"
          value={tags}
          onChange={setTags}
          data={allTagValues}
          clearable
          splitChars={[',', ' ']}
        />
        {tags.length > 0 && (
          <Group gap={4}>
            {tags.map((t) => (
              <Badge key={t} size="xs" variant="light" color={tagColor(t)}>
                {t}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>

      <Divider />

      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" onClick={onClose} disabled={isPending}>
          Batal
        </Button>
        <Button
          leftSection={<TbCheck size={14} />}
          color="blue"
          onClick={() => onSubmit({ slug: project.slug, name, description, tags })}
          loading={isPending}
          disabled={!canSubmit}
        >
          Simpan Perubahan
        </Button>
      </Group>
    </Stack>
  )
}
