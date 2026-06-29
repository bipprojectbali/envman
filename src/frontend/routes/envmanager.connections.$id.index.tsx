import { Alert, Badge, Box, Button, Group, Loader, Tabs, Text } from '@mantine/core'
import { useDisclosure, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { TbAlertTriangle, TbServer, TbTool } from 'react-icons/tb'
import { ConnectionHeader } from '@/frontend/components/connection-detail/ConnectionHeader'
import { ComposeModal } from '@/frontend/components/connection-detail/ComposeModal'
import { ExecDrawer } from '@/frontend/components/connection-detail/ExecDrawer'
import { LogsModal } from '@/frontend/components/connection-detail/LogsModal'
import { MaintenanceTab } from '@/frontend/components/connection-detail/MaintenanceTab'
import { StacksTabContent } from '@/frontend/components/connection-detail/StacksTabContent'
import { useCleanupMutations } from '@/frontend/hooks/useCleanupMutations'
import { useConnectionDetail } from '@/frontend/hooks/useConnectionDetail'
import { useConnectionLogs } from '@/frontend/hooks/useConnectionLogs'
import { useExec } from '@/frontend/hooks/useExec'
import { useStackMutations } from '@/frontend/hooks/useStackMutations'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import type { StackInfo } from '@/frontend/types/portainer'

export const Route = createFileRoute('/envmanager/connections/$id/')({
  component: ConnectionDetailPage,
})

const PAGE_SIZE = 10

function ConnectionDetailPage() {
  const { id } = Route.useParams()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const { data: sessionData } = useSession()
  const user = sessionData?.user
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const canView = isSuperAdmin || hasCapability(user, 'connection:view')
  const canOperate = isSuperAdmin || hasCapability(user, 'stack:operate')
  const canMutate = isSuperAdmin || hasCapability(user, 'stack:mutate')
  const canPrune = isSuperAdmin || hasCapability(user, 'stack:prune')

  const [activeTab, setActiveTab] = useLocalStorage<string>({ key: `envman:connection-detail:${id}:tab`, defaultValue: 'stacks' })
  const [stackView, setStackView] = useLocalStorage<'grid' | 'list'>({ key: `envman:connection-detail:${id}:view`, defaultValue: 'list' })

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [filterLinked, setFilterLinked] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  // Compose modal state
  const [composeStack, setComposeStack] = useState<StackInfo | null>(null)
  const [composeOpen, { open: openCompose, close: closeCompose }] = useDisclosure(false)
  const [composeEditing, setComposeEditing] = useState(false)
  const [composeContent, setComposeContent] = useState('')

  // Logs modal state
  const [logsStack, setLogsStack] = useState<StackInfo | null>(null)
  const [logsOpen, { open: openLogs, close: closeLogs }] = useDisclosure(false)
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null)
  const [logTail, setLogTail] = useState(200)
  const [showStdout, setShowStdout] = useState(true)
  const [showStderr, setShowStderr] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  const { stacks, connection, isLoading, refetch, isFetching, endpointIds, stackStatusMap, containerStatsMap, cleanupEndpointId, setCleanupEndpointId, imagesData, imagesFetching, refetchImages, containersData, containersFetching, refetchContainers, volumesData, volumesFetching, refetchVolumes, networksData, networksFetching, refetchNetworks } = useConnectionDetail(id, { activeTab })

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

  const filteredStacks = useMemo(() => {
    let list = [...stacks]
    if (search.trim()) list = list.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    if (filterStatus === 'active') list = list.filter((s) => s.status === 1)
    if (filterStatus === 'inactive') list = list.filter((s) => s.status !== 1)
    if (filterType === 'compose') list = list.filter((s) => s.type === 2)
    if (filterType === 'swarm') list = list.filter((s) => s.type !== 2)
    if (filterLinked === 'linked') list = list.filter((s) => s.linkedEnvs.length > 0)
    if (filterLinked === 'unlinked') list = list.filter((s) => s.linkedEnvs.length === 0)
    return list
  }, [stacks, search, filterStatus, filterType, filterLinked])

  const totalPages = Math.max(1, Math.ceil(filteredStacks.length / PAGE_SIZE))
  const hasFilter = !!search.trim() || !!filterStatus || !!filterType || !!filterLinked

  useEffect(() => { setPage(1) }, [search, filterStatus, filterType, filterLinked])

  const handleOpenLogs = (stack: StackInfo, containerId: string) => {
    setLogsStack(stack)
    setSelectedContainerId(containerId)
    openLogs()
  }
  const handleOpenCompose = (stack: StackInfo) => { setComposeStack(stack); setComposeEditing(false); openCompose() }

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

      <ComposeModal
        opened={composeOpen}
        onClose={closeCompose}
        composeStack={composeStack}
        composeContent={composeContent}
        setComposeContent={setComposeContent}
        composeEditing={composeEditing}
        setComposeEditing={setComposeEditing}
        composeFetching={composeFetching}
        composeData={composeData}
        canMutate={canMutate}
        saveCompose={saveCompose}
        onConfirmSave={confirmSaveCompose}
      />

      <LogsModal
        opened={logsOpen}
        onClose={closeLogs}
        isMobile={isMobile}
        logsStack={logsStack}
        selectedContainerId={selectedContainerId}
        setSelectedContainerId={setSelectedContainerId}
        logLines={liveLines}
        logsFetching={logsFetching}
        refetchLogs={refetchLogs}
        logTail={logTail}
        setLogTail={setLogTail}
        showStdout={showStdout}
        setShowStdout={setShowStdout}
        showStderr={showStderr}
        setShowStderr={setShowStderr}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        autoScroll={autoScroll}
        setAutoScroll={setAutoScroll}
        logViewportRef={logViewportRef}
        stackStatusMap={stackStatusMap}
        setLiveLines={setLiveLines}
        lastLogTimestamp={lastLogTimestamp}
      />

      <ExecDrawer
        opened={execOpen}
        onClose={closeExec}
        execContainer={execContainer}
        execCommand={execCommand}
        setExecCommand={setExecCommand}
        execHistory={execHistory}
        setExecHistory={setExecHistory}
        execQuickCommands={execQuickCommands}
        setExecQuickCommands={setExecQuickCommands}
        execShowQuickAdd={execShowQuickAdd}
        setExecShowQuickAdd={setExecShowQuickAdd}
        execNewQuickLabel={execNewQuickLabel}
        setExecNewQuickLabel={setExecNewQuickLabel}
        execNewQuickCommand={execNewQuickCommand}
        setExecNewQuickCommand={setExecNewQuickCommand}
        execHistoryIdxRef={execHistoryIdxRef}
        execOutputRef={execOutputRef}
        execMutation={execMutation}
      />
    </Box>
  )
}
