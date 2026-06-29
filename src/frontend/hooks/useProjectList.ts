import { useDebouncedValue, useHotkeys, useLocalStorage } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export interface Project {
  slug: string
  name: string
  description?: string
  tags: string[]
  isActive: boolean
  createdAt?: string
  myRole: 'OWNER' | 'EDITOR' | 'VIEWER'
  _count: { environments: number }
  members?: { id: string }[]
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

  const [view, setView] = useLocalStorage<'grid' | 'list'>({ key: 'envman:projects:view', defaultValue: 'grid' })
  const [search, setSearch] = useLocalStorage({ key: 'envman:projects:search', defaultValue: '' })
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({ key: 'envman:projects:tagFilter', defaultValue: [] })
  const [sort, setSort] = useLocalStorage<SortKey>({ key: 'envman:projects:sort', defaultValue: 'recent' })
  const [pinned, setPinned] = useLocalStorage<string[]>({ key: 'envman:projects:pinned', defaultValue: [] })
  const [groupByTag, setGroupByTag] = useLocalStorage<boolean>({ key: 'envman:projects:groupByTag', defaultValue: true })
  const [statusFilter, setStatusFilter] = useLocalStorage<'all' | 'active' | 'inactive'>({
    key: 'envman:projects:statusFilter',
    defaultValue: 'all',
  })

  const [debouncedSearch] = useDebouncedValue(search, 150)
  const [page, setPage] = useState(1)
  const searchRef = useRef<HTMLInputElement>(null)

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
    mutationFn: ({ slug, name, description, tags }: { slug: string; name: string; description: string; tags: string[] }) =>
      apiFetch(`/api/envman/projects/${slug}`, { method: 'PATCH', body: JSON.stringify({ name, description, tags }) }),
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

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of projects) for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: `${value} (${count})` }))
  }, [projects])

  const filtered = useMemo(() => {
    let result = projects
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false) ||
          (p.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (tagFilter.length > 0) result = result.filter((p) => tagFilter.every((t) => (p.tags ?? []).includes(t)))
    if (statusFilter === 'active') result = result.filter((p) => p.isActive)
    if (statusFilter === 'inactive') result = result.filter((p) => !p.isActive)
    const sorted = [...result]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'envs') sorted.sort((a, b) => b._count.environments - a._count.environments)
    return sorted
  }, [projects, debouncedSearch, tagFilter, statusFilter, sort])

  const groups = useMemo(() => {
    const sortGroup = (arr: Project[]) =>
      [...arr].sort((a, b) => (pinned.includes(b.slug) ? 1 : 0) - (pinned.includes(a.slug) ? 1 : 0))
    if (statusFilter !== 'all') {
      return [{ key: statusFilter, label: null as string | null, items: sortGroup(filtered) }]
    }
    const pinnedItems = sortGroup(filtered.filter((p) => pinned.includes(p.slug)))
    const activeItems = sortGroup(filtered.filter((p) => !pinned.includes(p.slug) && p.isActive))
    const inactiveItems = sortGroup(filtered.filter((p) => !pinned.includes(p.slug) && !p.isActive))
    return [
      pinnedItems.length > 0 ? { key: 'pinned', label: 'Pinned', items: pinnedItems } : null,
      activeItems.length > 0
        ? { key: 'active', label: pinnedItems.length > 0 || inactiveItems.length > 0 ? 'Aktif' : null, items: activeItems }
        : null,
      inactiveItems.length > 0 ? { key: 'inactive', label: 'Nonaktif', items: inactiveItems } : null,
    ].filter(Boolean) as { key: string; label: string | null; items: Project[] }[]
  }, [filtered, pinned, statusFilter])

  const PAGE_SIZE = 24
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginatedSlugs = useMemo(
    () => new Set(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((p) => p.slug)),
    [filtered, page],
  )
  const paginatedGroups = useMemo(
    () => groups.map((g) => ({ ...g, items: g.items.filter((p) => paginatedSlugs.has(p.slug)) })).filter((g) => g.items.length > 0),
    [groups, paginatedSlugs],
  )

  const ownerCount = projects.filter((p) => p.myRole === 'OWNER').length
  const totalEnvs = projects.reduce((s, p) => s + p._count.environments, 0)
  const hasFilter = debouncedSearch.trim().length > 0 || tagFilter.length > 0 || statusFilter !== 'all'

  const togglePin = (slug: string) =>
    setPinned((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]))
  const addTagFilter = (tag: string) => setTagFilter((prev) => (prev.includes(tag) ? prev : [...prev, tag]))
  const resetFilter = () => { setSearch(''); setTagFilter([]); setStatusFilter('all') }

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
    create, editSlug,
    // Form
    form, setForm, slugManual, setSlugManual,
    // List state
    view, setView, search, setSearch, tagFilter, setTagFilter, sort, setSort,
    pinned, setPinned, groupByTag, setGroupByTag, statusFilter, setStatusFilter,
    page, setPage, searchRef,
    // Query
    projects, isLoading, isError, error, refetch,
    // Mutations
    createProject, editProject, toggleActive,
    // Computed
    allTags, filtered, paginatedGroups, totalPages,
    ownerCount, totalEnvs, hasFilter, canCreateProject,
    // Helpers
    togglePin, addTagFilter, resetFilter,
    openProject, openCreatePage, openEditPage, closeFormPage,
  }
}
