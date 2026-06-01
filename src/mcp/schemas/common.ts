// Common zod schema building blocks. All MCP tool schemas use these.
//
// Convention: z.object().strict() + per-field .describe() + constraint error messages.
// Strict mode = reject unknown keys (mitigates rug-pull / typo from Claude).

import { z } from 'zod'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants'

export const SlugRef = z
  .string()
  .min(1, 'Slug must not be empty')
  .max(64, 'Slug must be at most 64 characters')
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
    'Slug must be lowercase alphanumeric with optional hyphens (e.g., "my-app")',
  )
  .describe('Project slug — URL-safe identifier shown in the envman dashboard URL.')

export const EnvName = z
  .string()
  .min(1, 'Env name must not be empty')
  .max(50, 'Env name must be at most 50 characters')
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Env name must start alphanumeric, then alphanumeric/underscore/hyphen')
  .describe('Environment name within the project (e.g., "production", "dev", "staging").')

export const VarKey = z
  .string()
  .min(1, 'Key must not be empty')
  .max(255, 'Key must be at most 255 characters')
  .regex(
    /^[A-Z_][A-Z0-9_]*$/,
    'Key must be SCREAMING_SNAKE_CASE (uppercase letters, digits, underscores; must start with letter or underscore)',
  )
  .describe('Environment variable key in SCREAMING_SNAKE_CASE.')

export const AliasName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Alias name must be lowercase alphanumeric with optional hyphens')
  .describe('Alias name (slugified, e.g., "deploy", "run-tests").')

export const Pagination = z.object({
  limit: z
    .number()
    .int()
    .min(1, 'limit must be ≥ 1')
    .max(MAX_PAGE_SIZE, `limit must be ≤ ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE)
    .describe(`Maximum items per page (default ${DEFAULT_PAGE_SIZE}, max ${MAX_PAGE_SIZE}).`),
  offset: z
    .number()
    .int()
    .min(0, 'offset must be ≥ 0')
    .default(0)
    .describe('Number of items to skip (for pagination — use next_offset from previous call).'),
})

export const ResponseFormat = z
  .enum(['markdown', 'json'])
  .default('markdown')
  .describe('Output format. "markdown" for human-readable, "json" for structured parsing.')

// Common output meta shape (for paginated results)
export const PageMetaSchema = z.object({
  total: z.number().int().describe('Total items available on server.'),
  count: z.number().int().describe('Items returned in this response.'),
  offset: z.number().int().describe('Offset used for this query.'),
  limit: z.number().int().describe('Limit used for this query.'),
  has_more: z.boolean().describe('True if more items exist (server pagination or local truncation).'),
  next_offset: z.number().int().optional().describe('Offset to use for next page (if has_more=true).'),
  truncated: z.boolean().optional().describe('True if response was truncated by character limit.'),
  truncation_message: z.string().optional().describe('Hint for handling truncation.'),
})
