import {
  ActionIcon, Badge, Box, Button, Checkbox, Drawer, Group, Loader, Pagination,
  Select, Stack, Table, Tabs, Text, Textarea, TextInput, ThemeIcon, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCalendarTime, TbDatabaseExport, TbDownload, TbHistory, TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

type Connection = { id: string; name: string }
type Backup = {
  id: string; type: string; note: string | null; sizeBytes: number | null;
  ok: boolean; error: string | null; createdAt: string; createdBy: { name: string } | null
}
type Schedule = {
  id: string; cron: string; type: string; note: string | null; enabled: boolean;
  lastRunAt: string | null; lastRunOk: boolean | null
} | null

const TYPE_LABELS: Record<string, string> = {
  PORTAINER_DB: 'Database',
  COMPOSE_FILES: 'Compose Files',
  FULL: 'Full',
}

function formatBytes(n: number | null) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// ─── Sub-panels ────────────────────────────────────────────────────────────

function BackupNowTab({ connId }: { connId: string }) {
  const [type, setType] = useState<string>('PORTAINER_DB')
  const [note, setNote] = useState('')
  const qc = useQueryClient()

  const trigger = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/portainer/connections/${connId}/backups`, {
        method: 'POST', body: JSON.stringify({ type, note: note.trim() || undefined }),
      }),
    onSuccess: () => {
      notifyOk('Backup selesai')
      setNote('')
      qc.invalidateQueries({ queryKey: ['portainer', 'backups', connId] })
    },
    onError: (e: Error) => notifyErr(e.message),
  })

  return (
    <Stack gap="sm" pt="xs">
      <Select
        label="Jenis backup"
        value={type} onChange={v => setType(v ?? 'PORTAINER_DB')}
        data={[
          { value: 'PORTAINER_DB', label: 'Database Portainer (tar.gz)' },
          { value: 'COMPOSE_FILES', label: 'Compose Files (JSON bundle)' },
          { value: 'FULL', label: 'Full — Database + Compose' },
        ]}
      />
      <Textarea
        label="Catatan (opsional)" placeholder="Alasan backup ini..."
        value={note} onChange={e => setNote(e.currentTarget.value)} rows={2}
      />
      <Button
        leftSection={<TbDatabaseExport size={16} />}
        loading={trigger.isPending}
        onClick={() => trigger.mutate()}
      >
        Backup Sekarang
      </Button>
    </Stack>
  )
}

function ScheduleTab({ connId }: { connId: string }) {
  const qc = useQueryClient()
  const scheduleQ = useQuery<{ schedule: Schedule }>({
    queryKey: ['portainer', 'backup-schedule', connId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${connId}/backup-schedule`),
  })
  const s = scheduleQ.data?.schedule

  const [cron, setCron] = useState(s?.cron ?? '0 2 * * *')
  const [type, setType] = useState(s?.type ?? 'PORTAINER_DB')
  const [note, setNote] = useState(s?.note ?? '')
  const [enabled, setEnabled] = useState(s?.enabled ?? true)

  // Update form when schedule loads
  const loaded = !!s
  if (loaded && cron === '0 2 * * *' && s.cron !== '0 2 * * *') {
    setCron(s.cron); setType(s.type); setNote(s.note ?? ''); setEnabled(s.enabled)
  }

  const save = useMutation({
    mutationFn: () => apiFetch(`/api/envman/portainer/connections/${connId}/backup-schedule`, {
      method: 'PUT', body: JSON.stringify({ cron, type, note: note.trim() || undefined, enabled }),
    }),
    onSuccess: () => { notifyOk('Jadwal disimpan'); qc.invalidateQueries({ queryKey: ['portainer', 'backup-schedule', connId] }) },
    onError: (e: Error) => notifyErr(e.message),
  })

  const del = useMutation({
    mutationFn: () => apiFetch(`/api/envman/portainer/connections/${connId}/backup-schedule`, { method: 'DELETE' }),
    onSuccess: () => { notifyOk('Jadwal dihapus'); qc.invalidateQueries({ queryKey: ['portainer', 'backup-schedule', connId] }) },
    onError: (e: Error) => notifyErr(e.message),
  })

  if (scheduleQ.isLoading) return <Loader size="sm" mt="md" />

  return (
    <Stack gap="sm" pt="xs">
      {s && (
        <Group gap="xs">
          <Badge color={s.enabled ? 'teal' : 'gray'} variant="light">{s.enabled ? 'Aktif' : 'Nonaktif'}</Badge>
          {s.lastRunAt && (
            <Text size="xs" c="dimmed">
              Terakhir: {new Date(s.lastRunAt).toLocaleString('id')} {' '}
              <Badge size="xs" color={s.lastRunOk ? 'green' : 'red'} variant="dot">{s.lastRunOk ? 'OK' : 'Gagal'}</Badge>
            </Text>
          )}
        </Group>
      )}
      <TextInput
        label="Cron expression" placeholder="0 2 * * *"
        description="Format: menit jam hari bulan hari-minggu. Contoh: 0 2 * * * = tiap hari jam 02:00"
        value={cron} onChange={e => setCron(e.currentTarget.value)}
      />
      <Select
        label="Jenis backup"
        value={type} onChange={v => setType(v ?? 'PORTAINER_DB')}
        data={[
          { value: 'PORTAINER_DB', label: 'Database Portainer' },
          { value: 'COMPOSE_FILES', label: 'Compose Files' },
          { value: 'FULL', label: 'Full — Database + Compose' },
        ]}
      />
      <Textarea
        label="Catatan (opsional)" rows={2}
        value={note} onChange={e => setNote(e.currentTarget.value)}
      />
      <Checkbox
        label="Aktifkan jadwal ini" checked={enabled}
        onChange={e => setEnabled(e.currentTarget.checked)}
      />
      <Group gap="xs">
        <Button flex={1} loading={save.isPending} onClick={() => save.mutate()}>
          {s ? 'Simpan Perubahan' : 'Buat Jadwal'}
        </Button>
        {s && (
          <Button
            variant="light" color="red" loading={del.isPending}
            onClick={() => modals.openConfirmModal({
              title: 'Hapus jadwal?',
              children: <Text size="sm">Backup terjadwal akan dihentikan.</Text>,
              labels: { confirm: 'Hapus', cancel: 'Batal' },
              confirmProps: { color: 'red' },
              onConfirm: () => del.mutate(),
            })}
          >
            Hapus
          </Button>
        )}
      </Group>
    </Stack>
  )
}

