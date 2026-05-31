import {
  Alert,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation } from '@tanstack/react-query'
import { createLazyFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import {
  TbAlertTriangle,
  TbCheck,
  TbCloudDownload,
  TbCopy,
  TbDatabase,
  TbKey,
  TbRefresh,
} from 'react-icons/tb'

export const Route = createLazyFileRoute('/envmanager/database')({
  component: DatabasePage,
})

type TokenResp = { token: string; expiresInSeconds: number }
type SyncResp = { ok: boolean; tables: Record<string, number>; durationMs: number }

function DatabasePage() {
  return (
    <Stack gap="lg" p="md" maw={700} mx="auto">
      <Group gap="sm">
        <ThemeIcon size={36} variant="gradient" radius="md">
          <TbDatabase size={20} />
        </ThemeIcon>
        <div>
          <Text fw={700} size="lg">Database Sync</Text>
          <Text size="sm" c="dimmed">Kloning data dari instance remote (staging) ke local dev.</Text>
        </div>
      </Group>

      <Alert icon={<TbAlertTriangle size={18} />} color="yellow" variant="light">
        <Text size="sm">
          Operasi ini <b>destructive</b>: data local akan ditimpa total oleh data dari remote.
          Pakai hanya untuk debugging dengan real data. Setelah sync, kamu perlu login ulang.
        </Text>
      </Alert>

      <GenerateTokenSection />
      <Divider label="atau" labelPosition="center" />
      <SyncFromSection />
    </Stack>
  )
}

// ─── Section A: Generate Token ─────────────────────────────────────────────────

function GenerateTokenSection() {
  const [tokenResp, setTokenResp] = useState<TokenResp | null>(null)
  const [remaining, setRemaining] = useState(0)

  const mutation = useMutation({
    mutationFn: () => apiFetch('/api/envman/database/sync-token', { method: 'POST' }) as Promise<TokenResp>,
    onSuccess: (data) => {
      setTokenResp(data)
      setRemaining(data.expiresInSeconds)
      notifyOk('Token dibuat. Copy & paste di local dev sebelum kedaluwarsa.')
    },
    onError: (e) => notifyErr(e),
  })

  useEffect(() => {
    if (!tokenResp) return
    const id = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          setTokenResp(null)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [tokenResp])

  return (
    <Box p="md" >
      <Stack gap="sm">
        <Group gap="xs">
          <ThemeIcon size={28} variant="light" color="primary" radius="md">
            <TbKey size={14} />
          </ThemeIcon>
          <Text fw={600}>Generate Sync Token</Text>
          <Badge size="xs" color="gray" variant="light">jalankan di STAGING</Badge>
        </Group>
        <Text size="xs" c="dimmed">
          Token berlaku 5 menit dan hanya bisa dipakai sekali. Setelah generate, copy
          dan paste di section "Sync From Remote" pada local dev.
        </Text>
        {tokenResp ? (
          <Box p="sm" bg="var(--mantine-color-default-hover)" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Code style={{ flex: 1, wordBreak: 'break-all' }}>{tokenResp.token}</Code>
                <CopyButton value={tokenResp.token}>
                  {({ copied, copy }) => (
                    <Button
                      size="xs"
                      variant={copied ? 'filled' : 'light'}
                      color={copied ? 'teal' : 'violet'}
                      leftSection={copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                      onClick={copy}
                    >
                      {copied ? 'Disalin' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
              <Text size="xs" c={remaining < 30 ? 'red' : 'dimmed'}>
                Kedaluwarsa dalam {Math.floor(remaining / 60)}m {remaining % 60}s
              </Text>
            </Stack>
          </Box>
        ) : (
          <Button
            leftSection={<TbRefresh size={16} />}
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            variant="light"
            color="primary"
            w="fit-content"
          >
            Generate Token
          </Button>
        )}
      </Stack>
    </Box>
  )
}

// ─── Section B: Sync From Remote ───────────────────────────────────────────────

function SyncFromSection() {
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
    <Box p="md" >
      <Stack gap="sm">
        <Group gap="xs">
          <ThemeIcon size={28} variant="light" color="teal" radius="md">
            <TbCloudDownload size={14} />
          </ThemeIcon>
          <Text fw={600}>Sync From Remote</Text>
          <Badge size="xs" color="gray" variant="light">jalankan di LOCAL DEV</Badge>
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
          <Box p="sm" mt="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
            <Stack gap="xs">
              <Group gap="xs">
                <ThemeIcon size={20} color="teal" variant="light" radius="xl">
                  <TbCheck size={12} />
                </ThemeIcon>
                <Text size="sm" fw={600}>Sync berhasil dalam {result.durationMs}ms</Text>
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
                      <Table.Td><Code>{t}</Code></Table.Td>
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
