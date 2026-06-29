import { useDisclosure } from '@mantine/hooks'
import { useEffect, useMemo, useState } from 'react'
import type { StackInfo } from '@/frontend/types/portainer'

const PAGE_SIZE = 10

export function useConnectionPageState(stacks: StackInfo[]) {
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

  return {
    search, setSearch, filterStatus, setFilterStatus,
    filterType, setFilterType, filterLinked, setFilterLinked,
    page, setPage,
    composeStack, setComposeStack, composeOpen, openCompose, closeCompose,
    composeEditing, setComposeEditing, composeContent, setComposeContent,
    logsStack, setLogsStack, logsOpen, openLogs, closeLogs,
    selectedContainerId, setSelectedContainerId,
    logTail, setLogTail, showStdout, setShowStdout,
    showStderr, setShowStderr, autoRefresh, setAutoRefresh,
    autoScroll, setAutoScroll,
    filteredStacks, totalPages, hasFilter,
    handleOpenLogs, handleOpenCompose,
  }
}
