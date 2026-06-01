import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Pagination,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useMemo, useState } from 'react'
import { TbBan, TbCheck, TbLayoutGrid, TbLayoutList, TbSearch, TbX } from 'react-icons/tb'
import { ProjectAccessItem } from './ProjectAccessItem'
import type { ProjectAccess } from './types'

const PAGE_SIZE = 10

const hasAnyOverride = (p: ProjectAccess) => p.environments.some((e) => e.envRole !== 'inherit')
const hasRestricted = (p: ProjectAccess) => p.environments.some((e) => e.envRole === 'denied')

export function AccessMatrixTab({ userId, projects }: { userId: string; projects: ProjectAccess[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'has-access' | 'restricted'>('all')
  const [page, setPage] = useState(1)
  const [view, setView] = useLocalStorage<'list' | 'grid'>({ key: 'envman:users:access-view', defaultValue: 'list' })

  const filtered = useMemo(() => {
    let list = projects
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
    if (filter === 'has-access') list = list.filter((p) => p.projectRole !== null || hasAnyOverride(p))
    else if (filter === 'restricted') list = list.filter((p) => hasRestricted(p))
    return list
  }, [projects, search, filter])

  const totalHasAccess = projects.filter((p) => p.projectRole !== null || hasAnyOverride(p)).length
  const totalRestricted = projects.filter(hasRestricted).length

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const paginatedWithAccess = paginated.filter((p) => p.projectRole !== null || hasAnyOverride(p))
  const paginatedWithoutAccess = paginated.filter((p) => p.projectRole === null && !hasAnyOverride(p))

  const handleSearch = (v: string) => {
    setSearch(v)
    setPage(1)
  }
  const handleFilter = (v: string) => {
    setFilter(v as typeof filter)
    setPage(1)
  }

  return (
    <Stack gap="sm">
      {/* Summary */}
      <Group gap="xs">
        <Badge size="sm" variant="light" color="teal">
          {totalHasAccess} has access
        </Badge>
        {totalRestricted > 0 && (
          <Badge size="sm" variant="light" color="red">
            {totalRestricted} restricted
          </Badge>
        )}
        <Badge size="sm" variant="outline" color="gray">
          {projects.length} total
        </Badge>
      </Group>

      {/* Search + filter */}
      <Group gap="xs">
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
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Tampilan list">
            <ActionIcon
              size="sm"
              variant={view === 'list' ? 'filled' : 'subtle'}
              color={view === 'list' ? 'violet' : 'gray'}
              onClick={() => setView('list')}
            >
              <TbLayoutList size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Tampilan grid">
            <ActionIcon
              size="sm"
              variant={view === 'grid' ? 'filled' : 'subtle'}
              color={view === 'grid' ? 'violet' : 'gray'}
              onClick={() => setView('grid')}
            >
              <TbLayoutGrid size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <SegmentedControl
        size="xs"
        value={filter}
        onChange={handleFilter}
        style={{ alignSelf: 'flex-start' }}
        data={[
          { value: 'all', label: `Semua (${projects.length})` },
          { value: 'has-access', label: `Has access (${totalHasAccess})` },
          { value: 'restricted', label: `Restricted (${totalRestricted})` },
        ]}
      />

      {/* Has access section */}
      {paginatedWithAccess.length > 0 && (
        <Stack gap={6}>
          <Group gap={6}>
            <ThemeIcon size={18} radius="sm" variant="light" color="teal">
              <TbCheck size={11} />
            </ThemeIcon>
            <Text size="xs" tt="uppercase" fw={700} c="teal">
              Has access
            </Text>
            <Badge size="xs" variant="light" color="teal">
              {totalHasAccess}
            </Badge>
          </Group>
          {view === 'grid' ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {paginatedWithAccess.map((p) => (
                <ProjectAccessItem key={p.slug} userId={userId} project={p} />
              ))}
            </SimpleGrid>
          ) : (
            <Stack gap="xs">
              {paginatedWithAccess.map((p) => (
                <ProjectAccessItem key={p.slug} userId={userId} project={p} />
              ))}
            </Stack>
          )}
        </Stack>
      )}

      {/* No access section */}
      {paginatedWithoutAccess.length > 0 && (
        <Stack gap={6} mt="xs">
          <Group gap={6}>
            <ThemeIcon size={18} radius="sm" variant="light" color="gray">
              <TbBan size={11} />
            </ThemeIcon>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              No access
            </Text>
            <Badge size="xs" variant="outline" color="gray">
              {projects.length - totalHasAccess}
            </Badge>
          </Group>
          {view === 'grid' ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {paginatedWithoutAccess.map((p) => (
                <ProjectAccessItem key={p.slug} userId={userId} project={p} />
              ))}
            </SimpleGrid>
          ) : (
            <Stack gap="xs">
              {paginatedWithoutAccess.map((p) => (
                <ProjectAccessItem key={p.slug} userId={userId} project={p} />
              ))}
            </Stack>
          )}
        </Stack>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={32} radius="xl" variant="light" color="gray" mx="auto" mb="xs">
            <TbSearch size={16} />
          </ThemeIcon>
          <Text size="sm" fw={500}>
            Tidak ada project yang cocok
          </Text>
          <Text size="xs" c="dimmed">
            Coba ubah filter atau hapus kata kunci pencarian.
          </Text>
          {(search || filter !== 'all') && (
            <Button
              size="xs"
              variant="subtle"
              mt="xs"
              onClick={() => {
                handleSearch('')
                handleFilter('all')
              }}
            >
              Reset filter
            </Button>
          )}
        </Box>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Group justify="space-between" align="center" mt="xs">
          <Text size="xs" c="dimmed">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length} project
          </Text>
          <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </Stack>
  )
}
