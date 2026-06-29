import { Badge, Divider, Group, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { TbTag } from 'react-icons/tb'

interface Environment {
  id: string
  name: string
  tags: string[]
  createdAt?: string
  _count: { vars: number }
  accessRole?: 'OWNER' | 'EDITOR' | 'VIEWER' | null
}

interface Props {
  filteredEnvs: Environment[]
  renderGrid: (list: Environment[]) => ReactNode
}

export function EnvironmentGroupedView({ filteredEnvs, renderGrid }: Props) {
  const grouped = new Map<string, Environment[]>()
  const untagged: Environment[] = []
  for (const env of filteredEnvs) {
    if ((env.tags ?? []).length === 0) { untagged.push(env); continue }
    for (const t of env.tags ?? []) {
      if (!grouped.has(t)) grouped.set(t, [])
      grouped.get(t)!.push(env)
    }
  }
  const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))

  return (
    <Stack gap="md">
      {groups.map(([tag, tagEnvs]) => (
        <Stack key={tag} gap="xs">
          <Group gap={6} align="center">
            <Badge size="xs" variant="filled" color="grape" leftSection={<TbTag size={9} />}>{tag}</Badge>
            <Divider style={{ flex: 1 }} />
          </Group>
          {renderGrid(tagEnvs)}
        </Stack>
      ))}
      {untagged.length > 0 && (
        <Stack gap="xs">
          <Group gap={6} align="center">
            <Text size="xs" c="dimmed" fw={500}>Lainnya</Text>
            <Divider style={{ flex: 1 }} />
          </Group>
          {renderGrid(untagged)}
        </Stack>
      )}
    </Stack>
  )
}
