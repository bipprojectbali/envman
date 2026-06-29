import {
  ActionIcon,
  Box,
  Button,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { Kbd } from '@mantine/core'
import type { NavigateFn } from '@tanstack/react-router'
import { TbAlertTriangle, TbLayoutGrid, TbLayoutList, TbPlus, TbPlugConnected, TbPlugConnectedX, TbSearch, TbX } from 'react-icons/tb'
import {
  type Connection,
  ConnectionGridCard,
  ConnectionListCard,
  HOVER_STYLES,
} from '@/frontend/components/connection/ConnectionCard'

interface ConnectionListViewProps {
  connections: Connection[]
  filteredConnections: Connection[]
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  view: 'grid' | 'list'
  setView: (fn: (v: 'grid' | 'list') => 'grid' | 'list') => void
  search: string
  setSearch: (s: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  debouncedSearch: string
  healthMap: Record<string, { totalStacks: number; activeStacks: number; inactiveStacks: number } | undefined>
  canManageConnections: boolean
  totalEnvs: number
  openCreate: () => void
  openEdit: (c: Connection) => void
  deleteConnection: (id: string, name: string, usedBy: number) => void
  navigate: NavigateFn
}

export function ConnectionListView({
  connections,
  filteredConnections,
  isLoading,
  isError,
  error,
  refetch,
  view,
  setView,
  search,
  setSearch,
  searchRef,
  debouncedSearch,
  healthMap,
  canManageConnections,
  totalEnvs,
  openCreate,
  openEdit,
  deleteConnection,
  navigate,
}: ConnectionListViewProps) {
  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      {/* ─── Header ─────────────────────────── */}
      <Group justify="space-between" mb="md" wrap="nowrap" align="flex-start">
        <Group gap="sm" style={{ minWidth: 0 }}>
          <ThemeIcon size={38} radius="md" variant="light" color="primary">
            <TbPlugConnected size={20} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="lg" lh={1.2}>
              Portainer Connections
            </Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {isLoading
                ? 'Memuat...'
                : connections.length === 0
                  ? 'Belum ada connection'
                  : `${connections.length} connection · ${totalEnvs} environment terhubung`}
            </Text>
          </Box>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {connections.length > 0 && (
            <Tooltip label={view === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
              <ActionIcon
                size="lg"
                variant="default"
                aria-label="Ganti tampilan"
                onClick={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))}
              >
                {view === 'grid' ? <TbLayoutList size={16} /> : <TbLayoutGrid size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
          {canManageConnections && (
            <Button size="sm" leftSection={<TbPlus size={14} />} color="primary" onClick={openCreate}>
              Add Connection
            </Button>
          )}
        </Group>
      </Group>

      {/* ─── Toolbar ────────────────────────── */}
      {!isError && connections.length > 0 && (
        <Box py={8} mb="md" maw={580}>
          <TextInput
            ref={searchRef}
            size="sm"
            placeholder="Cari nama atau URL..."
            leftSection={<TbSearch size={14} />}
            rightSection={
              search ? (
                <ActionIcon size="sm" variant="subtle" aria-label="Hapus pencarian" onClick={() => setSearch('')}>
                  <TbX size={12} />
                </ActionIcon>
              ) : (
                <Tooltip label="Tekan / untuk focus">
                  <Kbd size="xs">/</Kbd>
                </Tooltip>
              )
            }
            rightSectionWidth={34}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {debouncedSearch.trim() && filteredConnections.length < connections.length && (
            <Group justify="space-between" mt="xs" gap="xs">
              <Text size="xs" c="dimmed">
                {filteredConnections.length} dari {connections.length} connection
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<TbX size={11} />}
                onClick={() => setSearch('')}
              >
                Reset pencarian
              </Button>
            </Group>
          )}
        </Box>
      )}

      {/* ─── Error state ────────────────────── */}
      {isError && (
        <Box p="xl" ta="center" style={{ border: '1px solid var(--mantine-color-red-5)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm">
            <TbAlertTriangle size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Gagal memuat connections
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            {(error as Error)?.message ?? 'Terjadi kesalahan saat memuat daftar connection.'}
          </Text>
          <Button size="xs" variant="light" color="red" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </Box>
      )}

      {/* ─── List/grid ─────────────────────── */}
      {!isError && isLoading ? (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={148} radius="md" />
            ))}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={72} radius="md" />
            ))}
          </Stack>
        )
      ) : !isError && connections.length === 0 ? (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="primary" mx="auto" mb="sm">
            <TbPlugConnectedX size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Belum ada connection
          </Text>
          <Text size="sm" c="dimmed" mb="md" maw={420} mx="auto">
            Tambah Portainer instance yang dapat dipakai semua project untuk auto-sync env vars ke container stack.
          </Text>
          {canManageConnections ? (
            <Button size="sm" color="primary" leftSection={<TbPlus size={14} />} onClick={openCreate}>
              Add Connection
            </Button>
          ) : (
            <Text size="xs" c="dimmed">
              Connection adalah infrastruktur global — hanya SUPER_ADMIN yang boleh menambah.
            </Text>
          )}
        </Box>
      ) : !isError && filteredConnections.length === 0 ? (
        <Box p="lg" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbSearch size={22} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Tidak ada hasil
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            Tidak ada connection yang cocok dengan "{debouncedSearch}".
          </Text>
          <Button size="xs" variant="subtle" leftSection={<TbX size={11} />} onClick={() => setSearch('')}>
            Reset pencarian
          </Button>
        </Box>
      ) : !isError && view === 'grid' ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {filteredConnections.map((c) => (
            <ConnectionGridCard
              key={c.id}
              connection={c}
              health={healthMap[c.id]}
              canManage={canManageConnections}
              onOpen={() => navigate({ to: '/envmanager/connections/$id', params: { id: c.id } })}
              onEdit={() => openEdit(c)}
              onDelete={() => deleteConnection(c.id, c.name, c._count.configs)}
            />
          ))}
        </SimpleGrid>
      ) : !isError ? (
        <Stack gap="xs">
          {filteredConnections.map((c) => (
            <ConnectionListCard
              key={c.id}
              connection={c}
              health={healthMap[c.id]}
              canManage={canManageConnections}
              onOpen={() => navigate({ to: '/envmanager/connections/$id', params: { id: c.id } })}
              onEdit={() => openEdit(c)}
              onDelete={() => deleteConnection(c.id, c.name, c._count.configs)}
            />
          ))}
        </Stack>
      ) : null}
    </Box>
  )
}
