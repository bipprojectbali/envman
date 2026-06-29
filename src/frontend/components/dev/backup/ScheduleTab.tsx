import { Badge, Button, Checkbox, Group, Loader, Paper, Select, Stack, Text, Textarea } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { CronBuilder } from './CronBuilder'
import type { Schedule } from './types'

export function ScheduleTab({ connId }: { connId: string }) {
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
    if (s) {
      setCron(s.cron)
      setType(s.type)
      setNote(s.note ?? '')
      setEnabled(s.enabled)
    }
  }, [s?.id, s])

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/portainer/connections/${connId}/backup-schedule`, {
        method: 'PUT',
        body: JSON.stringify({ cron, type, note: note.trim() || undefined, enabled }),
      }),
    onSuccess: () => {
      notifyOk('Jadwal disimpan')
      qc.invalidateQueries({ queryKey: ['portainer', 'backup-schedule', connId] })
    },
    onError: (e: Error) => notifyErr(e.message),
  })

  const del = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/portainer/connections/${connId}/backup-schedule`, { method: 'DELETE' }),
    onSuccess: () => {
      notifyOk('Jadwal dihapus')
      qc.invalidateQueries({ queryKey: ['portainer', 'backup-schedule', connId] })
    },
    onError: (e: Error) => notifyErr(e.message),
  })

  if (scheduleQ.isLoading) return <Loader size="sm" mt="md" />

  return (
    <Paper withBorder p="md" mt="md">
      <Stack gap="sm" pt="xs">
        {s && (
          <Group gap="xs">
            <Badge color={s.enabled ? 'teal' : 'gray'} variant="light">
              {s.enabled ? 'Aktif' : 'Nonaktif'}
            </Badge>
            {s.lastRunAt && (
              <Text size="xs" c="dimmed">
                Terakhir: {new Date(s.lastRunAt).toLocaleString('id')}{' '}
                <Badge size="xs" color={s.lastRunOk ? 'green' : 'red'} variant="dot">
                  {s.lastRunOk ? 'OK' : 'Gagal'}
                </Badge>
              </Text>
            )}
          </Group>
        )}
        <CronBuilder value={cron} onChange={setCron} />
        <Select
          label="Jenis backup"
          value={type}
          onChange={(v) => setType(v ?? 'PORTAINER_DB')}
          data={[
            { value: 'PORTAINER_DB', label: 'Database Portainer' },
            { value: 'COMPOSE_FILES', label: 'Compose Files' },
            { value: 'FULL', label: 'Full — Database + Compose' },
          ]}
        />
        <Textarea label="Catatan (opsional)" rows={2} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Checkbox label="Aktifkan jadwal ini" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} />
        <Group gap="xs" justify="end">
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {s ? 'Simpan Perubahan' : 'Buat Jadwal'}
          </Button>
          {s && (
            <Button
              variant="light"
              color="red"
              loading={del.isPending}
              onClick={() =>
                modals.openConfirmModal({
                  title: 'Hapus jadwal?',
                  children: <Text size="sm">Backup terjadwal akan dihentikan.</Text>,
                  labels: { confirm: 'Hapus', cancel: 'Batal' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => del.mutate(),
                })
              }
            >
              Hapus
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  )
}
