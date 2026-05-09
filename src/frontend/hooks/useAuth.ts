import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { apiFetch } from '@/frontend/lib/api'

export type Role = 'USER' | 'QC' | 'ADMIN' | 'SUPER_ADMIN'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  blocked: boolean
}

export function getDefaultRoute(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/dev'
    case 'ADMIN':
      return '/dashboard'
    case 'QC':
      return '/dashboard'
    default:
      return '/profile'
  }
}

export function useSession() {
  return useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () => apiFetch<{ user: User | null }>('/api/auth/session'),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiFetch<{ user: User }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'session'], data)
      navigate({ to: getDefaultRoute(data.user.role) })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'session'], { user: null })
      navigate({ to: '/login' })
    },
  })
}
