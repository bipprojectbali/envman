import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Pagination,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core'
import { useMemo, useState } from 'react'
import { TbBan, TbChevronDown, TbChevronRight, TbSearch, TbX } from 'react-icons/tb'
import { AccessStatsHeader, computeStats } from './AccessStatsHeader'
import { ProjectAccessRow } from './ProjectAccessRow'
import type { ProjectAccess } from './types'

const PAGE_SIZE = 20
type FilterKey = 'with-access' | 'restricted' | 'override' | 'all'
type SortKey = 'name' | 'role' | 'overrides'

const hasAnyOverride = (p: ProjectAccess) => p.environments.some((e) => e.envRole !== 'inherit')
const hasRestricted = (p: ProjectAccess) => p.environments.some((e) => e.envRole === 'denied')
const overrideCount = (p: ProjectAccess) => p.environments.filter((e) => e.envRole !== 'inherit').length
const roleWeight = (p: ProjectAccess) =>
  p.projectRole === 'OWNER' ? 3 : p.projectRole === 'EDITOR' ? 2 : p.projectRole === 'VIEWER' ? 1 : 0

export function AccessMatrixTab({ userId, projects }: { userId: string; projects: ProjectAccess[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('with-access')
  const [sort, setSort] = useState<SortKey>('name')
  const [page, setPage] = useState(1)
  const [showNoAccess, setShowNoAccess] = useState(false)

  const stats = useMemo(() => computeStats(projects), [projects])

  const filtered = useMemo(() => {
    let list = projects
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
    if (filter === 'with-access') list = list.filter((p) => p.projectRole !== null || hasAnyOverride(p))
    else if (filter === 'restricted') list = list.filter(hasRestricted)
    else if (filter === 'override') list = list.filter(hasAnyOverride)

    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'role') sorted.sort((a, b) => roleWeight(b) - roleWeight(a) || a.name.localeCompare(b.name))
    else if (sort === 'overrides')
      sorted.sort((a, b) => overrideCount(b) - overrideCount(a) || a.name.localeCompare(b.name))
    return sorted
  }, [projects, search, filter, sort])

  const noAccessList = useMemo(() => projects.filter((p) => p.projectRole === null && !hasAnyOverride(p)), [projects])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const handleSearch = (v: string) => {
    setSearch(v)
    setPage(1)
  }
  const handleFilter = (v: string) => {
    setFilter(v as FilterKey)
    setPage(1)
  }
  const resetFilters = () => {
    setSearch('')
    setFilter('with-access')
    setSort('name')
    setPage(1)
  }

  return (
    <Stack gap="sm">
      <AccessStatsHeader stats={stats} />

      <Group gap="xs" wrap="nowrap">
        <TextInput
          placeholder="Cari project (nama atau slug)..."
          leftSection={<TbSearch size={14} />}
          value={search}
          onChange={(e) => handleSearch(e.currentTarget.value)}
          size="sm"
          style={{ flex: 1 }}
          rightSection={
            search ? (
              <ActionIcon size="xs" variant="subtle" onClick={() => handleSearch('')}>
                <TbX size={11} />
              </ActionIcon>
            ) : undefined
          }
        />
        <Select
          size="sm"
          value={sort}
          onChange={(v) => v && setSort(v as SortKey)}
          data={[
            { value: 'name', label: 'Sort: Name' },
            { value: 'role', label: 'Sort: Role' },
            { value: 'overrides', label: 'Sort: Override count' },
          ]}
          style={{ width: 180 }}
          allowDeselect={false}
        />
      </Group>

      <SegmentedControl
        size="xs"
        value={filter}
        onChange={handleFilter}
        data={[
          { value: 'with-access', label: `Has access (${stats.withAccess})` },
          { value: 'override', label: `Override (${stats.envOverrides})` },
          { value: 'restricted', label: `Restricted (${stats.envDenied})` },
          { value: 'all', label: `Semua (${stats.total})` },
        ]}
      />

      {paginated.length > 0 && (
        <Stack gap={4}>
          {paginated.map((p) => (
            <ProjectAccessRow key={p.slug} userId={userId} project={p} />
          ))}
        </Stack>
      )}

      {filtered.length === 0 && (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={32} radius="xl" variant="light" color="gray" mx="auto" mb="xs">
            <TbSearch size={16} />
          </ThemeIcon>
          <Text size="sm" fw={500}>
            Tidak ada project yang cocok
          </Text>
          <Text size="xs" c="dimmed">
            {filter === 'with-access' && !search
              ? 'User ini belum punya akses ke project mana pun.'
              : 'Coba ubah filter atau hapus kata kunci pencarian.'}
          </Text>
          {(search || filter !== 'with-access' || sort !== 'name') && (
            <Button size="xs" variant="subtle" mt="xs" onClick={resetFilters}>
              Reset filter
            </Button>
          )}
        </Box>
      )}

      {totalPages > 1 && (
        <Group justify="space-between" align="center" mt="xs">
          <Text size="xs" c="dimmed">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} dari {filtered.length}
          </Text>
          <Pagination value={safePage} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}

      {/* No-access section (collapsed by default) */}
      {noAccessList.length > 0 && filter !== 'all' && (
        <Box
          mt="sm"
          style={{
            borderTop: '1px dashed var(--mantine-color-default-border)',
            paddingTop: 'var(--mantine-spacing-sm)',
          }}
        >
          <Group
            gap="xs"
            wrap="nowrap"
            onClick={() => setShowNoAccess((v) => !v)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              onClick={(e) => {
                e.stopPropagation()
                setShowNoAccess((v) => !v)
              }}
            >
              {showNoAccess ? <TbChevronDown size={12} /> : <TbChevronRight size={12} />}
            </ActionIcon>
            <ThemeIcon size={18} radius="sm" variant="light" color="gray">
              <TbBan size={11} />
            </ThemeIcon>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed" style={{ flex: 1 }}>
              No access
            </Text>
            <Badge size="xs" variant="outline" color="gray">
              {noAccessList.length}
            </Badge>
          </Group>
          <Collapse in={showNoAccess}>
            <Stack gap={4} mt="xs">
              {noAccessList.map((p) => (
                <ProjectAccessRow key={p.slug} userId={userId} project={p} />
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}
    </Stack>
  )
}
