import { Elysia } from 'elysia'
import { storageCoreRouter } from './storage-core'
import { storageFolderRouter } from './storage-folder'
import { storageMultipartRouter } from './storage-multipart'
import { storageMoveRouter } from './storage-move'
import { storagePresignRouter } from './storage-presign'
import { storageRenameRouter } from './storage-rename'
import { storageUploadRouter } from './storage-upload'

export const storageRouter = new Elysia()
  .use(storageCoreRouter)
  .use(storageUploadRouter)
  .use(storagePresignRouter)
  .use(storageMultipartRouter)
  .use(storageRenameRouter)
  .use(storageMoveRouter)
  .use(storageFolderRouter)
