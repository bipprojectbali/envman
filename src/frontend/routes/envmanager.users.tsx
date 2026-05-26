import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/envmanager/users')({
  validateSearch: (search: Record<string, unknown>) => ({
    user: typeof search.user === 'string' ? search.user : undefined,
  }),
  component: () => null,
})
