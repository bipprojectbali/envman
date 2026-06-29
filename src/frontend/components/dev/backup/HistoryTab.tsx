import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbDownload, TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { type Backup, formatBytes, TYPE_LABELS } from './types'

export function HistoryTab({ connId }: { connId: string }) {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const listQ = useQuery<{ backups: Backup[]; total: number; totalPages: number }>({
    queryKey: ['portainer', 'backups', connId, page, typeFilter],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), limit: '20' })
      if (typeFilter) qs.set('type', typeFilter)
      return apiFetch(`/api/envman/portainer/connections/${connId}/backups?${qs}`)
    },
  })

  const deleteMany = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch(`/api/envman/portainer/connections/${connId}/backups`, {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (_, ids) => {
      notifyOk(`${ids.length} backup dihapus`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['portainer', 'backups', connId] })
    },
    onError: (e: Error) => notifyErr(e.message),
  })

  const backups = listQ.data?.backups ?? []
  const allChecked = backups.length > 0 && backups.every((b) => selected.has(b.id))

  const toggleAll = () => {
    if (allChecked) setSelected(new Set())
    else setSelected(new Set(backups.map((b) => b.id)))
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const confirmDelete = (ids: string[]) =>
    modals.openConfirmModal({
      title: 'Hapus backup?',
      children: <Text size="sm">{ids.length} backup akan dihapus permanen.</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMany.mutate(ids),
    })

  return (
    <Paper withBorder p="md" mt="md">
      <Stack gap="sm" pt="xs">
        <Group justify="space-between">
          <Select
            size="xs"
            placeholder="Semua jenis"
            clearable
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); setPage(1) }}
            data={[
              { value: 'PORTAINER_DB', label: 'Database' },
              { value: 'COMPOSE_FILES', label: 'Compose' },
              { value: 'FULL', label: 'Full' },
            ]}
            w={160}
          />
          {selected.size > 0 && (
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<TbTrash size={12} />}
              loading={deleteMany.isPending}
              onClick={() => confirmDelete(Array.from(selected))}
            >
              Hapus {selected.size} terpilih
            </Button>
          )}
        </Group>

        {listQ.isLoading ? (
          <Loader size="sm" />
        ) : backups.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="lg">Belum ada backup</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={36}><Checkbox checked={allChecked} onChange={toggleAll} size="xs" /></Table.Th>
                <Table.Th>Waktu</Table.Th>
                <Table.Th>Jenis</Table.Th>
                <Table.Th>Ukuran</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th w={72} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {backups.map((b) => (
                <Table.Tr key={b.id} bg={selected.has(b.id) ? 'var(--mantine-color-blue-light)' : undefined}>
                  <Table.Td><Checkbox checked={selected.has(b.id)} onChange={() => toggleOne(b.id)} size="xs" /></Table.Td>
                  <Table.Td>
                    <Text size="xs">{new Date(b.createdAt).toLocaleString('id')}</Text>
                    {b.note && <Text size="xs" c="dimmed">{b.note}</Text>}
                  </Table.Td>
                  <Table.Td><Badge size="xs" variant="light">{TYPE_LABELS[b.type] ?? b.type}</Badge></Table.Td>
                  <Table.Td><Text size="xs">{formatBytes(b.sizeBytes)}</Text></Table.Td>
                  <Table.Td>
                    {b.ok ? (
                      <Badge size="xs" color="green" variant="dot">OK</Badge>
                    ) : (
                      <Tooltip label={b.error ?? 'Gagal'} withArrow>
                        <Badge size="xs" color="red" variant="dot">Gagal</Badge>
                      </Tooltip>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end">
                      {b.ok && (
                        <Tooltip label="Download" withArrow>
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="blue"
                            component="a"
                            href={`/api/envman/portainer/connections/${connId}/backups/${b.id}/download`}
                            download
                          >
                            <TbDownload size={12} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Tooltip label="Hapus" withArrow>
                        <ActionIcon size="xs" variant="subtle" color="red" onClick={() => confirmDelete([b.id])}>
                          <TbTrash size={12} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        {(listQ.data?.totalPages ?? 1) > 1 && (
          <Pagination size="sm" value={page} onChange={setPage} total={listQ.data?.totalPages ?? 1} />
        )}
      </Stack>
    </Paper>
  )
}
