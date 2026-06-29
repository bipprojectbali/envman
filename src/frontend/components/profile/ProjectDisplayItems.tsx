import {
  Anchor,
  Badge,
  Card,
  Divider,
  Group,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { TbExternalLink, TbFolders, TbLock } from 'react-icons/tb'

type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export interface Project {
  id: string
  slug: string
  name: string
  description: string | null
  tags: string[]
  myRole: ProjectRole
  environments: { name: string }[]
  _count: { environments: number }
}

export const roleColor: Record<ProjectRole, string> = { OWNER: 'blue', EDITOR: 'teal', VIEWER: 'gray' }
export const roleLabel: Record<ProjectRole, string> = { OWNER: 'Owner', EDITOR: 'Editor', VIEWER: 'Viewer' }

export function ProjectListItem({ p, canNavigate }: { p: Project; canNavigate: boolean }) {
  return (
    <Stack gap={2} py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Group align="flex-start" wrap="wrap" gap="xs">
        <ThemeIcon size="lg" variant="light" color={roleColor[p.myRole]} style={{ flexShrink: 0 }}>
          <TbFolders size={18} />
        </ThemeIcon>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" justify="space-between" wrap="wrap" align="flex-start">
            <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
              {canNavigate ? (
                <Anchor href={`/envmanager/${p.slug}`} size="sm" fw={600} style={{ wordBreak: 'break-word' }}>
                  {p.name}
                  <TbExternalLink size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                </Anchor>
              ) : (
                <Group gap={4} wrap="nowrap">
                  <Text size="sm" fw={600} style={{ wordBreak: 'break-word' }}>
                    {p.name}
                  </Text>
                  <TbLock size={12} color="var(--mantine-color-dimmed)" />
                </Group>
              )}
            </Stack>
            <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
              <Badge color={roleColor[p.myRole]} variant="light" size="sm">
                {roleLabel[p.myRole]}
              </Badge>
              <Text size="xs" c="dimmed">
                {p._count.environments} env
              </Text>
            </Group>
          </Group>
          <Text size="xs" c="dimmed" ff="monospace">
            {p.slug}
          </Text>
          {p.description && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {p.description}
            </Text>
          )}
          {p.tags.length > 0 && (
            <Group gap={4} mt={2} wrap="wrap">
              {p.tags.map((t) => (
                <Badge key={t} size="xs" variant="dot" color="gray">
                  {t}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      </Group>
    </Stack>
  )
}

export function ProjectCard({ p, canNavigate }: { p: Project; canNavigate: boolean }) {
  return (
    <Card withBorder padding="sm">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <ThemeIcon size="md" variant="light" color={roleColor[p.myRole]}>
            <TbFolders size={15} />
          </ThemeIcon>
          <Badge color={roleColor[p.myRole]} variant="light" size="sm">
            {roleLabel[p.myRole]}
          </Badge>
        </Group>
        <Stack gap={2}>
          {canNavigate ? (
            <Anchor href={`/envmanager/${p.slug}`} size="sm" fw={600} lineClamp={1}>
              {p.name}
              <TbExternalLink size={11} style={{ marginLeft: 3, verticalAlign: 'middle' }} />
            </Anchor>
          ) : (
            <Group gap={4} wrap="nowrap">
              <Text size="sm" fw={600} truncate>
                {p.name}
              </Text>
              <TbLock size={12} color="var(--mantine-color-dimmed)" />
            </Group>
          )}
          <Text size="xs" c="dimmed" ff="monospace" truncate>
            {p.slug}
          </Text>
        </Stack>
        {p.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {p.description}
          </Text>
        )}
        <Divider />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {p._count.environments} env
          </Text>
          {p.tags.length > 0 && (
            <Group gap={4}>
              {p.tags.slice(0, 2).map((t) => (
                <Badge key={t} size="xs" variant="dot" color="gray">
                  {t}
                </Badge>
              ))}
            </Group>
          )}
        </Group>
      </Stack>
    </Card>
  )
}
