import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/frontend/lib/api'

export interface ExtensionsConfig {
  portainer: boolean
}

const QUERY_KEY = ['extensions']

export function useExtensions() {
  return useQuery<ExtensionsConfig>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch('/api/envman/extensions'),
    staleTime: 5 * 60_000,
  })
}

export function useUpdateExtensions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ExtensionsConfig>) =>
      apiFetch('/api/admin/extensions', { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: (updated) => {
      qc.setQueryData(QUERY_KEY, updated)
    },
  })
}
