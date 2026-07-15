import { ActionIcon, Badge, Group, Menu, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import {
  TbCheck,
  TbCopy,
  TbEye,
  TbEyeOff,
  TbFilter,
  TbGitCompare,
  TbKey,
  TbSearch,
  TbSortAscending,
  TbX,
} from 'react-icons/tb'
import { toEnvText, toKeyTemplate } from '@/frontend/lib/env-clipboard'
import type { EnvVar, FilterType } from '@/frontend/types/env'
import { VarsBulkActions } from './VarsBulkActions'

type SortType = 'key-asc' | 'key-desc' | 'newest' | 'oldest'

interface Props {
  search: string
  setSearch: (v: string) => void
  filterType: FilterType
  filterDisabled: 'all' | 'active' | 'disabled'
  setFilterType: React.Dispatch<React.SetStateAction<FilterType>>
  setFilterDisabled: React.Dispatch<React.SetStateAction<'all' | 'active' | 'disabled'>>
  sort: SortType
  setSort: React.Dispatch<React.SetStateAction<SortType>>
  vars: EnvVar[]
  filteredVars: EnvVar[]
  selectedIds: Set<string>
  copiedAll: boolean
  setCopiedAll: (v: boolean) => void
  copiedSelected: boolean
  setCopiedSelected: (v: boolean) => void
  copiedKeys: boolean
  setCopiedKeys: (v: boolean) => void
  copyToClipboard: (text: string, setCopied: (v: boolean) => void) => void
  canEdit: boolean
  isOwner: boolean
  plainCount: number
  secretCount: number
  revealAllPlain: boolean
  toggleRevealAllPlain: () => void
  openCompare: () => void
  openImportMgr: () => void
  openBulk: () => void
  openAdd: () => void
  openEditEnvModal: () => void
  confirmClearAll: () => void
  confirmBulkToggle: (targetSecret: boolean) => void
}

export function VarsToolbar({
  search,
  setSearch,
  filterType,
  filterDisabled,
  setFilterType,
  setFilterDisabled,
  sort,
  setSort,
  vars,
  filteredVars,
  selectedIds,
  copiedAll,
  setCopiedAll,
  copiedSelected,
  setCopiedSelected,
  copiedKeys,
  setCopiedKeys,
  copyToClipboard,
  canEdit,
  isOwner,
  plainCount,
  secretCount,
  revealAllPlain,
  toggleRevealAllPlain,
  openCompare,
  openImportMgr,
  openBulk,
  openAdd,
  openEditEnvModal,
  confirmClearAll,
  confirmBulkToggle,
}: Props) {
  const hasFilter = search || filterType !== 'all' || filterDisabled !== 'all'

  const resetFilters = () => {
    setSearch('')
    setFilterType('all')
    setFilterDisabled('all')
  }

  return (
    <Stack gap="xs" mb="sm">
      <TextInput
        size="sm"
        placeholder="Cari key atau value..."
        leftSection={<TbSearch size={14} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        maw={540}
        rightSection={
          hasFilter ? (
            <Tooltip label="Reset semua filter">
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={resetFilters}>
                <TbX size={12} />
              </ActionIcon>
            </Tooltip>
          ) : undefined
        }
        rightSectionWidth={hasFilter ? 32 : undefined}
        radius="md"
      />

      <Group justify="space-between" gap="xs" wrap="wrap" align="center">
        {/* View tools */}
        <Group gap={4} wrap="nowrap">
          {hasFilter && (
            <Badge
              size="sm"
              variant="light"
              color="blue"
              leftSection={<TbFilter size={10} />}
              style={{ cursor: 'pointer' }}
              onClick={resetFilters}
            >
              {filteredVars.length}/{vars.length}
            </Badge>
          )}

          {vars.length > 0 && (
            <>
              <Select
                size="sm"
                w={130}
                radius="md"
                leftSection={<TbSortAscending size={13} />}
                value={sort}
                onChange={(v) => setSort((v ?? 'key-asc') as SortType)}
                data={[
                  { label: 'A → Z', value: 'key-asc' },
                  { label: 'Z → A', value: 'key-desc' },
                  { label: 'Terbaru', value: 'newest' },
                  { label: 'Terlama', value: 'oldest' },
                ]}
                allowDeselect={false}
              />

              <Menu shadow="md" width={210} position="bottom-end">
                <Menu.Target>
                  <Tooltip label="Export .env ke clipboard">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color={copiedAll || copiedSelected || copiedKeys ? 'teal' : 'gray'}
                      radius="md"
                    >
                      {copiedAll || copiedSelected || copiedKeys ? <TbCheck size={14} /> : <TbCopy size={14} />}
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Export sebagai .env</Menu.Label>
                  <Menu.Item
                    leftSection={<TbCopy size={14} />}
                    rightSection={
                      <Badge size="xs" variant="light" color="gray">
                        {vars.length}
                      </Badge>
                    }
                    onClick={() => copyToClipboard(toEnvText(vars), setCopiedAll)}
                  >
                    Semua variabel
                  </Menu.Item>
                  {filteredVars.length < vars.length && (
                    <Menu.Item
                      leftSection={<TbFilter size={14} />}
                      rightSection={
                        <Badge size="xs" variant="light" color="blue">
                          {filteredVars.length}
                        </Badge>
                      }
                      onClick={() => copyToClipboard(toEnvText(filteredVars), setCopiedAll)}
                    >
                      Hasil filter
                    </Menu.Item>
                  )}
                  <Menu.Item
                    leftSection={<TbCopy size={14} />}
                    rightSection={
                      <Badge size="xs" variant="light" color={selectedIds.size > 0 ? 'blue' : 'gray'}>
                        {selectedIds.size}
                      </Badge>
                    }
                    disabled={selectedIds.size === 0}
                    onClick={() =>
                      copyToClipboard(toEnvText(vars.filter((v) => selectedIds.has(v.id))), setCopiedSelected)
                    }
                  >
                    Yang dipilih
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Label>Export hanya key (KEY=)</Menu.Label>
                  <Menu.Item
                    leftSection={<TbKey size={14} />}
                    rightSection={
                      <Badge size="xs" variant="light" color="grape">
                        {vars.length}
                      </Badge>
                    }
                    onClick={() => copyToClipboard(toKeyTemplate(vars), setCopiedKeys)}
                  >
                    Semua key
                  </Menu.Item>
                  {filteredVars.length < vars.length && (
                    <Menu.Item
                      leftSection={<TbKey size={14} />}
                      rightSection={
                        <Badge size="xs" variant="light" color="grape">
                          {filteredVars.length}
                        </Badge>
                      }
                      onClick={() => copyToClipboard(toKeyTemplate(filteredVars), setCopiedKeys)}
                    >
                      Key hasil filter
                    </Menu.Item>
                  )}
                  <Menu.Item
                    leftSection={<TbKey size={14} />}
                    rightSection={
                      <Badge size="xs" variant="light" color={selectedIds.size > 0 ? 'grape' : 'gray'}>
                        {selectedIds.size}
                      </Badge>
                    }
                    disabled={selectedIds.size === 0}
                    onClick={() =>
                      copyToClipboard(toKeyTemplate(vars.filter((v) => selectedIds.has(v.id))), setCopiedKeys)
                    }
                  >
                    Key yang dipilih
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>

              <Tooltip label="Bandingkan dengan .env local">
                <ActionIcon size="sm" variant="subtle" color="grape" radius="md" onClick={openCompare}>
                  <TbGitCompare size={14} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label={revealAllPlain ? 'Sembunyikan semua nilai' : 'Tampilkan semua nilai (kecuali secret)'}>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color={revealAllPlain ? 'blue' : 'gray'}
                  radius="md"
                  onClick={toggleRevealAllPlain}
                >
                  {revealAllPlain ? <TbEye size={14} /> : <TbEyeOff size={14} />}
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>

        {/* Write actions */}
        <VarsBulkActions
          canEdit={canEdit}
          isOwner={isOwner}
          vars={vars}
          filteredVars={filteredVars}
          selectedIds={selectedIds}
          plainCount={plainCount}
          secretCount={secretCount}
          openImportMgr={openImportMgr}
          openBulk={openBulk}
          openEditEnvModal={openEditEnvModal}
          openAdd={openAdd}
          confirmClearAll={confirmClearAll}
          confirmBulkToggle={confirmBulkToggle}
        />
      </Group>
    </Stack>
  )
}
