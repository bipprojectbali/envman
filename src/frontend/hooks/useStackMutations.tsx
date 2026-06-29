import { Alert, Code, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TbAlertTriangle } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { StackInfo } from '@/frontend/types/portainer'

interface Params {
  id: string
  composeStack: StackInfo | null
  composeContent: string
  setComposeEditing: (v: boolean) => void
}

export function useStackMutations({ id, composeStack, composeContent, setComposeEditing }: Params) {
  const qc = useQueryClient()

  const saveCompose = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/portainer/connections/${id}/stacks/${composeStack!.id}/file`, {
        method: 'PUT',
        body: JSON.stringify({ content: composeContent }),
      }),
    onSuccess: () => {
      notifyOk('Compose file berhasil disimpan')
      setComposeEditing(false)
      qc.invalidateQueries({ queryKey: ['portainer', 'compose-file', id, composeStack?.id] })
    },
    onError: (e) => notifyErr(e),
  })

  const confirmSaveCompose = () =>
    modals.openConfirmModal({
      title: 'Simpan Compose File',
      children: (
        <Stack gap="xs">
          <Text size="sm">Simpan perubahan ke stack <strong>{composeStack?.name}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">
              Perubahan langsung diterapkan ke Portainer. Container mungkin tidak otomatis restart — gunakan Recreate
              jika diperlukan.
            </Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Simpan', cancel: 'Batal' },
      confirmProps: { color: 'blue' },
      onConfirm: () => saveCompose.mutate(),
    })

  const restartContainer = useMutation({
    mutationFn: ({ stackId, containerId }: { stackId: number; containerId: string }) =>
      apiFetch(`/api/envman/portainer/connections/${id}/stacks/${stackId}/containers/${containerId}/restart`, {
        method: 'POST',
      }),
    onSuccess: (_, { stackId }) => {
      notifyOk('Container berhasil di-restart')
      qc.invalidateQueries({ queryKey: ['portainer', 'stack-status', id, stackId] })
    },
    onError: (e) => notifyErr(e),
  })

  const confirmRestartContainer = (stack: StackInfo, containerId: string, containerName: string) =>
    modals.openConfirmModal({
      title: 'Restart Container',
      children: (
        <Stack gap="xs">
          <Text size="sm">Restart container <strong>{containerName}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">
              Container akan stop sebentar lalu start kembali. Request yang sedang berjalan akan terputus.
            </Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Restart', cancel: 'Batal' },
      confirmProps: { color: 'orange' },
      onConfirm: () => restartContainer.mutate({ stackId: stack.id, containerId }),
    })

  const repull = useMutation({
    mutationFn: (stackId: number) =>
      apiFetch(`/api/envman/portainer/connections/${id}/stacks/${stackId}/repull`, { method: 'POST' }),
    onSuccess: (_, stackId) => {
      notifyOk('Repull berhasil — container restart dengan image terbaru')
      qc.invalidateQueries({ queryKey: ['portainer', 'stack-status', id, stackId] })
    },
    onError: (e) => notifyErr(e),
  })

  const confirmRepull = (stack: StackInfo) =>
    modals.openConfirmModal({
      title: `Repull — ${stack.name}`,
      children: (
        <Stack gap="xs">
          <Text size="sm">Pull image terbaru untuk stack <strong>{stack.name}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">
              Setara <Code fz="xs">docker compose pull && docker compose up -d</Code>. Container akan restart.
            </Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Repull & Restart', cancel: 'Batal' },
      confirmProps: { color: 'blue' },
      onConfirm: () => repull.mutate(stack.id),
    })

  const recreate = useMutation({
    mutationFn: (stackId: number) =>
      apiFetch(`/api/envman/portainer/connections/${id}/stacks/${stackId}/recreate`, { method: 'POST' }),
    onSuccess: () => notifyOk('Force recreate berhasil'),
    onError: (e) => notifyErr(e),
  })

  const confirmRecreate = (stack: StackInfo) =>
    modals.openConfirmModal({
      title: `Force Recreate — ${stack.name}`,
      children: (
        <Stack gap="xs">
          <Text size="sm">Stop dan start ulang container di stack <strong>{stack.name}</strong>?</Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">
              Image tidak di-pull ulang. Setara <Code fz="xs">docker compose stop && up -d</Code>.
            </Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Recreate', cancel: 'Batal' },
      confirmProps: { color: 'orange' },
      onConfirm: () => recreate.mutate(stack.id),
    })

  return { saveCompose, confirmSaveCompose, restartContainer, confirmRestartContainer, repull, confirmRepull, recreate, confirmRecreate }
}
