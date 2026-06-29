import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/envmanager/$slug/')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ['environments', 'members', 'notes', 'aliases', 'files'].includes(search.tab as string)
      ? (search.tab as 'environments' | 'members' | 'notes' | 'aliases' | 'files')
      : 'environments',
    fileId: typeof search.fileId === 'string' ? search.fileId : undefined,
    fileNew: search.fileNew === true || search.fileNew === 'true',
    viewFileId: typeof search.viewFileId === 'string' ? search.viewFileId : undefined,
    aliasId: typeof search.aliasId === 'string' ? search.aliasId : undefined,
    aliasNew: search.aliasNew === true || search.aliasNew === 'true',
    viewAliasId: typeof search.viewAliasId === 'string' ? search.viewAliasId : undefined,
    noteId: typeof search.noteId === 'string' ? search.noteId : undefined,
    noteNew: search.noteNew === true || search.noteNew === 'true',
    viewNoteId: typeof search.viewNoteId === 'string' ? search.viewNoteId : undefined,
  }),
})
