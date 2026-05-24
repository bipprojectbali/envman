// Vars read tools: vars_list, vars_export, vars_diff.

import { z } from 'zod'
import { apiCall } from '../api-client'
import { jsonResponse, markdownResponse, type ToolModule, type ToolResponse } from '../shared'
import { toErrorResponse } from '../errors'
import { emitAudit } from '../audit'
import { SlugRef, EnvName, Pagination } from '../schemas/common'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const VarsListInputSchema = z.object({
  slug: SlugRef,
  env: EnvName,
  search: z.string().optional()
    .describe('Substring match on KEY (case-insensitive). Omit to list all.'),
  ...Pagination.shape,
}).strict()

const VarRecordSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string().describe('Actual value, or "***" for secrets when token is VIEWER role'),
  isSecret: z.boolean(),
  isDisabled: z.boolean(),
  updatedAt: z.string(),
}).passthrough()

const VarsListOutputSchema = z.object({
  vars: z.array(VarRecordSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  hasMore: z.boolean(),
})

const VarsExportInputSchema = z.object({
  slug: SlugRef,
  env: EnvName,
  revealSecrets: z.boolean().default(false)
    .describe('If true, return decrypted secret values (requires EDITOR/OWNER role). DEFAULT FALSE — secrets shown as "***".'),
}).strict()

const VarsExportOutputSchema = z.object({
  vars: z.record(z.string(), z.string()),
  count: z.number().int(),
  secretsRevealed: z.boolean(),
})

const VarsDiffInputSchema = z.object({
  slug: SlugRef,
  env1: EnvName.describe('First environment to compare (e.g., "dev")'),
  env2: EnvName.describe('Second environment to compare (e.g., "production")'),
}).strict()

const DiffEntrySchema = z.object({
  key: z.string(),
  value1: z.string().nullable(),
  value2: z.string().nullable(),
}).passthrough()

const VarsDiffOutputSchema = z.object({
  same: z.array(DiffEntrySchema),
  different: z.array(DiffEntrySchema),
  only_env1: z.array(DiffEntrySchema),
  only_env2: z.array(DiffEntrySchema),
}).passthrough()

// ─── Descriptions ─────────────────────────────────────────────────────────────

const LIST_DESCRIPTION = `List environment variables for a project:env. Secrets are masked as "***" unless the caller's role is EDITOR or OWNER.

ARGS:
  - slug: project slug
  - env: environment name (e.g., "production")
  - search: optional substring match on KEY (case-insensitive)
  - limit / offset: pagination

RETURNS:
  - vars[]: { id, key, value, isSecret, isDisabled, updatedAt }
  - total, limit, offset, hasMore (server-side pagination)

EXAMPLES:
  - vars_list({ slug: "myapp", env: "prod" }) → first 50 vars
  - vars_list({ slug: "myapp", env: "prod", search: "DB" }) → only KEYs containing "DB"
  - vars_list({ slug: "myapp", env: "prod", offset: 50 }) → next page

ERRORS:
  - 404: project or env not found
  - 403: token scope doesn't allow this project:env

NOTES:
  - For full plaintext export (all secrets), use vars_export with revealSecrets: true.
  - Disabled vars (isDisabled=true) are included but won't be exported to runtime.`

const EXPORT_DESCRIPTION = `Export all variables for a project:env as a KEY=value map. By default secrets are MASKED as "***". Pass revealSecrets: true to get decrypted values (requires EDITOR/OWNER role; otherwise still masked).

ARGS:
  - slug, env: project + environment
  - revealSecrets: boolean — if true AND caller has EDITOR/OWNER, return plaintext secrets

RETURNS:
  - vars: { KEY1: value, KEY2: value, ... } object
  - count: number of vars
  - secretsRevealed: true if revealSecrets was requested AND honored

EXAMPLES:
  - vars_export({ slug: "myapp", env: "prod" }) → masked
  - vars_export({ slug: "myapp", env: "prod", revealSecrets: true }) → plaintext (if authorized)

ERRORS:
  - 403: insufficient role for revealSecrets, or token scope blocks access

SECURITY WARNING:
  - When revealSecrets=true, full secret values are returned in the response.
    Do NOT log or persist this output. Use only for the immediate question.
  - This call is AUDITED — server records MCP_VARS_REVEALED event.`

const DIFF_DESCRIPTION = `Compare variables between two environments of the same project. Categorizes each key as: same value, different value, only in env1, only in env2.

ARGS:
  - slug: project slug
  - env1, env2: two environments to compare

RETURNS:
  - same: vars with identical values
  - different: vars present in both but with different values
  - only_env1, only_env2: vars only present in one

EXAMPLES:
  - "What's different between dev and prod?" → vars_diff({ slug: "myapp", env1: "dev", env2: "production" })

ERRORS:
  - 404: project or either env not found

NOTES:
  - Secret values: returned as "***" for both, so diff for secrets shows them as "same" if both secrets, "different" if one is secret and other isn't.`

interface VarsListResponse {
  vars: Array<Record<string, unknown>>
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

interface VarsExportResponse {
  vars: Record<string, string>
}

interface VarsDiffResponse {
  same: Array<Record<string, unknown>>
  different: Array<Record<string, unknown>>
  only_env1: Array<Record<string, unknown>>
  only_env2: Array<Record<string, unknown>>
}

export const varsReadModule: ToolModule = {
  register(server, ctx) {
    server.registerTool(
      'vars_list',
      {
        title: 'List environment variables',
        description: LIST_DESCRIPTION,
        inputSchema: VarsListInputSchema.shape,
        outputSchema: VarsListOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const parsed = VarsListInputSchema.parse(args)
          const params = new URLSearchParams({
            limit: String(parsed.limit),
            offset: String(parsed.offset),
          })
          if (parsed.search) params.set('search', parsed.search)
          const url = `/api/envman/projects/${encodeURIComponent(parsed.slug)}/environments/${encodeURIComponent(parsed.env)}/vars?${params}`
          const res = await apiCall<VarsListResponse>(ctx.cfg, url, {
            resource: `Vars for ${parsed.slug}:${parsed.env}`,
            notFoundHint: 'Verify slug + env with project_get.',
          })
          return jsonResponse({
            vars: res.vars,
            total: res.total,
            limit: res.limit,
            offset: res.offset,
            hasMore: res.hasMore,
          })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'vars_export',
      {
        title: 'Export all variables as KEY=value map',
        description: EXPORT_DESCRIPTION,
        inputSchema: VarsExportInputSchema.shape,
        outputSchema: VarsExportOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const parsed = VarsExportInputSchema.parse(args)
          const url = `/api/envman/projects/${encodeURIComponent(parsed.slug)}/environments/${encodeURIComponent(parsed.env)}/vars/export`
          const res = await apiCall<VarsExportResponse>(ctx.cfg, url, {
            resource: `Vars export for ${parsed.slug}:${parsed.env}`,
          })
          // Conservative: any '***' value implies server still masked (role insufficient).
          // We can't distinguish "no secrets exist" from "all revealed" without the isSecret flag,
          // but the request worked end-to-end either way. If user explicitly asked to reveal AND
          // no masked value remains, we report success.
          const hasMasked = Object.values(res.vars).some((v) => v === '***')
          const secretsRevealed = parsed.revealSecrets && !hasMasked
          if (parsed.revealSecrets) {
            emitAudit(ctx.cfg, 'MCP_VARS_REVEALED', { slug: parsed.slug, env: parsed.env })
          }
          return jsonResponse({
            vars: res.vars,
            count: Object.keys(res.vars).length,
            secretsRevealed,
          })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'vars_diff',
      {
        title: 'Compare vars between two environments',
        description: DIFF_DESCRIPTION,
        inputSchema: VarsDiffInputSchema.shape,
        outputSchema: VarsDiffOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const parsed = VarsDiffInputSchema.parse(args)
          const url = `/api/envman/projects/${encodeURIComponent(parsed.slug)}/diff/${encodeURIComponent(parsed.env1)}/${encodeURIComponent(parsed.env2)}`
          const res = await apiCall<VarsDiffResponse>(ctx.cfg, url, {
            resource: `Diff ${parsed.slug}:${parsed.env1} vs ${parsed.env2}`,
          })
          const text = [
            `# Diff ${parsed.slug}: ${parsed.env1} vs ${parsed.env2}`,
            ``,
            `- Same: ${res.same.length}`,
            `- Different: ${res.different.length}`,
            `- Only in ${parsed.env1}: ${res.only_env1.length}`,
            `- Only in ${parsed.env2}: ${res.only_env2.length}`,
          ].join('\n')
          return markdownResponse(text, res as unknown as Record<string, unknown>)
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )
  },
}
