import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import type { StackInfo } from '@/frontend/types/portainer'

interface Props {
  id: string
  logsOpen: boolean
  logsStack: StackInfo | null
  selectedContainerId: string | null
  logTail: number
  showStdout: boolean
  showStderr: boolean
  autoRefresh: boolean
  autoScroll: boolean
}

export function useConnectionLogs({ id, logsOpen, logsStack, selectedContainerId, logTail, showStdout, showStderr, autoRefresh, autoScroll }: Props) {
  const logViewportRef = useRef<HTMLDivElement>(null)
  const [liveLines, setLiveLines] = useState<{ stream: 'stdout' | 'stderr'; timestamp: string | null; message: string }[]>([])
  const lastLogTimestamp = useRef<string | null>(null)

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

  return { logViewportRef, liveLines, setLiveLines, lastLogTimestamp, logsFetching, refetchLogs }
}
