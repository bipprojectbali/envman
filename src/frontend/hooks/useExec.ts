import { useDisclosure, useLocalStorage } from '@mantine/hooks'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr } from '@/frontend/lib/notify'
import type { StackInfo } from '@/frontend/types/portainer'

export interface ExecContainer {
  containerId: string
  endpointId: number
  containerName: string
  stackName: string
}

export interface ExecHistoryEntry {
  command: string
  stdout: string[]
  stderr: string[]
  exitCode: number | null
  timestamp: number
}

const DEFAULT_QUICK_COMMANDS = [
  { id: 'ps', label: 'ps', command: 'ps aux' },
  { id: 'env', label: 'env', command: 'env | sort' },
  { id: 'df', label: 'df', command: 'df -h' },
  { id: 'free', label: 'free', command: 'free -h 2>/dev/null || cat /proc/meminfo 2>/dev/null' },
  { id: 'netstat', label: 'netstat', command: 'netstat -tlnp 2>/dev/null || ss -tlnp' },
]

export function useExec(id: string) {
  const [execContainer, setExecContainer] = useState<ExecContainer | null>(null)
  const [execOpen, { open: openExec, close: closeExec }] = useDisclosure(false)
  const [execCommand, setExecCommand] = useState('')
  const [execHistory, setExecHistory] = useState<ExecHistoryEntry[]>([])
  const [execQuickCommands, setExecQuickCommands] = useLocalStorage<{ id: string; label: string; command: string }[]>({
    key: 'envman:exec:quick-commands',
    defaultValue: DEFAULT_QUICK_COMMANDS,
  })
  const [execShowQuickAdd, setExecShowQuickAdd] = useState(false)
  const [execNewQuickLabel, setExecNewQuickLabel] = useState('')
  const [execNewQuickCommand, setExecNewQuickCommand] = useState('')
  const execHistoryIdxRef = useRef(-1)
  const execOutputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (execOpen && execOutputRef.current) {
      execOutputRef.current.scrollTop = execOutputRef.current.scrollHeight
    }
  }, [execOpen, execHistory])

  const execMutation = useMutation({
    mutationFn: ({ containerId, endpointId, command }: { containerId: string; endpointId: number; command: string }) =>
      apiFetch(`/api/envman/portainer/connections/${id}/exec`, {
        method: 'POST',
        body: JSON.stringify({ containerId, endpointId, command }),
      }),
    onSuccess: (data: any, { command }) => {
      setExecHistory((prev) => [
        { command, stdout: data.stdout ?? [], stderr: data.stderr ?? [], exitCode: data.exitCode ?? null, timestamp: Date.now() },
        ...prev,
      ])
      setExecCommand('')
    },
    onError: (e) => notifyErr(e),
  })

  const openExecForContainer = (container: { id: string; names: string[] }, stack: StackInfo) => {
    setExecContainer({ containerId: container.id, endpointId: stack.endpointId, containerName: container.names[0], stackName: stack.name })
    setExecHistory([])
    openExec()
  }

  return {
    execContainer, setExecContainer,
    execOpen, openExec, closeExec, openExecForContainer,
    execCommand, setExecCommand,
    execHistory, setExecHistory,
    execQuickCommands, setExecQuickCommands,
    execShowQuickAdd, setExecShowQuickAdd,
    execNewQuickLabel, setExecNewQuickLabel,
    execNewQuickCommand, setExecNewQuickCommand,
    execHistoryIdxRef, execOutputRef,
    execMutation,
  }
}
