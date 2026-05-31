import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/envmanager/$slug/')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ['environments', 'members', 'notes', 'aliases', 'files'].includes(search.tab as string)
      ? (search.tab as 'environments' | 'members' | 'notes' | 'aliases' | 'files')
      : 'environments',
    fileId: typeof search.fileId === 'string' ? search.fileId : undefined,
    fileNew: search.fileNew === true || search.fileNew === 'true',
  }),
})
