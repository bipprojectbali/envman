import { ColorSchemeScript, createTheme, MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { ModalsProvider } from '@mantine/modals'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { UnauthorizedError } from '@/frontend/lib/api'
import { routeTree } from './routeTree.gen'

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
})

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof UnauthorizedError) {
        queryClient.setQueryData(['auth', 'session'], { user: null })
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof UnauthorizedError) && count < 1,
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 30_000,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function App() {
  return (
    <>
      <ColorSchemeScript defaultColorScheme="auto" />
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <Notifications position="top-right" zIndex={1000} />
        <ModalsProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>
    </>
  )
}
