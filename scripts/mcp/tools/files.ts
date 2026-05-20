import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { jsonText, errText, type ToolModule } from './shared'

const notDeleted = { deletedAt: null }

const fileSelect = {
  id: true,
  title: true,
  description: true,
  files: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, email: true } },
} as const

export const fileReadonlyTools: ToolModule = {
  name: 'project-files-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'project_file_list',
      {
        title: 'List project files',
        description: 'List all files for a project by slug',
        inputSchema: { slug: z.string().describe('Project slug') },
      },
      async ({ slug }) => {
        const project = await prisma.project.findFirst({ where: { slug, ...notDeleted } })
        if (!project) return jsonText({ error: 'Project not found' })
        const files = await prisma.projectFile.findMany({
          where: { projectId: project.id },
          orderBy: { updatedAt: 'desc' },
          select: fileSelect,
        })
        return jsonText({ count: files.length, files })
      },
    )

    server.registerTool(
      'project_file_get',
      {
        title: 'Get project file',
        description: 'Fetch a single project file by id',
        inputSchema: {
          slug: z.string().describe('Project slug'),
          id: z.string().describe('File id'),
        },
      },
      async ({ slug, id }) => {
        const project = await prisma.project.findFirst({ where: { slug, ...notDeleted } })
        if (!project) return jsonText({ error: 'Project not found' })
        const file = await prisma.projectFile.findUnique({ where: { id }, select: fileSelect })
        if (!file || (file as any).projectId !== project.id) return jsonText({ file: null })
        return jsonText({ file })
      },
    )
  },
}

export const fileAdminTools: ToolModule = {
  name: 'project-files-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'project_file_create',
      {
        title: 'Create project file (admin)',
        description: 'Create a project file directly in dev DB.',
        inputSchema: {
          slug: z.string(),
          title: z.string().min(1),
          authorEmail: z.string().email(),
          files: z.array(z.object({ filename: z.string(), content: z.string(), language: z.string() })).min(1),
          description: z.string().optional(),
          tags: z.array(z.string()).optional(),
        },
      },
      async ({ slug, title, authorEmail, files, description, tags }) => {
        const project = await prisma.project.findFirst({ where: { slug, ...notDeleted } })
        if (!project) return errText('Project not found')
        const user = await prisma.user.findUnique({ where: { email: authorEmail } })
        if (!user) return errText('User not found')
        const file = await prisma.projectFile.create({
          data: { projectId: project.id, authorId: user.id, title, description: description ?? '', files: files as any, tags: tags ?? [] },
          select: fileSelect,
        }).catch((e: Error) => e)
        if (file instanceof Error) return errText(file.message)
        return jsonText({ ok: true, file })
      },
    )

    server.registerTool(
      'project_file_delete',
      {
        title: 'Delete project file (admin)',
        description: 'Delete a project file from dev DB by id.',
        inputSchema: {
          slug: z.string(),
          id: z.string(),
        },
      },
      async ({ slug, id }) => {
        const project = await prisma.project.findFirst({ where: { slug, ...notDeleted } })
        if (!project) return errText('Project not found')
        const file = await prisma.projectFile.findUnique({ where: { id } })
        if (!file || file.projectId !== project.id) return errText('File not found')
        await prisma.projectFile.delete({ where: { id } })
        return jsonText({ ok: true })
      },
    )
  },
}
