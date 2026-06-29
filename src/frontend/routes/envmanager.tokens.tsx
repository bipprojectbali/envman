import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/envmanager/tokens')({
  component: () => null,
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === 'string' ? s.token : undefined,
    edit: s.edit === true || s.edit === 'true' ? true : undefined,
  }),
})
