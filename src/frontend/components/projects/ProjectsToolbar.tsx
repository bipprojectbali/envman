import { ActionIcon, Button, Group, SegmentedControl, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import type { RefObject } from 'react'
import { TbArrowsSort, TbLayoutGrid, TbLayoutList, TbSearch, TbTag, TbX } from 'react-icons/tb'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { SORT_OPTIONS } from '@/frontend/hooks/useProjectList'
import { tagColor } from '@/frontend/lib/project-utils'

interface TagOption { value: string; label: string }

interface Props {
  search: string
  setSearch: (s: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  view: 'grid' | 'list'
  setView: (fn: (v: 'grid' | 'list') => 'grid' | 'list') => void
  allTags: TagOption[]
  tagFilter: string[]
  setTagFilter: (t: string[]) => void
  sort: string
  setSort: (s: any) => void
  groupByTag: boolean
  setGroupByTag: (fn: (v: boolean) => boolean) => void
  statusFilter: 'all' | 'active' | 'inactive'
  setStatusFilter: (v: 'all' | 'active' | 'inactive') => void
  filtered: any[]
  projects: any[]
  hasFilter: boolean
  resetFilter: () => void
}

export function ProjectsToolbar({ search, setSearch, searchRef, view, setView, allTags, tagFilter, setTagFilter, sort, setSort, groupByTag, setGroupByTag, statusFilter, setStatusFilter, filtered, projects, hasFilter, resetFilter }: Props) {
  return (
    <Stack gap="xs" mb="md">
      <TextInput
        ref={searchRef}
        size="sm"
        placeholder="Cari project, slug, deskripsi, atau tag..."
        leftSection={<TbSearch size={14} />}
        maw={540}
        rightSection={
          search ? (
            <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Hapus pencarian" onClick={() => setSearch('')}>
              <TbX size={12} />
            </ActionIcon>
          ) : (
            <Tooltip label="Tekan / untuk focus"><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, fontSize: 10, border: '1px solid var(--mantine-color-default-border)', borderRadius: 4, color: 'var(--mantine-color-dimmed)' }}>/</span></Tooltip>
          )
        }
        rightSectionWidth={36}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        radius="md"
      />
      <Group gap="xs" wrap="wrap">
        <Tooltip label={view === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
          <ActionIcon size="md" variant="default" radius="md" aria-label="Ganti tampilan" onClick={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))}>
            {view === 'grid' ? <TbLayoutList size={15} /> : <TbLayoutGrid size={15} />}
          </ActionIcon>
        </Tooltip>
        {allTags.length > 0 && (
          <Tooltip label={groupByTag ? 'Nonaktifkan group by tag' : 'Group by tag'}>
            <ActionIcon size="md" variant={groupByTag ? 'filled' : 'default'} radius="md" color={groupByTag ? 'grape' : undefined} onClick={() => setGroupByTag((v) => !v)}>
              <TbTag size={15} />
            </ActionIcon>
          </Tooltip>
        )}
        {allTags.length > 0 && (
          <MultiSelectChips size="sm" label="Tag" icon={<TbTag size={14} />} width={130} options={allTags} value={tagFilter} onChange={setTagFilter} />
        )}
        <Select size="sm" data={SORT_OPTIONS} value={sort} onChange={(v) => v && setSort(v as typeof sort)} leftSection={<TbArrowsSort size={14} />} allowDeselect={false} w={155} radius="md" />
        <SegmentedControl size="xs" value={statusFilter} onChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}
          data={[{ value: 'all', label: 'Semua' }, { value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Nonaktif' }]} radius="md" />
      </Group>
      {tagFilter.length > 0 && (
        <Group gap={6} wrap="wrap" align="center">
          <MultiSelectChipsRow value={tagFilter} onChange={setTagFilter} getColor={tagColor} />
        </Group>
      )}
      {hasFilter && (
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {filtered.length === projects.length ? `${projects.length} project` : `${filtered.length} dari ${projects.length} project`}
          </Text>
          <Button size="compact-xs" variant="subtle" color="gray" leftSection={<TbX size={11} />} onClick={resetFilter}>
            Reset filter
          </Button>
        </Group>
      )}
    </Stack>
  )
}
