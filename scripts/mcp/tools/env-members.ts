import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { errText, jsonText, type ToolModule } from './shared'

const notDeleted = { deletedAt: null }

const roleEnum = z.enum(['inherit', 'denied', 'OWNER', 'EDITOR', 'VIEWER'])

type ResolveOk = {
  ok: true
  project: { id: string }
  env: { id: string }
}
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

export const envMemberReadonlyTools: ToolModule = {
  name: 'env-members-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'env_member_list',
      {
        title: 'List env-level member overrides',
        description:
          'List project members with their env-level access (inherit/role override/denied) for a given environment. Read-only.',
        inputSchema: {
          slug: z.string().describe('Project slug'),
          envName: z.string().describe('Environment name (e.g. "prod", "dev")'),
        },
      },
      async ({ slug, envName }) => {
        const r = await resolveProjectEnv(slug, envName)
        if (!r.ok) return jsonText({ error: r.error })

        const projectMembers = await prisma.projectMember.findMany({
          where: { projectId: r.project.id },
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        })
        const envMembers = await prisma.environmentMember.findMany({
          where: { environmentId: r.env.id },
        })
        const overrideByUser = new Map(envMembers.map((m) => [m.userId, m]))

        const members = projectMembers.map((pm) => {
          const override = overrideByUser.get(pm.userId)
          let envRole: 'inherit' | 'denied' | 'OWNER' | 'EDITOR' | 'VIEWER' = 'inherit'
          let effectiveRole: 'OWNER' | 'EDITOR' | 'VIEWER' | null = pm.role as 'OWNER' | 'EDITOR' | 'VIEWER'
          if (override) {
            if (override.role === null) {
              envRole = 'denied'
              effectiveRole = null
            } else {
              envRole = override.role as 'OWNER' | 'EDITOR' | 'VIEWER'
              effectiveRole = override.role as 'OWNER' | 'EDITOR' | 'VIEWER'
            }
          }
          return {
            userId: pm.userId,
            email: pm.user.email,
            name: pm.user.name,
            projectRole: pm.role,
            envRole,
            effectiveRole,
          }
        })

        return jsonText({ slug, envName, count: members.length, members })
      },
    )

    server.registerTool(
      'env_member_get',
      {
        title: 'Get a single env-level override',
        description: 'Get the env-level access record for one user on one environment.',
        inputSchema: {
          slug: z.string().describe('Project slug'),
          envName: z.string().describe('Environment name'),
          userEmail: z.string().email().describe('Target user email'),
        },
      },
      async ({ slug, envName, userEmail }) => {
        const r = await resolveProjectEnv(slug, envName)
        if (!r.ok) return jsonText({ error: r.error })
        const user = await prisma.user.findUnique({ where: { email: userEmail } })
        if (!user) return jsonText({ error: 'User not found' })
        const projectMember = await prisma.projectMember.findUnique({
          where: { userId_projectId: { userId: user.id, projectId: r.project.id } },
        })
        if (!projectMember) return jsonText({ projectRole: null, envRole: 'inherit', effectiveRole: null })
        const override = await prisma.environmentMember.findUnique({
          where: { userId_environmentId: { userId: user.id, environmentId: r.env.id } },
        })
        let envRole: 'inherit' | 'denied' | 'OWNER' | 'EDITOR' | 'VIEWER' = 'inherit'
        let effectiveRole: 'OWNER' | 'EDITOR' | 'VIEWER' | null = projectMember.role as 'OWNER' | 'EDITOR' | 'VIEWER'
        if (override) {
          if (override.role === null) {
            envRole = 'denied'
            effectiveRole = null
          } else {
            envRole = override.role as 'OWNER' | 'EDITOR' | 'VIEWER'
            effectiveRole = override.role as 'OWNER' | 'EDITOR' | 'VIEWER'
          }
        }
        return jsonText({
          userId: user.id,
          email: user.email,
          projectRole: projectMember.role,
          envRole,
          effectiveRole,
        })
      },
    )
  },
}

export const envMemberAdminTools: ToolModule = {
  name: 'env-members-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'env_member_set',
      {
        title: 'Set env-level access for a project member (admin)',
        description:
          "Set the env-level access for one project member. role='inherit' clears the override (uses project role); 'denied' blocks access; OWNER/EDITOR/VIEWER overrides the project-level role for this env only. Dev DB only.",
        inputSchema: {
          slug: z.string().describe('Project slug'),
          envName: z.string().describe('Environment name'),
          userEmail: z.string().email().describe('Target user email (must already be a project member)'),
          role: roleEnum.describe("'inherit' | 'denied' | 'OWNER' | 'EDITOR' | 'VIEWER'"),
        },
      },
      async ({ slug, envName, userEmail, role }) => {
        const r = await resolveProjectEnv(slug, envName)
        if (!r.ok) return errText(r.error)
        const user = await prisma.user.findUnique({ where: { email: userEmail } })
        if (!user) return errText('User not found')
        const projectMember = await prisma.projectMember.findUnique({
          where: { userId_projectId: { userId: user.id, projectId: r.project.id } },
        })
        if (!projectMember) return errText('User is not a project member — add them to the project first')

        if (role === 'inherit') {
          await prisma.environmentMember.deleteMany({
            where: { userId: user.id, environmentId: r.env.id },
          })
          return jsonText({ ok: true, role: 'inherit' })
        }
        const newRole = role === 'denied' ? null : role
        await prisma.environmentMember.upsert({
          where: { userId_environmentId: { userId: user.id, environmentId: r.env.id } },
          update: { role: newRole },
          create: { userId: user.id, environmentId: r.env.id, role: newRole },
        })
        return jsonText({ ok: true, role })
      },
    )

    server.registerTool(
      'env_member_clear',
      {
        title: 'Clear env-level override (admin)',
        description:
          'Remove the env-level override for a user (back to inheriting the project-level role). Dev DB only.',
        inputSchema: {
          slug: z.string().describe('Project slug'),
          envName: z.string().describe('Environment name'),
          userEmail: z.string().email().describe('Target user email'),
        },
      },
      async ({ slug, envName, userEmail }) => {
        const r = await resolveProjectEnv(slug, envName)
        if (!r.ok) return errText(r.error)
        const user = await prisma.user.findUnique({ where: { email: userEmail } })
        if (!user) return errText('User not found')
        const deleted = await prisma.environmentMember.deleteMany({
          where: { userId: user.id, environmentId: r.env.id },
        })
        return jsonText({ ok: true, deletedCount: deleted.count })
      },
    )
  },
}
