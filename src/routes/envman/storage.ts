import { Elysia } from 'elysia'
import { storageCoreRouter } from './storage-core'
import { storageUploadRouter } from './storage-upload'

export const storageRouter = new Elysia()
  .use(storageCoreRouter)
  .use(storageUploadRouter)
