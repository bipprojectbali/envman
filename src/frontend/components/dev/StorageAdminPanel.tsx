import { Alert, Badge, Button, Code, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbAlertCircle, TbBucket, TbCheck, TbRefresh } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'

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

  const ensure = useMutation({
    mutationFn: () => apiFetch('/api/admin/storage/ensure-bucket', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'storage', 'status'] }),
  })

  const statusColor = !data?.configured ? 'gray' : data.bucketExists ? 'green' : data.status === 'error' ? 'red' : 'orange'
  const statusLabel = !data?.configured ? 'Tidak dikonfigurasi' : data.bucketExists ? 'Bucket tersedia' : data.status === 'error' ? 'Error koneksi' : 'Bucket belum ada'

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
              <Button size="xs" variant="subtle" leftSection={<TbRefresh size={13} />} onClick={() => refetch()} loading={isLoading}>
                Refresh
              </Button>
            </Group>
          </Group>

          {data && (
            <Stack gap={4}>
              <Group gap="xs">
                <Text size="xs" c="dimmed">Endpoint:</Text>
                <Code fz="xs">{data.endpoint ?? '—'}</Code>
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed">Bucket:</Text>
                <Code fz="xs">{data.bucket ?? '—'}</Code>
              </Group>
              {data.detail && (
                <Group gap="xs">
                  <Text size="xs" c="dimmed">Detail:</Text>
                  <Text size="xs" c="red">{data.detail}</Text>
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
              Bucket <Code>{data.bucket}</Code> belum ada di MinIO. Klik tombol di bawah untuk membuatnya secara otomatis.
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
          Tambahkan <Code>MINIO_ENDPOINT</Code>, <Code>MINIO_ACCESS_KEY</Code>, <Code>MINIO_SECRET_KEY</Code>, dan <Code>MINIO_BUCKET</Code> ke file <Code>.env</Code>, lalu restart server.
        </Alert>
      )}
    </Stack>
  )
}
