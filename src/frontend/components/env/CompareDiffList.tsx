import { ActionIcon, Box, Button, Group, ScrollArea, Stack, Text, Tooltip } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCheck, TbChevronDown, TbEye, TbEyeOff, TbGitCompare } from 'react-icons/tb'
import type { DiffRow } from '@/frontend/lib/compare-utils'
import { DiffRowItem } from './DiffRowItem'

export function EmptyState() {
  return (
    <Stack align="center" justify="center" style={{ flex: 1 }} gap="md" p="xl">
      <TbGitCompare size={48} opacity={0.3} />
      <Stack gap={4} align="center">
        <Text size="sm" fw={600}>Paste .env local untuk mulai membandingkan</Text>
        <Text size="xs" c="dimmed" ta="center" maw={360}>
          Hasil perbandingan akan tampil di sini: key yang sama, beda value, hanya di local, atau hanya di envman.
        </Text>
      </Stack>
    </Stack>
  )
}

export function DiffList({
  rows, canEdit, applySingle, addAsSecret,
}: {
  rows: DiffRow[]
  canEdit: boolean
  applySingle: ReturnType<typeof useMutation<unknown, Error, DiffRow>>
  addAsSecret: boolean
}) {
  const [revealValues, setRevealValues] = useState(false)
  const [expandedAll, setExpandedAll] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (key: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  if (rows.length === 0) {
    return (
      <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs" p="xl">
        <TbCheck size={32} opacity={0.4} />
        <Text size="sm" c="dimmed">Tidak ada perbedaan untuk filter ini.</Text>
      </Stack>
    )
  }

  return (
    <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Group justify="space-between" px="md" py={6} style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Text size="xs" fw={600} c="dimmed">HASIL ({rows.length})</Text>
        <Group gap={4}>
          <Tooltip label={expandedAll ? 'Compact semua' : 'Expand semua untuk lihat full value'}>
            <Button
              size="compact-xs" variant="subtle" color="gray"
              leftSection={<TbChevronDown size={11} style={{ transform: expandedAll ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />}
              onClick={() => { setExpandedAll((v) => !v); setExpandedRows(new Set()) }}
            >
              {expandedAll ? 'Compact' : 'Expand'}
            </Button>
          </Tooltip>
          <Tooltip label={revealValues ? 'Sembunyikan value' : 'Tampilkan value'}>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setRevealValues((v) => !v)}>
              {revealValues ? <TbEyeOff size={12} /> : <TbEye size={12} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={2} p="xs">
          {rows.map((row) => (
            <DiffRowItem
              key={row.key} row={row} canEdit={canEdit} applySingle={applySingle} addAsSecret={addAsSecret}
              revealValues={revealValues} expanded={expandedAll || expandedRows.has(row.key)} onToggle={() => toggleRow(row.key)}
            />
          ))}
        </Stack>
      </ScrollArea>
    </Box>
  )
}
