import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { errText, jsonText, type ToolModule } from './shared'

const notDeleted = { deletedAt: null }

type ResolveOk = { ok: true; project: { id: string }; env: { id: string } }
type ResolveErr = { ok: false; error: string }

async function resolveProjectEnv(slug: string, envName: string): Promise<ResolveOk | ResolveErr> {
  const project = await prisma.project.findFirst({ where: { slug, ...notDeleted } })
  if (!project) return { ok: false, error: 'Project not found' }
  const env = await prisma.environment.findUnique({
    where: { projectId_name: { projectId: project.id, name: envName } },
  })
  if (!env) return { ok: false, error: 'Environment not found' }
  return { ok: true, project, env }
}

export const envImportReadonlyTools: ToolModule = {
  name: 'env-imports-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'envimport_list',
      {
        title: 'List env import links',
        description:
          'List live-link imports for a target environment (the source envs whose vars it borrows). Read-only.',
        inputSchema: {
          slug: z.string().describe('Target project slug'),
          envName: z.string().describe('Target environment name'),
        },
      },
      async ({ slug, envName }) => {
        const r = await resolveProjectEnv(slug, envName)
        if (!r.ok) return jsonText({ error: r.error })
        const imports = await prisma.envImport.findMany({
          where: { targetEnvId: r.env.id },
          orderBy: { order: 'asc' },
          include: { sourceEnv: { select: { name: true, project: { select: { slug: true, name: true } } } } },
        })
        return jsonText({
          slug,
          envName,
          count: imports.length,
          imports: imports.map((i) => ({
            id: i.id,
            order: i.order,
            sourceProject: i.sourceEnv.project.slug,
            sourceProjectName: i.sourceEnv.project.name,
            sourceEnv: i.sourceEnv.name,
            createdAt: i.createdAt,
          })),
        })
      },
    )

    server.registerTool(
      'envimport_get',
      {
        title: 'Get one env import link',
        description: 'Fetch a single env import link by id, including source env keys (values masked).',
        inputSchema: {
          id: z.string().describe('EnvImport id'),
        },
      },
      async ({ id }) => {
        const link = await prisma.envImport.findUnique({
          where: { id },
          include: {
            sourceEnv: {
              select: {
                name: true,
                project: { select: { slug: true, name: true } },
                vars: { select: { key: true, isSecret: true, isDisabled: true }, orderBy: { key: 'asc' } },
              },
            },
            targetEnv: { select: { name: true, project: { select: { slug: true } } } },
          },
        })
        if (!link) return jsonText({ link: null })
        return jsonText({
          link: {
            id: link.id,
            order: link.order,
            createdAt: link.createdAt,
            target: { project: link.targetEnv.project.slug, env: link.targetEnv.name },
            source: { project: link.sourceEnv.project.slug, env: link.sourceEnv.name },
            sourceKeys: link.sourceEnv.vars.map((v) => ({ key: v.key, isSecret: v.isSecret, isDisabled: v.isDisabled })),
          },
        })
      },
    )
  },
}

export const envImportAdminTools: ToolModule = {
  name: 'env-imports-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'envimport_create',
      {
        title: 'Create env import link (admin)',
        description:
          'Create a live-link import: target env borrows vars from source env. Dev DB only. Rejects self-import and duplicates.',
        inputSchema: {
          slug: z.string().describe('Target project slug'),
          envName: z.string().describe('Target environment name'),
          sourceProject: z.string().describe('Source project slug'),
          sourceEnv: z.string().describe('Source environment name'),
          createdByEmail: z.string().email().describe('Email of the user creating the link'),
        },
      },
      async ({ slug, envName, sourceProject, sourceEnv, createdByEmail }) => {
        const target = await resolveProjectEnv(slug, envName)
        if (!target.ok) return errText(`Target: ${target.error}`)
        const source = await resolveProjectEnv(sourceProject, sourceEnv)
        if (!source.ok) return errText(`Source: ${source.error}`)
        if (target.env.id === source.env.id) return errText('Tidak bisa import dari env yang sama (self-import)')
        const user = await prisma.user.findUnique({ where: { email: createdByEmail } })
        if (!user) return errText('User not found')
        const existing = await prisma.envImport.findUnique({
          where: { targetEnvId_sourceEnvId: { targetEnvId: target.env.id, sourceEnvId: source.env.id } },
        })
        if (existing) return errText('Import dari source ini sudah ada')
        const max = await prisma.envImport.aggregate({
          where: { targetEnvId: target.env.id },
          _max: { order: true },
        })
        const created = await prisma.envImport.create({
          data: {
            targetEnvId: target.env.id,
            sourceEnvId: source.env.id,
            order: (max._max.order ?? -1) + 1,
            createdById: user.id,
          },
        })
        return jsonText({ ok: true, id: created.id, order: created.order })
      },
    )

    server.registerTool(
      'envimport_delete',
      {
        title: 'Delete env import link (admin)',
        description: 'Delete a live-link import by id from dev DB.',
        inputSchema: {
          id: z.string().describe('EnvImport id to delete'),
        },
      },
      async ({ id }) => {
        const link = await prisma.envImport.findUnique({ where: { id } })
        if (!link) return errText('Import not found')
        await prisma.envImport.delete({ where: { id } })
        return jsonText({ ok: true })
      },
    )
  },
}
