import { createFileRoute, redirect } from '@tanstack/react-router'

const validTabs = ['dashboard', 'tickets', 'analytics', 'orders', 'messages', 'calendar', 'settings'] as const

export const Route = createFileRoute('/dashboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: validTabs.includes(search.tab as any) ? (search.tab as string) : 'dashboard',
  }),
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
        staleTime: 0,
      })
      if (!data?.user) throw redirect({ to: '/login' })
      if (data.user.blocked) throw redirect({ to: '/blocked' })
      if (data.user.role === 'USER') throw redirect({ to: '/profile', search: { tab: 'account' } })
      // Dashboard = QC ticket workflow + SUPER_ADMIN. ADMIN tidak boleh akses —
      // collaboration model: ADMIN landing di /envmanager.
      if (data.user.role === 'ADMIN')
        throw redirect({ to: '/envmanager', search: { create: false, editSlug: undefined } })
      const search = window.location.search
      if (data.user.role === 'QC' && !search.includes('tab=')) {
        throw redirect({ to: '/dashboard', search: { tab: 'tickets' } })
      }
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
})
