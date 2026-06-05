import { Alert, Badge, Button, Divider, Group, NumberInput, Stack, Switch, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbAlertCircle, TbCheck, TbDatabase, TbSettings, TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

interface Settings {
  user_token_creation: boolean
  user_token_max_days: number
  token_activity_enabled: boolean
  token_activity_log_vars_fetch: boolean
  token_activity_retention_days: number
  token_activity_cap_per_token: number
}

interface ActivityStats {
  total: number
  estimatedBytes: number
  oldestEntry: string | null
  topTokens: { tokenId: string; tokenName: string | null; count: number }[]
  byAction: { action: string; count: number }[]
}

function parseSettings(raw: Record<string, string>): Settings {
  return {
    user_token_creation: raw.user_token_creation !== 'false',
    user_token_max_days: Number(raw.user_token_max_days ?? '0') || 0,
    token_activity_enabled: raw.token_activity_enabled !== 'false',
    token_activity_log_vars_fetch: raw.token_activity_log_vars_fetch !== 'false',
    token_activity_retention_days: Number(raw.token_activity_retention_days ?? '30') || 30,
    token_activity_cap_per_token: Number(raw.token_activity_cap_per_token ?? '1000') || 1000,
  }
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

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
              Semua user non-QC dapat membuat token dari halaman Profile. Token hanya bekerja untuk project yang user
              sudah jadi member.
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

      {/* ── Section: Token Activity Log ── */}
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            Token Activity Log
          </Text>
          {stats && (
            <Group gap="xs">
              <Badge size="xs" color="gray" variant="light">
                {stats.total.toLocaleString()} entry
              </Badge>
              <Badge size="xs" color="blue" variant="light">
                ~{fmtBytes(stats.estimatedBytes)}
              </Badge>
            </Group>
          )}
        </Group>
        <Divider />

        <Group justify="space-between" align="flex-start" py="xs">
          <Stack gap={2}>
            <Text size="sm">Aktifkan pencatatan aktivitas</Text>
            <Text size="xs" c="dimmed">
              Master switch. Matikan untuk menghentikan semua logging aktivitas CLI.
            </Text>
          </Stack>
          <Switch
            checked={local.token_activity_enabled}
            color="blue"
            onChange={(e) => setLocal({ ...local, token_activity_enabled: e.currentTarget.checked })}
          />
        </Group>

        <Group justify="space-between" align="flex-start" py="xs">
          <Stack gap={2}>
            <Text size="sm">Catat vars_fetch</Text>
            <Text size="xs" c="dimmed">
              Catat setiap kali CLI mengambil vars (export). Volume tinggi pada CI/CD intensif — matikan jika storage
              jadi masalah.
            </Text>
          </Stack>
          <Switch
            checked={local.token_activity_log_vars_fetch}
            color="blue"
            disabled={!local.token_activity_enabled}
            onChange={(e) => setLocal({ ...local, token_activity_log_vars_fetch: e.currentTarget.checked })}
          />
        </Group>

        <Group justify="space-between" align="flex-start" py="xs">
          <Stack gap={2} style={{ flex: 1 }}>
            <Text size="sm">Retensi log (hari)</Text>
            <Text size="xs" c="dimmed">
              Hapus entry lebih tua dari N hari. <b>0</b> = tidak dihapus otomatis.
            </Text>
          </Stack>
          <NumberInput
            value={local.token_activity_retention_days}
            min={0}
            max={3650}
            w={100}
            size="sm"
            suffix=" hari"
            onChange={(v) => setLocal({ ...local, token_activity_retention_days: Number(v) || 0 })}
          />
        </Group>

        <Group justify="space-between" align="flex-start" py="xs">
          <Stack gap={2} style={{ flex: 1 }}>
            <Text size="sm">Maks entry per token</Text>
            <Text size="xs" c="dimmed">
              Batasi entry terbaru yang disimpan per token. <b>0</b> = tidak dibatasi.
            </Text>
          </Stack>
          <NumberInput
            value={local.token_activity_cap_per_token}
            min={0}
            max={100000}
            w={110}
            size="sm"
            onChange={(v) => setLocal({ ...local, token_activity_cap_per_token: Number(v) || 0 })}
          />
        </Group>

        {/* Stats */}
        {stats && stats.total > 0 && (
          <Stack
            gap={4}
            p="sm"
            style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 'var(--mantine-radius-sm)' }}
          >
            {stats.oldestEntry && (
              <Text size="xs" c="dimmed">
                Entry tertua: {new Date(stats.oldestEntry).toLocaleDateString('id-ID')}
              </Text>
            )}
            {stats.byAction.length > 0 && (
              <Group gap={4} wrap="wrap">
                {stats.byAction.map((a) => (
                  <Badge key={a.action} size="xs" variant="light" color="gray">
                    {a.action}: {a.count.toLocaleString()}
                  </Badge>
                ))}
              </Group>
            )}
            {stats.topTokens.length > 0 && (
              <Text size="xs" c="dimmed">
                Top token:{' '}
                {stats.topTokens
                  .slice(0, 3)
                  .map((t) => `${t.tokenName ?? t.tokenId.slice(0, 8)} (${t.count.toLocaleString()})`)
                  .join(' · ')}
              </Text>
            )}
          </Stack>
        )}

        {/* Manual cleanup buttons */}
        <Group gap="xs" pt="xs">
          <Button
            size="xs"
            variant="light"
            color="blue"
            leftSection={<TbDatabase size={14} />}
            loading={cleanup.isPending}
            onClick={() => cleanup.mutate()}
          >
            Bersihkan Sekarang
          </Button>
          <Button
            size="xs"
            variant="light"
            color="red"
            leftSection={<TbTrash size={14} />}
            loading={truncate.isPending}
            onClick={confirmTruncate}
          >
            Hapus Semua Log
          </Button>
        </Group>
      </Stack>

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
