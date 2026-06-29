import {
  ActionIcon,
  Button,
  Group,
  Kbd,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import type { RefObject } from 'react'
import {
  TbBookmarkFilled,
  TbLayoutGrid,
  TbLayoutList,
  TbPlus,
  TbSearch,
  TbSortAscending,
  TbTag,
  TbX,
} from 'react-icons/tb'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'

interface TagOption {
  value: string
  label: string
}

interface Props {
  search: string
  onSearchChange: (v: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  tagFilter: string[]
  onTagFilterChange: (v: string[]) => void
  sort: 'updated' | 'created' | 'title'
  onSortChange: (v: 'updated' | 'created' | 'title') => void
  view: 'list' | 'grid'
  onViewChange: (v: 'list' | 'grid') => void
  canEdit: boolean
  canCreate: boolean
  allTags: TagOption[]
  notesTotal: number
  filteredTotal: number
  hasFilter: boolean
  pinnedCount: number
  myCount: number
  onNewNote: () => void
  onResetFilter: () => void
}

export function NotesPanelToolbar({
  search, onSearchChange, searchRef,
  tagFilter, onTagFilterChange,
  sort, onSortChange,
  view, onViewChange,
  canEdit, canCreate,
  allTags, notesTotal, filteredTotal,
  hasFilter, pinnedCount, myCount,
  onNewNote, onResetFilter,
}: Props) {
  return (
    <Stack gap="xs">
      {/* Stats */}
      {notesTotal > 0 && (
        <Group gap="xs" wrap="wrap" mb={-4}>
          <Text size="xs" c="dimmed">
            <Text component="span" fw={600} c="default">{notesTotal}</Text> note
          </Text>
          {pinnedCount > 0 && (
            <Group gap={4}>
              <TbBookmarkFilled size={11} color="var(--mantine-color-yellow-5)" />
              <Text size="xs" c="dimmed">
                <Text component="span" fw={600} c="default">{pinnedCount}</Text> disematkan
              </Text>
            </Group>
          )}
          {myCount > 0 && (
            <Text size="xs" c="dimmed">
              <Text component="span" fw={600} c="default">{myCount}</Text> saya buat
            </Text>
          )}
        </Group>
      )}

      {/* Search */}
      <TextInput
        ref={searchRef}
        size="sm"
        placeholder="Cari judul, isi, atau tag..."
        leftSection={<TbSearch size={13} />}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        maw={540}
        rightSection={
          search ? (
            <ActionIcon size="xs" variant="subtle" aria-label="Hapus pencarian" onClick={() => onSearchChange('')}>
              <TbX size={11} />
            </ActionIcon>
          ) : (
            <Tooltip label="Tekan / untuk focus">
              <Kbd size="xs">/</Kbd>
            </Tooltip>
          )
        }
        rightSectionWidth={32}
        radius="md"
      />

      {/* Filter row */}
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs" wrap="wrap">
          {allTags.length > 0 && (
            <MultiSelectChips
              size="xs"
              label="Tag"
              icon={<TbTag size={13} />}
              width={140}
              options={allTags}
              value={tagFilter}
              onChange={onTagFilterChange}
            />
          )}
          <Select
            size="xs"
            w={140}
            leftSection={<TbSortAscending size={13} />}
            value={sort}
            onChange={(v) => onSortChange((v ?? 'updated') as typeof sort)}
            data={[
              { label: 'Terbaru edit', value: 'updated' },
              { label: 'Terbaru buat', value: 'created' },
              { label: 'Judul A→Z', value: 'title' },
            ]}
            allowDeselect={false}
          />
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Group gap={2} wrap="nowrap">
            <Tooltip label="Tampilan list">
              <ActionIcon size="sm" variant={view === 'list' ? 'filled' : 'subtle'} color={view === 'list' ? 'violet' : 'gray'}
                aria-label="Tampilan list" onClick={() => onViewChange('list')}>
                <TbLayoutList size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Tampilan grid">
              <ActionIcon size="sm" variant={view === 'grid' ? 'filled' : 'subtle'} color={view === 'grid' ? 'violet' : 'gray'}
                aria-label="Tampilan grid" onClick={() => onViewChange('grid')}>
                <TbLayoutGrid size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          {canEdit && canCreate && (
            <Button type="button" size="sm" color="primary" leftSection={<TbPlus size={13} />} onClick={onNewNote}>
              New Note
            </Button>
          )}
        </Group>
      </Group>

      {tagFilter.length > 0 && (
        <Group gap="xs" wrap="wrap" align="center">
          <Text size="xs" c="dimmed">Tag aktif:</Text>
          <MultiSelectChipsRow value={tagFilter} onChange={onTagFilterChange} />
        </Group>
      )}

      {hasFilter && (
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {filteredTotal === notesTotal ? `Menampilkan semua ${notesTotal} note` : `${filteredTotal} dari ${notesTotal} note`}
          </Text>
          <Button size="compact-xs" variant="subtle" color="gray" leftSection={<TbX size={11} />} onClick={onResetFilter}>
            Reset filter
          </Button>
        </Group>
      )}
    </Stack>
  )
}
