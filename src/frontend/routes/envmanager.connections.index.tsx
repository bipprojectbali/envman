import { Alert, Box, Code, Tabs, Text } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { TbAlertTriangle, TbDatabaseExport, TbPlugConnected } from 'react-icons/tb'
import type { Connection } from '@/frontend/components/connection/ConnectionCard'
import { ConnectionForm } from '@/frontend/components/connection/ConnectionForm'
import { ConnectionListView } from '@/frontend/components/connection/ConnectionListView'
import { BackupPanelContent } from '@/frontend/components/dev/PortainerBackupPanel'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { useConnectionsPage } from '@/frontend/hooks/useConnectionsPage'
import { apiFetch } from '@/frontend/lib/api'

export const Route = createFileRoute('/envmanager/connections/')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) === 'backup' ? ('backup' as const) : ('connections' as const),
    connectionForm: typeof search.connectionForm === 'string' ? search.connectionForm : undefined,
  }),
  component: ConnectionsPage,
})

function ConnectionsPage() {
  const navigate = useNavigate()
  const { data: sessionData } = useSession()
  const isSuperAdmin = sessionData?.user?.role === 'SUPER_ADMIN'
  const canViewConnections = isSuperAdmin || hasCapability(sessionData?.user, 'connection:view')
  const canManageConnections = isSuperAdmin || hasCapability(sessionData?.user, 'connection:manage')
  const canViewBackup = isSuperAdmin || hasCapability(sessionData?.user, 'backup:view')
  const { tab, connectionForm: connectionFormId } = Route.useSearch()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
  })
  const connections: Connection[] = data?.connections ?? []

  const isFormOpen = !!connectionFormId
  const editTarget =
    connectionFormId && connectionFormId !== 'new' ? (connections.find((c) => c.id === connectionFormId) ?? null) : null

  const openCreate = () => navigate({ to: '.', search: (prev) => ({ ...prev, connectionForm: 'new' }), replace: true })
  const openEdit = (c: Connection) =>
    navigate({ to: '.', search: (prev) => ({ ...prev, connectionForm: c.id }), replace: true })
  const handleClose = () =>
    navigate({ to: '.', search: (prev) => ({ ...prev, connectionForm: undefined }), replace: true })

  const page = useConnectionsPage({ connections, editTarget, connectionFormId, handleClose })
  const {
    form,
    setForm,
    testResult,
    setTestResult,
    search,
    setSearch,
    view,
    setView,
    debouncedSearch,
    searchRef,
    healthMap,
    filteredConnections,
    testConnection,
    saveConnection,
    deleteConnection,
  } = page

  useHotkeys([
    [
      '/',
      () => {
        searchRef.current?.focus()
        searchRef.current?.select()
      },
    ],
  ])

  if (!canViewConnections && !canManageConnections) {
    return (
      <Box p="md">
        <Alert color="yellow" icon={<TbAlertTriangle size={16} />} variant="light">
          <Text size="sm" fw={600} mb={4}>
            Tidak punya izin melihat Portainer connections
          </Text>
          <Text size="xs">
            Connection adalah infrastruktur global. Minta SUPER_ADMIN untuk grant capability{' '}
            <Code fz="xs">connection:view</Code>.
          </Text>
        </Alert>
      </Box>
    )
  }

  const totalEnvs = connections.reduce((s, c) => s + (c._count?.configs ?? 0), 0)

  if (isFormOpen) {
    return (
      <ConnectionForm
        form={form}
        setForm={setForm}
        editTarget={editTarget}
        testResult={testResult}
        setTestResult={setTestResult}
        testConnection={testConnection}
        saveConnection={saveConnection}
        handleClose={handleClose}
      />
    )
  }

  return (
    <Box>
      <Tabs
        value={tab}
        variant="outline"
        onChange={(v) =>
          navigate({
            to: '/envmanager/connections',
            search: (prev) => ({
              ...prev,
              tab: (v ?? 'connections') as 'connections' | 'backup',
              connectionForm: undefined,
            }),
          })
        }
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="connections" leftSection={<TbPlugConnected size={14} />}>
            Connections
          </Tabs.Tab>
          {canViewBackup && (
            <Tabs.Tab value="backup" leftSection={<TbDatabaseExport size={14} />}>
              Backup
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="connections">
          <Alert color="gray" p="xs" mb="md" icon={<TbPlugConnected size={14} />}>
            <Text size="xs" c="dimmed">
              Connections adalah konfigurasi Portainer yang dapat dipakai oleh semua project. Set sekali, pakai berulang
              — tidak perlu input URL dan token di setiap environment.
            </Text>
          </Alert>
          <ConnectionListView
            connections={connections}
            filteredConnections={filteredConnections}
            isLoading={isLoading}
            isError={isError}
            error={error}
            refetch={refetch}
            view={view}
            setView={setView}
            search={search}
            setSearch={setSearch}
            searchRef={searchRef}
            debouncedSearch={debouncedSearch}
            healthMap={healthMap}
            canManageConnections={canManageConnections}
            totalEnvs={totalEnvs}
            openCreate={openCreate}
            openEdit={openEdit}
            deleteConnection={deleteConnection}
            navigate={navigate}
          />
        </Tabs.Panel>

        {canViewBackup && (
          <Tabs.Panel value="backup" pt="xs">
            <BackupPanelContent />
          </Tabs.Panel>
        )}
      </Tabs>
    </Box>
  )
}
