import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { jsonText, errText, type ToolModule } from './shared'

const notDeleted = { deletedAt: null }

const aliasSelect = {
  id: true,
  name: true,
  args: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: { id: true, name: true, email: true } },
} as const

export const aliasReadonlyTools: ToolModule = {
  name: 'aliases-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'alias_list',
      {
        title: 'List project aliases',
        description: 'List all aliases for a project by slug',
        inputSchema: {
          slug: z.string().describe('Project slug'),
        },
      },
      async ({ slug }) => {
        const project = await prisma.project.findFirst({ where: { slug, ...notDeleted } })
        if (!project) return jsonText({ error: 'Project not found' })
        const aliases = await prisma.projectAlias.findMany({
          where: { projectId: project.id },
          orderBy: { name: 'asc' },
          select: aliasSelect,
        })
        return jsonText({ count: aliases.length, aliases })
      },
    )

    server.registerTool(
      'alias_get',
      {
        title: 'Get project alias',
        description: 'Fetch a single alias by project slug and alias name',
        inputSchema: {
          slug: z.string().describe('Project slug'),
          name: z.string().describe('Alias name'),
        },
      },
      async ({ slug, name }) => {
        const project = await prisma.project.findFirst({ where: { slug, ...notDeleted } })
        if (!project) return jsonText({ error: 'Project not found' })
        const alias = await prisma.projectAlias.findUnique({
          where: { projectId_name: { projectId: project.id, name } },
          select: aliasSelect,
        })
        if (!alias) return jsonText({ alias: null })
        return jsonText({ alias })
      },
    )
  },
}

export const aliasAdminTools: ToolModule = {
  name: 'aliases-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'alias_create',
      {
        title: 'Create project alias (admin)',
        description: 'Create a project alias directly in dev DB. Use for seeding test data.',
        inputSchema: {
          slug: z.string().describe('Project slug'),
          name: z.string().describe('Alias name (lowercase, letters/digits/hyphens)'),
          args: z.string().min(1).describe('Stored args, e.g. "-e proj:env -- docker compose up"'),
          creatorEmail: z.string().email().describe('Email of the creator user'),
          description: z.string().optional().describe('Optional description'),
          tags: z.array(z.string()).optional().describe('Optional tags'),
        },
      },
      async ({ slug, name, args, creatorEmail, description, tags }) => {
        const project = await prisma.project.findFirst({ where: { slug, ...notDeleted } })
        if (!project) return errText('Project not found')
        const user = await prisma.user.findUnique({ where: { email: creatorEmail } })
        if (!user) return errText('User not found')
        const alias = await prisma.projectAlias.create({
          data: { projectId: project.id, name, args, description: description ?? null, tags: tags ?? [], createdBy: user.id },
          select: aliasSelect,
        }).catch((e: Error) => e)
        if (alias instanceof Error) return errText(alias.message)
        return jsonText({ ok: true, alias })
      },
    )

    server.registerTool(
      'alias_delete',
      {
        title: 'Delete project alias (admin)',
        description: 'Delete a project alias from dev DB by project slug and alias name.',
        inputSchema: {
          slug: z.string().describe('Project slug'),
          name: z.string().describe('Alias name to delete'),
        },
      },
      async ({ slug, name }) => {
        const project = await prisma.project.findFirst({ where: { slug, ...notDeleted } })
        if (!project) return errText('Project not found')
        const alias = await prisma.projectAlias.findUnique({
          where: { projectId_name: { projectId: project.id, name } },
        })
        if (!alias) return errText('Alias not found')
        await prisma.projectAlias.delete({ where: { id: alias.id } })
        return jsonText({ ok: true })
      },
    )
  },
}
