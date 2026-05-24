// Aliases read tools: aliases_list, alias_resolve.

import { z } from 'zod'
import { apiCall } from '../api-client'
import { jsonResponse, type ToolModule, type ToolResponse } from '../shared'
import { toErrorResponse } from '../errors'
import { SlugRef, AliasName } from '../schemas/common'

const AliasesListInputSchema = z.object({ slug: SlugRef }).strict()

const AliasSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.string(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()),
}).passthrough()

const AliasesListOutputSchema = z.object({
  aliases: z.array(AliasSchema),
  count: z.number().int(),
})

const AliasResolveInputSchema = z.object({
  ref: z.string()
    .regex(/^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/i, 'ref must be "slug:aliasName"')
    .describe('Reference in "slug:aliasName" format (e.g., "myapp:deploy").'),
}).strict()

const AliasResolveOutputSchema = z.object({
  args: z.string(),
  project: z.string(),
  alias: z.string(),
})

const LIST_DESCRIPTION = `List all aliases for a project. Aliases are saved CLI invocations that can be run via \`envman run <slug>:<aliasName>\`.

ARGS:
  - slug: project slug

RETURNS:
  - aliases[]: { id, name, args, description, tags[] }
  - count

EXAMPLES:
  - aliases_list({ slug: "myapp" }) → all aliases like "deploy", "migrate", etc.

ERRORS:
  - 404: slug not found
  - 403: no access to this project

NOTES:
  - Aliases store the CLI args string (e.g., "-e myapp:prod -- bash myapp:scripts/deploy.sh").
  - Use alias_resolve to get expanded args for an alias.
  - File refs use canonical "slug:prefix/file.ext" syntax. The legacy "files:" prefix is deprecated — do not generate it in new aliases.`

const RESOLVE_DESCRIPTION = `Resolve a "slug:aliasName" reference to its stored args. Used by CLI internally for \`envman run\`.

ARGS:
  - ref: "slug:aliasName" string (e.g., "myapp:deploy")

RETURNS:
  - args: the stored CLI args (e.g., "-e myapp:prod -- bash myapp:scripts/deploy.sh")
  - project: slug
  - alias: alias name

EXAMPLES:
  - alias_resolve({ ref: "myapp:deploy" }) → { args: "-e myapp:prod -- bash deploy.sh", ... }

ERRORS:
  - 400: ref format invalid (must be "slug:name")
  - 404: project or alias not found
  - 403: no access

NOTES:
  - Use aliases_list first to see available alias names for a project.`

interface AliasesListResponse { aliases: Array<Record<string, unknown>> }
interface AliasResolveResponse { args: string; project: string; alias: string }

export const aliasesReadModule: ToolModule = {
  register(server, ctx) {
    server.registerTool(
      'aliases_list',
      {
        title: 'List project aliases',
        description: LIST_DESCRIPTION,
        inputSchema: AliasesListInputSchema.shape,
        outputSchema: AliasesListOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const parsed = AliasesListInputSchema.parse(args)
          const res = await apiCall<AliasesListResponse>(
            ctx.cfg,
            `/api/envman/projects/${encodeURIComponent(parsed.slug)}/aliases`,
            { resource: `Aliases for "${parsed.slug}"`, notFoundHint: 'Use projects_list to see slugs.' },
          )
          return jsonResponse({ aliases: res.aliases, count: res.aliases.length })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'alias_resolve',
      {
        title: 'Resolve alias to its args',
        description: RESOLVE_DESCRIPTION,
        inputSchema: AliasResolveInputSchema.shape,
        outputSchema: AliasResolveOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const parsed = AliasResolveInputSchema.parse(args)
          const res = await apiCall<AliasResolveResponse>(
            ctx.cfg,
            `/api/envman/aliases/resolve/${encodeURIComponent(parsed.ref)}`,
            { resource: `Alias "${parsed.ref}"`, notFoundHint: 'Use aliases_list to see available names.' },
          )
          return jsonResponse({ args: res.args, project: res.project, alias: res.alias })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    // suppress unused warning if AliasName not used elsewhere
    void AliasName
  },
}
