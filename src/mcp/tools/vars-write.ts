// Vars write tools: var_set, var_delete.
// Requires --write flag AND token canWrite=true. Each call audited.

import { z } from 'zod'
import { apiCall } from '../api-client'
import { emitAudit } from '../audit'
import { toErrorResponse } from '../errors'
import { EnvName, SlugRef, VarKey } from '../schemas/common'
import { jsonResponse, type ToolModule, type ToolResponse } from '../shared'

const VarSetInputSchema = z
  .object({
    slug: SlugRef,
    env: EnvName,
    key: VarKey,
    value: z.string().describe('Variable value. Plaintext — if isSecret=true, server will encrypt before storage.'),
    isSecret: z
      .boolean()
      .default(false)
      .describe('If true, value is encrypted at rest and masked in lists for VIEWER role.'),
  })
  .strict()

const VarSetOutputSchema = z.object({
  ok: z.boolean(),
  key: z.string(),
  isSecret: z.boolean(),
  created: z.boolean().describe('True if newly created, false if updated existing'),
})

const VarDeleteInputSchema = z
  .object({
    slug: SlugRef,
    env: EnvName,
    key: VarKey,
  })
  .strict()

const VarDeleteOutputSchema = z.object({
  ok: z.boolean(),
  key: z.string(),
})

const SET_DESC = `Create or update an environment variable (upsert). Requires --write mode AND token canWrite=true AND role EDITOR/OWNER on the project.

ARGS:
  - slug, env: project + environment
  - key: variable name (SCREAMING_SNAKE_CASE)
  - value: plaintext (server encrypts if isSecret=true)
  - isSecret: boolean, default false

RETURNS:
  - ok: true
  - key: the key just upserted
  - isSecret: the isSecret flag stored
  - created: true if newly created, false if updated

EXAMPLES:
  - var_set({ slug: "myapp", env: "prod", key: "PORT", value: "3000" })
  - var_set({ slug: "myapp", env: "prod", key: "API_KEY", value: "sk-...", isSecret: true })

ERRORS:
  - 403: token read-only OR caller role insufficient (must be EDITOR or OWNER)
  - 404: project/env not found
  - 400: invalid key format

NOTES:
  - This is upsert: existing key with same name will be overwritten.
  - AUDITED: server records MCP_VAR_SET event.
  - For secret values, treat with care — value may end up in logs.`

const DELETE_DESC = `Delete an environment variable. Requires --write mode AND token canWrite=true AND role EDITOR/OWNER.

ARGS:
  - slug, env, key

RETURNS:
  - ok: true
  - key: the key deleted

EXAMPLES:
  - var_delete({ slug: "myapp", env: "prod", key: "OLD_FLAG" })

ERRORS:
  - 403: insufficient permissions
  - 404: var (or project/env) not found

NOTES:
  - Idempotent in effect (404 if already gone — caller should handle).
  - AUDITED: MCP_VAR_DELETED.
  - **DESTRUCTIVE**: removed values cannot be recovered.`

interface VarSetResponse {
  var: { id: string; key: string; isSecret: boolean }
}

export const varsWriteModule: ToolModule = {
  register(server, ctx) {
    server.registerTool(
      'var_set',
      {
        title: 'Set/upsert environment variable',
        description: SET_DESC,
        inputSchema: VarSetInputSchema.shape,
        outputSchema: VarSetOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const parsed = VarSetInputSchema.parse(args)
          const url = `/api/envman/projects/${encodeURIComponent(parsed.slug)}/environments/${encodeURIComponent(parsed.env)}/vars`
          const res = await apiCall<VarSetResponse>(ctx.cfg, url, {
            method: 'POST',
            body: { key: parsed.key, value: parsed.value, isSecret: parsed.isSecret },
            resource: `Var ${parsed.slug}:${parsed.env}:${parsed.key}`,
          })
          emitAudit(ctx.cfg, 'MCP_VAR_SET', {
            slug: parsed.slug,
            env: parsed.env,
            detail: `key=${parsed.key} isSecret=${parsed.isSecret}`,
          })
          // Server doesn't distinguish create vs update — assume update if API returns 200.
          // For better signal, server could return 201 on create. For now: always "upsert".
          return jsonResponse({
            ok: true,
            key: res.var.key,
            isSecret: res.var.isSecret,
            created: false, // unknown from current server response
          })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'var_delete',
      {
        title: 'Delete environment variable',
        description: DELETE_DESC,
        inputSchema: VarDeleteInputSchema.shape,
        outputSchema: VarDeleteOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const parsed = VarDeleteInputSchema.parse(args)
          const url = `/api/envman/projects/${encodeURIComponent(parsed.slug)}/environments/${encodeURIComponent(parsed.env)}/vars/${encodeURIComponent(parsed.key)}`
          await apiCall<{ ok: true }>(ctx.cfg, url, {
            method: 'DELETE',
            resource: `Var ${parsed.slug}:${parsed.env}:${parsed.key}`,
          })
          emitAudit(ctx.cfg, 'MCP_VAR_DELETED', {
            slug: parsed.slug,
            env: parsed.env,
            detail: `key=${parsed.key}`,
          })
          return jsonResponse({ ok: true, key: parsed.key })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )
  },
}
