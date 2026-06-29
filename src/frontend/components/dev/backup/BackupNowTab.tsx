import { Button, Group, Paper, Select, Stack, Textarea } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbDatabaseExport } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export function BackupNowTab({ connId }: { connId: string }) {
  const [type, setType] = useState<string>('PORTAINER_DB')
  const [note, setNote] = useState('')
  const qc = useQueryClient()

  const trigger = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/portainer/connections/${connId}/backups`, {
        method: 'POST',
        body: JSON.stringify({ type, note: note.trim() || undefined }),
      }),
    onSuccess: () => {
      notifyOk('Backup selesai')
      setNote('')
      qc.invalidateQueries({ queryKey: ['portainer', 'backups', connId] })
    },
    onError: (e: Error) => notifyErr(e.message),
  })

  return (
    <Paper withBorder p="md" mt="md">
      <Stack gap="sm" pt="xs">
        <Select
          label="Jenis backup"
          value={type}
          onChange={(v) => setType(v ?? 'PORTAINER_DB')}
          data={[
            { value: 'PORTAINER_DB', label: 'Database Portainer (tar.gz)' },
            { value: 'COMPOSE_FILES', label: 'Compose Files (JSON bundle)' },
            { value: 'FULL', label: 'Full — Database + Compose' },
          ]}
        />
        <Textarea
          label="Catatan (opsional)"
          placeholder="Alasan backup ini..."
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          rows={2}
        />
        <Group justify="end">
          <Button leftSection={<TbDatabaseExport size={16} />} loading={trigger.isPending} onClick={() => trigger.mutate()}>
            Backup Sekarang
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
