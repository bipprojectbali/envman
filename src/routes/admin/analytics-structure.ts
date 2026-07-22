import { Elysia } from 'elysia'
import { forbidden, requireSuperAdmin } from '../../lib/auth-middleware'
import { parseSchema } from '../../lib/schema-parser'

export const analyticsStructureRouter = new Elysia()

  .get('/api/admin/schema', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const fs = await import('node:fs')
    const schemaPath = `${process.cwd()}/prisma/schema.prisma`
    if (!fs.existsSync(schemaPath)) {
      set.status = 404
      return { error: 'Schema not found' }
    }
    const raw = fs.readFileSync(schemaPath, 'utf-8')
    return { schema: parseSchema(raw) }
  })
