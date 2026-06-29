// Aliases write tools: alias_create, alias_update, alias_delete.

import { z } from 'zod'
import { apiCall } from '../api-client'
import { emitAudit } from '../audit'
import { toErrorResponse } from '../errors'
import { AliasName, SlugRef } from '../schemas/common'
import { jsonResponse, type ToolModule, type ToolResponse } from '../shared'

const AliasCreateInputSchema = z
  .object({
    slug: SlugRef,
    name: AliasName.describe('Alias name — will be slugified server-side.'),
    args: z
      .string()
      .min(1, 'args must not be empty')
      .describe(
        'CLI args this alias expands to (e.g., "-e myapp:prod -- bash myapp:scripts/deploy.sh"). Use canonical "slug:prefix/file.ext" syntax for file refs — legacy "files:" prefix is deprecated.',
      ),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()

const AliasOutputSchema = z.object({
  alias: z
    .object({
      id: z.string(),
      name: z.string(),
      args: z.string(),
      description: z.string().nullable().optional(),
      tags: z.array(z.string()),
    })
    .passthrough(),
})

const AliasUpdateInputSchema = z
  .object({
    slug: SlugRef,
    name: AliasName,
    args: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()

const AliasDeleteInputSchema = z
  .object({
    slug: SlugRef,
    name: AliasName,
  })
  .strict()

const AliasDeleteOutputSchema = z.object({ ok: z.boolean(), name: z.string() })

const CREATE_DESC = `Create a new alias for a project. Requires OWNER role on the project.

ARGS:
  - slug: project slug
  - name: alias name (lowercase + hyphens; will be slugified)
  - args: full CLI args this alias expands to
  - description: optional human description
  - tags: optional array

RETURNS:
  - alias: created alias object

EXAMPLES:
  - alias_create({ slug: "myapp", name: "deploy", args: "-e myapp:prod -- bash myapp:scripts/deploy.sh" })

ERRORS:
  - 403: OWNER role required
  - 409: alias name already exists for this project (NOT idempotent)
  - 404: project not found
  - 400: invalid args (empty)

NOTES:
  - Not idempotent — calling twice creates one, then 409.
  - To update existing, use alias_update.
  - AUDITED: MCP_ALIAS_CREATED.`

const UPDATE_DESC = `Update an existing alias (args, description, or tags). Requires OWNER role.

ARGS:
  - slug, name: identify alias
  - args, description, tags: any subset to update

RETURNS:
  - alias: updated alias object

EXAMPLES:
  - alias_update({ slug: "myapp", name: "deploy", args: "-e myapp:prod -- node deploy.js" })

ERRORS:
  - 403: OWNER required
  - 404: alias not found

NOTES:
  - Idempotent (same input → same result).
  - AUDITED: MCP_ALIAS_UPDATED.`

const DELETE_DESC = `Delete an alias. Requires OWNER role.

ARGS:
  - slug, name

RETURNS:
  - ok, name

ERRORS:
  - 403: OWNER required
  - 404: alias not found

NOTES:
  - **DESTRUCTIVE**: cannot recover.
  - AUDITED: MCP_ALIAS_DELETED.`

interface AliasResponse {
  alias: { id: string; name: string; args: string; description?: string | null; tags: string[] }
}

export const aliasesWriteModule: ToolModule = {
  register(server, ctx) {
    server.registerTool(
      'alias_create',
      {
        title: 'Create project alias',
        description: CREATE_DESC,
        inputSchema: AliasCreateInputSchema.shape,
        outputSchema: AliasOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const p = AliasCreateInputSchema.parse(args)
          const res = await apiCall<AliasResponse>(
            ctx.cfg,
            `/api/envman/projects/${encodeURIComponent(p.slug)}/aliases`,
            {
              method: 'POST',
              body: { name: p.name, args: p.args, description: p.description, tags: p.tags ?? [] },
              resource: `Alias ${p.slug}:${p.name}`,
            },
          )
          emitAudit(ctx.cfg, 'MCP_ALIAS_CREATED', { slug: p.slug, detail: `name=${p.name}` })
          return jsonResponse({ alias: res.alias as unknown as Record<string, unknown> })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'alias_update',
      {
        title: 'Update project alias',
        description: UPDATE_DESC,
        inputSchema: AliasUpdateInputSchema.shape,
        outputSchema: AliasOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const p = AliasUpdateInputSchema.parse(args)
          const body: Record<string, unknown> = {}
          if (p.args !== undefined) body.args = p.args
          if (p.description !== undefined) body.description = p.description
          if (p.tags !== undefined) body.tags = p.tags
          const res = await apiCall<AliasResponse>(
            ctx.cfg,
            `/api/envman/projects/${encodeURIComponent(p.slug)}/aliases/${encodeURIComponent(p.name)}`,
            { method: 'PATCH', body, resource: `Alias ${p.slug}:${p.name}` },
          )
          emitAudit(ctx.cfg, 'MCP_ALIAS_UPDATED', { slug: p.slug, detail: `name=${p.name}` })
          return jsonResponse({ alias: res.alias as unknown as Record<string, unknown> })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'alias_delete',
      {
        title: 'Delete project alias',
        description: DELETE_DESC,
        inputSchema: AliasDeleteInputSchema.shape,
        outputSchema: AliasDeleteOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const p = AliasDeleteInputSchema.parse(args)
          await apiCall(
            ctx.cfg,
            `/api/envman/projects/${encodeURIComponent(p.slug)}/aliases/${encodeURIComponent(p.name)}`,
            {
              method: 'DELETE',
              resource: `Alias ${p.slug}:${p.name}`,
            },
          )
          emitAudit(ctx.cfg, 'MCP_ALIAS_DELETED', { slug: p.slug, detail: `name=${p.name}` })
          return jsonResponse({ ok: true, name: p.name })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )
  },
}
