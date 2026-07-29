import { Alert, Badge, Button, Code, Group, NumberInput, Paper, Stack, Text, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbAlertCircle, TbBucket, TbCheck, TbDeviceFloppy, TbRefresh } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { parseSettings } from './settings-types'
import { TransferSettingsPanel } from './TransferSettingsPanel'

type StorageStatus = {
  configured: boolean
  bucketExists: boolean
  status: 'exists' | 'not_found' | 'error' | 'not_configured'
  detail?: string
  bucket: string | null
  endpoint: string | null
}

export function StorageAdminPanel() {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery<StorageStatus>({
    queryKey: ['admin', 'storage', 'status'],
    queryFn: () => apiFetch('/api/admin/storage/status'),
    staleTime: 10_000,
  })

  const { data: rawSettings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/api/envman/settings'),
    staleTime: 30_000,
  })
  const settings = rawSettings ? parseSettings(rawSettings) : null

  const [maxFileMb, setMaxFileMb] = useState<number | string>('')
  const [quotaMb, setQuotaMb] = useState<number | string>('')

  // Sync state saat settings dimuat pertama kali
  const [limitsSynced, setLimitsSynced] = useState(false)
  if (settings && !limitsSynced) {
    setMaxFileMb(settings.storage_max_file_mb)
    setQuotaMb(settings.storage_default_quota_mb)
    setLimitsSynced(true)
  }

  const saveLimits = useMutation({
    mutationFn: () =>
      apiFetch('/api/envman/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { key: 'storage_max_file_mb', value: String(maxFileMb) },
          { key: 'storage_default_quota_mb', value: String(quotaMb) },
        ]),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const ensure = useMutation({
    mutationFn: () => apiFetch('/api/admin/storage/ensure-bucket', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'storage', 'status'] }),
  })

  const statusColor = !data?.configured
    ? 'gray'
    : data.bucketExists
      ? 'green'
      : data.status === 'error'
        ? 'red'
        : 'orange'
  const statusLabel = !data?.configured
    ? 'Tidak dikonfigurasi'
    : data.bucketExists
      ? 'Bucket tersedia'
      : data.status === 'error'
        ? 'Error koneksi'
        : 'Bucket belum ada'

  return (
    <Stack gap="md">
      <Title order={4}>Storage (MinIO)</Title>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Group gap="xs">
              <TbBucket size={18} />
              <Text fw={500}>Status Bucket</Text>
            </Group>
            <Group gap="xs">
              <Badge color={statusColor} variant="light">
                {isLoading ? 'Memeriksa...' : statusLabel}
              </Badge>
              <Button
                size="xs"
                variant="subtle"
                leftSection={<TbRefresh size={13} />}
                onClick={() => refetch()}
                loading={isLoading}
              >
                Refresh
              </Button>
            </Group>
          </Group>

          {data && (
            <Stack gap={4}>
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  Endpoint:
                </Text>
                <Code fz="xs">{data.endpoint ?? '—'}</Code>
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  Bucket:
                </Text>
                <Code fz="xs">{data.bucket ?? '—'}</Code>
              </Group>
              {data.detail && (
                <Group gap="xs">
                  <Text size="xs" c="dimmed">
                    Detail:
                  </Text>
                  <Text size="xs" c="red">
                    {data.detail}
                  </Text>
                </Group>
              )}
            </Stack>
          )}

          {isError && (
            <Alert icon={<TbAlertCircle size={14} />} color="red" title="Gagal cek status">
              Tidak dapat menghubungi server. Coba refresh.
            </Alert>
          )}
        </Stack>
      </Paper>

      {data?.configured && !data.bucketExists && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Text size="sm">
              Bucket <Code>{data.bucket}</Code> belum ada di MinIO. Klik tombol di bawah untuk membuatnya secara
              otomatis.
            </Text>
            {ensure.isError && (
              <Alert icon={<TbAlertCircle size={14} />} color="red" title="Gagal buat bucket">
                {(ensure.error as Error)?.message ?? 'Unknown error'}
              </Alert>
            )}
            {ensure.isSuccess && (
              <Alert icon={<TbCheck size={14} />} color="green" title="Berhasil">
                {ensure.data?.created ? 'Bucket berhasil dibuat.' : 'Bucket sudah ada.'}
              </Alert>
            )}
            <Button
              leftSection={<TbBucket size={14} />}
              loading={ensure.isPending}
              onClick={() => ensure.mutate()}
              color="teal"
            >
              Buat Bucket "{data.bucket}"
            </Button>
          </Stack>
        </Paper>
      )}

      {data?.configured && data.bucketExists && (
        <Alert icon={<TbCheck size={14} />} color="green" title="Storage siap">
          MinIO terhubung dan bucket tersedia. Upload file project sudah bisa digunakan.
        </Alert>
      )}

      {!data?.configured && !isLoading && (
        <Alert icon={<TbAlertCircle size={14} />} color="orange" title="MinIO belum dikonfigurasi">
          Tambahkan <Code>MINIO_ENDPOINT</Code>, <Code>MINIO_ACCESS_KEY</Code>, <Code>MINIO_SECRET_KEY</Code>, dan{' '}
          <Code>MINIO_BUCKET</Code> ke file <Code>.env</Code>, lalu restart server.
        </Alert>
      )}

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={500} size="sm">
            Batas Storage Default
          </Text>
          <Text size="xs" c="dimmed">
            Berlaku untuk semua project yang tidak punya override per-project. SUPER_ADMIN bisa mengatur override
            per-project via ikon gear di panel Storage project.
          </Text>
          <Group align="flex-end" gap="sm">
            <NumberInput
              label="Maks ukuran file (MB)"
              description="Default: 50 MB"
              value={maxFileMb}
              onChange={setMaxFileMb}
              min={1}
              max={10240}
              w={200}
            />
            <NumberInput
              label="Quota per project (MB)"
              description="Default: 500 MB"
              value={quotaMb}
              onChange={setQuotaMb}
              min={1}
              max={102400}
              w={200}
            />
            <Button
              leftSection={<TbDeviceFloppy size={14} />}
              loading={saveLimits.isPending}
              onClick={() => saveLimits.mutate()}
            >
              Simpan
            </Button>
          </Group>
          {saveLimits.isSuccess && (
            <Alert icon={<TbCheck size={14} />} color="green" title="Tersimpan" p="xs">
              Batas storage default berhasil diupdate.
            </Alert>
          )}
          {saveLimits.isError && (
            <Alert icon={<TbAlertCircle size={14} />} color="red" title="Gagal simpan" p="xs">
              {(saveLimits.error as Error)?.message ?? 'Unknown error'}
            </Alert>
          )}
        </Stack>
      </Paper>

      <TransferSettingsPanel />
    </Stack>
  )
}
