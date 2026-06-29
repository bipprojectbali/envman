import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Checkbox,
  Code,
  Group,
  Loader,
  Modal,
  NumberInput,
  ScrollArea,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { TbAlertTriangle, TbChevronRight, TbCopy, TbDownload, TbFileText, TbRefresh } from 'react-icons/tb'
import type { ContainerInfo, LogLine, StackInfo } from '@/frontend/types/portainer'
import { stateColor } from '@/frontend/types/portainer'

interface Props {
  opened: boolean
  onClose: () => void
  isMobile: boolean | undefined
  logsStack: StackInfo | null
  selectedContainerId: string | null
  setSelectedContainerId: (id: string | null) => void
  logLines: LogLine[]
  logsFetching: boolean
  refetchLogs: () => void
  logTail: number
  setLogTail: (v: number) => void
  showStdout: boolean
  setShowStdout: (v: boolean) => void
  showStderr: boolean
  setShowStderr: (v: boolean) => void
  autoRefresh: boolean
  setAutoRefresh: (v: boolean) => void
  autoScroll: boolean
  setAutoScroll: (v: boolean) => void
  logViewportRef: React.RefObject<HTMLDivElement | null>
  stackStatusMap: Record<number, { containers: ContainerInfo[]; isFetching: boolean }>
  setLiveLines: (lines: LogLine[]) => void
  lastLogTimestamp: React.MutableRefObject<string | null>
}

