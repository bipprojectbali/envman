// Project read tools: projects_list, project_get.

import { z } from 'zod'
import { apiCall } from '../api-client'
import { jsonResponse, type ToolModule, type ToolResponse } from '../shared'
import { toErrorResponse } from '../errors'
import { SlugRef } from '../schemas/common'

const ProjectsListInputSchema = z.object({}).strict()

const ProjectMemberSchema = z.object({
  userId: z.string(),
  role: z.string(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }).optional(),
})

const ProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()),
  myRole: z.string().optional(),
  environments: z.array(z.object({ name: z.string() })).optional(),
  members: z.array(ProjectMemberSchema).optional(),
}).passthrough()

const ProjectsListOutputSchema = z.object({
  projects: z.array(ProjectSchema),
  count: z.number().int(),
})

const ProjectGetInputSchema = z.object({ slug: SlugRef }).strict()

const ProjectGetOutputSchema = z.object({ project: ProjectSchema })

const LIST_DESCRIPTION = `List envman projects accessible to the authenticated user. Returns only projects where the user is a member (or all projects for SUPER_ADMIN).

ARGS: (none)

RETURNS:
  - projects[]: array of { id, slug, name, description, tags[], myRole, environments[], members[] }
  - count: total number returned

EXAMPLES:
  - "What projects do I have?" → projects_list() → list with slug + name
  - Then use slug as input to other tools like vars_list

ERRORS:
  - 401: Token invalid
  - Network: server unreachable

NOTES:
  - Cached server-side 60s — fresh data may lag briefly after create/update.
  - For details of one project (members, environments with counts) use project_get.`

const GET_DESCRIPTION = `Get full detail of one project: members with their roles, environments with var counts, and the caller's effective role.

ARGS:
  - slug: project slug (string, e.g., "my-app")

RETURNS:
  - project: full Project shape including members[] and environments[] with vars count

EXAMPLES:
  - project_get({ slug: "open-marina" }) → { project: { ... members: [...], environments: [{ name: "dev", _count: { vars: 12 }}, ...]}}

ERRORS:
  - 404: Slug not found — use projects_list to see available slugs
  - 403: No access to this project

NOTES:
  - Use this before vars_list / aliases_list to confirm which environments and members exist.`

interface ProjectsListResponse { projects: unknown[] }
interface ProjectGetResponse { project: unknown }

export const projectsModule: ToolModule = {
  register(server, ctx) {
    server.registerTool(
      'projects_list',
      {
        title: 'List accessible projects',
        description: LIST_DESCRIPTION,
        inputSchema: ProjectsListInputSchema.shape,
        outputSchema: ProjectsListOutputSchema.shape,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (): Promise<ToolResponse> => {
        try {
          const res = await apiCall<ProjectsListResponse>(ctx.cfg, '/api/envman/projects', {
            resource: 'projects',
          })
          return jsonResponse({ projects: res.projects, count: res.projects.length })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'project_get',
      {
        title: 'Get project detail',
        description: GET_DESCRIPTION,
        inputSchema: ProjectGetInputSchema.shape,
        outputSchema: ProjectGetOutputSchema.shape,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const parsed = ProjectGetInputSchema.parse(args)
          const res = await apiCall<ProjectGetResponse>(
            ctx.cfg,
            `/api/envman/projects/${encodeURIComponent(parsed.slug)}`,
            { resource: `Project "${parsed.slug}"`, notFoundHint: 'Use projects_list to see available slugs.' },
          )
          return jsonResponse({ project: res.project as Record<string, unknown> })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )
  },
}
