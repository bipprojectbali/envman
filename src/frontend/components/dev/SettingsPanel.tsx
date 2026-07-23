import { Alert, Button, Divider, Group, NumberInput, Stack, Switch, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbAlertCircle, TbCheck, TbSettings } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { ActivityStats, Settings } from './settings-types'
import { parseSettings } from './settings-types'
import { TokenActivitySection } from './TokenActivitySection'

export function SettingsPanel() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [local, setLocal] = useState<Settings | null>(null)

  const { data, isLoading } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['admin', 'app-settings'],
    queryFn: () => apiFetch('/api/envman/settings'),
  })

  const { data: stats, refetch: refetchStats } = useQuery<ActivityStats>({
    queryKey: ['admin', 'token-activity-stats'],
    queryFn: () => apiFetch('/api/admin/token-activity/stats'),
  })

  useEffect(() => {
    if (data && !local) setLocal(parseSettings(data.settings))
  }, [data, local])

  const save = useMutation({
    mutationFn: (s: Settings) =>
      apiFetch('/api/envman/settings', {
        method: 'PUT',
        body: JSON.stringify([
          { key: 'user_token_creation', value: String(s.user_token_creation) },
          { key: 'user_token_max_days', value: String(s.user_token_max_days) },
          { key: 'token_activity_enabled', value: String(s.token_activity_enabled) },
          { key: 'token_activity_log_vars_fetch', value: String(s.token_activity_log_vars_fetch) },
          { key: 'token_activity_retention_days', value: String(s.token_activity_retention_days) },
          { key: 'token_activity_cap_per_token', value: String(s.token_activity_cap_per_token) },
        ]),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] })
      qc.invalidateQueries({ queryKey: ['envman', 'settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const cleanup = useMutation({
    mutationFn: () => apiFetch('/api/admin/token-activity/cleanup', { method: 'POST' }),
    onSuccess: (d: any) => {
      notifyOk(`Selesai — ${d.deleted} entry dihapus`)
      refetchStats()
    },
    onError: (e) => notifyErr(e),
  })

  const truncate = useMutation({
    mutationFn: () => apiFetch('/api/admin/token-activity', { method: 'DELETE' }),
    onSuccess: (d: any) => {
      notifyOk(`Semua log dihapus — ${d.deleted} entry`)
      refetchStats()
    },
    onError: (e) => notifyErr(e),
  })

  const confirmTruncate = () =>
    modals.openConfirmModal({
      title: 'Hapus Semua Log Aktivitas',
      children: <Text size="sm">Seluruh riwayat aktivitas token akan dihapus permanen dan tidak bisa dipulihkan.</Text>,
      labels: { confirm: 'Hapus Semua', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => truncate.mutate(),
    })

  if (isLoading || !local)
    return (
      <Text c="dimmed" size="sm">
        Loading...
      </Text>
    )

  return (
    <Stack gap="xl" maw={580}>
      <Group gap="xs">
        <TbSettings size={22} />
        <Title order={3}>Settings</Title>
      </Group>

      {/* ── Section: API Token ── */}
      <Stack gap="xs">
        <Text fw={600} size="sm">
          API Token
        </Text>
        <Divider />
        <Group justify="space-between" align="flex-start" py="xs">
          <Stack gap={2}>
            <Text size="sm">Izinkan user membuat token sendiri</Text>
            <Text size="xs" c="dimmed">
              Semua user dapat membuat token dari halaman Profile. Token hanya bekerja untuk project yang user sudah
              jadi member.
            </Text>
          </Stack>
          <Switch
            checked={local.user_token_creation}
            color="blue"
            onChange={(e) => setLocal({ ...local, user_token_creation: e.currentTarget.checked })}
          />
        </Group>
        <Group justify="space-between" align="flex-start" py="xs">
          <Stack gap={2} style={{ flex: 1 }}>
            <Text size="sm">Maks masa berlaku token user (hari)</Text>
            <Text size="xs" c="dimmed">
              Batas expiry untuk token yang dibuat user biasa. <b>0</b> = tidak dibatasi. SUPER_ADMIN tidak terikat.
            </Text>
          </Stack>
          <NumberInput
            value={local.user_token_max_days}
            min={0}
            max={3650}
            w={100}
            size="sm"
            suffix=" hari"
            onChange={(v) => setLocal({ ...local, user_token_max_days: Number(v) || 0 })}
          />
        </Group>
      </Stack>

      <TokenActivitySection
        local={local}
        stats={stats}
        cleanupPending={cleanup.isPending}
        truncatePending={truncate.isPending}
        onChange={setLocal}
        onCleanup={() => cleanup.mutate()}
        onConfirmTruncate={confirmTruncate}
      />

      {save.isError && (
        <Alert icon={<TbAlertCircle size={16} />} color="red" variant="light">
          {(save.error as Error).message}
        </Alert>
      )}

      <Group>
        <Button
          leftSection={saved ? <TbCheck size={16} /> : undefined}
          color={saved ? 'green' : 'blue'}
          loading={save.isPending}
          onClick={() => save.mutate(local)}
        >
          {saved ? 'Tersimpan' : 'Simpan'}
        </Button>
        <Button
          variant="subtle"
          color="gray"
          disabled={save.isPending}
          onClick={() => data && setLocal(parseSettings(data.settings))}
        >
          Reset
        </Button>
      </Group>
    </Stack>
  )
}
