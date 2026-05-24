// Files read tools: files_list, file_resolve.

import { z } from 'zod'
import { apiCall } from '../api-client'
import { jsonResponse, type ToolModule, type ToolResponse } from '../shared'
import { toErrorResponse } from '../errors'
import { SlugRef } from '../schemas/common'

const FilesListInputSchema = z.object({
  slug: SlugRef,
}).strict()

const FileSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  prefix: z.string().nullable().optional(),
  tags: z.array(z.string()),
  files: z.array(z.object({
    filename: z.string(),
    language: z.string().optional(),
  }).passthrough()),
}).passthrough()

const FilesListOutputSchema = z.object({
  files: z.array(FileSchema),
  count: z.number().int(),
})

const FileResolveInputSchema = z.object({
  slug: SlugRef,
  prefix: z.string().min(1).max(128)
    .describe('Prefix slug of the file entry (e.g., "deploy", "migrate")'),
  filename: z.string().optional()
    .describe('Specific filename if entry has multiple files (e.g., "main.sh"). Omit if entry has exactly one file.'),
}).strict()

const FileResolveOutputSchema = z.object({
  content: z.string(),
  filename: z.string(),
  language: z.string().nullable().optional(),
  entryTitle: z.string(),
})

const LIST_DESCRIPTION = `List file entries for a project. Files are scripts/snippets stored in envman that can be referenced and executed via CLI (e.g., \`envman -- bash myapp:deploy/script.sh\`).

ARGS:
  - slug: project slug

RETURNS:
  - files[]: { id, title, description, prefix, tags[], files: [{ filename, language }, ...] }
  - count

EXAMPLES:
  - files_list({ slug: "myapp" }) → all file entries

ERRORS:
  - 404: slug not found
  - 403: no access

NOTES:
  - Each entry can contain multiple files. Use file_resolve to fetch content.
  - "prefix" is used in CLI invocations (e.g., \`files:deploy/script.sh\`).`

const RESOLVE_DESCRIPTION = `Fetch content of a specific file by prefix (+ optional filename). Used by CLI to pipe scripts to interpreters at runtime.

ARGS:
  - slug: project slug
  - prefix: prefix slug of the file entry
  - filename: required only if entry has multiple files

RETURNS:
  - content: file content as string
  - filename: actual filename
  - language: programming language (best-effort, may be null)
  - entryTitle: title of the entry

EXAMPLES:
  - file_resolve({ slug: "myapp", prefix: "deploy" }) → content of single-file entry
  - file_resolve({ slug: "myapp", prefix: "scripts", filename: "migrate.sh" }) → content from multi-file entry

ERRORS:
  - 400: multi-file entry without filename
  - 404: prefix or filename not found

NOTES:
  - Returned content may be large — use vars_export pattern of restraint when previewing.`

interface FilesListResponse { files: Array<Record<string, unknown>> }
interface FileResolveResponse {
  content: string
  filename: string
  language?: string | null
  entryTitle: string
}

export const filesReadModule: ToolModule = {
  register(server, ctx) {
    server.registerTool(
      'files_list',
      {
        title: 'List project files',
        description: LIST_DESCRIPTION,
        inputSchema: FilesListInputSchema.shape,
        outputSchema: FilesListOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const parsed = FilesListInputSchema.parse(args)
          const res = await apiCall<FilesListResponse>(
            ctx.cfg,
            `/api/envman/projects/${encodeURIComponent(parsed.slug)}/files`,
            { resource: `Files for "${parsed.slug}"`, notFoundHint: 'Use projects_list to see slugs.' },
          )
          return jsonResponse({ files: res.files, count: res.files.length })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'file_resolve',
      {
        title: 'Fetch file content by prefix',
        description: RESOLVE_DESCRIPTION,
        inputSchema: FileResolveInputSchema.shape,
        outputSchema: FileResolveOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        try {
          const parsed = FileResolveInputSchema.parse(args)
          const qs = new URLSearchParams({ prefix: parsed.prefix })
          if (parsed.filename) qs.set('filename', parsed.filename)
          const res = await apiCall<FileResolveResponse>(
            ctx.cfg,
            `/api/envman/projects/${encodeURIComponent(parsed.slug)}/files/resolve?${qs}`,
            { resource: `File ${parsed.slug}:${parsed.prefix}${parsed.filename ? '/' + parsed.filename : ''}`, notFoundHint: 'Use files_list to see prefixes.' },
          )
          return jsonResponse({
            content: res.content,
            filename: res.filename,
            language: res.language ?? null,
            entryTitle: res.entryTitle,
          })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )
  },
}
