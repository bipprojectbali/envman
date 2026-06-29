import { createFileRoute, redirect } from '@tanstack/react-router'

const validTabs = [
  'overview',
  'users',
  'tickets',
  'app-logs',
  'user-logs',
  'database',
  'project',
  'file-health',
  'tokens-admin',
  'extensions',
  'settings',
] as const

export const Route = createFileRoute('/dev')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: validTabs.includes(search.tab as any) ? (search.tab as string) : 'overview',
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
      if (data.user.role !== 'SUPER_ADMIN') throw redirect({ to: '/profile', search: { tab: 'account' } })
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
})
