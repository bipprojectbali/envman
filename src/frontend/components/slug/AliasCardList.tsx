import {
  ActionIcon,
  Badge,
  Box,
  Code,
  CopyButton,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { TbCheck, TbCopy, TbLock, TbPencil, TbTag, TbTrash } from 'react-icons/tb'
import type { Alias } from './alias-types'
import { CreatedUpdatedMeta } from './CreatedUpdatedMeta'

interface AliasCardListProps {
  filtered: Alias[]
  allTags: { value: string; label: string }[]
  view: 'list' | 'grid'
  groupByTag: boolean
  tagFilter: string[]
  onAddTag: (tag: string) => void
  isOwner: boolean
  slug: string
  onView: (id: string) => void
  onEdit: (alias: Alias) => void
  onDelete: (alias: Alias) => void
}

export function AliasCardList({
  filtered,
  allTags,
  view,
  groupByTag,
  tagFilter,
  onAddTag,
  isOwner,
  slug,
  onView,
  onEdit,
  onDelete,
}: AliasCardListProps) {
  const cards = filtered.map((alias) => (
    <Box
      key={alias.id}
      p="sm"
      role="button"
      tabIndex={0}
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
        cursor: 'pointer',
      }}
      onClick={() => onView(alias.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onView(alias.id)
      }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Code fz="sm" fw={700}>
              {alias.name}
            </Code>
            {alias.deniedEnvs && alias.deniedEnvs.length > 0 && (
              <Tooltip
                label={`Butuh akses ke env: ${alias.deniedEnvs.map((d) => `${d.project}:${d.env}`).join(', ')}`}
                withArrow
                multiline
                w={240}
              >
                <Badge size="xs" color="red" variant="light" leftSection={<TbLock size={9} />}>
                  needs {alias.deniedEnvs.map((d) => d.env).join(', ')}
                </Badge>
              </Tooltip>
            )}
            {!alias.deniedEnvs?.length && (
              <CopyButton value={`envman run ${slug}:${alias.name}`} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Disalin!' : `Salin: envman run ${slug}:${alias.name}`} withArrow>
                    <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                      {copied ? <TbCheck size={12} /> : <TbCopy size={12} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            )}
            {alias.tags.length > 0 && (
              <Group gap={4} wrap="wrap" onClick={(e) => e.stopPropagation()}>
                {alias.tags.map((tag) => (
                  <Badge
                    key={tag}
                    size="xs"
                    variant="light"
                    color="blue"
                    style={{ cursor: 'pointer' }}
                    onClick={() => !tagFilter.includes(tag) && onAddTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </Group>
            )}
          </Group>
          <Group gap={4} wrap="nowrap" align="flex-start">
            <Code block fz="xs" style={{ wordBreak: 'break-all', flex: 1 }}>
              envman {alias.args}
            </Code>
            <CopyButton value={`envman ${alias.args}`} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Disalin!' : 'Salin perintah'} withArrow>
                  <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                    {copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          {alias.description && (
            <Text size="xs" c="dimmed">
              {alias.description}
            </Text>
          )}
          <Group gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">
              oleh {alias.creator.name}
            </Text>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <CreatedUpdatedMeta createdAt={alias.createdAt} updatedAt={alias.updatedAt} />
          </Group>
        </Stack>

        {isOwner && (
          <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <Tooltip label="Edit alias" withArrow>
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => onEdit(alias)}>
                <TbPencil size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Hapus alias" withArrow>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onDelete(alias)}>
                <TbTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>
    </Box>
  ))

  if (groupByTag && allTags.length > 0) {
    const grouped = new Map<string, typeof filtered>()
    const untagged: typeof filtered = []
    for (const a of filtered) {
      if (a.tags.length === 0) {
        untagged.push(a)
        continue
      }
      const tag = a.tags[0]
      if (!grouped.has(tag)) grouped.set(tag, [])
      grouped.get(tag)!.push(a)
    }
    const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
    const cardsByName = new Map(filtered.map((a, i) => [a.name, cards[i]]))
    const renderGroup = (items: typeof filtered) =>
      view === 'grid' ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
          {items.map((a) => cardsByName.get(a.name))}
        </SimpleGrid>
      ) : (
        items.map((a) => cardsByName.get(a.name))
      )
    return (
      <Stack gap="md">
        {groups.map(([tag, items]) => (
          <Stack key={tag} gap="xs">
            <Group gap={6} align="center">
              <Badge size="xs" variant="filled" color="grape" leftSection={<TbTag size={9} />}>
                {tag}
              </Badge>
              <Divider style={{ flex: 1 }} />
            </Group>
            {renderGroup(items)}
          </Stack>
        ))}
        {untagged.length > 0 && (
          <Stack gap="xs">
            <Group gap={6} align="center">
              <Text size="xs" c="dimmed" fw={500}>
                Tanpa tag
              </Text>
              <Divider style={{ flex: 1 }} />
            </Group>
            {renderGroup(untagged)}
          </Stack>
        )}
      </Stack>
    )
  }

  return view === 'grid' ? (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
      {cards}
    </SimpleGrid>
  ) : (
    <Stack gap="xs">{cards}</Stack>
  )
}
