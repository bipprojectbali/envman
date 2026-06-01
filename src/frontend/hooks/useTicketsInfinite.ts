import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '@/frontend/lib/api'

interface Ticket {
  id: string
  title: string
  description: string
  status: string
  priority: string
  route: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  reporter: { id: string; name: string; email: string; role: string }
  assignee: { id: string; name: string; email: string; role: string } | null
  _count: { comments: number; evidence: number }
}
interface TicketsPage {
  tickets: Ticket[]
  nextCursor?: string
  hasMore: boolean
}

const LIMIT = 50

interface TicketFilters {
  status?: string
  priority?: string
  assigneeId?: string
  reporterId?: string
  mine?: boolean
}

export function useTicketsInfinite(filters: TicketFilters = {}) {
  const params = new URLSearchParams({ limit: String(LIMIT) })
  if (filters.status) params.set('status', filters.status)
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId)
  if (filters.reporterId) params.set('reporterId', filters.reporterId)
  if (filters.mine) params.set('mine', '1')

  return useInfiniteQuery<TicketsPage>({
    queryKey: ['tickets', 'infinite', filters],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(params)
      if (pageParam) p.set('cursor', pageParam as string)
      return apiFetch<TicketsPage>(`/api/tickets?${p}`)
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

export type { Ticket }
