import { Elysia } from 'elysia'
import { getSectionAccess } from '../../lib/access'
import { forbidden, requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'
import { conditional, notModifiedResponse, weakEtag } from '../../lib/http-cache'
import { logTokenActivity } from '../../lib/token-activity'

interface FileEntry {
  filename: string
  content: string
  language: string
}

export const filesResolveRouter = new Elysia()

  .get('/api/envman/projects/:slug/files/resolve', async ({ request, params, set, query }) => {
    const authResult = await requireEnvAuth(request)
    if (!authResult) return unauthorized(set)
    const access = await getSectionAccess(authResult.userId, authResult.role, params.slug, 'FILES')
    if (!access) return forbidden(set)
    const prefix = (query.prefix as string | undefined)?.trim()
    const filename = (query.filename as string | undefined)?.trim()
    if (!prefix) {
      set.status = 400
      return { error: 'prefix wajib diisi' }
    }
    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    const entry = await prisma.projectFile.findFirst({ where: { projectId: project.id, prefix } })
    if (!entry) {
      set.status = 404
      return { error: `File dengan prefix "${prefix}" tidak ditemukan di project ${params.slug}` }
    }
    const fileList = entry.files as unknown as FileEntry[]
    let resolved: FileEntry | undefined
    if (filename) {
      resolved = fileList.find((f) => f.filename === filename)
      if (!resolved) {
        set.status = 404
        return { error: `Filename "${filename}" tidak ditemukan di entry "${entry.title}"` }
      }
    } else {
      if (fileList.length > 1) {
        set.status = 400
        return {
          error: `Entry "${entry.title}" punya ${fileList.length} file. Tentukan filename: files:${prefix}/<filename>. Files: ${fileList.map((f) => f.filename).join(', ')}`,
        }
      }
      resolved = fileList[0]
    }
    if (authResult.tokenId) {
      logTokenActivity({
        tokenId: authResult.tokenId,
        userId: authResult.userId,
        tokenName: authResult.tokenName,
        action: 'file_exec',
        projectSlug: params.slug,
        detail: `${prefix}${filename ? `/${filename}` : ''}`,
        ip:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          request.headers.get('x-real-ip') ??
          undefined,
      })
    }
    const { notModified, headers } = conditional(request, {
      etag: weakEtag(`${entry.id}:${entry.updatedAt.toISOString()}:${resolved.filename}`),
      lastModified: entry.updatedAt,
    })
    if (notModified) return notModifiedResponse(headers)
    return new Response(
      JSON.stringify({
        content: resolved.content,
        filename: resolved.filename,
        language: resolved.language,
        entryTitle: entry.title,
      }),
      { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } },
    )
  })
