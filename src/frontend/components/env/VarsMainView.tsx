import type { Dispatch, SetStateAction } from 'react'
import { Alert, Box, Text } from '@mantine/core'
import { TbAlertTriangle, TbPlugConnected } from 'react-icons/tb'
import type { EnvVar, FilterType } from '@/frontend/types/env'
import type { EditForm, UpdateVarInput } from './VarCardActions'
import { CompareModal } from './CompareModal'
import { ImportManagerModal } from './ImportManagerModal'
import { SelectionBar } from './SelectionBar'
import { VarCardMobile } from './VarCardMobile'
import { VarsEmptyState } from './VarsEmptyState'
import { VarsPageBreadcrumb } from './VarsPageBreadcrumb'
import { VarsStats } from './VarsStats'
import { VarsTableDesktop } from './VarsTableDesktop'
import { VarsToolbar } from './VarsToolbar'

type SortType = 'key-asc' | 'key-desc' | 'newest' | 'oldest'

interface Props {
  slug: string
  env: string
  isMobile: boolean | undefined
  portainerEnabled: boolean
  portainerData: unknown
  isFetching: boolean
  refetch: () => void
  openIntegrations: () => void
  encryptionEnabled: boolean
  navToRoot: () => void
  navToProject: () => void
  deniedImports: { project: string; env: string }[]
  vars: EnvVar[]
  importedRows: EnvVar[]
  importedKeySet: Set<string>
  importedDisplay: EnvVar[]
  filteredVars: EnvVar[]
  plainCount: number
  secretCount: number
  disabledCount: number
  activeCount: number
  varsTotal: number
  varsPage: number
  setVarsPage: Dispatch<SetStateAction<number>>
  varsTotalPages: number
  filterType: FilterType
  setFilterType: Dispatch<SetStateAction<FilterType>>
  filterDisabled: 'all' | 'active' | 'disabled'
  setFilterDisabled: Dispatch<SetStateAction<'all' | 'active' | 'disabled'>>
  cliCommand: string
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  sort: SortType
  setSort: Dispatch<SetStateAction<SortType>>
  selectedIds: Set<string>
  allFilteredSelected: boolean
  copiedAll: boolean
  setCopiedAll: Dispatch<SetStateAction<boolean>>
  copiedSelected: boolean
  setCopiedSelected: Dispatch<SetStateAction<boolean>>
  copiedKeys: boolean
  setCopiedKeys: Dispatch<SetStateAction<boolean>>
  copyToClipboard: (text: string, setCopied: (v: boolean) => void) => void
  canEdit: boolean
  isOwner: boolean
  openCompare: () => void
  closeCompare: () => void
  compareOpen: boolean
  openImportMgr: () => void
  closeImportMgr: () => void
  importMgrOpen: boolean
  openBulk: () => void
  openAdd: () => void
  openEditEnvModal: () => void
  confirmClearAll: () => void
  confirmBulkToggle: (targetSecret: boolean) => void
  clearSelection: () => void
  toggleSelect: (id: string) => void
  toggleSelectAll: () => void
  editingId: string | null
  editForm: EditForm
  setEditForm: Dispatch<SetStateAction<EditForm>>
  updateVar: { mutate: (input: UpdateVarInput) => void; isPending: boolean; variables?: UpdateVarInput }
  cancelEdit: () => void
  startEdit: (v: EnvVar) => void
  revealed: Set<string>
  toggleReveal: (id: string) => void
  toggleDisabled: { mutate: (key: string) => void; isPending: boolean; variables?: string }
  deleteVar: (key: string) => void
}

export function VarsMainView({
  slug, env, isMobile, portainerEnabled, portainerData, isFetching, refetch,
  openIntegrations, encryptionEnabled, navToRoot, navToProject,
  deniedImports, vars, importedRows, importedKeySet, importedDisplay, filteredVars,
  plainCount, secretCount, disabledCount, activeCount, varsTotal, varsPage, setVarsPage, varsTotalPages,
  filterType, setFilterType, filterDisabled, setFilterDisabled, cliCommand,
  search, setSearch, sort, setSort,
  selectedIds, allFilteredSelected, copiedAll, setCopiedAll, copiedSelected, setCopiedSelected,
  copiedKeys, setCopiedKeys, copyToClipboard, canEdit, isOwner,
  openCompare, closeCompare, compareOpen, openImportMgr, closeImportMgr, importMgrOpen,
  openBulk, openAdd, openEditEnvModal, confirmClearAll, confirmBulkToggle,
  clearSelection, toggleSelect, toggleSelectAll,
  editingId, editForm, setEditForm, updateVar, cancelEdit, startEdit,
  revealed, toggleReveal, toggleDisabled, deleteVar,
}: Props) {
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
