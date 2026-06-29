import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Kbd,
  Select,
  Stack,
  TextInput,
  Tooltip,
} from '@mantine/core'
import type { RefObject } from 'react'
import { TbLayoutGrid, TbLayoutList, TbPlus, TbSearch, TbSortAscending, TbTag, TbX } from 'react-icons/tb'

interface EnvListControlsProps {
  searchRef: RefObject<HTMLInputElement | null>
  envSearch: string
  onSearch: (v: string) => void
  envSort: 'name' | 'vars' | 'recent'
  onSort: (v: 'name' | 'vars' | 'recent') => void
  envView: 'list' | 'grid'
  onView: (v: 'list' | 'grid') => void
  envGroupByTag: boolean
  onGroupByTag: (updater: (v: boolean) => boolean) => void
  envTagFilter: string
  onTagFilter: (updater: (v: string) => string) => void
  allEnvTags: string[]
  canEdit: boolean
  envCount: number
  onOpenCreate: () => void
}

export function EnvListControls({
  searchRef, envSearch, onSearch, envSort, onSort, envView, onView,
  envGroupByTag, onGroupByTag, envTagFilter, onTagFilter, allEnvTags, canEdit, envCount, onOpenCreate,
}: EnvListControlsProps) {
  return (
    <Stack gap="xs" mb="sm">
      {envCount > 2 && (
        <TextInput
          ref={searchRef}
          size="sm"
          placeholder="Cari environment..."
          leftSection={<TbSearch size={14} />}
          value={envSearch}
          onChange={(e) => onSearch(e.target.value)}
          maw={540}
          rightSection={
            envSearch ? (
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Hapus pencarian" onClick={() => onSearch('')}>
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
      )}
      <Group gap="xs" wrap="wrap" justify="space-between">
        <Group gap="xs" wrap="wrap">
          {envCount > 2 && (
            <Select
              size="sm"
              w={155}
              radius="md"
              leftSection={<TbSortAscending size={14} />}
              value={envSort}
              onChange={(v) => onSort((v ?? 'name') as 'name' | 'vars' | 'recent')}
              data={[
                { label: 'Nama A→Z', value: 'name' },
                { label: 'Terbanyak vars', value: 'vars' },
                { label: 'Terbaru', value: 'recent' },
              ]}
              allowDeselect={false}
            />
          )}
          <Group gap={4} wrap="nowrap">
            <Tooltip label="List view" withArrow>
              <ActionIcon size="sm" variant={envView === 'list' ? 'filled' : 'subtle'} color="blue" onClick={() => onView('list')}>
                <TbLayoutList size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Grid view" withArrow>
              <ActionIcon size="sm" variant={envView === 'grid' ? 'filled' : 'subtle'} color="blue" onClick={() => onView('grid')}>
                <TbLayoutGrid size={14} />
              </ActionIcon>
            </Tooltip>
            {allEnvTags.length > 0 && (
              <Tooltip label={envGroupByTag ? 'Nonaktifkan grouping' : 'Group by tag'} withArrow>
                <ActionIcon size="sm" variant={envGroupByTag ? 'filled' : 'subtle'} color="grape" onClick={() => onGroupByTag((v) => !v)}>
                  <TbTag size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
        {canEdit && (
          <Button size="xs" leftSection={<TbPlus size={13} />} onClick={onOpenCreate}>
            Buat environment
          </Button>
        )}
      </Group>
      {allEnvTags.length > 0 && (
        <Group gap={6} wrap="wrap">
          {allEnvTags.map((t) => (
            <Badge
              key={t}
              size="sm"
              variant={envTagFilter === t ? 'filled' : 'outline'}
              color="grape"
              leftSection={<TbTag size={9} />}
              style={{ cursor: 'pointer' }}
              onClick={() => onTagFilter((f) => (f === t ? '' : t))}
            >
              {t}
            </Badge>
          ))}
        </Group>
      )}
    </Stack>
  )
}
