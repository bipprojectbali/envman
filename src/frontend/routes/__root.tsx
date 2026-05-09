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

const PUBLIC_ROUTES = ['/', '/login', '/blocked']

function SessionGuard() {
  const { data, isLoading } = useSession()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    if (isLoading) return
    if (data?.user === null && !PUBLIC_ROUTES.includes(pathname)) {
      navigate({ to: '/login' })
    }
  }, [data?.user, isLoading, pathname])

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
