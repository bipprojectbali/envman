import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Select,
  Stack,
  Stepper,
  Text,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbAlertTriangle, TbCheck, TbChevronLeft, TbPlus, TbPlugConnected, TbX } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'

interface PortainerConnection {
  id: string
  name: string
  portainerUrl: string
}

interface Stack {
  id: number
  name: string
  endpointId: number
}

interface Props {
  slug: string
  env: string
  mode: 'new' | 'edit'
  onClose: () => void
}

export function PortainerSetupInline({ slug, env, mode, onClose }: Props) {
  const qc = useQueryClient()

  // Pre-populate dari cache jika edit mode
  const { data: portainerData } = useQuery({
    queryKey: ['portainer', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`),
    staleTime: 30_000,
  })
  const existingConfig = portainerData?.config ?? null

  const { data: connectionsData } = useQuery({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
  })
  const connections: PortainerConnection[] = connectionsData?.connections ?? []

  const [step, setStep] = useState(0)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    mode === 'edit' ? (existingConfig?.connectionId ?? null) : null,
  )
  const [stacks, setStacks] = useState<Stack[]>(
    mode === 'edit' && existingConfig
      ? [{ id: existingConfig.stackId, name: existingConfig.stackName, endpointId: existingConfig.endpointId }]
      : [],
  )
  const [selectedStack, setSelectedStack] = useState<Stack | null>(
    mode === 'edit' && existingConfig
      ? { id: existingConfig.stackId, name: existingConfig.stackName, endpointId: existingConfig.endpointId }
      : null,
  )
  const [additionalSelectedStacks, setAdditionalSelectedStacks] = useState<Stack[]>([])
  const [probeError, setProbeError] = useState<string | null>(null)

  const probe = useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch(`/api/envman/portainer/connections/${connectionId}/probe`, { method: 'POST' }),
    onSuccess: (data) => {
      setStacks(data.stacks)
      setProbeError(null)
      setStep(1)
    },
    onError: (e: Error) => {
      setStacks([])
      setProbeError(e.message)
    },
  })

  const saveConfig = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, {
        method: 'PUT',
        body: JSON.stringify({
          connectionId: selectedConnectionId,
          stackId: selectedStack!.id,
          stackName: selectedStack!.name,
          endpointId: selectedStack!.endpointId,
        }),
      })
      for (const t of additionalSelectedStacks) {
        await apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`, {
          method: 'PATCH',
          body: JSON.stringify({
            addTarget: {
              connectionId: selectedConnectionId,
              stackId: t.id,
              stackName: t.name,
              endpointId: t.endpointId,
            },
          }),
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portainer', slug, env] })
      onClose()
    },
  })

  return (
    <Stack gap="sm">
      <Group gap={6} align="center">
        <TbChevronLeft
          size={15}
          style={{ cursor: 'pointer', color: 'var(--mantine-color-dimmed)' }}
          onClick={onClose}
        />
        <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={onClose}>
          Integrasi
        </Text>
        <Text size="sm" c="dimmed">/</Text>
        <Text size="sm" fw={600}>
          {mode === 'edit' ? 'Edit Konfigurasi Portainer' : 'Hubungkan ke Portainer'}
        </Text>
      </Group>
      <Divider />

      <Stepper active={step} size="xs" mb="xs" onStepClick={(s) => { if (s < step) setStep(s) }}>
        <Stepper.Step label="Connection" />
        <Stepper.Step label="Stack" />
      </Stepper>

      {step === 0 && (
        <Stack gap="sm">
          {connections.length === 0 ? (
            <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
              <Text size="xs">
                Belum ada Portainer connection.{' '}
                <Anchor size="xs" href="/envmanager/connections">Tambah connection</Anchor>{' '}
                terlebih dahulu.
              </Text>
            </Alert>
          ) : (
            <>
              <Text size="xs" c="dimmed">
                Pilih Portainer instance untuk environment <strong>{slug}:{env}</strong>.
              </Text>
              <Select
                label="Portainer Connection"
                placeholder="Pilih connection..."
                data={connections.map((c) => ({
                  value: c.id,
                  label: c.name,
                  description: c.portainerUrl.replace(/^https?:\/\//, ''),
                }))}
                value={selectedConnectionId}
                onChange={setSelectedConnectionId}
                searchable
              />
              {probeError && (
                <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
                  <Text size="xs">{probeError}</Text>
                </Alert>
              )}
            </>
          )}
          <Group justify="space-between" mt="xs">
            <Button size="sm" variant="subtle" color="gray" component="a" href="/envmanager/connections" leftSection={<TbPlus size={13} />}>
              Kelola Connections
            </Button>
            <Group gap="xs">
              <Button variant="subtle" size="sm" color="gray" onClick={onClose}>Batal</Button>
              <Button
                size="sm"
                disabled={!selectedConnectionId || connections.length === 0}
                loading={probe.isPending}
                leftSection={<TbPlugConnected size={14} />}
                onClick={() => selectedConnectionId && probe.mutate(selectedConnectionId)}
              >
                Load Stacks
              </Button>
            </Group>
          </Group>
        </Stack>
      )}

      {step === 1 && (
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
            onChange={(v) => setSelectedStack(stacks.find((s) => String(s.id) === v) ?? null)}
            searchable
            nothingFoundMessage="Stack tidak ditemukan"
          />
          {selectedStack && (
            <Box p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
              <Text size="xs" c="dimmed" mb={6}>Ringkasan</Text>
              <Stack gap={4}>
                {([
                  ['Connection', connections.find((c) => c.id === selectedConnectionId)?.name ?? '—'],
                  ['Project:Env', `${slug}:${env}`],
                  ['Stack (primary)', selectedStack.name],
                  ['Endpoint', `#${selectedStack.endpointId}`],
                ] as [string, string][]).map(([label, value]) => (
                  <Group key={label} justify="space-between">
                    <Text size="xs" c="dimmed">{label}</Text>
                    <Code fz="xs">{value}</Code>
                  </Group>
                ))}
              </Stack>
            </Box>
          )}
          {stacks.length > 1 && selectedStack && (
            <Box>
              <Text size="xs" c="dimmed" mb={6}>Stack tambahan (opsional)</Text>
              <Select
                placeholder="Tambah stack lain..."
                data={stacks
                  .filter((s) => s.id !== selectedStack.id && !additionalSelectedStacks.find((a) => a.id === s.id))
                  .map((s) => ({ value: String(s.id), label: s.name }))}
                value={null}
                onChange={(v) => {
                  const s = stacks.find((st) => String(st.id) === v)
                  if (s) setAdditionalSelectedStacks((prev) => [...prev, s])
                }}
                searchable
                nothingFoundMessage="Tidak ada stack lain"
                size="xs"
              />
              {additionalSelectedStacks.length > 0 && (
                <Stack gap={4} mt="xs">
                  {additionalSelectedStacks.map((s) => (
                    <Group key={s.id} justify="space-between" p="xs"
                      style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 6 }}>
                      <Group gap="xs">
                        <Badge size="xs" variant="outline" color="gray">ep#{s.endpointId}</Badge>
                        <Text size="xs" ff="monospace">{s.name}</Text>
                      </Group>
                      <TbX
                        size={12}
                        style={{ cursor: 'pointer', color: 'var(--mantine-color-red-5)' }}
                        onClick={() => setAdditionalSelectedStacks((prev) => prev.filter((a) => a.id !== s.id))}
                      />
                    </Group>
                  ))}
                </Stack>
              )}
            </Box>
          )}
          <Group justify="space-between" mt="xs">
            <Button variant="subtle" size="sm" color="gray" onClick={() => setStep(0)}>← Kembali</Button>
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
      )}
    </Stack>
  )
}
