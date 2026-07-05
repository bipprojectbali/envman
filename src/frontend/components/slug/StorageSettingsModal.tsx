import { Alert, Button, Group, Modal, NumberInput, Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbAlertCircle, TbCheck, TbDeviceFloppy } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'

interface Limits { storageMaxFileMb: number | null; storageQuotaMb: number | null }
interface StorageData { limits?: Limits }

interface Props {
  slug: string
  opened: boolean
  onClose: () => void
}

export function StorageSettingsModal({ slug, opened, onClose }: Props) {
  const qc = useQueryClient()
  const { data } = useQuery<StorageData>({
    queryKey: ['storage', slug, ''],
    staleTime: 30_000,
  })

  const limits = data?.limits
  const [maxFileMb, setMaxFileMb] = useState<number | string>('')
  const [quotaMb, setQuotaMb] = useState<number | string>('')
  const [synced, setSynced] = useState(false)

  if (limits !== undefined && !synced) {
    setMaxFileMb(limits.storageMaxFileMb ?? '')
    setQuotaMb(limits.storageQuotaMb ?? '')
    setSynced(true)
  }

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/projects/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storageMaxFileMb: maxFileMb === '' ? null : Number(maxFileMb),
          storageQuotaMb: quotaMb === '' ? null : Number(quotaMb),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage', slug] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return (
    <Modal opened={opened} onClose={onClose} title="Batas Storage Project" size="sm">
      <Stack gap="md">
        <Text size="xs" c="dimmed">
          Kosongkan untuk mengikuti batas default global (dari /dev &gt; Storage). Override hanya berlaku untuk project ini.
        </Text>

        <NumberInput
          label="Maks ukuran file (MB)"
          description="Kosong = ikuti global default"
          placeholder="Gunakan default global"
          value={maxFileMb}
          onChange={setMaxFileMb}
          min={1} max={10240}
        />

        <NumberInput
          label="Quota storage project (MB)"
          description="Kosong = ikuti global default"
          placeholder="Gunakan default global"
          value={quotaMb}
          onChange={setQuotaMb}
          min={1} max={102400}
        />

        {save.isSuccess && (
          <Alert icon={<TbCheck size={14} />} color="green" p="xs">
            Batas storage project berhasil diupdate.
          </Alert>
        )}
        {save.isError && (
          <Alert icon={<TbAlertCircle size={14} />} color="red" p="xs">
            {(save.error as Error)?.message ?? 'Gagal simpan'}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>Batal</Button>
          <Button leftSection={<TbDeviceFloppy size={14} />} loading={save.isPending} onClick={() => save.mutate()}>
            Simpan
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
