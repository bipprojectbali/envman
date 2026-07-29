import { Elysia } from 'elysia'
import { transfersClaimRouter } from './transfers-claim'
import { transfersListRouter } from './transfers-list'
import { transfersSendRouter } from './transfers-send'

// User-to-user transfer (envman send / inbox / recv). Split by verb-cluster:
// send needs canWrite + MASTER_KEY + quota checks, claim needs the CAS + rate
// limiter, list is plain CRUD.
export const transfersRouter = new Elysia().use(transfersSendRouter).use(transfersListRouter).use(transfersClaimRouter)
