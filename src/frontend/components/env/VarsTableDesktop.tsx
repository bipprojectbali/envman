import {
  ActionIcon,
  Badge,
  Box,
  Code,
  CopyButton,
  Group,
  Pagination,
  Table,
  Text,
  Tooltip,
} from '@mantine/core'
import {
  TbCheck,
  TbCopy,
  TbEye,
  TbEyeOff,
  TbLink,
  TbLock,
  TbSquare,
  TbSquareCheckFilled,
} from 'react-icons/tb'
import { toEnvLine } from '@/frontend/lib/env-clipboard'
import { type EnvVar, relTime } from '@/frontend/types/env'
import { VarActionButtons, VarEditRow } from './VarRowActions'

interface EditForm {
  value: string
  isSecret: boolean
}

interface UpdateVarInput {
  key: string
  value: string
  isSecret: boolean
}

interface Props {
  filteredVars: EnvVar[]
  importedDisplay: EnvVar[]
  vars: EnvVar[]
  varsTotal: number
  activeCount: number
  disabledCount: number
  varsPage: number
  setVarsPage: (page: number) => void
  varsTotalPages: number
  editingId: string | null
  editForm: EditForm
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>
  updateVar: { mutate: (input: UpdateVarInput) => void; isPending: boolean; variables?: UpdateVarInput }
  cancelEdit: () => void
  selectedIds: Set<string>
  toggleSelect: (id: string) => void
  allFilteredSelected: boolean
  toggleSelectAll: () => void
  canEdit: boolean
  startEdit: (v: EnvVar) => void
  revealed: Set<string>
  toggleReveal: (id: string) => void
  toggleDisabled: { mutate: (key: string) => void; isPending: boolean; variables?: string }
  deleteVar: (key: string) => void
  importedKeySet: Set<string>
}

