// Pagination + character-limit truncation helper.
//
// Bug B3 mitigation: cap response size at CHARACTER_LIMIT to avoid
// Claude Desktop stdio buffering issues with large payloads.

import { CHARACTER_LIMIT } from './constants'

export interface PageMeta {
  total: number
  count: number
  offset: number
  limit: number
  has_more: boolean
  next_offset?: number
  truncated?: boolean
  truncation_message?: string
}

export interface Paged<T> {
  items: T[]
  meta: PageMeta
}

/**
 * Apply character-limit truncation on top of server-side pagination.
 * Server may return up to `limit` items; we further truncate if
 * the rendered output exceeds CHARACTER_LIMIT.
 */
export function paginate<T>(
  items: T[],
  total: number,
  offset: number,
  limit: number,
  render: (item: T) => string,
): Paged<T> & { renderedText: string } {
  const rendered: string[] = []
  const kept: T[] = []
  let bytes = 0
  for (const item of items) {
    const s = render(item)
    if (bytes + s.length > CHARACTER_LIMIT) break
    rendered.push(s)
    kept.push(item)
    bytes += s.length
  }
  const truncated = kept.length < items.length
  const serverHasMore = offset + items.length < total
  const has_more = truncated || serverHasMore
  const next_offset = has_more ? offset + kept.length : undefined
  const meta: PageMeta = {
    total,
    count: kept.length,
    offset,
    limit,
    has_more,
    next_offset,
  }
  if (truncated) {
    meta.truncated = true
    meta.truncation_message = `Showing ${kept.length} of ${items.length} returned items (character limit reached). Use offset=${offset + kept.length} or narrow filters.`
  }
  return {
    items: kept,
    meta,
    renderedText: rendered.join('\n'),
  }
}
