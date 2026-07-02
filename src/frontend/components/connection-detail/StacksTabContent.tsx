import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Pagination,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { TbLayoutGrid, TbLayoutList, TbSearch, TbServer, TbX } from 'react-icons/tb'
import type { ContainerInfo, StackInfo } from '@/frontend/types/portainer'
import { StackFilterToolbar } from './StackFilterToolbar'
import { StackItem } from './StackItem'

const PAGE_SIZE = 10

interface Props {
  stacks: StackInfo[]
  filteredStacks: StackInfo[]
  stackView: 'grid' | 'list'
  setStackView: (fn: (v: 'grid' | 'list') => 'grid' | 'list') => void
  totalPages: number
  page: number
  setPage: (p: number) => void
  search: string
  setSearch: (s: string) => void
  filterStatus: string | null
  setFilterStatus: (v: string | null) => void
  filterType: string | null
  setFilterType: (v: string | null) => void
  filterLinked: string | null
  setFilterLinked: (v: string | null) => void
  hasFilter: boolean
  stackStatusMap: Record<string, { containers: any[]; isFetching: boolean }>
  containerStatsMap: Record<string, any>
  canExec: boolean
  canPower: boolean
  canDeploy: boolean
  repull: any
  recreate: any
  restartContainer: any
  confirmRepull: (stack: StackInfo) => void
  confirmRecreate: (stack: StackInfo) => void
  confirmRestartContainer: (stack: StackInfo, containerId: string, containerName: string) => void
  onOpenCompose: (stack: StackInfo) => void
  onOpenLogs: (stack: StackInfo, containerId: string) => void
  onOpenExec: (container: ContainerInfo, stack: StackInfo) => void
}

export function StacksTabContent({
  stacks,
  filteredStacks,
  stackView,
  setStackView,
  totalPages,
  page,
  setPage,
  search,
  setSearch,
  filterStatus,
  setFilterStatus,
  filterType,
  setFilterType,
  filterLinked,
  setFilterLinked,
  hasFilter,
  stackStatusMap,
  containerStatsMap,
  canExec,
  canPower,
  canDeploy,
  repull,
  recreate,
  restartContainer,
  confirmRepull,
  confirmRecreate,
  confirmRestartContainer,
  onOpenCompose,
  onOpenLogs,
  onOpenExec,
}: Props) {
  const pagedStacks = filteredStacks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
        <Group gap="xs">
          <Text fw={600} size="sm">
            Stacks
          </Text>
          <Badge size="sm" variant="light" color="gray">
            {filteredStacks.length}
            {filteredStacks.length !== stacks.length ? `/${stacks.length}` : ''}
          </Badge>
        </Group>
        {stacks.length > 0 && (
          <Tooltip label={stackView === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => setStackView((v) => (v === 'grid' ? 'list' : 'grid'))}
            >
              {stackView === 'grid' ? <TbLayoutList size={15} /> : <TbLayoutGrid size={15} />}
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      {stacks.length > 0 && (
        <StackFilterToolbar
          search={search}
          setSearch={setSearch}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterType={filterType}
          setFilterType={setFilterType}
          filterLinked={filterLinked}
          setFilterLinked={setFilterLinked}
          hasFilter={hasFilter}
        />
      )}

      {stacks.length === 0 ? (
        <Alert color="gray" icon={<TbServer size={14} />} p="xs">
          <Text size="xs">Tidak ada stack ditemukan di Portainer instance ini.</Text>
        </Alert>
      ) : filteredStacks.length === 0 ? (
        <Box
          p="lg"
          ta="center"
          mb="xl"
          style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}
        >
          <TbSearch size={28} style={{ opacity: 0.2, margin: '0 auto 8px' }} />
          <Text size="sm" fw={500} mb={4}>
            Tidak ada stack yang cocok
          </Text>
          <Text size="xs" c="dimmed" mb="sm">
            Coba ubah kata kunci atau reset filter.
          </Text>
          <Button
            size="xs"
            variant="subtle"
            leftSection={<TbX size={12} />}
            onClick={() => {
              setSearch('')
              setFilterStatus(null)
              setFilterType(null)
              setFilterLinked(null)
            }}
          >
            Reset filter
          </Button>
        </Box>
      ) : stackView === 'grid' ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb={totalPages > 1 ? 'sm' : 'xl'}>
            {pagedStacks.map((stack) => {
              const { containers: stackContainers, isFetching: stackFetching } = stackStatusMap[stack.id] ?? {
                containers: [],
                isFetching: false,
              }
              return (
                <StackItem
                  key={stack.id}
                  stack={stack}
                  view="grid"
                  stackContainers={stackContainers}
                  stackFetching={stackFetching}
                  containerStatsMap={containerStatsMap}
                  canExec={canExec}
                  canPower={canPower}
                  canDeploy={canDeploy}
                  repull={repull}
                  recreate={recreate}
                  restartContainer={restartContainer}
                  onRepull={confirmRepull}
                  onRecreate={confirmRecreate}
                  onRestartContainer={confirmRestartContainer}
                  onOpenCompose={onOpenCompose}
                  onOpenLogs={onOpenLogs}
                  onOpenExec={onOpenExec}
                />
              )
            })}
          </SimpleGrid>
          {totalPages > 1 && (
            <Group justify="center" mb="xl">
              <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
            </Group>
          )}
        </>
      ) : (
        <>
          <Stack gap="md" mb={totalPages > 1 ? 'sm' : 'xl'}>
            {pagedStacks.map((stack) => {
              const { containers: stackContainers, isFetching: stackFetching } = stackStatusMap[stack.id] ?? {
                containers: [],
                isFetching: false,
              }
              return (
                <StackItem
                  key={stack.id}
                  stack={stack}
                  view="list"
                  stackContainers={stackContainers}
                  stackFetching={stackFetching}
                  canExec={canExec}
                  canPower={canPower}
                  canDeploy={canDeploy}
                  repull={repull}
                  recreate={recreate}
                  restartContainer={restartContainer}
                  onRepull={confirmRepull}
                  onRecreate={confirmRecreate}
                  onRestartContainer={confirmRestartContainer}
                  onOpenCompose={onOpenCompose}
                  onOpenLogs={onOpenLogs}
                  onOpenExec={onOpenExec}
                />
              )
            })}
          </Stack>
          {totalPages > 1 && (
            <Group justify="center" mb="xl">
              <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
            </Group>
          )}
        </>
      )}
    </>
  )
}
