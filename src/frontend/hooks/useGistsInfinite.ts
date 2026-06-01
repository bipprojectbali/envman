import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '@/frontend/lib/api'

interface GistFile {
  filename: string
  content: string
  language: string
}
interface Gist {
  id: string
  title: string
  description: string
  files: GistFile[]
  isPublic: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
  user: { id: string; name: string }
}
interface GistsPage {
  gists: Gist[]
  nextCursor?: string
  total: number
}

const LIMIT = 20

export function useGistsInfinite() {
  return useInfiniteQuery<GistsPage>({
    queryKey: ['envman', 'gists', 'infinite'],
    queryFn: ({ pageParam }) =>
      apiFetch<GistsPage>(`/api/envman/gists?limit=${LIMIT}${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })
}

export type { Gist, GistFile }
