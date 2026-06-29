import { Alert, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation } from '@tanstack/react-query'
import { TbAlertTriangle } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

interface Params {
  id: string
  cleanupEndpointId: number | null
  imagesData: any
  refetchImages: () => void
  refetchContainers: () => void
  refetchVolumes: () => void
  refetchNetworks: () => void
}

export function useCleanupMutations({ id, cleanupEndpointId, imagesData, refetchImages, refetchContainers, refetchVolumes, refetchNetworks }: Params) {
  const pruneImages = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/portainer/connections/${id}/prune/images?endpointId=${cleanupEndpointId}`, { method: 'POST' }),
    onSuccess: (d: any) => {
      if (d.remaining > 0 && d.stuckByContainers > 0) {
        notifyOk(`${d.deletedCount} image dihapus — ${d.reclaimedMB} MB dibebaskan. ${d.stuckByContainers} image tidak bisa dihapus karena masih direferensi container (termasuk yang stopped).`)
      } else if (d.remaining > 0) {
        notifyOk(`${d.deletedCount} image dihapus — ${d.reclaimedMB} MB dibebaskan. ${d.remaining} image tersisa.`)
      } else {
        notifyOk(`${d.deletedCount} image dihapus — ${d.reclaimedMB} MB dibebaskan`)
      }
      refetchImages()
    },
    onError: (e) => notifyErr(e),
  })

  const confirmPruneImages = () =>
    modals.openConfirmModal({
      title: 'Hapus Dangling Images',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Hapus <strong>{imagesData?.count ?? 0} dangling image</strong> (~{imagesData?.totalSizeMB ?? 0} MB)?
          </Text>
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
            <Text size="xs">Hanya image yang tidak dipakai container manapun. Tidak bisa dibatalkan.</Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => pruneImages.mutate(),
    })

  const pruneContainers = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/portainer/connections/${id}/prune/containers?endpointId=${cleanupEndpointId}`, { method: 'POST' }),
    onSuccess: (d: any) => {
      notifyOk(`${d.deletedContainers?.length ?? 0} container dihapus — ${d.reclaimedMB} MB dibebaskan`)
      refetchContainers()
      refetchImages()
    },
    onError: (e) => notifyErr(e),
  })

  const pruneVolumes = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/portainer/connections/${id}/prune/volumes?endpointId=${cleanupEndpointId}`, { method: 'POST' }),
    onSuccess: (d: any) => {
      notifyOk(`${d.deletedVolumes?.length ?? 0} volume dihapus — ${d.reclaimedMB} MB dibebaskan`)
      refetchVolumes()
    },
    onError: (e) => notifyErr(e),
  })

  const pruneNetworks = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/portainer/connections/${id}/prune/networks?endpointId=${cleanupEndpointId}`, { method: 'POST' }),
    onSuccess: (d: any) => {
      notifyOk(`${d.deletedNetworks?.length ?? 0} network dihapus`)
      refetchNetworks()
    },
    onError: (e) => notifyErr(e),
  })

  return { pruneImages, confirmPruneImages, pruneContainers, pruneVolumes, pruneNetworks }
}
