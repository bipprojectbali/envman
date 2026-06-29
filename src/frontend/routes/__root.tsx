import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ErrorPage } from '@/frontend/components/ErrorPage'
import { NotFound } from '@/frontend/components/NotFound'
import { useSession } from '@/frontend/hooks/useAuth'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
})

const PUBLIC_ROUTES = ['/', '/login', '/blocked', '/docs']
const PUBLIC_PREFIXES = ['/gists']

function SessionGuard() {
  const { data, isLoading } = useSession()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    if (isLoading) return
    const isPublic = PUBLIC_ROUTES.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
    if (data?.user === null && !isPublic) {
      navigate({ to: '/login' })
    }
  }, [data?.user, isLoading, pathname, navigate])

  return null
}

function RootLayout() {
  return (
    <>
      <SessionGuard />
      <Outlet />
    </>
  )
}
