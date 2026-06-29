import { Alert, Badge, Box, Button, Code, Group, Select, Stack, Text } from '@mantine/core'
import { TbCheck, TbX } from 'react-icons/tb'

interface PortainerStack {
  id: number
  name: string
  endpointId: number
}

interface PortainerConnection {
  id: string
  name: string
  portainerUrl: string
}

interface Props {
  stacks: PortainerStack[]
  selectedStack: PortainerStack | null
  onSelectStack: (stack: PortainerStack | null) => void
  additionalSelectedStacks: PortainerStack[]
  onAdditionalStacksChange: (stacks: PortainerStack[]) => void
  selectedConnectionId: string | null
  connections: PortainerConnection[]
  saveConfig: { isPending: boolean; mutate: () => void }
  onBack: () => void
  mode: 'new' | 'edit'
  slug: string
  env: string
}

export function PortainerStackStep({
  stacks,
  selectedStack,
  onSelectStack,
  additionalSelectedStacks,
  onAdditionalStacksChange,
  selectedConnectionId,
  connections,
  saveConfig,
  onBack,
  mode,
  slug: _slug,
  env: _env,
}: Props) {
  return (
    <Stack gap="sm">
      <Alert color="teal" p="xs" icon={<TbCheck size={14} />}>
        <Text size="xs" fw={500}>
          {connections.find((c) => c.id === selectedConnectionId)?.name} — {stacks.length} stack ditemukan
        </Text>
      </Alert>
      <Select
        label="Stack target"
        placeholder="Pilih stack..."
        data={stacks.map((s) => ({ value: String(s.id), label: s.name, description: `Endpoint ${s.endpointId}` }))}
        value={selectedStack ? String(selectedStack.id) : null}
        onChange={(v) => onSelectStack(stacks.find((s) => String(s.id) === v) ?? null)}
        searchable
        nothingFoundMessage="Stack tidak ditemukan"
      />
      {selectedStack && (
        <Box
          p="sm"
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <Text size="xs" c="dimmed" mb={6}>
            Ringkasan
          </Text>
          <Stack gap={4}>
            {(
              [
                ['Connection', connections.find((c) => c.id === selectedConnectionId)?.name ?? '—'],
                ['Stack (primary)', selectedStack.name],
                ['Endpoint', `#${selectedStack.endpointId}`],
              ] as [string, string][]
            ).map(([label, value]) => (
              <Group key={label} justify="space-between">
                <Text size="xs" c="dimmed">
                  {label}
                </Text>
                <Code fz="xs">{value}</Code>
              </Group>
            ))}
          </Stack>
        </Box>
      )}
      {stacks.length > 1 && selectedStack && (
        <Box>
          <Text size="xs" c="dimmed" mb={6}>
            Stack tambahan (opsional)
          </Text>
          <Select
            placeholder="Tambah stack lain..."
            data={stacks
              .filter((s) => s.id !== selectedStack.id && !additionalSelectedStacks.find((a) => a.id === s.id))
              .map((s) => ({ value: String(s.id), label: s.name }))}
            value={null}
            onChange={(v) => {
              const s = stacks.find((st) => String(st.id) === v)
              if (s) onAdditionalStacksChange([...additionalSelectedStacks, s])
            }}
            searchable
            nothingFoundMessage="Tidak ada stack lain"
            size="xs"
          />
          {additionalSelectedStacks.length > 0 && (
            <Stack gap={4} mt="xs">
              {additionalSelectedStacks.map((s) => (
                <Group
                  key={s.id}
                  justify="space-between"
                  p="xs"
                  style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 6 }}
                >
                  <Group gap="xs">
                    <Badge size="xs" variant="outline" color="gray">
                      ep#{s.endpointId}
                    </Badge>
                    <Text size="xs" ff="monospace">
                      {s.name}
                    </Text>
                  </Group>
                  <TbX
                    size={12}
                    style={{ cursor: 'pointer', color: 'var(--mantine-color-red-5)' }}
                    onClick={() => onAdditionalStacksChange(additionalSelectedStacks.filter((a) => a.id !== s.id))}
                  />
                </Group>
              ))}
            </Stack>
          )}
        </Box>
      )}
      <Group justify="space-between" mt="xs">
        <Button variant="subtle" size="sm" color="gray" onClick={onBack}>
          ← Kembali
        </Button>
        <Button
          size="sm"
          color="primary"
          disabled={!selectedStack}
          loading={saveConfig.isPending}
          leftSection={<TbCheck size={14} />}
          onClick={() => saveConfig.mutate()}
        >
          {mode === 'edit' ? 'Update' : 'Simpan & Hubungkan'}
        </Button>
      </Group>
    </Stack>
  )
}
