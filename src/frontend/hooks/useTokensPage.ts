import { useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { createElement, useEffect, useMemo, useState } from 'react'
import { TbRefresh, TbTrash } from 'react-icons/tb'
import type { ProjectOption } from '@/frontend/components/tokens/ScopeSelector'
import type { TokenFormState } from '@/frontend/components/tokens/TokenForm'
import { RevokeTokenConfirm } from '@/frontend/components/tokens/RevokeTokenConfirm'
import type { ApiToken } from '@/frontend/components/tokens/token-utils'
import { expiryStatus } from '@/frontend/components/tokens/token-utils'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { useTokenFilters } from './useTokenFilters'

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
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revealedValue, setRevealedValue] = useState<{ id: string; token: string } | null>(null)

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

  // Mutations
  const createToken = useMutation({
    mutationFn: (body: TokenFormState) =>
      apiFetch('/api/envman/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: body.name, canWrite: body.canWrite, expiresAt: body.expiresAt || undefined, scopes: body.scopes, tags: body.tags }),
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      setNewToken(d.token)
      setForm(emptyForm)
      goToList()
      notifyOk('Token berhasil dibuat — salin nilainya sekarang!')
    },
    onError: (e) => notifyErr(e),
  })

  const editToken = useMutation({
    mutationFn: (body: TokenFormState) =>
      apiFetch(`/api/envman/tokens/${editingToken!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: body.name, canWrite: body.canWrite, expiresAt: body.expiresAt || null, scopes: body.scopes, tags: body.tags }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      navigate({ to: '/envmanager/tokens', search: { token: editingToken!.id, edit: undefined } })
      notifyOk('Token diperbarui')
    },
    onError: (e) => notifyErr(e),
  })

  const toggleToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: (d: { isDisabled: boolean }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      notifyOk(d.isDisabled ? 'Token dinonaktifkan' : 'Token diaktifkan')
    },
    onError: (e) => notifyErr(e),
  })

  const copyToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/reveal`),
    onSuccess: async (d: { token: string }, id) => {
      try {
        await navigator.clipboard.writeText(d.token)
        setCopiedId(id)
        setRevealedValue({ id, token: d.token })
        notifyOk('Token disalin ke clipboard')
        setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500)
      } catch {
        notifyErr(new Error('Gagal akses clipboard — coba browser modern atau HTTPS'))
      }
    },
    onError: (e) => notifyErr(e),
  })

  const handleCopyCommand = async (tokenId: string, cmdTemplate: string) => {
    try {
      let tokenVal: string
      if (revealedValue?.id === tokenId) {
        tokenVal = revealedValue.token
      } else {
        const d: { token: string } = await apiFetch(`/api/envman/tokens/${tokenId}/reveal`)
        tokenVal = d.token
        setRevealedValue({ id: tokenId, token: tokenVal })
        setCopiedId(tokenId)
        setTimeout(() => setCopiedId((prev) => (prev === tokenId ? null : prev)), 1500)
      }
      await navigator.clipboard.writeText(cmdTemplate.replace(/\[TOKEN\]/g, tokenVal))
      notifyOk('Command disalin ke clipboard')
    } catch {
      notifyErr(new Error('Gagal akses clipboard — coba browser modern atau HTTPS'))
    }
  }

  const rotateToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/rotate`, { method: 'POST' }),
    onSuccess: (d: { token: string }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      setNewToken(d.token)
      notifyOk('Token di-rotate — salin nilai baru sekarang!')
    },
    onError: (e) => notifyErr(e),
  })

  const confirmRotate = (id: string, name: string) => {
    modals.openConfirmModal({
      title: createElement('span', { style: { fontWeight: 600 } }, 'Rotate token'),
      children: `Token "${name}" akan diganti dengan nilai baru. Nilai lama langsung invalid.`,
      labels: { confirm: 'Rotate token', cancel: 'Batal' },
      confirmProps: { color: 'yellow', leftSection: createElement(TbRefresh, { size: 13 }) },
      onConfirm: () => rotateToken.mutate(id),
    })
  }

  const revokeToken = (id: string, name: string) => {
    const modalId = `revoke-token-${id}`
    modals.open({
      modalId,
      title: 'Revoke token',
      children: createElement(RevokeTokenConfirm, {
        name,
        onCancel: () => modals.close(modalId),
        onConfirm: async () => {
          await apiFetch(`/api/envman/tokens/${id}`, { method: 'DELETE' })
          qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
          notifyOk(`Token "${name}" direvoke`)
          modals.close(modalId)
        },
      }),
    })
  }

  const goToList = () => navigate({ to: '/envmanager/tokens', search: { token: undefined, edit: undefined } })
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
