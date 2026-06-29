import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Kbd,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import type React from 'react'
import { TbLayoutGrid, TbLayoutList, TbSearch, TbSortAscending, TbTag, TbX } from 'react-icons/tb'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'

interface Props {
  searchRef: React.RefObject<HTMLInputElement | null>
  search: string
  onSearchChange: (v: string) => void
  filter: 'all' | 'mine' | 'public' | 'private'
  onFilterChange: (v: 'all' | 'mine' | 'public' | 'private') => void
  tagFilter: string[]
  onTagFilterChange: (v: string[]) => void
  sort: 'updated' | 'created'
  onSortChange: (v: 'updated' | 'created') => void
  view: 'list' | 'grid'
  onViewChange: (v: 'list' | 'grid') => void
  groupByTag: boolean
  onGroupByTagToggle: () => void
  allTags: string[]
  totalCount: number
  filteredCount: number
  mineCount: number
  publicCount: number
  privateCount: number
  hasFilter: boolean
  onReset: () => void
}

export function GistToolbar({
  searchRef,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  tagFilter,
  onTagFilterChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  groupByTag,
  onGroupByTagToggle,
  allTags,
  totalCount,
  filteredCount,
  mineCount,
  publicCount,
  privateCount,
  hasFilter,
  onReset,
}: Props) {
  return (
    <Stack gap="xs" mb="md">
      <TextInput
        ref={searchRef}
        size="sm"
        placeholder="Cari judul, deskripsi, filename, isi, atau tag..."
        leftSection={<TbSearch size={14} />}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        maw={540}
        rightSection={
          search ? (
            <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Hapus pencarian" onClick={() => onSearchChange('')}>
              <TbX size={12} />
            </ActionIcon>
          ) : (
            <Tooltip label="Tekan / untuk focus">
              <Kbd size="xs">/</Kbd>
            </Tooltip>
          )
        }
        rightSectionWidth={36}
        radius="md"
      />

      <Group gap="xs" wrap="wrap">
        {(
          [
            { value: 'all', label: `Semua (${totalCount})` },
            { value: 'mine', label: `Milik saya (${mineCount})` },
            { value: 'public', label: `Public (${publicCount})` },
            { value: 'private', label: `Private (${privateCount})` },
          ] as const
        ).map((f) => (
          <Badge
            key={f.value}
            size="sm"
            variant={filter === f.value ? 'filled' : 'outline'}
            color="primary"
            style={{ cursor: 'pointer' }}
            onClick={() => onFilterChange(f.value)}
          >
            {f.label}
          </Badge>
        ))}
        {allTags.length > 0 && (
          <MultiSelectChips
            size="sm"
            label="Tag"
            icon={<TbTag size={14} />}
            width={130}
            options={allTags}
            value={tagFilter}
            onChange={onTagFilterChange}
          />
        )}
        <Select
          size="sm"
          w={150}
          leftSection={<TbSortAscending size={14} />}
          value={sort}
          onChange={(v) => onSortChange((v ?? 'updated') as typeof sort)}
          data={[
            { label: 'Terbaru edit', value: 'updated' },
            { label: 'Terbaru buat', value: 'created' },
          ]}
          allowDeselect={false}
          radius="md"
        />
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Tampilan list" withArrow>
            <ActionIcon
              size="sm"
              variant={view === 'list' ? 'filled' : 'subtle'}
              color={view === 'list' ? 'violet' : 'gray'}
              aria-label="Tampilan list"
              onClick={() => onViewChange('list')}
            >
              <TbLayoutList size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Tampilan grid" withArrow>
            <ActionIcon
              size="sm"
              variant={view === 'grid' ? 'filled' : 'subtle'}
              color={view === 'grid' ? 'violet' : 'gray'}
              aria-label="Tampilan grid"
              onClick={() => onViewChange('grid')}
            >
              <TbLayoutGrid size={14} />
            </ActionIcon>
          </Tooltip>
          {allTags.length > 0 && (
            <Tooltip label={groupByTag ? 'Nonaktifkan group by tag' : 'Group by tag'} withArrow>
              <ActionIcon
                size="sm"
                variant={groupByTag ? 'filled' : 'subtle'}
                color={groupByTag ? 'grape' : 'gray'}
                onClick={onGroupByTagToggle}
              >
                <TbTag size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

      {tagFilter.length > 0 && (
        <Group gap={6} wrap="wrap" align="center">
          <MultiSelectChipsRow value={tagFilter} onChange={onTagFilterChange} />
        </Group>
      )}

      {hasFilter && (
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {filteredCount === totalCount ? `${totalCount} gist` : `${filteredCount} dari ${totalCount} gist`}
          </Text>
          <Button size="compact-xs" variant="subtle" color="gray" leftSection={<TbX size={11} />} onClick={onReset}>
            Reset filter
          </Button>
        </Group>
      )}
    </Stack>
  )
}
