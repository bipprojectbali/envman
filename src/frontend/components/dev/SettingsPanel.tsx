import { Alert, Button, Divider, Group, NumberInput, Stack, Switch, Text, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbAlertCircle, TbCheck, TbSettings } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'

interface Settings {
  user_token_creation: boolean
  user_token_max_days: number
}

function parseSettings(raw: Record<string, string>): Settings {
  return {
    user_token_creation: raw.user_token_creation !== 'false',
    user_token_max_days: Number(raw.user_token_max_days ?? '0') || 0,
  }
}

export function SettingsPanel() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [local, setLocal] = useState<Settings | null>(null)

  const { data, isLoading } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['admin', 'app-settings'],
    queryFn: () => apiFetch('/api/envman/settings'),
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
        ]),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] })
      qc.invalidateQueries({ queryKey: ['envman', 'settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  if (isLoading || !local)
    return (
      <Text c="dimmed" size="sm">
        Loading...
      </Text>
    )

  return (
    <Stack gap="lg" maw={560}>
      <Group gap="xs">
        <TbSettings size={22} />
        <Title order={3}>Settings</Title>
      </Group>

      <Stack gap="xs">
        <Text fw={600} size="sm">
          API Token
        </Text>
        <Divider />

        <Group justify="space-between" align="flex-start" py="xs">
          <Stack gap={2}>
            <Text size="sm">Izinkan user membuat token sendiri</Text>
            <Text size="xs" c="dimmed">
              Jika aktif, semua user non-QC dapat membuat token dari halaman Profile. Token hanya bekerja untuk project
              yang user sudah jadi member.
            </Text>
          </Stack>
          <Switch
            checked={local.user_token_creation}
            onChange={(e) => setLocal({ ...local, user_token_creation: e.currentTarget.checked })}
            color="blue"
          />
        </Group>

        <Group justify="space-between" align="flex-start" py="xs">
          <Stack gap={2} style={{ flex: 1 }}>
            <Text size="sm">Maks masa berlaku token user (hari)</Text>
            <Text size="xs" c="dimmed">
              Batas expiry untuk token yang dibuat user biasa. <b>0</b> = tidak dibatasi. SUPER_ADMIN dan user dengan
              capability <code>token:create</code> tidak terikat batas ini.
            </Text>
          </Stack>
          <NumberInput
            value={local.user_token_max_days}
            onChange={(v) => setLocal({ ...local, user_token_max_days: Number(v) || 0 })}
            min={0}
            max={3650}
            w={100}
            size="sm"
            suffix=" hari"
          />
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
