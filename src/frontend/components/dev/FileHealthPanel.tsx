import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Pagination,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TbActivity, TbAlertTriangle, TbCircleCheck, TbCircleX, TbCopy, TbCopyCheck } from 'react-icons/tb'

type FileStatus = 'ok' | 'warning' | 'critical'

interface FileEntry {
  path: string
  category: string
  lines: number
  chars: number
  maxLines: number
  maxChars: number
  linePercent: number
  charPercent: number
  status: FileStatus
}

interface FileHealthData {
  files: FileEntry[]
  summary: { total: number; ok: number; warning: number; critical: number }
}

const STATUS = {
  ok: { color: 'green', Icon: TbCircleCheck, label: 'OK' },
  warning: { color: 'yellow', Icon: TbAlertTriangle, label: 'Warning' },
  critical: { color: 'red', Icon: TbCircleX, label: 'Critical' },
} as const

function CopyRowIcon({ text }: { text: string }) {
  const cb = useClipboard({ timeout: 1500 })
  return (
    <Tooltip label={cb.copied ? 'Copied!' : 'Copy path'} withArrow>
      <ActionIcon
        size="xs"
        variant="subtle"
        color={cb.copied ? 'green' : 'gray'}
        onClick={(e) => {
          e.stopPropagation()
          cb.copy(text)
        }}
      >
        {cb.copied ? <TbCopyCheck size={12} /> : <TbCopy size={12} />}
      </ActionIcon>
    </Tooltip>
  )
}

