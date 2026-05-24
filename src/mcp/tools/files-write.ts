// Files write tool: file_create.

import { z } from 'zod'
import { apiCall } from '../api-client'
import { jsonResponse, type ToolModule, type ToolResponse } from '../shared'
import { toErrorResponse } from '../errors'
import { emitAudit } from '../audit'
import { SlugRef } from '../schemas/common'

const FileEntrySchema = z.object({
  filename: z.string().min(1).max(255)
    .describe('Filename including extension (e.g., "deploy.sh", "config.json").'),
  content: z.string().describe('Full file content as string.'),
  language: z.string().optional()
    .describe('Programming language hint (e.g., "bash", "typescript"). Auto-detected if omitted.'),
}).strict()

const FileCreateInputSchema = z.object({
  slug: SlugRef,
  title: z.string().min(1).max(255).describe('Human-readable title for this file entry.'),
  description: z.string().optional(),
  prefix: z.string().min(1).max(128).optional()
    .describe('Prefix slug for CLI reference. Used in canonical "<slug>:<prefix>/<filename>" syntax (e.g., prefix="deploy" → "envman -- bash myapp:deploy/script.sh"). Must be unique per project.'),
  files: z.array(FileEntrySchema).min(1).describe('One or more files in this entry.'),
  tags: z.array(z.string()).optional(),
}).strict()

const FileCreateOutputSchema = z.object({
  file: z.object({
    id: z.string(),
    title: z.string(),
    prefix: z.string().nullable().optional(),
  }).passthrough(),
})

const DESC = `Create a new file entry in a project. Files can be single-file (one script) or multi-file (a small bundle). Requires EDITOR+ role.

ARGS:
  - slug: project slug
  - title: human-readable title
  - description: optional
  - prefix: optional slug used for CLI invocation (\`envman -- bash <slug>:<prefix>/<filename>\`)
  - files: array of { filename, content, language? } — at least one
  - tags: optional

RETURNS:
  - file: created file entry with id

EXAMPLES:
  - file_create({ slug: "myapp", title: "Deploy script", prefix: "deploy",
      files: [{ filename: "deploy.sh", content: "#!/bin/bash\\necho deploying", language: "bash" }] })

ERRORS:
  - 403: EDITOR+ required
  - 400: missing title or files, OR prefix duplicate
  - 404: project not found

NOTES:
  - Not idempotent — calling twice creates two entries (or 400 on duplicate prefix).
  - **AUDITED**: MCP_FILE_CREATED.
  - To execute: CLI \`envman -- bash <slug>:<prefix>/<filename>\` pipes content to interpreter stdin.`

interface FileCreateResponse {
  file: { id: string; title: string; prefix?: string | null }
}

export const filesWriteModule: ToolModule = {
  register(server, ctx) {
    server.registerTool(
      'file_create',
      {
        title: 'Create file entry',
        description: DESC,
        inputSchema: FileCreateInputSchema.shape,
        outputSchema: FileCreateOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const p = FileCreateInputSchema.parse(args)
          const res = await apiCall<FileCreateResponse>(
            ctx.cfg,
            `/api/envman/projects/${encodeURIComponent(p.slug)}/files`,
            {
              method: 'POST',
              body: { title: p.title, description: p.description, prefix: p.prefix, files: p.files, tags: p.tags ?? [] },
              resource: `File entry in ${p.slug}`,
            },
          )
          emitAudit(ctx.cfg, 'MCP_FILE_CREATED', { slug: p.slug, detail: `title=${p.title} prefix=${p.prefix ?? '-'}` })
          return jsonResponse({ file: res.file as unknown as Record<string, unknown> })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )
  },
}
