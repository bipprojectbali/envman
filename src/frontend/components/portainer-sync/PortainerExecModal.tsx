import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Loader,
  Modal,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  TbBookmark,
  TbCheck,
  TbClipboard,
  TbEraser,
  TbPlayerPlay,
  TbPlus,
  TbTerminal2,
  TbX,
} from 'react-icons/tb'
import type { ExecContainer, PortainerConfig } from './types'
import { apiFetch } from './types'

interface Props {
  opened: boolean
  onClose: () => void
  execContainer: ExecContainer | null
  config: PortainerConfig | null
  isSuperAdmin: boolean
  slug: string
  env: string
}

export function PortainerExecModal({ opened, onClose, execContainer, config, isSuperAdmin, slug, env }: Props) {
  const [execCommand, setExecCommand] = useState('')
  const [execHistory, setExecHistory] = useState<{ command: string; stdout: string[]; stderr: string[]; exitCode: number | null; timestamp: number }[]>([])
  const [execQuickCommands, setExecQuickCommands] = useLocalStorage<{ id: string; label: string; command: string }[]>({
    key: 'envman:exec:quick-commands',
    defaultValue: [
      { id: 'ps', label: 'ps', command: 'ps aux' },
      { id: 'env', label: 'env', command: 'env | sort' },
      { id: 'df', label: 'df', command: 'df -h' },
      { id: 'free', label: 'free', command: 'free -h 2>/dev/null || cat /proc/meminfo 2>/dev/null' },
      { id: 'netstat', label: 'netstat', command: 'netstat -tlnp 2>/dev/null || ss -tlnp' },
    ],
  })
  const [execShowQuickAdd, setExecShowQuickAdd] = useState(false)
  const [execNewQuickLabel, setExecNewQuickLabel] = useState('')
  const [execNewQuickCommand, setExecNewQuickCommand] = useState('')
  const execHistoryIdxRef = useRef(-1)
  const execOutputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (opened && execOutputRef.current) execOutputRef.current.scrollTop = execOutputRef.current.scrollHeight
  }, [opened])

  const execMutation = useMutation({
    mutationFn: ({ containerId, endpointId, command }: { containerId: string; endpointId: number; command: string }) =>
      apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/exec`, {
        method: 'POST',
        body: JSON.stringify({ containerId, endpointId, command }),
      }),
    onSuccess: (data: { stdout?: string[]; stderr?: string[]; exitCode?: number | null }, { command }) => {
      setExecHistory((prev) => [{ command, stdout: data.stdout ?? [], stderr: data.stderr ?? [], exitCode: data.exitCode ?? null, timestamp: Date.now() }, ...prev])
      setExecCommand('')
    },
    onError: (e: Error) => alert(e.message),
  })

  const handleClose = () => {
    setExecCommand('')
    execHistoryIdxRef.current = -1
    onClose()
  }

  const addQuickCommand = () => {
    if (!execNewQuickLabel.trim() || !execNewQuickCommand.trim()) return
    setExecQuickCommands((prev) => [...prev, { id: crypto.randomUUID(), label: execNewQuickLabel.trim(), command: execNewQuickCommand.trim() }])
    setExecNewQuickLabel('')
    setExecNewQuickCommand('')
    setExecShowQuickAdd(false)
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="xl"
      title={
        <Group gap="sm">
          <ThemeIcon size={32} radius="md" variant="light" color="teal"><TbTerminal2 size={16} /></ThemeIcon>
          <Box>
            <Text fw={700} size="sm" lh={1.3}>{execContainer?.containerName}</Text>
            <Text size="xs" c="dimmed" lh={1.2}>{config?.stackName} — {slug}:{env}</Text>
          </Box>
        </Group>
      }
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '70vh', overflow: 'hidden' } }}
    >
      {/* Quick commands */}
      <Box style={{ background: 'var(--mantine-color-default-hover)', borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}>
        <Box px="sm" pt="sm" pb="sm">
          <Group gap="xs" justify="space-between" mb={execQuickCommands.length > 0 || execShowQuickAdd ? 'xs' : 0}>
            <Group gap={6} align="center">
              <TbBookmark size={12} style={{ color: 'var(--mantine-color-teal-6)' }} />
              <Text size="xs" fw={600}>Quick Commands</Text>
              <Text size="xs" c="dimmed">— tersimpan untuk semua container</Text>
            </Group>
            <Group gap={4}>
              {execHistory.length > 0 && (
                <Tooltip label="Hapus semua riwayat">
                  <ActionIcon size="xs" variant="subtle" color="red" onClick={() => { setExecHistory([]); execHistoryIdxRef.current = -1 }}>
                    <TbEraser size={12} />
                  </ActionIcon>
                </Tooltip>
              )}
              {isSuperAdmin && (
                <Tooltip label={execShowQuickAdd ? 'Batal' : 'Tambah quick command'}>
                  <ActionIcon size="xs" variant={execShowQuickAdd ? 'light' : 'subtle'} color={execShowQuickAdd ? 'red' : 'teal'}
                    onClick={() => { setExecShowQuickAdd((v) => !v); setExecNewQuickLabel(''); setExecNewQuickCommand('') }}>
                    {execShowQuickAdd ? <TbX size={12} /> : <TbPlus size={12} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Group>
          {execShowQuickAdd && (
            <Box p="xs" mb="xs" style={{ borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-body)' }}>
              <Group gap="xs" align="flex-end">
                <TextInput size="xs" label="Label" placeholder="mis: ps" value={execNewQuickLabel} onChange={(e) => setExecNewQuickLabel(e.target.value)} style={{ width: 100 }} />
                <TextInput size="xs" label="Command" placeholder="ps aux | grep node" value={execNewQuickCommand} onChange={(e) => setExecNewQuickCommand(e.target.value)} style={{ flex: 1 }}
                  onKeyDown={(e) => { if (e.key === 'Enter') addQuickCommand() }} />
                <ActionIcon size="sm" variant="filled" color="teal" mb={1} disabled={!execNewQuickLabel.trim() || !execNewQuickCommand.trim()} onClick={addQuickCommand}>
                  <TbCheck size={12} />
                </ActionIcon>
              </Group>
            </Box>
          )}
          {execQuickCommands.length > 0 && (
            <Group gap={4} wrap="wrap">
              {execQuickCommands.map((qc) => (
                <Tooltip key={qc.id} label={<Text size="xs" ff="monospace">{qc.command}</Text>} openDelay={350} multiline maw={280}>
                  <Group gap={0} wrap="nowrap">
                    <Box component="button" onClick={() => { setExecCommand(qc.command); execHistoryIdxRef.current = -1 }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--mantine-color-teal-light)', color: 'var(--mantine-color-teal-text)', border: 'none', borderRadius: isSuperAdmin ? '4px 0 0 4px' : '4px', padding: '2px 7px', fontSize: 11, fontWeight: 600, cursor: 'pointer', userSelect: 'none', lineHeight: 1.6 }}>
                      <TbTerminal2 size={10} />
                      {qc.label}
                    </Box>
                    {isSuperAdmin && (
                      <Box component="button" onClick={() => setExecQuickCommands((prev) => prev.filter((x) => x.id !== qc.id))}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, background: 'var(--mantine-color-teal-light)', border: 'none', borderLeft: '1px solid var(--mantine-color-teal-light-hover)', borderRadius: '0 4px 4px 0', cursor: 'pointer', color: 'var(--mantine-color-teal-text)', fontSize: 13, padding: 0, alignSelf: 'stretch' }}>
                        ×
                      </Box>
                    )}
                  </Group>
                </Tooltip>
              ))}
            </Group>
          )}
        </Box>
      </Box>

      {/* Terminal output */}
      <Box ref={execOutputRef} style={{ flex: 1, overflowY: 'auto', background: '#0d1117' }}>
        {execHistory.length === 0 && !execMutation.isPending ? (
          <Box p="md">
            <Text fz={12} ff="monospace" style={{ color: '#8b949e' }}>Connected to <Text span ff="monospace" style={{ color: '#79c0ff' }}>{execContainer?.containerName}</Text></Text>
            <Text fz={11} ff="monospace" mt={6} style={{ color: '#636e7b' }}>
              Ketik command lalu tekan <Text span style={{ color: '#e6edf3', background: '#21262d', padding: '1px 5px', borderRadius: 3 }}>Enter</Text> untuk eksekusi.
              Gunakan <Text span style={{ color: '#e6edf3', background: '#21262d', padding: '1px 5px', borderRadius: 3 }}>↑↓</Text> untuk navigasi riwayat.
            </Text>
          </Box>
        ) : (
          <Box p="sm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...execHistory].reverse().map((entry, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: exec history has no stable id after reverse
              <Box key={i} style={{ borderRadius: 6, border: '1px solid #21262d', overflow: 'hidden' }}>
                <Group px="sm" py={5} gap="xs" wrap="nowrap" justify="space-between"
                  style={{ background: '#161b22', borderBottom: entry.stdout.length > 0 || entry.stderr.length > 0 ? '1px solid #21262d' : undefined }}>
                  <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Text span fz={12} ff="monospace" style={{ color: '#3fb950', flexShrink: 0 }}>❯</Text>
                    <Text span fz={12} ff="monospace" style={{ color: '#79c0ff', wordBreak: 'break-all' }}>{entry.command}</Text>
                  </Group>
                  <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Text fz={10} style={{ color: '#636e7b' }}>{new Date(entry.timestamp).toLocaleTimeString('id-ID', { hour12: false })}</Text>
                    <Badge size="xs" variant="dot" color={entry.exitCode === 0 ? 'teal' : entry.exitCode === null ? 'gray' : 'red'}>{entry.exitCode ?? '?'}</Badge>
                    <Tooltip label="Copy output" openDelay={400}>
                      <ActionIcon size="xs" variant="subtle" color="gray"
                        onClick={() => navigator.clipboard.writeText([...entry.stdout, ...entry.stderr].join('\n')).catch(() => {})}>
                        <TbClipboard size={11} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
                {entry.stdout.length === 0 && entry.stderr.length === 0 ? (
                  <Box px="sm" py={6}><Text fz={11} ff="monospace" style={{ color: '#636e7b', fontStyle: 'italic' }}>(no output)</Text></Box>
                ) : (
                  <Box px="sm" py={6}>
                    {[...entry.stdout.entries()].map(([j, line]) => (
                      <Text key={`o${j}`} fz={11} ff="monospace" style={{ color: '#e6edf3', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>{line}</Text>
                    ))}
                    {[...entry.stderr.entries()].map(([j, line]) => (
                      <Text key={`e${j}`} fz={11} ff="monospace" style={{ color: '#ff7b72', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>{line}</Text>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
        {execMutation.isPending && (
          <Box px="sm" pb="sm">
            <Group gap="xs" px="sm" py={8} style={{ background: '#161b22', borderRadius: 6, border: '1px solid #21262d' }}>
              <Loader size="xs" color="teal" />
              <Text fz={11} ff="monospace" style={{ color: '#636e7b' }}>
                running <Text span ff="monospace" style={{ color: '#79c0ff' }}>{execCommand}</Text> ...
              </Text>
            </Group>
          </Box>
        )}
      </Box>

      {/* Command input */}
      <Box style={{ borderTop: '1px solid #21262d', background: '#010409', flexShrink: 0, padding: '10px 12px 8px' }}>
        <Group gap="xs" wrap="nowrap" align="center">
          <Text fz={14} ff="monospace" style={{ color: '#3fb950', flexShrink: 0, userSelect: 'none' }}>❯</Text>
          <TextInput
            style={{ flex: 1 }}
            size="sm"
            placeholder={execMutation.isPending ? 'waiting...' : 'command...'}
            value={execCommand}
            onChange={(e) => { execHistoryIdxRef.current = -1; setExecCommand(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && execCommand.trim() && !execMutation.isPending && execContainer) {
                execMutation.mutate({ containerId: execContainer.containerId, endpointId: execContainer.endpointId, command: execCommand.trim() })
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                const newIdx = Math.min(execHistoryIdxRef.current + 1, execHistory.length - 1)
                execHistoryIdxRef.current = newIdx
                if (execHistory[newIdx]) setExecCommand(execHistory[newIdx].command)
                return
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                const newIdx = Math.max(execHistoryIdxRef.current - 1, -1)
                execHistoryIdxRef.current = newIdx
                setExecCommand(newIdx === -1 ? '' : (execHistory[newIdx]?.command ?? ''))
              }
            }}
            styles={{ input: { fontFamily: 'monospace', fontSize: 13, background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' } }}
            disabled={execMutation.isPending}
            autoFocus
          />
          <ActionIcon size="lg" variant="filled" color="teal" loading={execMutation.isPending}
            disabled={!execCommand.trim() || execMutation.isPending || !execContainer}
            onClick={() => execContainer && execMutation.mutate({ containerId: execContainer.containerId, endpointId: execContainer.endpointId, command: execCommand.trim() })}>
            <TbPlayerPlay size={15} />
          </ActionIcon>
        </Group>
        <Group mt={5} justify="space-between">
          <Text fz={10} style={{ color: '#636e7b' }}>↑↓ history · Enter jalankan</Text>
          {execHistory.length > 0 && <Text fz={10} style={{ color: '#636e7b' }}>{execHistory.length} command dijalankan</Text>}
        </Group>
      </Box>
    </Modal>
  )
}