export function LogsModal({ opened, onClose, isMobile, logsStack, selectedContainerId, setSelectedContainerId, logLines, logsFetching, refetchLogs, logTail, setLogTail, showStdout, setShowStdout, showStderr, setShowStderr, autoRefresh, setAutoRefresh, autoScroll, setAutoScroll, logViewportRef, stackStatusMap, setLiveLines, lastLogTimestamp }: Props) {
  const stackContainers = logsStack ? (stackStatusMap[logsStack.id]?.containers ?? []) : []
  const stackFetchingContainers = logsStack ? (stackStatusMap[logsStack.id]?.isFetching ?? false) : false
  const loadingContainers = stackFetchingContainers && stackContainers.length === 0

  const handleClose = () => {
    onClose()
    setAutoRefresh(false)
    setSelectedContainerId(null)
    setLiveLines([])
    lastLogTimestamp.current = null
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="gray" radius="md"><TbFileText size={13} /></ThemeIcon>
          <Text fw={600} size="sm">Logs — {logsStack?.name}</Text>
          {selectedContainerId && (
            <Badge size="xs" variant="outline" color="gray" style={{ cursor: 'pointer' }} onClick={() => { setSelectedContainerId(null); setLiveLines([]); lastLogTimestamp.current = null }}>
              ← ganti container
            </Badge>
          )}
        </Group>
      }
      size="xl"
      fullScreen={isMobile}
    >
      <Stack gap="sm">
        {!selectedContainerId ? (
          <>
            <Text size="xs" c="dimmed" fw={500}>Pilih container untuk melihat logs:</Text>
            {loadingContainers ? (
              <Group gap="xs" align="center" py="md" justify="center">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">Memuat daftar container di stack <strong>{logsStack?.name}</strong>...</Text>
              </Group>
            ) : stackContainers.length === 0 ? (
              <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="sm">
                <Text size="xs">Tidak ada container ditemukan di stack <strong>{logsStack?.name}</strong>.</Text>
              </Alert>
            ) : (
              <Stack gap="xs">
                {stackContainers.map((c) => (
                  <Box key={c.id} p="sm" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', cursor: 'pointer' }} onClick={() => setSelectedContainerId(c.id)}>
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm" style={{ minWidth: 0 }}>
                        <ThemeIcon size={32} radius="md" variant="light" color={stateColor[c.state] ?? 'gray'}><TbFileText size={16} /></ThemeIcon>
                        <Box style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.names[0]}</Text>
                          <Group gap="xs" mt={2}>
                            <Code fz={10} c="dimmed">{c.shortId}</Code>
                            <Text fz={10} c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{c.image.split('/').pop()}</Text>
                          </Group>
                        </Box>
                      </Group>
                      <Group gap="xs" wrap="nowrap">
                        <Badge size="sm" color={stateColor[c.state] ?? 'gray'} variant="light">{c.state}</Badge>
                        {c.ports.length > 0 && <Code fz={10}>{c.ports[0]}</Code>}
                        <TbChevronRight size={14} color="var(--mantine-color-dimmed)" />
                      </Group>
                    </Group>
                  </Box>
                ))}
              </Stack>
            )}
          </>
        ) : (
          <>
            {(() => {
              const c = stackContainers.find((x) => x.id === selectedContainerId)
              return c ? (
                <Box p="xs" style={{ borderRadius: 'var(--mantine-radius-md)', background: 'var(--mantine-color-default-hover)' }}>
                  <Group gap="sm" wrap="nowrap">
                    <Badge size="sm" color={stateColor[c.state] ?? 'gray'} variant="light">{c.state}</Badge>
                    <Text size="xs" fw={600}>{c.names[0]}</Text>
                    <Code fz={10} c="dimmed">{c.shortId}</Code>
                    <Text fz={10} c="dimmed" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.image.split('/').pop()}</Text>
                  </Group>
                </Box>
              ) : null
            })()}

            <Group justify="space-between" wrap="wrap" gap="xs">
              <Group gap="xs">
                <NumberInput size="xs" w={90} label="Tail" min={10} max={1000} step={50} value={logTail} onChange={(v) => setLogTail(Number(v) || 200)} />
                <Stack gap={2} pt={2}>
                  <Checkbox size="xs" label="stdout" checked={showStdout} onChange={(e) => setShowStdout(e.currentTarget.checked)} />
                  <Checkbox size="xs" label="stderr" checked={showStderr} onChange={(e) => setShowStderr(e.currentTarget.checked)} />
                </Stack>
              </Group>
              <Group gap="xs" align="flex-end">
                <Switch size="xs" label="Auto refresh 5s" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.currentTarget.checked)} />
                <Switch size="xs" label="Auto scroll" checked={autoScroll} onChange={(e) => setAutoScroll(e.currentTarget.checked)} />
                <ActionIcon size="sm" variant="subtle" color="gray" loading={logsFetching} onClick={() => refetchLogs()}><TbRefresh size={13} /></ActionIcon>
                <Tooltip label="Copy logs">
                  <ActionIcon size="sm" variant="subtle" color="gray" disabled={logLines.length === 0}
                    onClick={() => {
                      const text = logLines.map((l) => `[${l.stream}] ${l.timestamp ? `${new Date(l.timestamp).toLocaleTimeString('id-ID')} ` : ''}${l.message}`).join('\n')
                      navigator.clipboard.writeText(text)
                    }}>
                    <TbCopy size={13} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Download .log">
                  <ActionIcon size="sm" variant="subtle" color="gray" disabled={logLines.length === 0}
                    onClick={() => {
                      const text = logLines.map((l) => `[${l.stream.toUpperCase()}] ${l.timestamp ?? ''} ${l.message}`).join('\n')
                      const blob = new Blob([text], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${logsStack?.name ?? 'stack'}-${selectedContainerId.slice(0, 8)}.log`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}>
                    <TbDownload size={13} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>

            {logsFetching && logLines.length === 0 ? (
              <Group justify="center" py="xl"><Loader size="sm" /></Group>
            ) : (
              <Box style={{ borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
                <Group px="xs" py={4} justify="space-between" style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}>
                  <Group gap="xs">
                    <Badge size="xs" color="gray" variant="filled">{logLines.length} baris</Badge>
                    {autoRefresh && <Badge size="xs" color="teal" variant="dot">live</Badge>}
                    {logsFetching && <Loader size={10} color="gray" />}
                  </Group>
                  <Code fz={10} c="dimmed">{selectedContainerId.slice(0, 12)}</Code>
                </Group>
                <ScrollArea.Autosize
                  mah={440}
                  viewportRef={logViewportRef}
                  onScrollPositionChange={({ y }) => {
                    if (logViewportRef.current) {
                      const { scrollHeight, clientHeight } = logViewportRef.current
                      setAutoScroll(y + clientHeight >= scrollHeight - 20)
                    }
                  }}
                >
                  <Box p="xs" style={{ background: '#0d1117', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, minHeight: 120 }}>
                    {logLines.length === 0 ? (
                      <Text fz={11} c="dimmed" ff="monospace">(tidak ada log)</Text>
                    ) : (
                      [...logLines.entries()].map(([i, line]) => (
                        <Box key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          {line.timestamp && (
                            <Text span fz={10} ff="monospace" style={{ color: '#8b949e', flexShrink: 0, userSelect: 'none', paddingTop: 1 }}>
                              {new Date(line.timestamp).toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </Text>
                          )}
                          <Text span fz={9} ff="monospace" style={{ color: line.stream === 'stderr' ? '#ff7b72' : '#7ee787', flexShrink: 0, paddingTop: 2, userSelect: 'none' }}>
                            {line.stream === 'stderr' ? 'ERR' : 'OUT'}
                          </Text>
                          <Text span fz={12} ff="monospace" style={{ color: line.stream === 'stderr' ? '#ff7b72' : '#e6edf3', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                            {line.message}
                          </Text>
                        </Box>
                      ))
                    )}
                  </Box>
                </ScrollArea.Autosize>
              </Box>
            )}
          </>
        )}
      </Stack>
    </Modal>
  )
}
