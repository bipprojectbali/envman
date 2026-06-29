import { useDebouncedValue, useHotkeys, useLocalStorage } from '@mantine/hooks'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { type Gist } from '@/frontend/components/gists/gist-types'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { useGistsInfinite } from '@/frontend/hooks/useGistsInfinite'

export function useGistsPage(gistParam: string | undefined, editParam: boolean | undefined) {
  const navigate = useNavigate()
  const { data: sessionData } = useSession()
  const myUserId = sessionData?.user?.id ?? ''
  const isSuperAdmin = sessionData?.user?.role === 'SUPER_ADMIN'
  const canCreateGist = hasCapability(sessionData?.user, 'gist:create')
  const canManageGist = (gistUserId: string) => gistUserId === myUserId || isSuperAdmin

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useLocalStorage<'all' | 'mine' | 'public' | 'private'>({
    key: 'envman:gists:filter',
    defaultValue: 'all',
  })
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({ key: 'envman:gists:tagFilter', defaultValue: [] })
  const [sort, setSort] = useLocalStorage<'updated' | 'created'>({ key: 'envman:gists:sort', defaultValue: 'updated' })
  const [view, setView] = useLocalStorage<'list' | 'grid'>({ key: 'envman:gists:view', defaultValue: 'list' })
  const [groupByTag, setGroupByTag] = useLocalStorage<boolean>({ key: 'envman:gists:groupByTag', defaultValue: true })
  const [debouncedSearch] = useDebouncedValue(search, 150)
  const searchRef = useRef<HTMLInputElement>(null)

  useHotkeys([['/', () => { searchRef.current?.focus(); searchRef.current?.select() }]])

  const addTagFilter = (tag: string) => setTagFilter((prev) => (prev.includes(tag) ? prev : [...prev, tag]))

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useGistsInfinite()
  const gists: Gist[] = useMemo(() => data?.pages.flatMap((p) => p.gists) ?? [], [data])
  const allTags = useMemo(() => [...new Set(gists.flatMap((g) => g.tags))].sort(), [gists])

  const filtered = useMemo(() => {
    let list = [...gists]
    if (filter === 'mine') list = list.filter((g) => g.user.id === myUserId)
    if (filter === 'public') list = list.filter((g) => g.isPublic)
    if (filter === 'private') list = list.filter((g) => !g.isPublic && g.user.id === myUserId)
    if (tagFilter.length > 0) list = list.filter((g) => tagFilter.every((t) => g.tags.includes(t)))
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q) ||
          g.files.some((f) => f.filename.toLowerCase().includes(q) || f.content.toLowerCase().includes(q)) ||
          g.tags.some((t) => t.includes(q)),
      )
    }
    list.sort((a, b) =>
      sort === 'updated'
        ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    return list
  }, [gists, filter, tagFilter, debouncedSearch, sort, myUserId])

  const goToList = () => navigate({ to: '/envmanager/gists', search: { gist: undefined, edit: undefined } })
  const goToNew = () => navigate({ to: '/envmanager/gists', search: { gist: 'new', edit: undefined } })
  const goToView = (id: string) => navigate({ to: '/envmanager/gists', search: { gist: id, edit: undefined } })
  const goToEdit = (id: string) => navigate({ to: '/envmanager/gists', search: { gist: id, edit: true } })

  const selectedGist = gistParam && gistParam !== 'new' ? gists.find((g) => g.id === gistParam) : undefined

  const mineCount = gists.filter((g) => g.user.id === myUserId).length
  const publicCount = gists.filter((g) => g.isPublic).length
  const privateCount = gists.filter((g) => !g.isPublic && g.user.id === myUserId).length
  const hasFilterActive = debouncedSearch.trim().length > 0 || tagFilter.length > 0 || filter !== 'all'
  const resetFilter = () => { setSearch(''); setTagFilter([]); setFilter('all') }

  return {
    myUserId,
    canCreateGist,
    canManageGist,
    gistParam,
    editParam,
    selectedGist,
    search, setSearch,
    filter, setFilter,
    tagFilter, setTagFilter,
    sort, setSort,
    view, setView,
    groupByTag, setGroupByTag,
    debouncedSearch,
    searchRef,
    addTagFilter,
    data,
    isLoading,
    fetchNextPage, hasNextPage, isFetchingNextPage,
    gists, allTags, filtered,
    mineCount, publicCount, privateCount,
    hasFilterActive, resetFilter,
    goToList, goToNew, goToView, goToEdit,
  }
}
