import { Paper } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { createFileRoute } from '@tanstack/react-router'
import { AddVarPage } from '@/frontend/components/env/AddVarPage'
import { BulkImportPage } from '@/frontend/components/env/BulkImportPage'
import { EditEnvPage } from '@/frontend/components/env/EditEnvPage'
import { IntegrationsPage } from '@/frontend/components/env/IntegrationsPage'
import { VarsMainView } from '@/frontend/components/env/VarsMainView'
import { PortainerSetupInline } from '@/frontend/components/portainer/PortainerSetupInline'
import { useExtensions } from '@/frontend/hooks/useExtensions'
import { useVarsMutations } from '@/frontend/hooks/useVarsMutations'
import { useVarsNavigation } from '@/frontend/hooks/useVarsNavigation'
import { useVarsPageState } from '@/frontend/hooks/useVarsPageState'

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
  const isMobile = useMediaQuery('(max-width: 48em)')
  const { data: extensions } = useExtensions()
  const portainerEnabled = extensions?.portainer ?? true

  const {
    compare: compareSearch, integrations: integrationsSearch,
    portainerSetup: portainerSetupSearch, editEnv: editEnvSearch,
    bulk: bulkSearch, addVar: addVarSearch, importMgr: importMgrSearch,
  } = Route.useSearch()

  const importMgrOpen = importMgrSearch === true
  const compareOpen = compareSearch === true
  const portainerSetupMode = portainerSetupSearch ?? null
  const integrationsOpen = integrationsSearch === true
  const editEnvOpen = editEnvSearch === true
  const bulkOpen = bulkSearch === true
  const addVarOpen = addVarSearch === true

  const {
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
    revealAllPlain, toggleRevealAllPlain, showValue,
  } = useVarsPageState(slug, env, integrationsOpen)

  const {
    openImportMgr, closeImportMgr, openCompare, closeCompare,
    openPortainerSetup, closePortainerSetup, openIntegrations, closeIntegrations,
    openEditEnv, closeEditEnv, openBulk, closeBulk, openAdd, closeAdd,
    navToRoot, navToProject,
  } = useVarsNavigation({ slug, env, setForm })

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
    <VarsMainView
      slug={slug} env={env} isMobile={isMobile} portainerEnabled={portainerEnabled}
      portainerData={portainerData} isFetching={isFetching} refetch={refetch}
      openIntegrations={openIntegrations} encryptionEnabled={encryptionEnabled}
      navToRoot={navToRoot} navToProject={navToProject}
      deniedImports={deniedImports} vars={vars} importedRows={importedRows}
      importedKeySet={importedKeySet} importedDisplay={importedDisplay} filteredVars={filteredVars}
      plainCount={plainCount} secretCount={secretCount} disabledCount={disabledCount}
      activeCount={activeCount} varsTotal={varsTotal} varsPage={varsPage}
      setVarsPage={setVarsPage} varsTotalPages={varsTotalPages}
      filterType={filterType} setFilterType={setFilterType}
      filterDisabled={filterDisabled} setFilterDisabled={setFilterDisabled} cliCommand={cliCommand}
      search={search} setSearch={setSearch} sort={sort} setSort={setSort}
      selectedIds={selectedIds} allFilteredSelected={allFilteredSelected}
      copiedAll={copiedAll} setCopiedAll={setCopiedAll}
      copiedSelected={copiedSelected} setCopiedSelected={setCopiedSelected}
      copiedKeys={copiedKeys} setCopiedKeys={setCopiedKeys}
      copyToClipboard={copyToClipboard} canEdit={canEdit} isOwner={isOwner}
      openCompare={openCompare} closeCompare={closeCompare} compareOpen={compareOpen}
      openImportMgr={openImportMgr} closeImportMgr={closeImportMgr} importMgrOpen={importMgrOpen}
      openBulk={openBulk} openAdd={openAdd} openEditEnvModal={openEditEnvModal}
      confirmClearAll={confirmClearAll} confirmBulkToggle={confirmBulkToggle}
      clearSelection={clearSelection} toggleSelect={toggleSelect} toggleSelectAll={toggleSelectAll}
      editingId={editingId} editForm={editForm} setEditForm={setEditForm}
      updateVar={updateVar} cancelEdit={cancelEdit} startEdit={startEdit}
      revealed={revealed} toggleReveal={toggleReveal} showValue={showValue}
      revealAllPlain={revealAllPlain} toggleRevealAllPlain={toggleRevealAllPlain}
      toggleDisabled={toggleDisabled} deleteVar={deleteVar}
    />
  )
}
