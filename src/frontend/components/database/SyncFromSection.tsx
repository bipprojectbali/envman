import { Badge, Box, Button, Code, Group, Loader, Stack, Table, Text, TextInput, ThemeIcon } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCheck, TbCloudDownload } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

type SyncResp = { ok: boolean; tables: Record<string, number>; durationMs: number }

export function SyncFromSection() {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [result, setResult] = useState<SyncResp | null>(null)

  const mutation = useMutation({
    mutationFn: (body: { url: string; token: string }) =>
      apiFetch('/api/envman/database/sync-from', {
        method: 'POST',
        body: JSON.stringify(body),
      }) as Promise<SyncResp>,
    onSuccess: (data) => {
      setResult(data)
      setToken('')
      notifyOk(`Sync selesai dalam ${data.durationMs}ms. Login ulang diperlukan.`)
    },
    onError: (e) => notifyErr(e),
  })

  const handleSync = () => {
    if (!url.trim() || !token.trim()) {
      notifyErr(new Error('URL dan token wajib diisi'))
      return
    }
    modals.openConfirmModal({
      title: 'Konfirmasi Sync Database',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Ini akan <b>menimpa seluruh data local DB</b> dengan data dari:
          </Text>
          <Code>{url}</Code>
          <Text size="xs" c="dimmed">
            Semua session local hilang — kamu akan otomatis logout setelah sync selesai.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Sync sekarang', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => mutation.mutate({ url: url.trim(), token: token.trim() }),
    })
  }

  return (
    <Box p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <ThemeIcon size={28} variant="light" color="teal" radius="md">
            <TbCloudDownload size={14} />
          </ThemeIcon>
          <Text fw={600}>Sync From Remote</Text>
          <Badge size="xs" color="gray" variant="light">
            jalankan di LOCAL DEV
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          Paste URL server staging dan token yang sudah di-generate di section atas (di instance staging).
        </Text>
        <TextInput
          label="Source server URL"
          placeholder="https://envman.staging.example.com"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          disabled={mutation.isPending}
        />
        <TextInput
          label="Sync token"
          placeholder="Paste token dari staging"
          value={token}
          onChange={(e) => setToken(e.currentTarget.value)}
          disabled={mutation.isPending}
        />
        <Button
          leftSection={mutation.isPending ? <Loader size={14} /> : <TbCloudDownload size={16} />}
          onClick={handleSync}
          loading={mutation.isPending}
          color="red"
          variant="light"
          w="fit-content"
        >
          {mutation.isPending ? 'Mendownload & restore...' : 'Sync Now'}
        </Button>

        {result && (
          <Box
            p="sm"
            mt="xs"
            style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
          >
            <Stack gap="xs">
              <Group gap="xs">
                <ThemeIcon size={20} color="teal" variant="light" radius="xl">
                  <TbCheck size={12} />
                </ThemeIcon>
                <Text size="sm" fw={600}>
                  Sync berhasil dalam {result.durationMs}ms
                </Text>
              </Group>
              <Table withTableBorder withColumnBorders fz="xs" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Table</Table.Th>
                    <Table.Th ta="right">Rows</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {Object.entries(result.tables).map(([t, n]) => (
                    <Table.Tr key={t}>
                      <Table.Td>
                        <Code>{t}</Code>
                      </Table.Td>
                      <Table.Td ta="right">{n}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Box>
        )}
      </Stack>
    </Box>
  )
}
