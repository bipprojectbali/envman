import { useDebouncedValue, useLocalStorage } from '@mantine/hooks'
import { useMemo, useRef, useState } from 'react'
import type { ApiToken } from '@/frontend/components/tokens/token-utils'
import { expiryStatus } from '@/frontend/components/tokens/token-utils'

const TOKENS_PER_PAGE = 20

export function useTokenFilters(tokens: ApiToken[]) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useLocalStorage({ key: 'envman:tokens:filterStatus', defaultValue: 'semua' })
  const [filterProjects, setFilterProjects] = useLocalStorage<string[]>({ key: 'envman:tokens:filterProjects', defaultValue: [] })
  const [filterTags, setFilterTags] = useLocalStorage<string[]>({ key: 'envman:tokens:filterTags', defaultValue: [] })
  const [sort, setSort] = useLocalStorage({ key: 'envman:tokens:sort', defaultValue: 'terbaru' })
  const [view, setView] = useLocalStorage<'grid' | 'list'>({ key: 'envman:tokens:view', defaultValue: 'list' })
  const [groupByTag, setGroupByTag] = useLocalStorage<boolean>({ key: 'envman:tokens:groupByTag', defaultValue: false })

  const [debouncedSearch] = useDebouncedValue(search, 150)
  const searchRef = useRef<HTMLInputElement>(null)
  const [tokensPage, setTokensPage] = useState(1)

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of tokens) for (const tag of t.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: `${value} (${count})` }))
  }, [tokens])

  const filteredTokens = useMemo(() => {
    let list = [...tokens]
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.scopes.some((s) => s.toLowerCase().includes(q)))
    }
    if (filterStatus === 'aktif') list = list.filter((t) => !t.isDisabled && expiryStatus(t.expiresAt) !== 'expired')
    if (filterStatus === 'expired') list = list.filter((t) => expiryStatus(t.expiresAt) === 'expired')
    if (filterStatus === 'disabled') list = list.filter((t) => t.isDisabled)
    if (filterProjects.length > 0) {
      list = list.filter((t) =>
        t.scopes.length === 0 ? false : filterProjects.some((slug) => t.scopes.some((s) => s === `${slug}:*` || s.startsWith(`${slug}:`))),
      )
    }
    if (filterTags.length > 0) list = list.filter((t) => filterTags.some((tag) => (t.tags ?? []).includes(tag)))
    if (sort === 'nama') list.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'terlama') list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (sort === 'last_used') list.sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
    return list
  }, [tokens, debouncedSearch, filterStatus, filterProjects, filterTags, sort])

  const tokensTotalPages = Math.ceil(filteredTokens.length / TOKENS_PER_PAGE)
  const paginatedTokens = filteredTokens.slice((tokensPage - 1) * TOKENS_PER_PAGE, tokensPage * TOKENS_PER_PAGE)

  return {
    search, setSearch, debouncedSearch, filterStatus, setFilterStatus,
    filterProjects, setFilterProjects, filterTags, setFilterTags,
    sort, setSort, view, setView, groupByTag, setGroupByTag,
    searchRef, tokensPage, setTokensPage,
    allTags, filteredTokens, tokensTotalPages, paginatedTokens,
  }
}
