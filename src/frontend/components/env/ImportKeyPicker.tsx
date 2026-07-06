import { Anchor, Checkbox, Group, Loader, ScrollArea, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/frontend/lib/api'

interface KeyPickerProps {
  slug: string
  env: string
  selected: string[]
  onChange: (keys: string[]) => void
  enabled?: boolean
}

// Pemilih key untuk whitelist import: fetch daftar key dari env source (reuse GET vars),
// tampilkan checkbox + aksi pilih semua/kosongkan. Kosong = semua key ikut (hint di caller).
export function ImportKeyPicker({ slug, env, selected, onChange, enabled = true }: KeyPickerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'vars-keys', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars?limit=200`),
    enabled: enabled && !!slug && !!env,
  })

  const keys: string[] = (data?.vars ?? []).map((v: { key: string }) => v.key)

  if (isLoading) {
    return (
      <Group justify="center" py="sm">
        <Loader size="sm" />
      </Group>
    )
  }
  if (keys.length === 0) {
    return (
      <Text fz="xs" c="dimmed" fs="italic">
        Env source tidak punya var.
      </Text>
    )
  }

  const allSelected = selected.length > 0 && selected.length === keys.length

  return (
    <Stack gap={6}>
      <Group justify="space-between" gap="xs">
        <Text fz="xs" c="dimmed" fw={600}>
          Pilih key ({selected.length > 0 ? `${selected.length}/${keys.length}` : `semua ${keys.length}`})
        </Text>
        <Group gap="xs">
          <Anchor fz="xs" onClick={() => onChange(keys)} c={allSelected ? 'dimmed' : undefined}>
            Pilih semua
          </Anchor>
          <Anchor fz="xs" onClick={() => onChange([])} c={selected.length === 0 ? 'dimmed' : undefined}>
            Kosongkan
          </Anchor>
        </Group>
      </Group>
      <ScrollArea.Autosize mah={200}>
        <Stack gap={4}>
          {keys.map((k) => (
            <Checkbox
              key={k}
              size="xs"
              label={k}
              checked={selected.includes(k)}
              onChange={(e) =>
                onChange(e.currentTarget.checked ? [...selected, k] : selected.filter((x) => x !== k))
              }
            />
          ))}
        </Stack>
      </ScrollArea.Autosize>
      <Text fz={10} c="dimmed" fs="italic">
        Tidak memilih apa pun = semua key ikut. Key baru di source tidak ikut otomatis.
      </Text>
    </Stack>
  )
}
