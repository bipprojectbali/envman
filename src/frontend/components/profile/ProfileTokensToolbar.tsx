import { ActionIcon, Badge, Group, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { TbLayoutGrid, TbLayoutList, TbSearch, TbTable, TbX } from 'react-icons/tb'

export type ViewMode = 'list' | 'grid'

interface Props {
  search: string
  onSearch: (v: string) => void
  dateFrom: string
  dateTo: string
  onDateFrom: (v: string) => void
  onDateTo: (v: string) => void
  allTags: string[]
  selectedTags: string[]
  onToggleTag: (tag: string) => void
  groupByTag: boolean
  onGroupByTag: (v: boolean) => void
  viewMode: ViewMode
  onViewMode: (v: ViewMode) => void
}

export function ProfileTokensToolbar({
  search,
  onSearch,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  allTags,
  selectedTags,
  onToggleTag,
  groupByTag,
  onGroupByTag,
  viewMode,
  onViewMode,
}: Props) {
  return (
    <Stack gap="xs">
      {/* Baris 1: search + view toggles */}
      <Group gap="xs" wrap="nowrap">
        <TextInput
          size="xs"
          placeholder="Cari nama token..."
          leftSection={<TbSearch size={13} />}
          value={search}
          onChange={(e) => onSearch(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 0 }}
          rightSection={
            search ? (
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => onSearch('')}>
                <TbX size={12} />
              </ActionIcon>
            ) : undefined
          }
        />
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Kelompokkan by tag" withArrow>
            <ActionIcon
              size="sm"
              variant={groupByTag ? 'light' : 'subtle'}
              color={groupByTag ? 'blue' : 'gray'}
              onClick={() => onGroupByTag(!groupByTag)}
            >
              <TbTable size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="List view" withArrow>
            <ActionIcon
              size="sm"
              variant={viewMode === 'list' ? 'light' : 'subtle'}
              color={viewMode === 'list' ? 'blue' : 'gray'}
              onClick={() => onViewMode('list')}
            >
              <TbLayoutList size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Grid view" withArrow>
            <ActionIcon
              size="sm"
              variant={viewMode === 'grid' ? 'light' : 'subtle'}
              color={viewMode === 'grid' ? 'blue' : 'gray'}
              onClick={() => onViewMode('grid')}
            >
              <TbLayoutGrid size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Baris 2: filter tanggal — full width, wrap ke baris sendiri */}
      <Group gap="xs" grow>
        <TextInput
          size="xs"
          type="date"
          label="Dari"
          value={dateFrom}
          onChange={(e) => onDateFrom(e.currentTarget.value)}
        />
        <TextInput
          size="xs"
          type="date"
          label="Sampai"
          value={dateTo}
          onChange={(e) => onDateTo(e.currentTarget.value)}
        />
      </Group>

      {/* Tags */}
      {allTags.length > 0 && (
        <Group gap={4} wrap="wrap">
          {allTags.map((tag) => (
            <Badge
              key={tag}
              size="xs"
              variant={selectedTags.includes(tag) ? 'filled' : 'light'}
              color="blue"
              style={{ cursor: 'pointer' }}
              onClick={() => onToggleTag(tag)}
            >
              {tag}
            </Badge>
          ))}
          {selectedTags.length > 0 && (
            <Text
              size="xs"
              c="dimmed"
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => selectedTags.forEach(onToggleTag)}
            >
              Reset
            </Text>
          )}
        </Group>
      )}
    </Stack>
  )
}
