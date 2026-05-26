import { createFileRoute } from '@tanstack/react-router'

const truthy = (v: unknown) => v === true || v === 'true' || v === '1'

export const Route = createFileRoute('/envmanager/gists')({
  component: () => null,
  validateSearch: (search: Record<string, unknown>) => ({
    gist: typeof search.gist === 'string' ? search.gist : undefined,
    edit: truthy(search.edit) ? (true as const) : undefined,
  }),
})
