import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import type { EnvVar, FilterType } from '@/frontend/types/env'

export function useVarsPageState(slug: string, env: string, integrationsOpen: boolean) {
  const [form, setForm] = useState({ key: '', value: '', isSecret: false })
  const [bulkText, setBulkText] = useState('')
  const [bulkAllSecret, setBulkAllSecret] = useState(false)
  const [editEnvText, setEditEnvText] = useState('')
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ value: '', isSecret: false })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterDisabled, setFilterDisabled] = useState<'all' | 'active' | 'disabled'>('all')
  const [sort, setSort] = useState<'key-asc' | 'key-desc' | 'newest' | 'oldest'>('key-asc')
  const [varsPage, setVarsPage] = useState(1)
  const VARS_LIMIT = 50
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedSelected, setCopiedSelected] = useState(false)
  const [copiedKeys, setCopiedKeys] = useState(false)

  const { data: projectData } = useQuery({
    queryKey: ['envman', 'project', slug],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}`),
  })
  const { data: statusData } = useQuery({
    queryKey: ['envman', 'status'],
    queryFn: () => apiFetch('/api/envman/status'),
    staleTime: 60000,
  })
  useEffect(() => { setVarsPage(1) }, [])

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['envman', 'vars', slug, env, varsPage, search],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars?limit=${VARS_LIMIT}&offset=${(varsPage - 1) * VARS_LIMIT}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    refetchInterval: 15000,
    placeholderData: keepPreviousData,
  })
  const { data: portainerData } = useQuery({
    queryKey: ['portainer', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`),
    staleTime: 30000,
  })
  const { data: historyData } = useQuery({
    queryKey: ['portainer', 'history', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/history`),
    enabled: integrationsOpen && !!portainerData?.config,
    staleTime: 30000,
  })

  const myRole: string = projectData?.project?.myRole ?? 'VIEWER'
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'
  const isOwner = myRole === 'OWNER'
  const encryptionEnabled: boolean = statusData?.encryptionEnabled ?? false
  const vars: EnvVar[] = data?.vars ?? []
  const importedRows: EnvVar[] = (data?.imported ?? []).map(
    (v: { key: string; value: string; isSecret: boolean; sourceProject: string; sourceEnv: string }, i: number) => ({
      id: `imported:${v.sourceProject}:${v.sourceEnv}:${v.key}:${i}`,
      key: v.key, value: v.value, isSecret: v.isSecret, isDisabled: false,
      updatedAt: new Date(0).toISOString(), imported: true,
      source: { project: v.sourceProject, env: v.sourceEnv },
    }),
  )
  const importedKeySet: Set<string> = new Set(data?.importedKeys ?? [])
  const deniedImports: { project: string; env: string }[] = data?.deniedImports ?? []
  const varsTotal: number = data?.total ?? vars.length
  const varsTotalPages = Math.ceil(varsTotal / VARS_LIMIT)

  const filteredVars = useMemo(() => {
    let list = [...vars]
    if (filterType === 'plain') list = list.filter((v) => !v.isSecret)
    if (filterType === 'secret') list = list.filter((v) => v.isSecret)
    if (filterDisabled === 'active') list = list.filter((v) => !v.isDisabled)
    if (filterDisabled === 'disabled') list = list.filter((v) => v.isDisabled)
    if (sort === 'key-asc') list.sort((a, b) => a.key.localeCompare(b.key))
    if (sort === 'key-desc') list.sort((a, b) => b.key.localeCompare(a.key))
    if (sort === 'newest') list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    if (sort === 'oldest') list.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    return list
  }, [vars, filterType, filterDisabled, sort])

  const importedDisplay: EnvVar[] = (() => {
    let list = importedRows
    if (search) { const q = search.toLowerCase(); list = list.filter((v) => v.key.toLowerCase().includes(q) || v.value.toLowerCase().includes(q)) }
    if (filterType === 'plain') list = list.filter((v) => !v.isSecret)
    if (filterType === 'secret') list = list.filter((v) => v.isSecret)
    if (filterDisabled === 'disabled') list = []
    if (sort === 'key-asc') list = [...list].sort((a, b) => a.key.localeCompare(b.key))
    if (sort === 'key-desc') list = [...list].sort((a, b) => b.key.localeCompare(a.key))
    return list
  })()

  const plainCount = vars.filter((v) => !v.isSecret).length
  const secretCount = vars.filter((v) => v.isSecret).length
  const disabledCount = vars.filter((v) => v.isDisabled).length
  const activeCount = vars.filter((v) => !v.isDisabled).length
  const cliCommand = `envman -e ${slug}:${env} -- bun dev`
  const allFilteredSelected = filteredVars.length > 0 && filteredVars.every((v) => selectedIds.has(v.id))
  const projectName: string = projectData?.project?.name ?? slug

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) =>
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleSelectAll = () =>
    setSelectedIds((prev) => (prev.size === filteredVars.length ? new Set() : new Set(filteredVars.map((v) => v.id))))
  const clearSelection = () => setSelectedIds(new Set())
  const toggleReveal = (id: string) =>
    setRevealed((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const startEdit = (v: EnvVar) => {
    setEditingId(v.id)
    setEditForm({ value: v.isSecret && !revealed.has(v.id) ? '' : v.value, isSecret: v.isSecret })
  }
  const cancelEdit = () => setEditingId(null)

  return {
    form, setForm, bulkText, setBulkText, bulkAllSecret, setBulkAllSecret,
    editEnvText, setEditEnvText, revealed, editingId, setEditingId,
    editForm, setEditForm, selectedIds, search, setSearch,
    filterType, setFilterType, filterDisabled, setFilterDisabled,
    sort, setSort, varsPage, setVarsPage, VARS_LIMIT,
    copiedAll, setCopiedAll, copiedSelected, setCopiedSelected, copiedKeys, setCopiedKeys,
    portainerData, historyData, isFetching, refetch,
    canEdit, isOwner, encryptionEnabled,
    vars, importedRows, importedKeySet, deniedImports, varsTotal, varsTotalPages,
    filteredVars, importedDisplay,
    plainCount, secretCount, disabledCount, activeCount,
    cliCommand, allFilteredSelected, projectName,
    copyToClipboard, toggleSelect, toggleSelectAll, clearSelection,
    toggleReveal, startEdit, cancelEdit,
  }
}
