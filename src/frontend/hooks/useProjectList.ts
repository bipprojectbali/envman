import { useHotkeys } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { useProjectFilters } from './useProjectFilters'

export interface Project {
  slug: string
  name: string
  description?: string
  tags: string[]
  isActive: boolean
  icon?: string | null
  color?: string | null
  cardColor?: string | null
  createdAt?: string
  createdById?: string | null
  createdBy?: { id: string; name: string; email: string; image?: string | null } | null
  myRole: 'OWNER' | 'EDITOR' | 'VIEWER'
  _count: { environments: number }
  members?: { id: string }[]
}

export interface ProjectCreator {
  id: string
  name: string
}

type SortKey = 'recent' | 'name' | 'envs'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Terbaru' },
  { value: 'name', label: 'Nama A→Z' },
  { value: 'envs', label: 'Env terbanyak' },
]

export function useProjectList() {
  const navigate = useNavigate()
  const { create, editSlug } = useSearch({ from: '/envmanager/' })
  const qc = useQueryClient()
  const { data: sessionData } = useSession()
  const canCreateProject = hasCapability(sessionData?.user, 'project:create')

  const [form, setForm] = useState({ slug: '', name: '', description: '', tags: [] as string[] })
  const [slugManual, setSlugManual] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['envman', 'projects'],
    queryFn: () => apiFetch('/api/envman/projects'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  const createProject = useMutation({
    mutationFn: (body: typeof form) => apiFetch('/api/envman/projects', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['envman', 'projects'] })
      setForm({ slug: '', name: '', description: '', tags: [] })
      setSlugManual(false)
      notifyOk('Project berhasil dibuat')
      navigate({
        to: '/envmanager/$slug',
        params: { slug: res.project.slug },
        search: {
          tab: 'environments',
          fileId: undefined,
          fileNew: false,
          viewFileId: undefined,
          aliasId: undefined,
          aliasNew: false,
          viewAliasId: undefined,
          noteId: undefined,
          noteNew: false,
          viewNoteId: undefined,
        },
      })
    },
    onError: (e) => notifyErr(e),
  })

  const editProject = useMutation({
    mutationFn: ({
      slug,
      name,
      description,
      tags,
      icon,
      color,
      cardColor,
    }: {
      slug: string
      name: string
      description: string
      tags: string[]
      icon?: string | null
      color?: string | null
      cardColor?: string | null
    }) =>
      apiFetch(`/api/envman/projects/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description, tags, icon, color, cardColor }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'projects'] })
      notifyOk('Project diperbarui')
      navigate({ to: '.', search: { create: false, editSlug: undefined } })
    },
    onError: (e) => notifyErr(e),
  })

  const toggleActive = useMutation({
    mutationFn: ({ slug, isActive }: { slug: string; isActive: boolean }) =>
      apiFetch(`/api/envman/projects/${slug}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: (_, { isActive }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'projects'] })
      notifyOk(isActive ? 'Project diaktifkan' : 'Project dinonaktifkan')
    },
    onError: (e) => notifyErr(e),
  })

  const projects: Project[] = data?.projects ?? []
  const currentUserId = sessionData?.user?.id
  const isSuperAdmin = sessionData?.user?.role === 'SUPER_ADMIN'

  const filters = useProjectFilters(projects, currentUserId)
  const {
    view,
    setView,
    search,
    setSearch,
    tagFilter,
    setTagFilter,
    sort,
    setSort,
    pinned,
    setPinned,
    groupByTag,
    setGroupByTag,
    statusFilter,
    setStatusFilter,
    creatorScope,
    setCreatorScope,
    allCreators,
    page,
    setPage,
    searchRef,
    allTags,
    filtered,
    paginatedGroups,
    totalPages,
    hasFilter,
    togglePin,
    addTagFilter,
    resetFilter,
  } = filters

  useHotkeys([
    [
      '/',
      () => {
        searchRef.current?.focus()
        searchRef.current?.select()
      },
    ],
  ])
  useEffect(() => setPage(1), [])

  const ownerCount = projects.filter((p) => p.myRole === 'OWNER').length
  const totalEnvs = projects.reduce((s, p) => s + p._count.environments, 0)

  const openProject = (slug: string) =>
    navigate({
      to: '/envmanager/$slug',
      params: { slug },
      search: {
        tab: 'environments',
        fileId: undefined,
        fileNew: false,
        viewFileId: undefined,
        aliasId: undefined,
        aliasNew: false,
        viewAliasId: undefined,
        noteId: undefined,
        noteNew: false,
        viewNoteId: undefined,
      },
    })

  const openCreatePage = () => navigate({ to: '.', search: { create: true, editSlug: undefined } })
  const openEditPage = (slug: string) => navigate({ to: '.', search: { create: false, editSlug: slug } })
  const closeFormPage = () => {
    setForm({ slug: '', name: '', description: '', tags: [] })
    setSlugManual(false)
    navigate({ to: '.', search: { create: false, editSlug: undefined } })
  }

  return {
    // Route search
    create,
    editSlug,
    // Form
    form,
    setForm,
    slugManual,
    setSlugManual,
    // List state
    view,
    setView,
    search,
    setSearch,
    tagFilter,
    setTagFilter,
    sort,
    setSort,
    pinned,
    setPinned,
    groupByTag,
    setGroupByTag,
    statusFilter,
    setStatusFilter,
    creatorScope,
    setCreatorScope,
    allCreators,
    isSuperAdmin,
    currentUserId,
    page,
    setPage,
    searchRef,
    // Query
    projects,
    isLoading,
    isError,
    error,
    refetch,
    // Mutations
    createProject,
    editProject,
    toggleActive,
    // Computed
    allTags,
    filtered,
    paginatedGroups,
    totalPages,
    ownerCount,
    totalEnvs,
    hasFilter,
    canCreateProject,
    // Helpers
    togglePin,
    addTagFilter,
    resetFilter,
    openProject,
    openCreatePage,
    openEditPage,
    closeFormPage,
  }
}
