import { Alert, Button, Code, Group, NumberInput, Paper, Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbAlertCircle, TbCheck, TbDeviceFloppy } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { parseSettings } from './settings-types'

// Limits for user-to-user transfers (envman send / inbox / recv).
//
// Text and file have separate limits on purpose. Text is hex-encoded into a DB
// column and arrives as a JSON body, so it costs ~2x on disk and ~2.7x in
// memory — a large value there is a server-memory problem. File bytes go
// straight from the CLI to MinIO via a presigned PUT and never touch the
// server, so that limit can be two orders of magnitude larger.
export function TransferSettingsPanel() {
  const qc = useQueryClient()

  const { data: rawSettings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/api/envman/settings'),
    staleTime: 30_000,
  })
  const settings = rawSettings ? parseSettings(rawSettings) : null

  const [textKb, setTextKb] = useState<number | string>('')
  const [fileMb, setFileMb] = useState<number | string>('')
  const [defaultTtl, setDefaultTtl] = useState<number | string>('')
  const [maxTtl, setMaxTtl] = useState<number | string>('')
  const [maxPending, setMaxPending] = useState<number | string>('')

  const [synced, setSynced] = useState(false)
  if (settings && !synced) {
    setTextKb(settings.transfer_max_text_kb)
    setFileMb(settings.transfer_max_file_mb)
    setDefaultTtl(settings.transfer_default_ttl_hours)
    setMaxTtl(settings.transfer_max_ttl_hours)
    setMaxPending(settings.transfer_max_pending_per_user)
    setSynced(true)
  }

  const save = useMutation({
    mutationFn: () =>
      apiFetch('/api/envman/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { key: 'transfer_max_text_kb', value: String(textKb) },
          { key: 'transfer_max_file_mb', value: String(fileMb) },
          { key: 'transfer_default_ttl_hours', value: String(defaultTtl) },
          { key: 'transfer_max_ttl_hours', value: String(maxTtl) },
          { key: 'transfer_max_pending_per_user', value: String(maxPending) },
        ]),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Text fw={500} size="sm">
          Transfer Antar User
        </Text>
        <Text size="xs" c="dimmed">
          Batas untuk <Code>envman send</Code>. CLI memilih jalurnya otomatis: teks kecil disimpan terenkripsi di
          database, file biner atau yang melebihi batas teks diupload ke storage. Karena itu batas teks jauh lebih kecil
          — isinya melewati memori server, sedangkan file langsung ke MinIO.
        </Text>
        <Group align="flex-end" gap="sm" wrap="wrap">
          <NumberInput
            label="Maks teks (KB)"
            description="Default: 1024 KB"
            value={textKb}
            onChange={setTextKb}
            min={1}
            max={10240}
            w={170}
          />
          <NumberInput
            label="Maks file (MB)"
            description="Default: 100 MB"
            value={fileMb}
            onChange={setFileMb}
            min={1}
            max={10240}
            w={170}
          />
          <NumberInput
            label="TTL default (jam)"
            description="Default: 72 jam"
            value={defaultTtl}
            onChange={setDefaultTtl}
            min={1}
            max={8760}
            w={170}
          />
          <NumberInput
            label="TTL maksimum (jam)"
            description="Default: 168 jam"
            value={maxTtl}
            onChange={setMaxTtl}
            min={1}
            max={8760}
            w={170}
          />
          <NumberInput
            label="Maks kiriman tertunda"
            description="Per pengirim, default: 20"
            value={maxPending}
            onChange={setMaxPending}
            min={1}
            max={1000}
            w={190}
          />
          <Button leftSection={<TbDeviceFloppy size={14} />} loading={save.isPending} onClick={() => save.mutate()}>
            Simpan
          </Button>
        </Group>
        {save.isSuccess && (
          <Alert icon={<TbCheck size={14} />} color="green" title="Tersimpan" p="xs">
            Batas transfer berhasil diupdate.
          </Alert>
        )}
        {save.isError && (
          <Alert icon={<TbAlertCircle size={14} />} color="red" title="Gagal simpan" p="xs">
            {(save.error as Error)?.message ?? 'Unknown error'}
          </Alert>
        )}
      </Stack>
    </Paper>
  )
}
