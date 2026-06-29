import { Badge, Divider, Group, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { TbTag } from 'react-icons/tb'
import type { ProjectFile } from './FileForm'

interface Props {
  filtered: ProjectFile[]
  renderCards: (items: ProjectFile[]) => ReactNode
}

export function FileGroupedView({ filtered, renderCards }: Props) {
  const grouped = new Map<string, ProjectFile[]>()
  const untagged: ProjectFile[] = []
  for (const f of filtered) {
    if (f.tags.length === 0) { untagged.push(f); continue }
    const tag = f.tags[0]
    if (!grouped.has(tag)) grouped.set(tag, [])
    grouped.get(tag)!.push(f)
  }
  const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))

  return (
    <Stack gap="md">
      {groups.map(([tag, items]) => (
        <Stack key={tag} gap="xs">
          <Group gap={6} align="center">
            <Badge size="xs" variant="filled" color="grape" leftSection={<TbTag size={9} />}>{tag}</Badge>
            <Divider style={{ flex: 1 }} />
          </Group>
          {renderCards(items)}
        </Stack>
      ))}
      {untagged.length > 0 && (
        <Stack gap="xs">
          <Group gap={6} align="center">
            <Text size="xs" c="dimmed" fw={500}>Tanpa tag</Text>
            <Divider style={{ flex: 1 }} />
          </Group>
          {renderCards(untagged)}
        </Stack>
      )}
    </Stack>
  )
}