export function VarsTableDesktop({
  filteredVars, importedDisplay, vars, varsTotal, activeCount, disabledCount,
  varsPage, setVarsPage, varsTotalPages, editingId, editForm, setEditForm,
  updateVar, cancelEdit, selectedIds, toggleSelect, allFilteredSelected, toggleSelectAll,
  canEdit, startEdit, revealed, toggleReveal, toggleDisabled, deleteVar, importedKeySet,
}: Props) {
  const thStyle = { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--mantine-color-dimmed)' }

  return (
    <Box style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
      <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm">
        <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
          <Table.Tr>
            <Table.Th w={36}>
              <Tooltip label={allFilteredSelected ? 'Batalkan semua' : 'Pilih semua'}>
                <ActionIcon size="xs" variant="subtle" color={allFilteredSelected ? 'blue' : 'gray'} onClick={toggleSelectAll}>
                  {allFilteredSelected ? <TbSquareCheckFilled size={14} /> : <TbSquare size={14} />}
                </ActionIcon>
              </Tooltip>
            </Table.Th>
            <Table.Th w={260} style={thStyle}>Key</Table.Th>
            <Table.Th style={thStyle}>Value</Table.Th>
            <Table.Th w={90} style={thStyle}>Diperbarui</Table.Th>
            <Table.Th w={canEdit ? 130 : 50} style={thStyle}>Aksi</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filteredVars.map((v) => {
            if (editingId === v.id) {
              return <VarEditRow key={v.id} v={v} editForm={editForm} setEditForm={setEditForm} updateVar={updateVar} cancelEdit={cancelEdit} />
            }

            return (
              <Table.Tr key={v.id} style={{ opacity: v.isDisabled ? 0.45 : 1, background: selectedIds.has(v.id) ? 'var(--mantine-color-blue-light)' : undefined, transition: 'opacity 0.15s' }}>
                <Table.Td>
                  <ActionIcon size="xs" variant="subtle" color={selectedIds.has(v.id) ? 'blue' : 'gray'} onClick={() => toggleSelect(v.id)}>
                    {selectedIds.has(v.id) ? <TbSquareCheckFilled size={14} /> : <TbSquare size={14} />}
                  </ActionIcon>
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <Code fz="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>{v.key}</Code>
                    {v.isDisabled && <Badge size="xs" variant="dot" color="orange" style={{ flexShrink: 0 }}>off</Badge>}
                    {importedKeySet.has(v.key) && (
                      <Tooltip label="Menimpa var dengan key sama dari env import" position="top">
                        <Badge size="xs" variant="outline" color="grape" style={{ flexShrink: 0 }}>overrides</Badge>
                      </Tooltip>
                    )}
                    {canEdit ? (
                      <Tooltip label={v.isSecret ? 'Klik → plain' : 'Klik → secret'} position="right">
                        <Badge size="xs" color={v.isSecret ? 'red' : 'gray'} variant={v.isSecret ? 'light' : 'outline'} leftSection={v.isSecret ? <TbLock size={9} /> : undefined}
                          style={{ cursor: v.value === '***' ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                          onClick={() => { if (v.value === '***') return; updateVar.mutate({ key: v.key, value: v.value, isSecret: !v.isSecret }) }}>
                          {updateVar.isPending && updateVar.variables?.key === v.key ? '…' : v.isSecret ? 'secret' : 'plain'}
                        </Badge>
                      </Tooltip>
                    ) : v.isSecret ? (
                      <Badge size="xs" color="red" variant="light" leftSection={<TbLock size={9} />}>secret</Badge>
                    ) : null}
                  </Group>
                </Table.Td>
                <Table.Td onDoubleClick={canEdit ? () => startEdit(v) : undefined} title={canEdit ? 'Double-click untuk edit' : undefined} style={{ cursor: canEdit ? 'pointer' : undefined }}>
                  <Group gap="xs" wrap="nowrap">
                    {v.isSecret ? (
                      <>
                        <Text fz="xs" ff="monospace" c={revealed.has(v.id) ? undefined : 'dimmed'} style={{ letterSpacing: revealed.has(v.id) ? undefined : 3, userSelect: revealed.has(v.id) ? undefined : 'none' }}>
                          {revealed.has(v.id) ? v.value : '••••••••••'}
                        </Text>
                        <Tooltip label={revealed.has(v.id) ? 'Sembunyikan' : 'Tampilkan'}>
                          <ActionIcon size="xs" variant="subtle" color={revealed.has(v.id) ? 'blue' : 'gray'} onClick={() => toggleReveal(v.id)} onDoubleClick={(e) => e.stopPropagation()}>
                            {revealed.has(v.id) ? <TbEyeOff size={12} /> : <TbEye size={12} />}
                          </ActionIcon>
                        </Tooltip>
                      </>
                    ) : (
                      <Text fz="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                        {v.value || <Text span c="dimmed" fz="xs" fs="italic">(kosong)</Text>}
                      </Text>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Tooltip label={new Date(v.updatedAt).toLocaleString('id-ID')} position="left">
                    <Text fz={10} c="dimmed" style={{ whiteSpace: 'nowrap', cursor: 'default' }}>{relTime(v.updatedAt)}</Text>
                  </Tooltip>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <CopyButton value={toEnvLine(v)}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Tersalin!' : 'Copy KEY=value'}>
                          <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                            {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    <VarActionButtons v={v} canEdit={canEdit} toggleDisabled={toggleDisabled} startEdit={startEdit} deleteVar={deleteVar} />
                  </Group>
                </Table.Td>
              </Table.Tr>
            )
          })}

          {importedDisplay.map((v) => (
            <Table.Tr key={v.id} style={{ background: 'var(--mantine-color-grape-light)' }}>
              <Table.Td />
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Code fz="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>{v.key}</Code>
                  <Tooltip label={`Di-import live dari ${v.source?.project}:${v.source?.env}`} position="right">
                    <Badge size="xs" variant="light" color="grape" leftSection={<TbLink size={9} />} style={{ flexShrink: 0 }}>
                      from {v.source?.project}:{v.source?.env}
                    </Badge>
                  </Tooltip>
                  {v.isSecret && <Badge size="xs" color="red" variant="light" leftSection={<TbLock size={9} />}>secret</Badge>}
                </Group>
              </Table.Td>
              <Table.Td>
                {v.isSecret ? (
                  <Group gap="xs" wrap="nowrap">
                    <Text fz="xs" ff="monospace" c={revealed.has(v.id) ? undefined : 'dimmed'} style={{ letterSpacing: revealed.has(v.id) ? undefined : 3, userSelect: revealed.has(v.id) ? undefined : 'none' }}>
                      {revealed.has(v.id) ? v.value : '••••••••••'}
                    </Text>
                    {v.value !== '***' && (
                      <Tooltip label={revealed.has(v.id) ? 'Sembunyikan' : 'Tampilkan'}>
                        <ActionIcon size="xs" variant="subtle" color={revealed.has(v.id) ? 'blue' : 'gray'} onClick={() => toggleReveal(v.id)}>
                          {revealed.has(v.id) ? <TbEyeOff size={12} /> : <TbEye size={12} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                ) : (
                  <Text fz="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                    {v.value || <Text span c="dimmed" fz="xs" fs="italic">(kosong)</Text>}
                  </Text>
                )}
              </Table.Td>
              <Table.Td><Text fz={10} c="dimmed" style={{ whiteSpace: 'nowrap' }}>—</Text></Table.Td>
              <Table.Td>
                <CopyButton value={toEnvLine(v)}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Tersalin!' : 'Copy KEY=value'}>
                      <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                        {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {filteredVars.length > 0 && (
        <Box px="sm" py={6} style={{ borderTop: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-default-hover)' }}>
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="xs" c="dimmed">
              <strong>{varsTotal}</strong> variabel total
              {activeCount < vars.length && <> · <strong>{activeCount}</strong> aktif · <strong>{disabledCount}</strong> disabled</>}
            </Text>
            {varsTotalPages > 1 && <Pagination value={varsPage} onChange={setVarsPage} total={varsTotalPages} size="xs" />}
          </Group>
        </Box>
      )}
    </Box>
  )
}
