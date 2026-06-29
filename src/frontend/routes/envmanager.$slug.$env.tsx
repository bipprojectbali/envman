import { Alert, Box, Paper, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
import { useVarsMutations } from '@/frontend/hooks/useVarsMutations'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr } from '@/frontend/lib/notify'
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

  const importMgrOpen = importMgrSearch === true
  const openImportMgr = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, importMgr: true }), replace: true })
  const closeImportMgr = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, importMgr: undefined }), replace: true })
  const compareOpen = compareSearch === true
  const openCompare = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, compare: true }), replace: true })
  const closeCompare = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, compare: undefined }), replace: true })
  const portainerSetupMode = portainerSetupSearch ?? null
  const openPortainerSetup = (mode: 'new' | 'edit') =>
    navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, integrations: true, portainerSetup: mode }), replace: true })
  const closePortainerSetup = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, portainerSetup: undefined }), replace: true })
  const integrationsOpen = integrationsSearch === true
  const openIntegrations = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, integrations: true }), replace: true })
  const closeIntegrations = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, integrations: undefined }), replace: true })
  const editEnvOpen = editEnvSearch === true
  const openEditEnv = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, editEnv: true }), replace: true })
  const closeEditEnv = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, editEnv: undefined }), replace: true })
  const bulkOpen = bulkSearch === true
  const openBulk = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, bulk: true }), replace: true })
  const closeBulk = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, bulk: undefined }), replace: true })
  const addVarOpen = addVarSearch === true
  const openAdd = () => navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, addVar: true }), replace: true })
  const closeAdd = () => { setForm({ key: '', value: '', isSecret: false }); navigate({ to: '.', params: { slug, env }, search: (p) => ({ ...p, addVar: undefined }), replace: true }) }

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

  const { data: projectData } = useQuery({ queryKey: ['envman', 'project', slug], queryFn: () => apiFetch(`/api/envman/projects/${slug}`) })
  const { data: statusData } = useQuery({ queryKey: ['envman', 'status'], queryFn: () => apiFetch('/api/envman/status'), staleTime: 60000 })
  useEffect(() => { setVarsPage(1) }, [])

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['envman', 'vars', slug, env, varsPage, search],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars?limit=${VARS_LIMIT}&offset=${(varsPage - 1) * VARS_LIMIT}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    refetchInterval: 15000,
    placeholderData: keepPreviousData,
  })
  const { data: portainerData } = useQuery({ queryKey: ['portainer', slug, env], queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer`), staleTime: 30000 })
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

  const {
    parsedBulk, parsedEditEnv, addVar, deleteVar, updateVar, toggleDisabled,
    bulkImport, editEnvSave, openEditEnvModal, confirmClearAll, confirmBulkToggle,
  } = useVarsMutations({
    slug, env, vars, revealed, bulkText, editEnvText, bulkAllSecret,
    plainCount, secretCount,
    setBulkText, setBulkAllSecret,
    closeAdd, closeBulk, closeEditEnv, openEditEnv, setEditEnvText, setEditingId,
  })

  // ─── Conditional full-page views ───────────────────────────────────────────────
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
    return <AddVarPage env={env} form={form} setForm={setForm} addVar={addVar} closeAdd={closeAdd} isMobile={isMobile} />
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

  // ─── Main view ──────────────────────────────────────────────────────────────────
  return (
    <Box>
      <VarsPageBreadcrumb
        slug={slug} env={env} isMobile={isMobile}
        onNavToRoot={() => navigate({ to: '/envmanager', search: { create: false, editSlug: undefined } })}
        onNavToProject={() => navigate({ to: '/envmanager/$slug', params: { slug }, search: { tab: 'environments', fileId: undefined, fileNew: false, viewFileId: undefined, aliasId: undefined, aliasNew: false, viewAliasId: undefined, noteId: undefined, noteNew: false, viewNoteId: undefined } })}
        portainerEnabled={portainerEnabled} portainerData={portainerData}
        isFetching={isFetching} refetch={refetch}
        openIntegrations={openIntegrations} encryptionEnabled={encryptionEnabled}
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
