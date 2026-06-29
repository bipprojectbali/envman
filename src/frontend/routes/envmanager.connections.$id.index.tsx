import { Alert, Badge, Box, Button, Group, Loader, Tabs, Text } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { TbAlertTriangle, TbServer, TbTool } from 'react-icons/tb'
import { ConnectionHeader } from '@/frontend/components/connection-detail/ConnectionHeader'
import { ConnectionModals } from '@/frontend/components/connection-detail/ConnectionModals'
import { MaintenanceTab } from '@/frontend/components/connection-detail/MaintenanceTab'
import { StacksTabContent } from '@/frontend/components/connection-detail/StacksTabContent'
import { useCleanupMutations } from '@/frontend/hooks/useCleanupMutations'
import { useConnectionDetail } from '@/frontend/hooks/useConnectionDetail'
import { useConnectionLogs } from '@/frontend/hooks/useConnectionLogs'
import { useConnectionPageState } from '@/frontend/hooks/useConnectionPageState'
import { useExec } from '@/frontend/hooks/useExec'
import { useStackMutations } from '@/frontend/hooks/useStackMutations'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'

export const Route = createFileRoute('/envmanager/connections/$id/')({
  component: ConnectionDetailPage,
})

function ConnectionDetailPage() {
  const { id } = Route.useParams()
  const { data: sessionData } = useSession()
  const user = sessionData?.user
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const canView = isSuperAdmin || hasCapability(user, 'connection:view')
  const canOperate = isSuperAdmin || hasCapability(user, 'stack:operate')
  const canMutate = isSuperAdmin || hasCapability(user, 'stack:mutate')
  const canPrune = isSuperAdmin || hasCapability(user, 'stack:prune')

  // activeTab drives useConnectionDetail fetch behavior — must come before it
  const [activeTab, setActiveTab] = useLocalStorage<string>({ key: `envman:connection-detail:${id}:tab`, defaultValue: 'stacks' })
  const [stackView, setStackView] = useLocalStorage<'grid' | 'list'>({ key: `envman:connection-detail:${id}:view`, defaultValue: 'list' })

  const { stacks, connection, isLoading, refetch, isFetching, endpointIds, stackStatusMap, containerStatsMap, cleanupEndpointId, setCleanupEndpointId, imagesData, imagesFetching, refetchImages, containersData, containersFetching, refetchContainers, volumesData, volumesFetching, refetchVolumes, networksData, networksFetching, refetchNetworks } = useConnectionDetail(id, { activeTab })

  const {
    search, setSearch, filterStatus, setFilterStatus,
    filterType, setFilterType, filterLinked, setFilterLinked,
    page, setPage,
    composeStack, composeOpen, closeCompose,
    composeEditing, setComposeEditing, composeContent, setComposeContent,
    logsStack, logsOpen, closeLogs,
    selectedContainerId, setSelectedContainerId,
    logTail, setLogTail, showStdout, setShowStdout,
    showStderr, setShowStderr, autoRefresh, setAutoRefresh,
    autoScroll, setAutoScroll,
    filteredStacks, totalPages, hasFilter,
    handleOpenLogs, handleOpenCompose,
  } = useConnectionPageState(stacks)

  const { saveCompose, confirmSaveCompose, restartContainer, confirmRestartContainer, repull, confirmRepull, recreate, confirmRecreate } = useStackMutations({ id, composeStack, composeContent, setComposeEditing })

  const { pruneImages, confirmPruneImages, pruneContainers, pruneVolumes, pruneNetworks } = useCleanupMutations({ id, cleanupEndpointId, imagesData, refetchImages, refetchContainers, refetchVolumes, refetchNetworks })

  const { execContainer, execOpen, closeExec, openExecForContainer, execCommand, setExecCommand, execHistory, setExecHistory, execQuickCommands, setExecQuickCommands, execShowQuickAdd, setExecShowQuickAdd, execNewQuickLabel, setExecNewQuickLabel, execNewQuickCommand, setExecNewQuickCommand, execHistoryIdxRef, execOutputRef, execMutation } = useExec(id)

  // Compose query — depends on composeStack/composeOpen
  const { data: composeData, isFetching: composeFetching } = useQuery({
    queryKey: ['portainer', 'compose-file', id, composeStack?.id],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/stacks/${composeStack!.id}/file`),
    enabled: composeOpen && !!composeStack,
    staleTime: 0,
  })
  useEffect(() => {
    if (composeData?.content !== undefined && !composeEditing) setComposeContent(composeData.content)
  }, [composeData, composeEditing])

  const { logViewportRef, liveLines, setLiveLines, lastLogTimestamp, logsFetching, refetchLogs } = useConnectionLogs({
    id, logsOpen, logsStack, selectedContainerId, logTail, showStdout, showStderr, autoRefresh, autoScroll,
  })

  if (!canView) {
    return (
      <Box p="md">
        <Alert color="yellow" icon={<TbAlertTriangle size={16} />} variant="light">
          <Text size="sm" fw={600} mb={4}>Tidak punya izin lihat connection detail</Text>
          <Text size="xs">Minta SUPER_ADMIN untuk grant capability <code>connection:view</code>.</Text>
          <Button size="xs" mt="sm" component={Link} to="/envmanager/connections">← Kembali</Button>
        </Alert>
      </Box>
    )
  }

  if (isLoading) return <Group justify="center" py="xl"><Loader /></Group>

  if (!connection) {
    return (
      <Alert color="red" icon={<TbAlertTriangle size={16} />}>
        <Text size="sm">Connection tidak ditemukan.</Text>
        <Button size="xs" mt="xs" component={Link} to="/envmanager/connections">← Kembali</Button>
      </Alert>
    )
  }

  return (
    <Box>
      <ConnectionHeader connection={connection} isFetching={isFetching} stackCount={stacks.length} refetch={refetch} />

      <Tabs variant="outline" value={activeTab} onChange={(v) => setActiveTab(v ?? 'stacks')} mb="sm">
        <Tabs.List>
          <Tabs.Tab value="stacks" leftSection={<TbServer size={14} />}>
            Stacks
            {stacks.length > 0 && <Badge size="xs" variant="light" color="primary" ml="xs">{stacks.length}</Badge>}
          </Tabs.Tab>
          <Tabs.Tab value="maintenance" leftSection={<TbTool size={14} />}>Maintenance</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {activeTab === 'stacks' && (
        <StacksTabContent
          stacks={stacks} filteredStacks={filteredStacks}
          stackView={stackView} setStackView={setStackView}
          totalPages={totalPages} page={page} setPage={setPage}
          search={search} setSearch={setSearch}
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterType={filterType} setFilterType={setFilterType}
          filterLinked={filterLinked} setFilterLinked={setFilterLinked}
          hasFilter={hasFilter}
          stackStatusMap={stackStatusMap} containerStatsMap={containerStatsMap}
          canMutate={canMutate} canOperate={canOperate}
          repull={repull} recreate={recreate} restartContainer={restartContainer}
          confirmRepull={confirmRepull} confirmRecreate={confirmRecreate} confirmRestartContainer={confirmRestartContainer}
          onOpenCompose={handleOpenCompose} onOpenLogs={handleOpenLogs} onOpenExec={openExecForContainer}
        />
      )}

      {activeTab === 'maintenance' && (
        <MaintenanceTab
          endpointIds={endpointIds}
          cleanupEndpointId={cleanupEndpointId}
          setCleanupEndpointId={setCleanupEndpointId}
          imagesData={imagesData} imagesFetching={imagesFetching} refetchImages={refetchImages}
          containersData={containersData} containersFetching={containersFetching} refetchContainers={refetchContainers}
          volumesData={volumesData} volumesFetching={volumesFetching} refetchVolumes={refetchVolumes}
          networksData={networksData} networksFetching={networksFetching} refetchNetworks={refetchNetworks}
          pruneImages={pruneImages} confirmPruneImages={confirmPruneImages}
          pruneContainers={pruneContainers} pruneVolumes={pruneVolumes} pruneNetworks={pruneNetworks}
          canPrune={canPrune}
        />
      )}

      <ConnectionModals
        compose={{ opened: composeOpen, onClose: closeCompose, composeStack, composeContent, setComposeContent, composeEditing, setComposeEditing, composeFetching, composeData, canMutate, saveCompose, onConfirmSave: confirmSaveCompose }}
        logs={{ opened: logsOpen, onClose: closeLogs, logsStack, selectedContainerId, setSelectedContainerId, logLines: liveLines, logsFetching, refetchLogs, logTail, setLogTail, showStdout, setShowStdout, showStderr, setShowStderr, autoRefresh, setAutoRefresh, autoScroll, setAutoScroll, logViewportRef, stackStatusMap, setLiveLines, lastLogTimestamp }}
        exec={{ opened: execOpen, onClose: closeExec, execContainer, execCommand, setExecCommand, execHistory, setExecHistory, execQuickCommands, setExecQuickCommands, execShowQuickAdd, setExecShowQuickAdd, execNewQuickLabel, setExecNewQuickLabel, execNewQuickCommand, setExecNewQuickCommand, execHistoryIdxRef, execOutputRef, execMutation }}
      />
    </Box>
  )
}
