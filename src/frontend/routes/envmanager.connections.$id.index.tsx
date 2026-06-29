import { ActionIcon, Alert, Badge, Box, Button, Group, Loader, Pagination, SimpleGrid, Stack, Tabs, Text, Tooltip } from '@mantine/core'
import { useDisclosure, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TbAlertTriangle, TbLayoutGrid, TbLayoutList, TbSearch, TbServer, TbTool, TbX } from 'react-icons/tb'
import { ConnectionHeader } from '@/frontend/components/connection-detail/ConnectionHeader'
import { ComposeModal } from '@/frontend/components/connection-detail/ComposeModal'
import { ExecDrawer } from '@/frontend/components/connection-detail/ExecDrawer'
import { LogsModal } from '@/frontend/components/connection-detail/LogsModal'
import { MaintenanceTab } from '@/frontend/components/connection-detail/MaintenanceTab'
import { StackFilterToolbar } from '@/frontend/components/connection-detail/StackFilterToolbar'
import { StackItem } from '@/frontend/components/connection-detail/StackItem'
import { useCleanupMutations } from '@/frontend/hooks/useCleanupMutations'
import { useConnectionDetail } from '@/frontend/hooks/useConnectionDetail'
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
  const logViewportRef = useRef<HTMLDivElement>(null)
  const [liveLines, setLiveLines] = useState<{ stream: 'stdout' | 'stderr'; timestamp: string | null; message: string }[]>([])
  const lastLogTimestamp = useRef<string | null>(null)

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

  // Logs query + incremental refresh
  const { isFetching: logsFetching, refetch: refetchLogs } = useQuery({
    queryKey: ['portainer', 'container-logs', id, logsStack?.id, selectedContainerId, logTail, showStdout, showStderr],
    queryFn: async () => {
      const qs = new URLSearchParams({ tail: String(logTail), stdout: showStdout ? '1' : '0', stderr: showStderr ? '1' : '0', timestamps: '1' })
      const result = await apiFetch(`/api/envman/portainer/connections/${id}/stacks/${logsStack!.id}/logs/${selectedContainerId}?${qs}`)
      setLiveLines(result.lines ?? [])
      const last = (result.lines ?? []).findLast?.((l: any) => l.timestamp)
      if (last?.timestamp) lastLogTimestamp.current = last.timestamp
      return result
    },
    enabled: logsOpen && !!logsStack && !!selectedContainerId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (!autoRefresh || !logsOpen || !logsStack || !selectedContainerId) return
    const interval = setInterval(async () => {
      try {
        const qs = new URLSearchParams({ stdout: showStdout ? '1' : '0', stderr: showStderr ? '1' : '0', timestamps: '1', tail: '100' })
        if (lastLogTimestamp.current) qs.set('since', lastLogTimestamp.current)
        const result = await apiFetch(`/api/envman/portainer/connections/${id}/stacks/${logsStack.id}/logs/${selectedContainerId}?${qs}`)
        const newLines = (result.lines ?? []) as typeof liveLines
        if (newLines.length > 0) {
          setLiveLines((prev) => [...prev, ...newLines].slice(-2000))
          const last = newLines.findLast?.((l: any) => l.timestamp)
          if (last?.timestamp) lastLogTimestamp.current = last.timestamp
        }
      } catch {}
    }, 2000)
    return () => clearInterval(interval)
  }, [autoRefresh, logsOpen, logsStack, selectedContainerId, showStdout, showStderr, id])

  useEffect(() => {
    if (autoScroll && logViewportRef.current) {
      logViewportRef.current.scrollTo({ top: logViewportRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [autoScroll, liveLines])

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
  const pagedStacks = filteredStacks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
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
        <>
          <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
            <Group gap="xs">
              <Text fw={600} size="sm">Stacks</Text>
              <Badge size="sm" variant="light" color="gray">{filteredStacks.length}{filteredStacks.length !== stacks.length ? `/${stacks.length}` : ''}</Badge>
            </Group>
            {stacks.length > 0 && (
              <Tooltip label={stackView === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setStackView((v) => (v === 'grid' ? 'list' : 'grid'))}>
                  {stackView === 'grid' ? <TbLayoutList size={15} /> : <TbLayoutGrid size={15} />}
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          {stacks.length > 0 && (
            <StackFilterToolbar search={search} setSearch={setSearch} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterType={filterType} setFilterType={setFilterType} filterLinked={filterLinked} setFilterLinked={setFilterLinked} hasFilter={hasFilter} />
          )}

          {stacks.length === 0 ? (
            <Alert color="gray" icon={<TbServer size={14} />} p="xs">
              <Text size="xs">Tidak ada stack ditemukan di Portainer instance ini.</Text>
            </Alert>
          ) : filteredStacks.length === 0 ? (
            <Box p="lg" ta="center" mb="xl" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
              <TbSearch size={28} style={{ opacity: 0.2, margin: '0 auto 8px' }} />
              <Text size="sm" fw={500} mb={4}>Tidak ada stack yang cocok</Text>
              <Text size="xs" c="dimmed" mb="sm">Coba ubah kata kunci atau reset filter.</Text>
              <Button size="xs" variant="subtle" leftSection={<TbX size={12} />} onClick={() => { setSearch(''); setFilterStatus(null); setFilterType(null); setFilterLinked(null) }}>Reset filter</Button>
            </Box>
          ) : stackView === 'grid' ? (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb={totalPages > 1 ? 'sm' : 'xl'}>
                {pagedStacks.map((stack) => {
                  const { containers: stackContainers, isFetching: stackFetching } = stackStatusMap[stack.id] ?? { containers: [], isFetching: false }
                  return (
                    <StackItem key={stack.id} stack={stack} view="grid" stackContainers={stackContainers} stackFetching={stackFetching} containerStatsMap={containerStatsMap} canMutate={canMutate} canOperate={canOperate}
                      repull={repull} recreate={recreate} restartContainer={restartContainer}
                      onRepull={confirmRepull} onRecreate={confirmRecreate} onRestartContainer={confirmRestartContainer}
                      onOpenCompose={handleOpenCompose} onOpenLogs={handleOpenLogs} onOpenExec={openExecForContainer} />
                  )
                })}
              </SimpleGrid>
              {totalPages > 1 && <Group justify="center" mb="xl"><Pagination total={totalPages} value={page} onChange={setPage} size="sm" /></Group>}
            </>
          ) : (
            <>
              <Stack gap="md" mb={totalPages > 1 ? 'sm' : 'xl'}>
                {pagedStacks.map((stack) => {
                  const { containers: stackContainers, isFetching: stackFetching } = stackStatusMap[stack.id] ?? { containers: [], isFetching: false }
                  return (
                    <StackItem key={stack.id} stack={stack} view="list" stackContainers={stackContainers} stackFetching={stackFetching} canMutate={canMutate} canOperate={canOperate}
                      repull={repull} recreate={recreate} restartContainer={restartContainer}
                      onRepull={confirmRepull} onRecreate={confirmRecreate} onRestartContainer={confirmRestartContainer}
                      onOpenCompose={handleOpenCompose} onOpenLogs={handleOpenLogs} onOpenExec={openExecForContainer} />
                  )
                })}
              </Stack>
              {totalPages > 1 && <Group justify="center" mb="xl"><Pagination total={totalPages} value={page} onChange={setPage} size="sm" /></Group>}
            </>
          )}
        </>
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
