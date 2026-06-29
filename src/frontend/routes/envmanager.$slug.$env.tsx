import { Alert, Box, Paper, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { createFileRoute } from '@tanstack/react-router'
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
    <Box>
      <VarsPageBreadcrumb
        slug={slug} env={env} isMobile={isMobile}
        onNavToRoot={navToRoot} onNavToProject={navToProject}
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
