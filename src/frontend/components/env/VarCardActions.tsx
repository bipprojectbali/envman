import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Group,
  PasswordInput,
  TextInput,
} from '@mantine/core'
import {
  TbCheck,
  TbCopy,
  TbLock,
  TbLockOpen,
  TbPencil,
  TbToggleLeft,
  TbToggleRight,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { toEnvLine } from '@/frontend/lib/env-clipboard'
import type { EnvVar } from '@/frontend/types/env'

export interface EditForm {
  value: string
  isSecret: boolean
}

export interface UpdateVarInput {
  key: string
  value: string
  isSecret: boolean
}

interface VarCardEditFormProps {
  v: EnvVar
  editForm: EditForm
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>
  updateVar: { mutate: (input: UpdateVarInput) => void; isPending: boolean }
  cancelEdit: () => void
}

export function VarCardEditForm({ v, editForm, setEditForm, updateVar, cancelEdit }: VarCardEditFormProps) {
  return (
    <Box
      p="sm"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-primary)',
        background: 'var(--mantine-color-violet-light)',
      }}
    >
      <Group gap={6} mb="xs" wrap="nowrap">
        <Code
          fz="xs"
          fw={700}
          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}
        >
          {v.key}
        </Code>
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
      </Group>
      {editForm.isSecret ? (
        <PasswordInput
          size="sm"
          value={editForm.value}
          placeholder="Nilai baru..."
          autoFocus
          onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })
            if (e.key === 'Escape') cancelEdit()
          }}
        />
      ) : (
        <TextInput
          size="sm"
          value={editForm.value}
          placeholder="Nilai baru..."
          autoFocus
          onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })
            if (e.key === 'Escape') cancelEdit()
          }}
        />
      )}
      <Group gap="xs" mt="xs" justify="flex-end">
        <Button size="xs" variant="subtle" color="gray" onClick={cancelEdit} leftSection={<TbX size={12} />}>
          Batal
        </Button>
        <Button
          size="xs"
          variant="filled"
          color="primary"
          loading={updateVar.isPending}
          leftSection={<TbCheck size={12} />}
          onClick={() => updateVar.mutate({ key: v.key, value: editForm.value, isSecret: editForm.isSecret })}
        >
          Simpan
        </Button>
      </Group>
    </Box>
  )
}

interface VarCardActionRowProps {
  v: EnvVar
  canEdit: boolean
  toggleDisabled: { mutate: (key: string) => void; isPending: boolean; variables?: string }
  startEdit: (v: EnvVar) => void
  deleteVar: (key: string) => void
}

export function VarCardActionRow({ v, canEdit, toggleDisabled, startEdit, deleteVar }: VarCardActionRowProps) {
  return (
    <Group gap={4} justify="flex-end" wrap="nowrap">
      <CopyButton value={toEnvLine(v)}>
        {({ copied, copy }) => (
          <ActionIcon size={32} variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
            {copied ? <TbCheck size={15} /> : <TbCopy size={15} />}
          </ActionIcon>
        )}
      </CopyButton>
      {canEdit && (
        <>
          <ActionIcon
            size={32}
            variant="subtle"
            color={v.isDisabled ? 'orange' : 'teal'}
            loading={toggleDisabled.isPending && toggleDisabled.variables === v.key}
            onClick={() => toggleDisabled.mutate(v.key)}
          >
            {v.isDisabled ? <TbToggleLeft size={17} /> : <TbToggleRight size={17} />}
          </ActionIcon>
          <ActionIcon size={32} variant="subtle" color="primary" onClick={() => startEdit(v)}>
            <TbPencil size={15} />
          </ActionIcon>
          <ActionIcon size={32} variant="subtle" color="red" onClick={() => deleteVar(v.key)}>
            <TbTrash size={15} />
          </ActionIcon>
        </>
      )}
    </Group>
  )
}