function HistoryTab({ connId }: { connId: string }) {
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
        method: 'DELETE', body: JSON.stringify({ ids }),
      }),
    onSuccess: (_, ids) => {
      notifyOk(`${ids.length} backup dihapus`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['portainer', 'backups', connId] })
    },
    onError: (e: Error) => notifyErr(e.message),
  })

  const backups = listQ.data?.backups ?? []
  const allChecked = backups.length > 0 && backups.every(b => selected.has(b.id))

  const toggleAll = () => {
    if (allChecked) setSelected(new Set())
    else setSelected(new Set(backups.map(b => b.id)))
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
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
    <Stack gap="sm" pt="xs">
      <Group justify="space-between">
        <Select
          size="xs" placeholder="Semua jenis" clearable
          value={typeFilter} onChange={v => { setTypeFilter(v); setPage(1) }}
          data={[
            { value: 'PORTAINER_DB', label: 'Database' },
            { value: 'COMPOSE_FILES', label: 'Compose' },
            { value: 'FULL', label: 'Full' },
          ]}
          w={160}
        />
        {selected.size > 0 && (
          <Button
            size="xs" color="red" variant="light" leftSection={<TbTrash size={12} />}
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
            {backups.map(b => (
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
                          size="xs" variant="subtle" color="blue"
                          component="a"
                          href={`/api/envman/portainer/connections/${connId}/backups/${b.id}/download`}
                          download
                        >
                          <TbDownload size={12} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Tooltip label="Hapus" withArrow>
                      <ActionIcon
                        size="xs" variant="subtle" color="red"
                        onClick={() => confirmDelete([b.id])}
                      >
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
        <Pagination
          size="sm" value={page} onChange={setPage}
          total={listQ.data?.totalPages ?? 1}
        />
      )}
    </Stack>
  )
}

// ─── Main panel ────────────────────────────────────────────────────────────

function BackupPanelContent() {
  const connectionsQ = useQuery<{ connections: Connection[] }>({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
  })
  const connections = connectionsQ.data?.connections ?? []
  const [connId, setConnId] = useState<string | null>(null)
  const activeConn = connId ?? connections[0]?.id ?? null

  return (
    <Stack gap="md">
      <Select
        label="Pilih connection"
        placeholder="Pilih Portainer connection..."
        value={activeConn}
        onChange={setConnId}
        data={connections.map(c => ({ value: c.id, label: c.name }))}
      />

      {activeConn ? (
        <Tabs defaultValue="backup">
          <Tabs.List>
            <Tabs.Tab value="backup" leftSection={<TbDatabaseExport size={14} />}>Backup Sekarang</Tabs.Tab>
            <Tabs.Tab value="schedule" leftSection={<TbCalendarTime size={14} />}>Jadwal</Tabs.Tab>
            <Tabs.Tab value="history" leftSection={<TbHistory size={14} />}>Riwayat</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="backup"><BackupNowTab connId={activeConn} /></Tabs.Panel>
          <Tabs.Panel value="schedule"><ScheduleTab connId={activeConn} /></Tabs.Panel>
          <Tabs.Panel value="history"><HistoryTab connId={activeConn} /></Tabs.Panel>
        </Tabs>
      ) : (
        !connectionsQ.isLoading && (
          <Text size="sm" c="dimmed">Belum ada Portainer connection. Buat di halaman Connections terlebih dahulu.</Text>
        )
      )}
    </Stack>
  )
}

export function PortainerBackupButton() {
  const [opened, { open, close }] = useDisclosure(false)
  return (
    <>
      <Box
        component="span"
        onClick={open}
        style={{ textDecoration: 'underline', cursor: 'pointer', fontSize: 'var(--mantine-font-size-xs)', color: 'var(--mantine-color-cyan-6)' }}
      >
        Kelola backup
      </Box>
      <Drawer
        opened={opened}
        onClose={close}
        title={
          <Group gap="xs">
            <ThemeIcon size={28} variant="light" color="cyan" radius="md">
              <TbDatabaseExport size={15} />
            </ThemeIcon>
            <Text fw={700} size="sm">Portainer Backup</Text>
          </Group>
        }
        size="lg"
        position="right"
      >
        <BackupPanelContent />
      </Drawer>
    </>
  )
}
