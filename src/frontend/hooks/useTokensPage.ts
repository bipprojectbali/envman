import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ProjectOption } from '@/frontend/components/tokens/ScopeSelector'
import type { TokenFormState } from '@/frontend/components/tokens/TokenForm'
import type { ApiToken } from '@/frontend/components/tokens/token-utils'
import { expiryStatus } from '@/frontend/components/tokens/token-utils'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import { useTokenFilters } from './useTokenFilters'
import { useTokenMutations } from './useTokenMutations'

export const emptyForm: TokenFormState = { name: '', canWrite: false, expiresAt: '', scopes: [], tags: [] }

export function useTokensPage(selectedTokenId: string | undefined, isEditing: boolean | undefined) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: sessionData } = useSession()
  const canCreateToken = hasCapability(sessionData?.user, 'token:create')

  // UI state
  const [editingToken, setEditingToken] = useState<ApiToken | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [form, setForm] = useState<TokenFormState>(emptyForm)
  const [editForm, setEditForm] = useState<TokenFormState>(emptyForm)
  const [expandedUsage, setExpandedUsage] = useState<Set<string>>(new Set())

  // Queries
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['envman', 'tokens'],
    queryFn: () => apiFetch('/api/envman/tokens'),
    staleTime: 2 * 60_000,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
  })
  const { data: projectsData } = useQuery({
    queryKey: ['envman', 'projects'],
    queryFn: () => apiFetch('/api/envman/projects'),
  })

  const tokens: ApiToken[] = data?.tokens ?? []
  const projects: ProjectOption[] = (projectsData?.projects ?? []).map((p: Record<string, unknown>) => ({
    slug: p.slug,
    name: p.name,
    environments: p.environments ?? [],
  }))
  const selectedToken = selectedTokenId ? (tokens.find((t) => t.id === selectedTokenId) ?? null) : null

  const activeTokens = tokens.filter((t) => expiryStatus(t.expiresAt) !== 'expired' && !t.isDisabled)
  const expiredTokens = tokens.filter((t) => expiryStatus(t.expiresAt) === 'expired')
  const disabledTokens = tokens.filter((t) => t.isDisabled)

  const { search, setSearch, debouncedSearch, filterStatus, setFilterStatus, filterProjects, setFilterProjects,
    filterTags, setFilterTags, sort, setSort, view, setView, groupByTag, setGroupByTag,
    searchRef, tokensPage, setTokensPage,
    allTags, filteredTokens, tokensTotalPages, paginatedTokens } = useTokenFilters(tokens)

  const { createToken, editToken, toggleToken, copyToken, handleCopyCommand,
    rotateToken, confirmRotate, revokeToken, copiedId, goToList } = useTokenMutations({
    editingToken, qc, setNewToken, setForm, emptyForm, navigate,
  })
  const goToNew = () => navigate({ to: '/envmanager/tokens', search: { token: 'new', edit: undefined } })
  const goToDetail = (id: string) => navigate({ to: '/envmanager/tokens', search: { token: id, edit: undefined } })
  const goToEdit = (id: string) => navigate({ to: '/envmanager/tokens', search: { token: id, edit: true } })

  const hasFilter = debouncedSearch.trim().length > 0 || filterStatus !== 'semua' || filterProjects.length > 0 || filterTags.length > 0
  const resetFilter = () => { setSearch(''); setFilterStatus('semua'); setFilterProjects([]); setFilterTags([]) }
  const toggleExpandedUsage = (id: string) =>
    setExpandedUsage((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  useEffect(() => {
    if (isEditing && selectedToken && editingToken?.id !== selectedToken.id) {
      setEditingToken(selectedToken)
      setEditForm({
        name: selectedToken.name,
        canWrite: selectedToken.canWrite,
        expiresAt: selectedToken.expiresAt ? new Date(selectedToken.expiresAt).toISOString().split('T')[0] : '',
        scopes: selectedToken.scopes,
        tags: selectedToken.tags ?? [],
      })
    }
  }, [isEditing, selectedToken?.id, selectedToken?.expiresAt, selectedToken?.tags, selectedToken?.canWrite, selectedToken, editingToken?.id])

  return {
    // Session
    canCreateToken,
    // Tokens data
    tokens, selectedToken, projects, allTags,
    activeTokens, expiredTokens, disabledTokens,
    filteredTokens, paginatedTokens, tokensTotalPages,
    isLoading, isError, error, refetch,
    // Filter state
    search, setSearch, debouncedSearch, searchRef,
    filterStatus, setFilterStatus, filterProjects, setFilterProjects,
    filterTags, setFilterTags, sort, setSort,
    view, setView, groupByTag, setGroupByTag,
    hasFilter, resetFilter,
    // Pagination
    tokensPage, setTokensPage,
    // UI state
    newToken, setNewToken, editingToken, expandedUsage, copiedId,
    form, setForm, editForm, setEditForm,
    // Mutations
    createToken, editToken, toggleToken, copyToken, rotateToken,
    handleCopyCommand,
    // Helpers
    confirmRotate, revokeToken, toggleExpandedUsage,
    goToList, goToNew, goToDetail, goToEdit,
  }
}
