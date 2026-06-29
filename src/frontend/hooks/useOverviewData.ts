import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/frontend/lib/api'

export function useOverviewData() {
  const {
    data: projectsData,
    isLoading: loadingProjects,
    isError: errorProjects,
    refetch: refetchProjects,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['envman', 'projects'],
    queryFn: () => apiFetch('/api/envman/projects'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  const { data: tokensData, isLoading: loadingTokens } = useQuery({
    queryKey: ['envman', 'tokens'],
    queryFn: () => apiFetch('/api/envman/tokens'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  const { data: connectionsData, isLoading: loadingConnections } = useQuery({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  const { data: gistsData, isLoading: loadingGists } = useQuery({
    queryKey: ['envman', 'gists'],
    queryFn: () => apiFetch('/api/envman/gists'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  const projects = projectsData?.projects ?? []
  const tokens = tokensData?.tokens ?? []
  const connections = connectionsData?.connections ?? []
  const gists: any[] = gistsData?.gists ?? []

  const totalEnvs = projects.reduce((s: number, p: any) => s + (p._count?.environments ?? 0), 0)
  const totalVars = projects.reduce((s: number, p: any) => s + (p._count?.vars ?? 0), 0)
  const activeTokens = tokens.filter((t: any) => { if (t.isDisabled) return false; if (!t.expiresAt) return true; return new Date(t.expiresAt) > new Date() })
  const secretVarCount = projects.reduce((s: number, p: any) => s + (p._count?.secrets ?? 0), 0)
  const publicGists = gists.filter((g: any) => g.isPublic)

  const recentProjects = [...projects].slice(0, 5)
  const recentTokens = [...tokens].filter((t: any) => t.lastUsedAt).sort((a: any, b: any) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()).slice(0, 3)
  const recentGists = [...gists].sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 4)
  const isLoading = loadingProjects || loadingTokens || loadingConnections || loadingGists

  return {
    projects, tokens, connections, gists,
    totalEnvs, totalVars, activeTokens, secretVarCount, publicGists,
    recentProjects, recentTokens, recentGists, isLoading,
    loadingProjects, loadingTokens, loadingConnections, loadingGists,
    errorProjects, refetchProjects, dataUpdatedAt,
  }
}
