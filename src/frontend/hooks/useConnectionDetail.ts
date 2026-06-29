import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import type { ContainerInfo, ContainerStats, StackInfo } from '@/frontend/types/portainer'

export function useConnectionDetail(id: string, { activeTab }: { activeTab: string }) {
  const [cleanupEndpointId, setCleanupEndpointId] = useState<number | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['portainer', 'connection-detail', id],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/stacks`),
    refetchInterval: 30000,
  })

  const stacks: StackInfo[] = data?.stacks ?? []
  const connection = data?.connection

  useEffect(() => {
    if (stacks.length > 0 && cleanupEndpointId === null) {
      setCleanupEndpointId(stacks[0].endpointId)
    }
  }, [stacks, cleanupEndpointId])

  const endpointIds = useMemo(() => [...new Set(stacks.map((s) => s.endpointId))].sort(), [stacks])

  const { data: imagesData, isFetching: imagesFetching, refetch: refetchImages } = useQuery({
    queryKey: ['portainer', 'dangling-images', id, cleanupEndpointId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/images/dangling?endpointId=${cleanupEndpointId}`),
    enabled: cleanupEndpointId !== null,
    staleTime: 30000,
  })

  const { data: containersData, isFetching: containersFetching, refetch: refetchContainers } = useQuery({
    queryKey: ['portainer', 'stopped-containers', id, cleanupEndpointId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/containers/stopped?endpointId=${cleanupEndpointId}`),
    enabled: cleanupEndpointId !== null,
    staleTime: 30000,
  })

  const { data: volumesData, isFetching: volumesFetching, refetch: refetchVolumes } = useQuery({
    queryKey: ['portainer', 'unused-volumes', id, cleanupEndpointId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/volumes/unused?endpointId=${cleanupEndpointId}`),
    enabled: cleanupEndpointId !== null,
    staleTime: 30000,
  })

  const { data: networksData, isFetching: networksFetching, refetch: refetchNetworks } = useQuery({
    queryKey: ['portainer', 'unused-networks', id, cleanupEndpointId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/networks/unused?endpointId=${cleanupEndpointId}`),
    enabled: cleanupEndpointId !== null,
    staleTime: 30000,
  })

  const stackStatusQueries = useQueries({
    queries: stacks.map((stack) => ({
      queryKey: ['portainer', 'stack-status', id, stack.id],
      queryFn: () => apiFetch(`/api/envman/portainer/connections/${id}/stacks/${stack.id}/status`),
      enabled: stacks.length > 0,
      refetchInterval: 30000,
      staleTime: 20000,
    })),
  })

  const stackStatusMap = useMemo(
    () =>
      Object.fromEntries(
        stacks.map((stack, i) => [
          stack.id,
          {
            containers: (stackStatusQueries[i]?.data?.containers ?? []) as ContainerInfo[],
            isFetching: stackStatusQueries[i]?.isFetching ?? false,
          },
        ]),
      ),
    [stacks, stackStatusQueries],
  )

  const allContainersFlat = useMemo(
    () =>
      stacks.flatMap((stack) =>
        (stackStatusMap[stack.id]?.containers ?? []).map((c) => ({ stackId: stack.id, containerId: c.id })),
      ),
    [stacks, stackStatusMap],
  )

  const containerStatsQueries = useQueries({
    queries: allContainersFlat.map(({ stackId, containerId }) => ({
      queryKey: ['portainer', 'container-stats', id, stackId, containerId],
      queryFn: () =>
        apiFetch(`/api/envman/portainer/connections/${id}/stacks/${stackId}/containers/${containerId}/stats`),
      enabled: activeTab === 'stacks' && allContainersFlat.length > 0,
      refetchInterval: 10000,
      staleTime: 8000,
      retry: false,
    })),
  })

  const containerStatsMap = useMemo(
    () =>
      Object.fromEntries(
        allContainersFlat.map(({ containerId }, i) => [
          containerId,
          containerStatsQueries[i]?.data as ContainerStats | undefined,
        ]),
      ),
    [allContainersFlat, containerStatsQueries],
  )

  return {
    data, isLoading, refetch, isFetching,
    stacks, connection, endpointIds,
    stackStatusMap, containerStatsMap,
    cleanupEndpointId, setCleanupEndpointId,
    imagesData, imagesFetching, refetchImages,
    containersData, containersFetching, refetchContainers,
    volumesData, volumesFetching, refetchVolumes,
    networksData, networksFetching, refetchNetworks,
  }
}
