import { Elysia } from 'elysia'
import { storageCoreRouter } from './storage-core'
import { storageRenameRouter } from './storage-rename'
import { storageUploadRouter } from './storage-upload'

export const storageRouter = new Elysia()
  .use(storageCoreRouter)
  .use(storageUploadRouter)
  .use(storageRenameRouter)