export function FileHealthPanel() {
  const [filter, setFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const cbAll = useClipboard({ timeout: 1500 })
  const cbSelected = useClipboard({ timeout: 1500 })

  const { data, isLoading } = useQuery<FileHealthData>({
    queryKey: ['admin', 'file-health'],
    queryFn: () => fetch('/api/admin/file-health', { credentials: 'include' }).then((r) => r.json()),
  })

  const files = (data?.files ?? []).filter((f) => filter === 'all' || f.status === filter)
  const s = data?.summary
  const totalPages = Math.max(1, Math.ceil(files.length / pageSize))
  const paged = files.slice((page - 1) * pageSize, page * pageSize)

  const allPaths = files.map((f) => f.path)
  const allChecked = files.length > 0 && files.every((f) => selected.has(f.path))
  const someChecked = files.some((f) => selected.has(f.path))
  const selectedPaths = allPaths.filter((p) => selected.has(p))

  const toggleRow = (path: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })

  const toggleAll = () =>
    setSelected((prev) => {
      if (allChecked) {
        const next = new Set(prev)
        for (const p of allPaths) next.delete(p)
        return next
      }
      return new Set([...prev, ...allPaths])
    })

  const resetPage = (v: string) => {
    setFilter(v)
    setSelected(new Set())
    setPage(1)
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Group gap="xs" align="center">
          <TbActivity size={22} />
          <Title order={3}>File Health</Title>
        </Group>
        {s && (
          <Group gap="xs">
            <Badge color="green" variant="light">
              {s.ok} OK
            </Badge>
            <Badge color="yellow" variant="light">
              {s.warning} Warning
            </Badge>
            <Badge color="red" variant="light">
              {s.critical} Critical
            </Badge>
          </Group>
        )}
      </Group>

      <Group justify="space-between">
        <SegmentedControl
          value={filter}
          onChange={resetPage}
          w="fit-content"
          data={[
            { value: 'all', label: `All${s ? ` (${s.total})` : ''}` },
            { value: 'critical', label: `Critical${s ? ` (${s.critical})` : ''}` },
            { value: 'warning', label: `Warning${s ? ` (${s.warning})` : ''}` },
            { value: 'ok', label: `OK${s ? ` (${s.ok})` : ''}` },
          ]}
        />
        <Group gap="xs">
          {someChecked && (
            <Button
              size="xs"
              variant="light"
              color={cbSelected.copied ? 'green' : 'blue'}
              leftSection={cbSelected.copied ? <TbCopyCheck size={14} /> : <TbCopy size={14} />}
              onClick={() => cbSelected.copy(selectedPaths.join('\n'))}
            >
              {cbSelected.copied ? 'Copied!' : `Copy Selected (${selectedPaths.length})`}
            </Button>
          )}
          <Button
            size="xs"
            variant="light"
            color={cbAll.copied ? 'green' : 'gray'}
            leftSection={cbAll.copied ? <TbCopyCheck size={14} /> : <TbCopy size={14} />}
            onClick={() => cbAll.copy(allPaths.join('\n'))}
            disabled={files.length === 0}
          >
            {cbAll.copied ? 'Copied!' : `Copy All (${files.length})`}
          </Button>
        </Group>
      </Group>

      {isLoading ? (
        <Text c="dimmed" size="sm">
          Loading...
        </Text>
      ) : (
        <Box style={{ overflowX: 'auto' }}>
          <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={36}>
                  <Checkbox
                    size="xs"
                    checked={allChecked}
                    indeterminate={someChecked && !allChecked}
                    onChange={toggleAll}
                  />
                </Table.Th>
                <Table.Th>File</Table.Th>
                <Table.Th w={150}>Category</Table.Th>
                <Table.Th w={150}>Lines</Table.Th>
                <Table.Th w={150}>Chars</Table.Th>
                <Table.Th w={90}>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paged.map((f) => {
                const cfg = STATUS[f.status]
                const Icon = cfg.Icon
                const lineColor = f.linePercent >= 100 ? 'red' : f.linePercent >= 80 ? 'yellow' : 'green'
                const charColor = f.charPercent >= 100 ? 'red' : f.charPercent >= 80 ? 'yellow' : 'green'
                const isSelected = selected.has(f.path)
                return (
                  <Table.Tr
                    key={f.path}
                    bg={isSelected ? 'var(--mantine-color-blue-light)' : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleRow(f.path)}
                  >
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Checkbox size="xs" checked={isSelected} onChange={() => toggleRow(f.path)} />
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                          {f.path}
                        </Text>
                        <CopyRowIcon text={f.path} />
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="dot" size="sm" color="blue">
                        {f.category}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={3}>
                        <Group gap={4} justify="space-between">
                          <Text size="xs">
                            {f.lines}/{f.maxLines}
                          </Text>
                          <Text size="xs" c={lineColor} fw={f.linePercent >= 80 ? 600 : 400}>
                            {f.linePercent}%
                          </Text>
                        </Group>
                        <Tooltip label={`${f.lines} / ${f.maxLines} baris`} withArrow>
                          <Progress value={Math.min(f.linePercent, 100)} color={lineColor} size="sm" />
                        </Tooltip>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={3}>
                        <Group gap={4} justify="space-between">
                          <Text size="xs">
                            {f.chars.toLocaleString()}/{f.maxChars.toLocaleString()}
                          </Text>
                          <Text size="xs" c={charColor} fw={f.charPercent >= 80 ? 600 : 400}>
                            {f.charPercent}%
                          </Text>
                        </Group>
                        <Tooltip label={`${f.chars.toLocaleString()} / ${f.maxChars.toLocaleString()} char`} withArrow>
                          <Progress value={Math.min(f.charPercent, 100)} color={charColor} size="sm" />
                        </Tooltip>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Icon size={14} color={`var(--mantine-color-${cfg.color}-6)`} />
                        <Text size="xs" c={cfg.color} fw={500}>
                          {cfg.label}
                        </Text>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
              {files.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed" size="sm" ta="center" py="md">
                      Tidak ada file
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Box>
      )}

      {files.length > 0 && (
        <Group justify="space-between" align="center">
          <Group gap="xs" align="center">
            <Text size="xs" c="dimmed">
              {files.length} file · hal {page}/{totalPages}
              {someChecked ? ` · ${selectedPaths.length} dipilih` : ''}
            </Text>
            <Select
              size="xs"
              w={80}
              value={String(pageSize)}
              onChange={(v) => {
                setPageSize(Number(v))
                setPage(1)
              }}
              data={['10', '25', '50', '100']}
              allowDeselect={false}
            />
            <Text size="xs" c="dimmed">
              / hal
            </Text>
          </Group>
          <Pagination value={page} onChange={setPage} total={totalPages} size="xs" withEdges />
        </Group>
      )}
    </Stack>
  )
}
