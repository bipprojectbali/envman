import {
  ActionIcon,
  Badge,
  Code,
  Group,
  PasswordInput,
  Table,
  TextInput,
  Tooltip,
} from '@mantine/core'
import {
  TbCheck,
  TbLock,
  TbLockOpen,
  TbPencil,
  TbToggleLeft,
  TbToggleRight,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { type EnvVar } from '@/frontend/types/env'

interface EditForm { value: string; isSecret: boolean }
interface UpdateVarInput { key: string; value: string; isSecret: boolean }

interface VarEditRowProps {
  v: EnvVar
  editForm: EditForm
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>
  updateVar: { mutate: (input: UpdateVarInput) => void; isPending: boolean }
  cancelEdit: () => void
}

export function VarEditRow({ v, editForm, setEditForm, updateVar, cancelEdit }: VarEditRowProps) {
  return (
    <Table.Tr style={{ background: 'var(--mantine-color-violet-light)' }}>
      <Table.Td />
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <Code fz="xs" fw={700} style={{ whiteSpace: 'nowrap' }}>{v.key}</Code>
          <Tooltip label={editForm.isSecret ? 'Klik → plain' : 'Klik → secret'}>
            <Badge
              size="xs"
              variant={editForm.isSecret ? 'filled' : 'outline'}
              color={editForm.isSecret ? 'red' : 'gray'}
              leftSection={editForm.isSecret ? <TbLock size={9} /> : <TbLockOpen size={9} />}
              style={{ cursor: 'pointer', flexShrink: 0 }}
              onClick={() => setEditForm((f) => ({ ...f, isSecret: !f.isSecret }))}
            >
              {editForm.isSecret ? 'secret' : 'plain'}
            </Badge>
          </Tooltip>
        </Group>
      </Table.Td>
      <Table.Td>
        {editForm.isSecret ? (
          <PasswordInput
            size="xs" value={editForm.value} placeholder="Nilai baru..." autoFocus
            onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })
              if (e.key === 'Escape') cancelEdit()
            }}
          />
        ) : (
          <TextInput
            size="xs" value={editForm.value} placeholder="Nilai baru..." autoFocus
            onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })
              if (e.key === 'Escape') cancelEdit()
            }}
          />
        )}
      </Table.Td>
      <Table.Td />
      <Table.Td>
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Simpan (Enter)">
            <ActionIcon size="sm" variant="filled" color="primary" loading={updateVar.isPending}
              onClick={() => updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })}>
              <TbCheck size={13} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Batal (Esc)">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={cancelEdit}><TbX size={13} /></ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  )
}

interface VarActionButtonsProps {
  v: EnvVar
  canEdit: boolean
  toggleDisabled: { mutate: (key: string) => void; isPending: boolean; variables?: string }
  startEdit: (v: EnvVar) => void
  deleteVar: (key: string) => void
}

export function VarActionButtons({ v, canEdit, toggleDisabled, startEdit, deleteVar }: VarActionButtonsProps) {
  return (
    <Group gap={4} wrap="nowrap">
      {canEdit && (
        <>
          <Tooltip label={v.isDisabled ? 'Aktifkan' : 'Nonaktifkan'}>
            <ActionIcon size="sm" variant="subtle" color={v.isDisabled ? 'orange' : 'teal'}
              loading={toggleDisabled.isPending && toggleDisabled.variables === v.key}
              onClick={() => toggleDisabled.mutate(v.key)}>
              {v.isDisabled ? <TbToggleLeft size={15} /> : <TbToggleRight size={15} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Edit">
            <ActionIcon size="sm" variant="subtle" color="primary" onClick={() => startEdit(v)}><TbPencil size={13} /></ActionIcon>
          </Tooltip>
          <Tooltip label="Hapus">
            <ActionIcon size="sm" variant="subtle" color="red" onClick={() => deleteVar(v.key)}><TbTrash size={13} /></ActionIcon>
          </Tooltip>
        </>
      )}
    </Group>
  )
}
