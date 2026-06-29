import { Badge, Button, Divider, Group, NumberInput, Stack, Switch, Text } from '@mantine/core'
import { TbDatabase, TbTrash } from 'react-icons/tb'
import type { ActivityStats, Settings } from './settings-types'
import { fmtBytes } from './settings-types'

interface Props {
  local: Settings
  stats: ActivityStats | undefined
  cleanupPending: boolean
  truncatePending: boolean
  onChange: (s: Settings) => void
  onCleanup: () => void
  onConfirmTruncate: () => void
}

export function TokenActivitySection({
  local,
  stats,
  cleanupPending,
  truncatePending,
  onChange,
  onCleanup,
  onConfirmTruncate,
}: Props) {
  return (
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
          onChange={(e) => onChange({ ...local, token_activity_enabled: e.currentTarget.checked })}
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
          onChange={(e) => onChange({ ...local, token_activity_log_vars_fetch: e.currentTarget.checked })}
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
          onChange={(v) => onChange({ ...local, token_activity_retention_days: Number(v) || 0 })}
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
          onChange={(v) => onChange({ ...local, token_activity_cap_per_token: Number(v) || 0 })}
        />
      </Group>

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

      <Group gap="xs" pt="xs">
        <Button
          size="xs"
          variant="light"
          color="blue"
          leftSection={<TbDatabase size={14} />}
          loading={cleanupPending}
          onClick={onCleanup}
        >
          Bersihkan Sekarang
        </Button>
        <Button
          size="xs"
          variant="light"
          color="red"
          leftSection={<TbTrash size={14} />}
          loading={truncatePending}
          onClick={onConfirmTruncate}
        >
          Hapus Semua Log
        </Button>
      </Group>
    </Stack>
  )
}
