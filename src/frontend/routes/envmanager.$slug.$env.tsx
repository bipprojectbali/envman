import { Alert, Box, Code, Paper, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { TbAlertTriangle, TbPlugConnected } from 'react-icons/tb'
import { CompareModal } from '@/frontend/components/env/CompareModal'
import { AddVarPage } from '@/frontend/components/env/AddVarPage'
import { BulkImportPage } from '@/frontend/components/env/BulkImportPage'
import { EditEnvPage } from '@/frontend/components/env/EditEnvPage'
import { IntegrationsPage } from '@/frontend/components/env/IntegrationsPage'
import { SelectionBar } from '@/frontend/components/env/SelectionBar'
import { VarCardMobile } from '@/frontend/components/env/VarCardMobile'
import { VarsEmptyState } from '@/frontend/components/env/VarsEmptyState'
import { VarsPageBreadcrumb } from '@/frontend/components/env/VarsPageBreadcrumb'
import { VarsStats } from '@/frontend/components/env/VarsStats'
import { VarsTableDesktop } from '@/frontend/components/env/VarsTableDesktop'
import { VarsToolbar } from '@/frontend/components/env/VarsToolbar'
import { ImportManagerModal } from '@/frontend/components/env/ImportManagerModal'
import { PortainerSetupInline } from '@/frontend/components/portainer/PortainerSetupInline'
import { useExtensions } from '@/frontend/hooks/useExtensions'
import { apiFetch } from '@/frontend/lib/api'
import { toEnvText } from '@/frontend/lib/env-clipboard'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { EnvVar, FilterType } from '@/frontend/types/env'

interface EnvSearch {
  compare?: boolean
  integrations?: boolean
  portainerSetup?: 'new' | 'edit'
  editEnv?: boolean
  bulk?: boolean
  addVar?: boolean
  importMgr?: boolean
}

const truthy = (v: unknown) => v === true || v === 'true' || v === '1'

export const Route = createFileRoute('/envmanager/$slug/$env')({
  component: VarsPage,
  validateSearch: (search: Record<string, unknown>): EnvSearch => ({
    compare: truthy(search.compare) ? true : undefined,
    integrations: truthy(search.integrations) ? true : undefined,
    portainerSetup:
      search.portainerSetup === 'new' || search.portainerSetup === 'edit'
        ? (search.portainerSetup as 'new' | 'edit')
        : undefined,
    editEnv: truthy(search.editEnv) ? true : undefined,
    bulk: truthy(search.bulk) ? true : undefined,
    addVar: truthy(search.addVar) ? true : undefined,
    importMgr: truthy(search.importMgr) ? true : undefined,
  }),
})

function VarsPage() {
  const { slug, env } = Route.useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const { data: extensions } = useExtensions()
  const portainerEnabled = extensions?.portainer ?? true

  const {
    compare: compareSearch,
    integrations: integrationsSearch,
    portainerSetup: portainerSetupSearch,
    editEnv: editEnvSearch,
    bulk: bulkSearch,
    addVar: addVarSearch,
    importMgr: importMgrSearch,
  } = Route.useSearch()

  // URL-based modal state — reload/share safe
  const importMgrOpen = importMgrSearch === true
  const openImportMgr = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, importMgr: true }), replace: true })
  const closeImportMgr = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, importMgr: undefined }), replace: true })
  const compareOpen = compareSearch === true
  const openCompare = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, compare: true }), replace: true })
  const closeCompare = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, compare: undefined }), replace: true })
  const portainerSetupMode = portainerSetupSearch ?? null
  const openPortainerSetup = (mode: 'new' | 'edit') =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, integrations: true, portainerSetup: mode }), replace: true })
  const closePortainerSetup = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, portainerSetup: undefined }), replace: true })
  const integrationsOpen = integrationsSearch === true
  const openIntegrations = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, integrations: true }), replace: true })
  const closeIntegrations = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, integrations: undefined }), replace: true })
  const editEnvOpen = editEnvSearch === true
  const openEditEnv = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, editEnv: true }), replace: true })
  const closeEditEnv = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, editEnv: undefined }), replace: true })
  const bulkOpen = bulkSearch === true
  const openBulk = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, bulk: true }), replace: true })
  const closeBulk = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, bulk: undefined }), replace: true })
  const addVarOpen = addVarSearch === true
  const openAdd = () =>
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, addVar: true }), replace: true })
  const closeAdd = () => {
    setForm({ key: '', value: '', isSecret: false })
    navigate({ to: '.', params: { slug, env }, search: (prev) => ({ ...prev, addVar: undefined }), replace: true })
  }

  // form + bulk state
  const [form, setForm] = useState({ key: '', value: '', isSecret: false })
  const [bulkText, setBulkText] = useState('')
  const [bulkAllSecret, setBulkAllSecret] = useState(false)
  const [editEnvText, setEditEnvText] = useState('')

  // table state
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
    queryFn: () =>
      apiFetch(
        `/api/envman/projects/${slug}/environments/${env}/vars?limit=${VARS_LIMIT}&offset=${(varsPage - 1) * VARS_LIMIT}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
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

  // mutations
  const addVar = useMutation({
    mutationFn: (body: typeof form) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); closeAdd(); notifyOk('Variabel ditambahkan') },
    onError: (e) => notifyErr(e),
  })
  const deleteVar = (key: string) =>
    modals.openConfirmModal({
      title: 'Hapus variabel',
      children: <Text size="sm">Hapus <Code>{key}</Code>?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars/${key}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); notifyOk(`${key} dihapus`) })
          .catch(notifyErr),
    })
  const updateVar = useMutation({
    mutationFn: ({ key, value, isSecret }: { key: string; value: string; isSecret: boolean }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, { method: 'POST', body: JSON.stringify({ key, value, isSecret }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); setEditingId(null); notifyOk('Variabel diperbarui') },
    onError: (e) => notifyErr(e),
  })
  const toggleDisabled = useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ isDisabled: boolean }>(`/api/envman/projects/${slug}/environments/${env}/vars/${key}/toggle`, { method: 'PATCH' }),
    onMutate: async (key) => {
      await qc.cancelQueries({ queryKey: ['envman', 'vars', slug, env] })
      const previous = qc.getQueryData(['envman', 'vars', slug, env])
      qc.setQueryData(['envman', 'vars', slug, env], (old: any) => ({
        ...old, vars: old?.vars?.map((v: any) => (v.key === key ? { ...v, isDisabled: !v.isDisabled } : v)) ?? [],
      }))
      return { previous }
    },
    onError: (e, _key, context) => { if (context?.previous) qc.setQueryData(['envman', 'vars', slug, env], context.previous); notifyErr(e) },
    onSuccess: (data) => notifyOk(data.isDisabled ? 'Variabel dinonaktifkan' : 'Variabel diaktifkan'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }),
  })
  const clearAll = useMutation({
    mutationFn: () =>
      Promise.all(vars.map((v) => apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars/${v.key}`, { method: 'DELETE' }))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); notifyOk('Semua variabel dihapus') },
    onError: (e) => notifyErr(e),
  })
  const bulkToggleType = useMutation({
    mutationFn: (targetSecret: boolean) =>
      Promise.all(vars.filter((v) => v.isSecret !== targetSecret && v.value !== '***').map((v) =>
        apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, { method: 'POST', body: JSON.stringify({ key: v.key, value: v.value, isSecret: targetSecret }) }),
      )),
    onSuccess: (_: unknown, targetSecret: boolean) => {
      qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] })
      notifyOk(targetSecret ? 'Semua variabel ditandai secret' : 'Semua variabel ditandai plain')
    },
    onError: (e) => notifyErr(e),
  })
  const parsedBulk = useMemo(() => {
    const result: { key: string; value: string }[] = []
    for (const raw of bulkText.split('\n')) {
      const line = raw.trim(); if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('='); if (eq === -1) continue
      const key = line.slice(0, eq).trim(); if (!key) continue
      let value = line.slice(eq + 1)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      result.push({ key, value })
    }
    return result
  }, [bulkText])
  const bulkImport = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, {
        method: 'PUT',
        body: JSON.stringify({ vars: Object.fromEntries(parsedBulk.map(({ key, value }) => [key, value])), secrets: bulkAllSecret ? parsedBulk.map(({ key }) => key) : [] }),
      }),
    onSuccess: (data: { count: number }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); closeBulk(); setBulkText(''); setBulkAllSecret(false)
      notifyOk(`${data.count} variabel berhasil diimpor`)
    },
    onError: (e) => notifyErr(e),
  })
  const parsedEditEnv = useMemo(() => {
    const result: { key: string; value: string }[] = []
    for (const raw of editEnvText.split('\n')) {
      const line = raw.trim(); if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('='); if (eq === -1) continue
      const key = line.slice(0, eq).trim(); if (!key) continue
      let value = line.slice(eq + 1)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      result.push({ key, value })
    }
    return result
  }, [editEnvText])
  const editEnvSave = useMutation({
    mutationFn: () => {
      const secretKeys = vars.filter((v) => v.isSecret).map((v) => v.key)
      return apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, {
        method: 'PUT',
        body: JSON.stringify({ vars: Object.fromEntries(parsedEditEnv.map(({ key, value }) => [key, value])), secrets: secretKeys.filter((k) => parsedEditEnv.some((p) => p.key === k)) }),
      })
    },
    onSuccess: (data: { count: number }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] }); closeEditEnv(); notifyOk(`${data.count} variabel disimpan`)
    },
    onError: (e) => notifyErr(e),
  })
  const openEditEnvModal = () => { setEditEnvText(toEnvText(vars.filter((v) => v.value !== '***'))); openEditEnv() }
  const confirmClearAll = () =>
    modals.openConfirmModal({
      title: 'Hapus semua variabel',
      children: <Text size="sm">Hapus semua <strong>{vars.length} variabel</strong> dari <strong>{slug}:{env}</strong>? Tidak bisa dibatalkan.</Text>,
      labels: { confirm: 'Hapus Semua', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => clearAll.mutate(),
    })
  const confirmBulkToggle = (targetSecret: boolean) =>
    modals.openConfirmModal({
      title: targetSecret ? 'Jadikan semua Secret' : 'Jadikan semua Plain',
      children: <Text size="sm">{targetSecret ? <>Enkripsi <strong>{plainCount} plain var</strong> menjadi secret?</> : <>Dekripsi <strong>{secretCount} secret var</strong> menjadi plain?</>}</Text>,
      labels: { confirm: targetSecret ? 'Jadikan Secret' : 'Jadikan Plain', cancel: 'Batal' },
      confirmProps: { color: targetSecret ? 'red' : 'gray' },
      onConfirm: () => bulkToggleType.mutate(targetSecret),
    })

  // ─── Conditional full-page views ───────────────────────────────────────────
  if (portainerSetupMode && portainerEnabled) {
    return (
      <Paper withBorder p="md" radius="md">
        <PortainerSetupInline slug={slug} env={env} mode={portainerSetupMode} onClose={closePortainerSetup} />
      </Paper>
    )
  }
  if (integrationsOpen && portainerEnabled) {
    return (
      <IntegrationsPage
        slug={slug} env={env} projectName={projectName}
        portainerData={portainerData} historyData={historyData}
        canEdit={canEdit} secretCount={secretCount}
        closeIntegrations={closeIntegrations} openPortainerSetup={openPortainerSetup}
      />
    )
  }
  if (editEnvOpen) {
    return (
      <EditEnvPage
        env={env} slug={slug} secretCount={secretCount}
        editEnvText={editEnvText} setEditEnvText={setEditEnvText}
        parsedEditEnv={parsedEditEnv} closeEditEnv={closeEditEnv}
        editEnvSave={editEnvSave} isMobile={isMobile}
      />
    )
  }
  if (addVarOpen) {
    return (
      <AddVarPage
        env={env} form={form} setForm={setForm}
        addVar={addVar} closeAdd={closeAdd} isMobile={isMobile}
      />
    )
  }
  if (bulkOpen) {
    return (
      <BulkImportPage
        env={env} bulkText={bulkText} setBulkText={setBulkText}
        bulkAllSecret={bulkAllSecret} setBulkAllSecret={setBulkAllSecret}
        parsedBulk={parsedBulk} bulkImport={bulkImport}
        closeBulk={() => { closeBulk(); setBulkText(''); setBulkAllSecret(false) }}
        isMobile={isMobile}
      />
    )
  }

  // ─── Main view ──────────────────────────────────────────────────────────────
  return (
    <Box>
      <VarsPageBreadcrumb
        slug={slug} env={env} isMobile={isMobile}
        onNavToRoot={() => navigate({ to: '/envmanager', search: { create: false, editSlug: undefined } })}
        onNavToProject={() => navigate({ to: '/envmanager/$slug', params: { slug }, search: { tab: 'environments', fileId: undefined, fileNew: false, viewFileId: undefined, aliasId: undefined, aliasNew: false, viewAliasId: undefined, noteId: undefined, noteNew: false, viewNoteId: undefined } })}
        portainerEnabled={portainerEnabled}
        portainerData={portainerData}
        isFetching={isFetching}
        refetch={refetch}
        openIntegrations={openIntegrations}
        encryptionEnabled={encryptionEnabled}
      />

      {!encryptionEnabled && (
        <Alert icon={<TbAlertTriangle size={14} />} color="orange" mb="sm" py="xs">
          <Text size="xs"><strong>MASTER_KEY</strong> belum di-set — secret vars disimpan plaintext.</Text>
        </Alert>
      )}
      {deniedImports.length > 0 && (
        <Alert icon={<TbPlugConnected size={14} />} color="yellow" mb="sm" py="xs">
          <Text size="xs">
            Tidak dapat memuat import dari:{' '}
            {deniedImports.map((d, i) => (<span key={i}>{i > 0 && ', '}<strong>{d.project}:{d.env}</strong></span>))}
          </Text>
        </Alert>
      )}

      <VarsStats
        varCount={vars.length} isMobile={isMobile} plainCount={plainCount}
        secretCount={secretCount} disabledCount={disabledCount}
        filterType={filterType} setFilterType={setFilterType}
        filterDisabled={filterDisabled} setFilterDisabled={setFilterDisabled}
        cliCommand={cliCommand}
      />

      <VarsToolbar
        search={search} setSearch={setSearch} filterType={filterType}
        filterDisabled={filterDisabled} setFilterType={setFilterType}
        setFilterDisabled={setFilterDisabled} sort={sort} setSort={setSort}
        vars={vars} filteredVars={filteredVars} selectedIds={selectedIds}
        copiedAll={copiedAll} setCopiedAll={setCopiedAll}
        copiedSelected={copiedSelected} setCopiedSelected={setCopiedSelected}
        copiedKeys={copiedKeys} setCopiedKeys={setCopiedKeys}
        copyToClipboard={copyToClipboard} canEdit={canEdit} isOwner={isOwner}
        plainCount={plainCount} secretCount={secretCount}
        openCompare={openCompare} openImportMgr={openImportMgr} openBulk={openBulk}
        openAdd={openAdd} openEditEnvModal={openEditEnvModal}
        confirmClearAll={confirmClearAll} confirmBulkToggle={confirmBulkToggle}
      />

      <SelectionBar
        selectedIds={selectedIds} clearSelection={clearSelection}
        copiedSelected={copiedSelected} setCopiedSelected={setCopiedSelected}
        copiedKeys={copiedKeys} setCopiedKeys={setCopiedKeys}
        vars={vars} copyToClipboard={copyToClipboard}
      />

      <VarsEmptyState
        vars={vars} importedRows={importedRows} filteredVars={filteredVars}
        importedDisplay={importedDisplay} canEdit={canEdit}
        setSearch={setSearch} setFilterType={setFilterType} setFilterDisabled={setFilterDisabled}
        openBulk={openBulk} openAdd={openAdd}
      />

      {isMobile ? (
        <VarCardMobile
          filteredVars={filteredVars} importedDisplay={importedDisplay}
          vars={vars} activeCount={activeCount} disabledCount={disabledCount}
          editingId={editingId} editForm={editForm} setEditForm={setEditForm}
          updateVar={updateVar} cancelEdit={cancelEdit}
          selectedIds={selectedIds} toggleSelect={toggleSelect}
          canEdit={canEdit} startEdit={startEdit}
          revealed={revealed} toggleReveal={toggleReveal}
          toggleDisabled={toggleDisabled} deleteVar={deleteVar}
        />
      ) : (
        <VarsTableDesktop
          filteredVars={filteredVars} importedDisplay={importedDisplay}
          vars={vars} varsTotal={varsTotal} activeCount={activeCount}
          disabledCount={disabledCount} varsPage={varsPage}
          setVarsPage={setVarsPage} varsTotalPages={varsTotalPages}
          editingId={editingId} editForm={editForm} setEditForm={setEditForm}
          updateVar={updateVar} cancelEdit={cancelEdit}
          selectedIds={selectedIds} toggleSelect={toggleSelect}
          allFilteredSelected={allFilteredSelected} toggleSelectAll={toggleSelectAll}
          canEdit={canEdit} startEdit={startEdit}
          revealed={revealed} toggleReveal={toggleReveal}
          toggleDisabled={toggleDisabled} deleteVar={deleteVar}
          importedKeySet={importedKeySet}
        />
      )}

      <CompareModal opened={compareOpen} onClose={closeCompare} slug={slug} env={env} canEdit={canEdit} />
      <ImportManagerModal opened={importMgrOpen} onClose={closeImportMgr} slug={slug} env={env} />
    </Box>
  )
}
