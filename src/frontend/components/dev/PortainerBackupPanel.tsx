import { Select, Stack, Tabs, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCalendarTime, TbDatabaseExport, TbHistory } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { BackupNowTab } from './backup/BackupNowTab'
import { HistoryTab } from './backup/HistoryTab'
import { ScheduleTab } from './backup/ScheduleTab'
import type { Connection } from './backup/types'

export function BackupPanelContent() {
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
        maw={580}
        label="Pilih connection"
        placeholder="Pilih Portainer connection..."
        value={activeConn}
        onChange={setConnId}
        data={connections.map((c) => ({ value: c.id, label: c.name }))}
      />
      {activeConn ? (
        <Tabs defaultValue="backup" variant="outline">
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
          <Text size="sm" c="dimmed">
            Belum ada Portainer connection. Buat di halaman Connections terlebih dahulu.
          </Text>
        )
      )}
    </Stack>
  )
}
