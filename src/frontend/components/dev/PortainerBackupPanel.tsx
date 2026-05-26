import {
  ActionIcon, Badge, Box, Button, Checkbox, Chip, Code, Drawer, Group, Loader, Pagination,
  Select, Stack, Table, Tabs, Text, Textarea, TextInput, ThemeIcon, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
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

// ─── Cron Builder ───────────────────────────────────────────────────────────

type CronFreq = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: String(i).padStart(2, '0') }))
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(i => ({
  value: String(i), label: String(i).padStart(2, '0'),
}))
const DOM_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Tanggal ${i + 1}` }))
const DOW_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const VALID_MINUTES = new Set(['0','5','10','15','20','25','30','35','40','45','50','55'])

function detectFreq(cron: string): CronFreq {
  const p = cron.trim().split(/\s+/)
  if (p.length !== 5) return 'custom'
  const [min, hour, dom, mon, dow] = p
  if (mon !== '*') return 'custom'
  if (dom !== '*' && dow === '*' && hour !== '*') return 'monthly'
  if (dow !== '*' && dom === '*' && hour !== '*') return 'weekly'
  if (hour !== '*' && dom === '*' && dow === '*') return 'daily'
  if (min !== '*' && hour === '*' && dom === '*' && dow === '*') return 'hourly'
  return 'custom'
}

function parseCronParts(cron: string) {
  const p = cron.trim().split(/\s+/)
  return {
    min: p[0] ?? '0',
    hour: p[1] ?? '2',
    dom: p[2] ?? '1',
    dow: (p[4] ?? '*').split(',').filter(d => /^\d$/.test(d)),
  }
}

function buildCron(freq: CronFreq, hour: string, min: string, dom: string, dow: string[]): string {
  const h = hour || '2', m = min || '0'
  switch (freq) {
    case 'hourly':  return `${m} * * * *`
    case 'daily':   return `${m} ${h} * * *`
    case 'weekly':  return `${m} ${h} * * ${dow.length ? [...dow].sort((a, b) => +a - +b).join(',') : '*'}`
    case 'monthly': return `${m} ${h} ${dom || '1'} * *`
    default:        return '0 2 * * *'
  }
}

function cronLabel(freq: CronFreq, hour: string, min: string, dom: string, dow: string[]): string {
  const t = `${String(+hour).padStart(2,'0')}:${String(+min).padStart(2,'0')}`
  const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
  switch (freq) {
    case 'hourly':  return `Tiap jam di menit :${String(+min).padStart(2,'0')}`
    case 'daily':   return `Tiap hari pukul ${t}`
    case 'weekly':  return `Tiap ${dow.map(d => dayNames[+d] ?? d).join(', ')} pukul ${t}`
    case 'monthly': return `Tiap bulan tanggal ${dom} pukul ${t}`
    default:        return ''
  }
}

function CronBuilder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [freq, setFreq] = useState<CronFreq>(() => detectFreq(value))
  const initParts = parseCronParts(value)
  const [hour, setHour] = useState(initParts.hour !== '*' ? initParts.hour : '2')
  const [min, setMin] = useState(VALID_MINUTES.has(initParts.min) ? initParts.min : '0')
  const [dom, setDom] = useState(initParts.dom !== '*' ? initParts.dom : '1')
  const [dow, setDow] = useState<string[]>(initParts.dow.length ? initParts.dow : ['1'])
  const [rawCron, setRawCron] = useState(value)
  const prevValue = useRef(value)

  useEffect(() => {
    if (prevValue.current === value) return
    prevValue.current = value
    const f = detectFreq(value)
    setFreq(f)
    const p = parseCronParts(value)
    if (f !== 'custom') {
      if (p.hour !== '*') setHour(p.hour)
      setMin(VALID_MINUTES.has(p.min) ? p.min : '0')
      if (p.dom !== '*') setDom(p.dom)
      if (p.dow.length) setDow(p.dow)
    } else {
      setRawCron(value)
    }
  }, [value])

  function emit(updates: Partial<{ freq: CronFreq; hour: string; min: string; dom: string; dow: string[]; rawCron: string }>) {
    const f = updates.freq ?? freq
    const h = updates.hour ?? hour
    const m = updates.min ?? min
    const d = updates.dom ?? dom
    const dw = updates.dow ?? dow
    const rc = updates.rawCron ?? rawCron
    onChange(f === 'custom' ? rc : buildCron(f, h, m, d, dw))
  }

  const derived = freq === 'custom' ? rawCron : buildCron(freq, hour, min, dom, dow)
  const label = freq !== 'custom' ? cronLabel(freq, hour, min, dom, dow) : ''

  return (
    <Stack gap="xs">
      <Select
        label="Frekuensi backup"
        value={freq}
        onChange={v => { const f = (v ?? 'daily') as CronFreq; setFreq(f); emit({ freq: f }) }}
        data={[
          { value: 'hourly',  label: 'Setiap jam' },
          { value: 'daily',   label: 'Setiap hari' },
          { value: 'weekly',  label: 'Setiap minggu' },
          { value: 'monthly', label: 'Setiap bulan' },
          { value: 'custom',  label: 'Kustom (cron expression)' },
        ]}
      />

      {freq === 'hourly' && (
        <Select
          label="Di menit ke-" description="Backup jalan di menit ini setiap jam"
          value={min} onChange={v => { setMin(v ?? '0'); emit({ min: v ?? '0' }) }}
          data={MINUTES}
        />
      )}

      {(freq === 'daily' || freq === 'weekly' || freq === 'monthly') && (
        <Group grow gap="xs">
          <Select label="Jam" value={hour} onChange={v => { setHour(v ?? '2'); emit({ hour: v ?? '2' }) }} data={HOURS} />
          <Select label="Menit" value={min} onChange={v => { setMin(v ?? '0'); emit({ min: v ?? '0' }) }} data={MINUTES} />
        </Group>
      )}

      {freq === 'weekly' && (
        <Box>
          <Text size="sm" fw={500} mb={6}>Hari</Text>
          <Chip.Group multiple value={dow} onChange={v => { setDow(v); emit({ dow: v }) }}>
            <Group gap="xs">
              {DOW_LABELS.map((lbl, i) => <Chip key={i} value={String(i)} size="sm">{lbl}</Chip>)}
            </Group>
          </Chip.Group>
        </Box>
      )}

      {freq === 'monthly' && (
        <Select
          label="Tanggal" description="Backup jalan tiap bulan di tanggal ini"
          value={dom} onChange={v => { setDom(v ?? '1'); emit({ dom: v ?? '1' }) }}
          data={DOM_OPTIONS}
        />
      )}

      {freq === 'custom' && (
        <TextInput
          label="Cron expression" placeholder="0 2 * * *"
          description="Format: menit jam hari bulan hari-minggu"
          value={rawCron} onChange={e => { setRawCron(e.currentTarget.value); emit({ rawCron: e.currentTarget.value }) }}
        />
      )}

      <Group gap="xs" align="center">
        <Text size="xs" c="dimmed">Jadwal:</Text>
        <Code fz="xs">{derived}</Code>
        {label && <Text size="xs" c="dimmed">— {label}</Text>}
      </Group>
    </Stack>
  )
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

  const [cron, setCron] = useState('0 2 * * *')
  const [type, setType] = useState('PORTAINER_DB')
  const [note, setNote] = useState('')
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (s) { setCron(s.cron); setType(s.type); setNote(s.note ?? ''); setEnabled(s.enabled) }
  }, [s?.id])

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
      <CronBuilder value={cron} onChange={setCron} />
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
