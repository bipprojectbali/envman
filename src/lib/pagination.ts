export interface PaginationResult {
  limit: number
  offset: number
}

export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit = 50,
  maxLimit = 200,
): PaginationResult {
  const limit = Math.min(Number(query.limit) || defaultLimit, maxLimit)
  const offset = Number(query.offset) || 0
  return { limit, offset }
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  { limit, offset }: PaginationResult,
) {
  return {
    data: items,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  }
}
