import { useDebouncedValue, useLocalStorage } from '@mantine/hooks'
import { useMemo, useRef, useState } from 'react'
import type { Project } from './useProjectList'
import { SORT_OPTIONS } from './useProjectList'

const PAGE_SIZE = 24

export function useProjectFilters(projects: Project[]) {
  const [view, setView] = useLocalStorage<'grid' | 'list'>({ key: 'envman:projects:view', defaultValue: 'grid' })
  const [search, setSearch] = useLocalStorage({ key: 'envman:projects:search', defaultValue: '' })
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({ key: 'envman:projects:tagFilter', defaultValue: [] })
  const [sort, setSort] = useLocalStorage<(typeof SORT_OPTIONS)[number]['value']>({ key: 'envman:projects:sort', defaultValue: 'recent' })
  const [pinned, setPinned] = useLocalStorage<string[]>({ key: 'envman:projects:pinned', defaultValue: [] })
  const [groupByTag, setGroupByTag] = useLocalStorage<boolean>({ key: 'envman:projects:groupByTag', defaultValue: true })
  const [statusFilter, setStatusFilter] = useLocalStorage<'all' | 'active' | 'inactive'>({
    key: 'envman:projects:statusFilter',
    defaultValue: 'all',
  })

  const [debouncedSearch] = useDebouncedValue(search, 150)
  const [page, setPage] = useState(1)
  const searchRef = useRef<HTMLInputElement>(null)

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

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginatedSlugs = useMemo(
    () => new Set(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((p) => p.slug)),
    [filtered, page],
  )
  const paginatedGroups = useMemo(
    () => groups.map((g) => ({ ...g, items: g.items.filter((p) => paginatedSlugs.has(p.slug)) })).filter((g) => g.items.length > 0),
    [groups, paginatedSlugs],
  )

  const hasFilter = debouncedSearch.trim().length > 0 || tagFilter.length > 0 || statusFilter !== 'all'
  const togglePin = (slug: string) =>
    setPinned((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]))
  const addTagFilter = (tag: string) => setTagFilter((prev) => (prev.includes(tag) ? prev : [...prev, tag]))
  const resetFilter = () => { setSearch(''); setTagFilter([]); setStatusFilter('all') }

  return {
    view, setView, search, setSearch, tagFilter, setTagFilter, sort, setSort,
    pinned, setPinned, groupByTag, setGroupByTag, statusFilter, setStatusFilter,
    page, setPage, searchRef,
    allTags, filtered, paginatedGroups, totalPages, hasFilter,
    togglePin, addTagFilter, resetFilter,
  }
}
